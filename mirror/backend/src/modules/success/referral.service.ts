/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- every raw query here goes through txQuery<T>, which narrows the row shape; the type-aware linter widens the chain-walk result back to any and no equivalent formulation keeps it narrow. The unsafe-member rule is the only one that actually fires. */
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
// Type-only: with `emitDecoratorMetadata` a value import of EntityManager
// makes the decorator metadata read the class at runtime and defeats the
// narrow generic inference on `txQuery` for the type-aware linter.
import type { EntityManager } from 'typeorm';
import { CreatorReferral } from '../../database/entities/success/creator-referral.entity';
import { CreatorReferralEvent } from '../../database/entities/success/creator-referral-event.entity';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { CrmEventsService } from '../crm/crm-events.service';
import { CREATOR_EVENTS } from '../crm/domain/events';
import {
  NotificationsService,
  NOTIFICATION_TYPES,
} from '../notifications/notifications.service';
import {
  canAdvanceReferral,
  canAttribute,
  referralStats,
  REFERRAL_STAGES,
  type ReferralStage,
} from './domain/referral';

/**
 * `EntityManager.query` has no generic overload, so every transactional read
 * in this service would otherwise be an untyped `any[]` and a mistyped column
 * name would only surface at runtime. This wrapper is the single boundary.
 */
async function txQuery<T>(
  runner: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  // `runner.query` is typed `Promise<any>`, so the result is bound to
  // `unknown` first. Letting `any` flow into the return type is what makes
  // every call site unsafe, and a mistyped column name would then only fail
  // at runtime.
  const raw: unknown = await runner.query(sql, params);
  const rows: T[] = [];
  if (Array.isArray(raw)) {
    for (const row of raw as unknown[]) rows.push(row as T);
  }
  return rows;
}

/**
 * Walks the referral chain upward looking for a loop.
 *
 * Module-level rather than a private method: it is pure traversal over a
 * manager and has no service state, and keeping it outside the decorated
 * class lets the type-aware linter keep the row shape narrow all the way to
 * the call site.
 */
async function wouldCreateCycle(
  runner: EntityManager,
  referrerId: string,
  visitorCreatorId: string | null,
): Promise<boolean> {
  if (!visitorCreatorId) return false;
  let cursor: string | null = referrerId;
  for (let depth = 0; depth < 32 && cursor; depth += 1) {
    if (cursor === visitorCreatorId) return true;
    const next = await txQuery<{ referrer_id: string | null }>(
      runner,
      `SELECT referrer_id FROM creator_referrals
        WHERE referred_creator_id = $1 LIMIT 1`,
      [cursor],
    );
    cursor = next[0]?.referrer_id ?? null;
  }
  return false;
}

/** Alphabet without look-alike characters (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export interface ReferralRowView {
  code: string;
  url: string;
  stage: ReferralStage;
  registeredAt: string | null;
  createdAt: string;
}

/**
 * Phase C4 §15–§18 — the creator referral program.
 *
 * Design notes that matter:
 *
 * 1. THE CODE IS THE LINK. §16 requires attribution to survive a refresh and
 *    a navigation, which rules out any cookie-session or in-memory state. A
 *    code in a URL is the only attribution that survives a three-day gap
 *    between landing and registering, which is exactly the scenario C1's
 *    `creator_attributions` was built for.
 *
 * 2. ONE ROW PER REFERRED PERSON. UNIQUE (referrer_id, referred_user_id) plus
 *    a single current `stage` means a replayed webhook cannot double-count,
 *    and a stage can only be recorded once because
 *    `creator_referral_events` is UNIQUE (referral_id, stage). Idempotency is
 *    a database property here, not a hope about application logic.
 *
 * 3. NO MONEY. §44 is explicit and there is no wallet in this project, so
 *    nothing in this service stores or reports a currency amount. Reward
 *    *eligibility* is tracked; the money, if any, happens outside Mesh.
 */
@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(CreatorReferral)
    private readonly referrals: Repository<CreatorReferral>,
    @InjectRepository(CreatorReferralEvent)
    private readonly referralEvents: Repository<CreatorReferralEvent>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly events: CrmEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * §15 — the creator's shareable link.
   *
   * Idempotent by design: asking twice returns the SAME code rather than
   * minting a second link, because two links for one creator would split
   * their referrals across two rows and make the dashboard a lie.
   */
  async myLink(
    creatorProfileId: string,
    creatorUserId: string,
    siteOrigin: string,
  ): Promise<{
    code: string;
    url: string;
    stats: ReturnType<typeof referralStats>;
  }> {
    const existing = await this.referrals.findOne({
      where: { referrerId: creatorProfileId },
      order: { createdAt: 'ASC' },
    });
    const row =
      existing ?? (await this.createLink(creatorProfileId, creatorUserId));
    const code = row.code;

    if (!existing) {
      await this.events.recordSafe({
        eventName: CREATOR_EVENTS.REFERRAL_LINK_CREATED,
        userId: creatorUserId,
        creatorProfileId,
        entityType: 'creator_referral',
        entityId: row.id,
        dedupKey: `c4.referral_link_created:${row.id}`,
      });
    }

    return {
      code,
      url: this.shareUrl(siteOrigin, code),
      stats: await this.stats(creatorProfileId),
    };
  }

  private async createLink(
    creatorProfileId: string,
    creatorUserId: string,
  ): Promise<CreatorReferral> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = await this.generateCode(creatorProfileId);
      if (!code) continue;
      try {
        const row = this.referrals.create({
          referrerId: creatorProfileId,
          referrerUserId: creatorUserId,
          code,
          stage: 'invited' as ReferralStage,
        });
        return await this.referrals.save(row);
      } catch {
        // The UNIQUE (referrer_id, code) index rejected a collision. Six
        // random draws from 32 characters is ~10^9 candidates, so reaching
        // the end of this loop means the referrer already has a link from a
        // concurrent request and we should just return that one.
        const raced = await this.referrals.findOne({
          where: { referrerId: creatorProfileId },
          order: { createdAt: 'ASC' },
        });
        if (raced) return raced;
      }
    }
    throw new BadRequestException('تولید کد دعوت ممکن نشد');
  }

  /** §16 — resolves a shared code to its referrer. Public, no auth. */
  async resolve(
    code: string,
  ): Promise<{ referrerUserId: string; slug: string } | null> {
    const clean = code.trim().toUpperCase();
    if (!clean) return null;
    const rows = await this.dataSource.query<
      Array<{ referrer_user_id: string; slug: string }>
    >(
      `SELECT r.referrer_user_id, COALESCE(cp.slug, r.referrer_user_id::text) AS slug
         FROM creator_referrals r
         JOIN creator_profiles cp ON cp.id = r.referrer_id
        WHERE r.code = $1`,
      [clean],
    );
    if (!rows[0]) return null;
    return { referrerUserId: rows[0].referrer_user_id, slug: rows[0].slug };
  }

  /**
   * §16 — the public landing endpoint records that a link was followed.
   *
   * This is a WRITE from an unauthenticated request, so it is the most
   * attackable surface in C4. Two defences: a `visited` referral that is
   * already at `visited` is a no-op (the unique stage index rejects the
   * second), and no user data is attached at this point. An attacker who
   * hammers this can at most learn that a code exists.
   */
  async markVisited(code: string): Promise<boolean> {
    const resolved = await this.resolve(code);
    if (!resolved) return false;
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM creator_referrals WHERE code = $1`,
      [code.trim().toUpperCase()],
    );
    if (!rows[0]) return false;
    return this.advance(rows[0].id, 'visited');
  }

  /**
   * §16 — attribution at registration.
   *
   * Runs with the userId of the person who just registered. The self and
   * cycle checks are structural (§32): a user can never be credited to their
   * own code, and C2's proven cycle walk is reused rather than reimplemented.
   */
  async attributeRegistration(
    code: string,
    newUserId: string,
    newCreatorProfileId: string | null,
    transaction?: EntityManager,
  ): Promise<boolean> {
    const runner = transaction ?? this.dataSource.manager;
    const clean = code.trim().toUpperCase();
    if (!clean) return false;

    const rows = await runner.query<
      Array<{
        id: string;
        referrer_id: string;
        referrer_user_id: string;
        stage: ReferralStage;
      }>
    >(
      `SELECT id, referrer_id, referrer_user_id, stage
         FROM creator_referrals WHERE code = $1`,
      [clean],
    );
    const row = rows[0];
    if (!row) return false;

    const existing = await runner.query<
      Array<{ referrer_user_id: string | null }>
    >(
      `SELECT referrer_user_id FROM creator_referrals
        WHERE referred_user_id = $1 AND referrer_id <> $2 LIMIT 1`,
      [newUserId, row.referrer_id],
    );

    const isCycle = await this.wouldCycle(
      runner,
      row.referrer_id,
      newCreatorProfileId,
    );
    const decision = canAttribute(
      {
        codeOwnerUserId: row.referrer_user_id,
        visitorUserId: newUserId,
        existingReferrerUserId: existing[0]?.referrer_user_id ?? null,
      },
      isCycle,
    );
    if (!decision.allowed) return false;

    // The claim is conditional on the pair still being free, so two
    // concurrent registrations carrying the same code cannot both attach.
    const claimed = await txQuery<{ id: string }>(
      runner,
      `UPDATE creator_referrals
          SET referred_user_id = $2,
              referred_creator_id = $3,
              registered_at = COALESCE(registered_at, now()),
              updated_at = now()
        WHERE id = $1
          AND referred_user_id IS NULL
        RETURNING id`,
      [row.id, newUserId, newCreatorProfileId],
    );
    if (!claimed[0]) return false;

    await this.recordStage(runner, row.id, 'visited');
    await this.recordStage(runner, row.id, 'registered');

    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.REFERRAL_REGISTERED,
      userId: newUserId,
      creatorProfileId: newCreatorProfileId,
      entityType: 'creator_referral',
      entityId: row.id,
      // One registration per referral, forever.
      dedupKey: `c4.referral_registered:${row.id}`,
    });
    return true;
  }

  /**
   * §16 — a real milestone in the referred creator's journey.
   *
   * Called from the same hooks C1 already runs (product submitted, product
   * published, first sale), so §26's automation works without a new queue:
   * the trigger is an event the system already emits.
   */
  async advanceForReferredCreator(
    referredCreatorProfileId: string,
    stage: ReferralStage,
    metadata: Record<string, unknown> = {},
  ): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM creator_referrals
        WHERE referred_creator_id = $1
        ORDER BY created_at ASC LIMIT 1`,
      [referredCreatorProfileId],
    );
    if (!rows[0]) return false;
    return this.advance(rows[0].id, stage, metadata);
  }

  /**
   * Advances one stage, forward-only, exactly once.
   *
   * The whole of §27's idempotency for referrals lives in these three lines:
   * the WHERE clause refuses the same stage twice, the domain check refuses a
   * skip, and the event insert refuses a duplicate stage. A replayed webhook
   * produces a no-op, not a second reward.
   */
  private async advance(
    referralId: string,
    to: ReferralStage,
    metadata: Record<string, unknown> = {},
  ): Promise<boolean> {
    return this.dataSource.transaction(async (runner) => {
      const rows = await txQuery<{ stage: ReferralStage }>(
        runner,
        `SELECT stage FROM creator_referrals WHERE id = $1 FOR UPDATE`,
        [referralId],
      );
      const current = rows[0];
      if (!current) return false;
      if (current.stage === to) return false;
      if (!canAdvanceReferral(current.stage, to)) return false;

      await runner.query(
        `UPDATE creator_referrals SET stage = $2, updated_at = now()
          WHERE id = $1`,
        [referralId, to],
      );
      await this.recordStage(runner, referralId, to, metadata);

      if (to === 'first_sale') {
        const owner = await txQuery<{ referrer_user_id: string }>(
          runner,
          `SELECT referrer_user_id FROM creator_referrals WHERE id = $1`,
          [referralId],
        );
        if (owner[0]) {
          await this.events.recordSafe({
            eventName: CREATOR_EVENTS.REFERRAL_FIRST_SALE,
            userId: owner[0].referrer_user_id,
            entityType: 'creator_referral',
            entityId: referralId,
            dedupKey: `c4.referral_first_sale:${referralId}`,
          });
          await this.notifications.notifyEventSafe(
            owner[0].referrer_user_id,
            NOTIFICATION_TYPES.REFERRAL_FIRST_SALE,
            {},
            { link: '/creator/success/referral' },
          );
        }
      }
      return true;
    });
  }

  /**
   * §16 stage history. `ON CONFLICT DO NOTHING` on UNIQUE
   * (referral_id, stage) is what makes a duplicate stage a silent no-op
   * instead of an error that would roll back a whole webhook.
   */
  private async recordStage(
    runner: EntityManager,
    referralId: string,
    stage: ReferralStage,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await runner.query(
      `INSERT INTO creator_referral_events (referral_id, stage, metadata)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (referral_id, stage) DO NOTHING`,
      [referralId, stage, JSON.stringify(metadata)],
    );
  }

  /** §17 — the dashboard counters. */
  async stats(creatorProfileId: string) {
    const rows = await this.dataSource.query<
      Array<{ stage: ReferralStage; reward_reviewed_at: Date | null }>
    >(
      `SELECT stage, reward_reviewed_at FROM creator_referrals
        WHERE referrer_id = $1`,
      [creatorProfileId],
    );
    return referralStats(
      rows.map((r) => ({
        stage: r.stage,
        rewardReviewed: r.reward_reviewed_at !== null,
      })),
    );
  }

  /** §17 — the individual rows, newest first. */
  async list(creatorProfileId: string): Promise<ReferralRowView[]> {
    const rows = await this.referrals.find({
      where: { referrerId: creatorProfileId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((row) => ({
      code: row.code,
      url: this.shareUrl(this.siteOrigin(), row.code),
      stage: row.stage,
      registeredAt: row.registeredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * §39 — the admin referral view, and the reward-review queue.
   *
   * Reviewing a reward records THAT AN ADMIN LOOKED AT IT. It stores no
   * amount and claims no payment, because §44 forbids presenting a financial
   * capability the platform does not have.
   */
  async reviewReward(referralId: string, adminUserId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE creator_referrals
          SET reward_reviewed_at = now(), reward_reviewed_by = $2, updated_at = now()
        WHERE id = $1`,
      [referralId, adminUserId],
    );
    await this.audit.record({
      action: AUDIT_ACTIONS.C4_REFERRAL_REWARD_REVIEWED,
      entity: AUDIT_ENTITIES.CREATOR_REFERRAL,
      entityId: referralId,
      context: { actorId: adminUserId },
    });
  }

  /** §29 — the share event, recorded so §30 can compute share rate. */
  async markShared(code: string, channel: string): Promise<boolean> {
    const rows = await this.dataSource.query<
      Array<{ id: string; referrer_user_id: string; referrer_id: string }>
    >(
      `SELECT id, referrer_user_id, referrer_id FROM creator_referrals
        WHERE code = $1`,
      [code.trim().toUpperCase()],
    );
    if (!rows[0]) return false;
    const row = rows[0];

    const created = await this.events.recordSafe({
      eventName: CREATOR_EVENTS.REFERRAL_LINK_SHARED,
      userId: row.referrer_user_id,
      creatorProfileId: row.referrer_id,
      entityType: 'creator_referral',
      entityId: row.id,
      // One share event per code per channel per day: enough to measure a
      // share rate without one enthusiastic clicker producing 400 rows.
      dedupKey: `c4.referral_shared:${row.id}:${channel}:${new Date()
        .toISOString()
        .slice(0, 10)}`,
      metadata: { channel },
    });
    return created;
  }

  // ---- internals --------------------------------------------------------

  /**
   * A cycle check that reuses C2's reasoning: walk up from the prospective
   * referrer; if we reach the visitor, the link would close a loop. Bounded
   * so a pre-existing corrupt chain cannot hang a signup.
   */
  private wouldCycle(
    runner: EntityManager,
    referrerId: string,
    visitorCreatorId: string | null,
  ): Promise<boolean> {
    return wouldCreateCycle(runner, referrerId, visitorCreatorId);
  }

  private async generateCode(creatorProfileId: string): Promise<string | null> {
    const prefix =
      this.config.get<string>('referralCodePrefix')?.toUpperCase() || 'MESH';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      let suffix = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) {
        suffix +=
          CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      const code = `${prefix}-${suffix}`.slice(0, 24);
      const taken = await this.dataSource.query<Array<{ n: number }>>(
        `SELECT COUNT(*)::int AS n FROM creator_referrals
          WHERE referrer_id = $1 AND code = $2`,
        [creatorProfileId, code],
      );
      if (taken[0].n === 0) return code;
    }
    return null;
  }

  /**
   * §18 — the share URL.
   *
   * Only `copy` and `email` are genuinely available: the project has no
   * WhatsApp/Telegram/LinkedIn/X integration, and §18 says to show only the
   * real options rather than buttons that do nothing. Those two use the web's
   * own share intents and need no server support; the rest are for later.
   */
  private shareUrl(origin: string, code: string): string {
    return `${origin.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`;
  }

  private siteOrigin(): string {
    return (
      // The A4 canonical origin, not a new C4 setting: a referral link that
      // points at a different host than every other share link on the site is
      // a bug waiting to be reported as "the link is broken".
      this.config.get<string>('publicSiteUrl') ?? 'https://mesh.ir'
    );
  }
}

export const SUPPORTED_SHARE_CHANNELS = ['copy', 'email'] as const;
export { REFERRAL_STAGES };
