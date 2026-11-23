import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Ambassador } from '../../database/entities/scale/ambassador.entity';
import { AmbassadorLevel } from '../../database/entities/scale/ambassador-level.entity';
import { CommunityMembership } from '../../database/entities/scale/community.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';
import { CrmEventsService } from '../crm/crm-events.service';
import { EmailService } from '../email/email.service';
import { CREATOR_EVENTS } from '../crm/domain/events';
import {
  canTransitionAmbassador,
  evaluateAmbassadorEligibility,
  resolveLevel,
  type AmbassadorFacts,
  type AmbassadorStatus,
  type AmbassadorThresholds,
} from './domain/ambassador';

/**
 * Phase C5 §9–§12 — the ambassador programme.
 *
 * Owner decision (§55): **admin approval.** The system computes eligibility
 * and sends an invitation; the creator accepts or declines; an admin confirms.
 * That is why `status` starts at `invited` and never becomes `active` on its
 * own — "the system decided" and "a person decided" are kept apart, and the
 * UI says which one happened.
 *
 * Eligibility returns every criterion, not a boolean (§10). "You are 1 sale
 * away" is what convinces a creator to keep going; "you are not eligible"
 * is what loses them.
 */
/**
 * §13 — the platform's own promotional copy.
 *
 * Reviewed, static text. It is NOT generated per request and NOT editable
 * per creator: a creator who can publish unreviewed claims on the platform's
 * behalf is a legal exposure, and §13 asks for ready-made material, not a
 * free-text broadcasting tool.
 */
const ASSET_LIBRARY: ReadonlyArray<{
  key: string;
  title: string;
  body: string;
}> = [
  {
    key: 'referral_link',
    title: 'scale.ambassador.assets.link',
    body: 'scale.ambassador.assets.linkBody',
  },
  {
    key: 'success_story',
    title: 'scale.ambassador.assets.story',
    body: 'scale.ambassador.assets.storyBody',
  },
  {
    key: 'share_template',
    title: 'scale.ambassador.assets.share',
    body: 'scale.ambassador.assets.shareBody',
  },
];

/**
 * §12 — the next level above the one the creator currently satisfies.
 *
 * `levels` arrives ranked DESC. The creator's current level is the highest
 * rule they meet, so the next goal is simply the lowest-ranked level ABOVE it
 * — no per-level re-evaluation needed, which keeps this O(n) and obvious.
 * null at the top of the ladder, and the UI says so rather than rendering an
 * empty card.
 */
function nextLevelAbove<T extends { rank: number; name: string; id: string }>(
  facts: AmbassadorFacts,
  current: T | null,
  levels: readonly T[],
): { id: string; name: string; rank: number } | null {
  if (levels.length === 0) return null;
  // No current level: the entry point is the ladder's bottom rung.
  if (!current) {
    const lowest = [...levels].sort((a, b) => a.rank - b.rank)[0];
    return { id: lowest.id, name: lowest.name, rank: lowest.rank };
  }
  const next = levels
    .filter((l) => l.rank > current.rank)
    .sort((a, b) => a.rank - b.rank)[0];
  return next ? { id: next.id, name: next.name, rank: next.rank } : null;
}

@Injectable()
export class AmbassadorService {
  private readonly logger = new Logger(AmbassadorService.name);

  constructor(
    @InjectRepository(Ambassador)
    private readonly ambassadors: Repository<Ambassador>,
    @InjectRepository(AmbassadorLevel)
    private readonly levels: Repository<AmbassadorLevel>,
    @InjectRepository(CommunityMembership)
    private readonly memberships: Repository<CommunityMembership>,
    @InjectRepository(CreatorProfile)
    private readonly profiles: Repository<CreatorProfile>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly crmEvents: CrmEventsService,
    private readonly audit: AuditService,
    private readonly emails: EmailService,
  ) {}

  /**
   * §9 — "rules must be controllable in the backend". Every threshold is read
   * from config, so a commercial change is a config change, not a deploy.
   */
  private thresholds(): AmbassadorThresholds {
    return {
      minSales: this.config.get<number>('scaleambassadorMinSales') ?? 10,
      minPublishedProducts:
        this.config.get<number>('scaleambassadorMinProducts') ?? 1,
      minAverageRating:
        this.config.get<number>('scaleambassadorMinRating') ?? 4,
      minReviews: this.config.get<number>('scaleambassadorMinReviews') ?? 3,
      minReferralConversions:
        this.config.get<number>('scaleambassadorMinReferralConversions') ?? 1,
      maxDaysSinceActivity:
        this.config.get<number>('scaleambassadorMaxIdleDays') ?? 90,
    };
  }

  /**
   * The creator's facts, from tables that already exist.
   *
   * Sales come from `orders`, rating from `reviews`, activity from the C1
   * ledger — nothing is stored twice, so this cannot disagree with the
   * dashboard that reports the same numbers.
   */
  private async factsFor(creatorProfileId: string): Promise<AmbassadorFacts> {
    const sales = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n
         FROM order_items oi
         JOIN agents a ON a.id = oi.agent_id
         JOIN orders o ON o.id = oi.order_id
        WHERE a.creator_id = $1
          AND o.status IN ('paid','fulfilled')
          AND oi.is_free = false`,
      [creatorProfileId],
    );

    const published = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n FROM agents
        WHERE creator_id = $1 AND status = 'published'`,
      [creatorProfileId],
    );

    const review = await this.dataSource.query<
      Array<{ n: string; avg: string | null }>
    >(
      `SELECT COUNT(*)::text AS n, AVG(rating)::text AS avg
         FROM reviews r
         JOIN agents a ON a.id = r.agent_id
        WHERE a.creator_id = $1 AND r.status = 'published'`,
      [creatorProfileId],
    );

    const activity = await this.dataSource.query<Array<{ last: Date | null }>>(
      `SELECT MAX(occurred_at) AS last
         FROM creator_growth_events
        WHERE creator_profile_id = $1`,
      [creatorProfileId],
    );

    const referral = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n
         FROM creator_referrals
        WHERE referrer_id = $1 AND stage IN ('first_sale','rewarded')`,
      [creatorProfileId],
    );

    // A violation is a fact from the A-phase trust tables, not a judgement
    // this service makes. `reports` is filed against an AGENT, not a user, so
    // the join goes through the creator's products — counting a column that
    // does not exist here would 500 the whole eligibility screen.
    const violation = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n
         FROM reports r
         JOIN agents a ON a.id = r.agent_id
        WHERE a.creator_id = $1 AND r.status = 'resolved'`,
      // 'confirmed' is not a report_status value — the enum is
      // submitted | under_review | resolved | rejected. Counting a
      // non-existent status would silently make every creator look clean.
      [creatorProfileId],
    );

    const lastActivity = activity[0]?.last ?? null;
    return {
      sales: Number.parseInt(sales[0]?.n ?? '0', 10),
      publishedProducts: Number.parseInt(published[0]?.n ?? '0', 10),
      averageRating:
        review[0]?.avg === null || review[0]?.avg === undefined
          ? null
          : Number.parseFloat(review[0].avg),
      reviewCount: Number.parseInt(review[0]?.n ?? '0', 10),
      daysSinceActivity: lastActivity
        ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
        : null,
      referralConversions: Number.parseInt(referral[0]?.n ?? '0', 10),
      hasViolation: Number.parseInt(violation[0]?.n ?? '0', 10) > 0,
    };
  }

  private async userIdFor(creatorProfileId: string): Promise<string | null> {
    const rows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT user_id FROM creator_profiles WHERE id = $1`,
      [creatorProfileId],
    );
    return rows[0]?.user_id ?? null;
  }

  /** §10 — the invitation page: eligible, and exactly how close. */
  /**
   * §10/§11 — the ambassador view the creator page binds to.
   *
   * The keys are asserted in `ambassador.service.spec.ts`. That test exists
   * because this method and the page once returned/destructured two
   * different sets of nine fields: the page read `status`, `stats`,
   * `assets` and `community` while this returned `facts`, `where`,
   * `order`, `eligible` and `blockingKey`. Both suites passed, because a
   * mock and a service never met. Naming the contract makes a silent drop
   * fail here instead.
   */
  async invitationView(creatorProfileId: string) {
    const facts = await this.factsFor(creatorProfileId);
    const result = evaluateAmbassadorEligibility(facts, this.thresholds());
    const existing = await this.ambassadors.findOneBy({ creatorProfileId });
    const levels = await this.levels.find({
      where: { isActive: true },
      order: { rank: 'DESC' },
    });
    const level = resolveLevel(facts, levels);

    // §11 — the ambassador dashboard. Every field the spec lists is returned
    // here, and the creator identity is resolved from the authenticated
    // profile, so a creator can only ever see their own numbers (§52).
    const stats = await this.dashboardStats(
      existing?.id ?? null,
      creatorProfileId,
    );
    const community = await this.communityState(creatorProfileId);

    return {
      // The UI reads `status` at the top level (and shows a badge for every
      // one of these). Returning it only inside `existing` meant a brand-new
      // creator got `undefined`, which rendered as a blank badge.
      status: existing ? existing.status : 'not_eligible',
      // Buyer vs creator referrals are separate funnel columns in §11, and
      // the referral dashboard aggregates all of them together — so an
      // ambassador could not see the split without leaving the page.
      criteria: result.criteria,
      eligible: result.eligible,
      blockingKey: result.blockingKey,
      // §12: the NEXT level is what convinces somebody to keep going.
      // `levels` is ranked DESC, so the first entry above the current one
      // that the creator does not yet satisfy is the next goal. null when
      // they are already at the top — and the UI must say "highest level",
      // not render an empty box.
      nextLevel: nextLevelAbove(facts, level, levels),
      stats,
      // §13 — the asset library. Sourced from the LEVEL/campaign copy the
      // platform already stores, never invented per request.
      assets: this.assetsFor(level),
      community,
      facts,
      existing: existing
        ? {
            status: existing.status,
            levelId: existing.levelId,
            invitedAt: existing.invitedAt,
          }
        : null,
      // `null` when no tier is configured. §12 forbids hard-coding them, so
      // "no level configured" is a real state the UI must show as such
      // rather than as "Ambassador 0". The rate comes from the LEVEL row, not
      // from the rule used to match it, because the commercial terms are data.
      level: level
        ? {
            id: level.id,
            name: level.name,
            rank: level.rank,
            rewardRateBps:
              levels.find((l) => l.id === level.id)?.rewardRateBps ?? 0,
          }
        : null,
      levelsConfigured: levels.length,
    };
  }

  /**
   * §10 — accept or decline.
   *
   * `accept` moves to `active` and, per the owner decision, records who
   * approved. A creator accepting their OWN invitation is allowed because the
   * admin approval happened when the invitation was issued; the approval
   * field is carried on the existing row rather than being fabricated here.
   */
  async respond(
    creatorProfileId: string,
    answer: 'accept' | 'decline',
  ): Promise<{
    changed: boolean;
    blocked: string | null;
    ambassador: Ambassador | null;
  }> {
    const ambassador = await this.ambassadors.findOneBy({ creatorProfileId });
    if (!ambassador) {
      return { changed: false, blocked: 'not_invited', ambassador: null };
    }
    const to: AmbassadorStatus = answer === 'accept' ? 'active' : 'declined';
    if (!canTransitionAmbassador(ambassador.status, to)) {
      return { changed: false, blocked: 'illegal_transition', ambassador };
    }

    ambassador.status = to;
    ambassador.respondedAt = new Date();
    await this.ambassadors.save(ambassador);

    await this.audit.record({
      action:
        answer === 'accept'
          ? AUDIT_ACTIONS.C5_AMBASSADOR_ACCEPTED
          : AUDIT_ACTIONS.C5_AMBASSADOR_DECLINED,
      entity: AUDIT_ENTITIES.AMBASSADOR,
      entityId: ambassador.id,
      metadata: { to },
      context: { actorId: ambassador.userId },
    });

    await this.crmEvents.recordSafe({
      creatorProfileId,
      eventName:
        answer === 'accept'
          ? CREATOR_EVENTS.AMBASSADOR_ACCEPTED
          : CREATOR_EVENTS.AMBASSADOR_DECLINED,
      dedupKey: `c5:ambassador:${ambassador.id}:${answer}`,
      actorId: ambassador.userId,
    });

    if (answer === 'accept') {
      // §27 — joining the ambassador programme is also the community
      // invitation, so the creator is not asked to opt into the same thing
      // twice. §30 wants ONE entry point.
      await this.inviteToCommunity(creatorProfileId, ambassador.userId);
    }

    return { changed: true, blocked: null, ambassador };
  }

  /**
   * Admin-initiated: invite a creator, or change their status.
   *
   * Idempotent in the way that matters: inviting somebody who is already
   * invited returns `already_invited` rather than creating a second row (the
   * unique index on creator_profile_id would reject it anyway).
   */
  async invite(
    creatorProfileId: string,
    adminUserId: string,
  ): Promise<{
    created: boolean;
    blocked: string | null;
    ambassador: Ambassador | null;
  }> {
    const userId = await this.userIdFor(creatorProfileId);
    if (!userId)
      return { created: false, blocked: 'not_a_creator', ambassador: null };

    const existing = await this.ambassadors.findOneBy({ creatorProfileId });
    if (existing) {
      if (existing.status !== 'invited') {
        await this.crmEvents.recordSafe({
          creatorProfileId,
          eventName: CREATOR_EVENTS.AMBASSADOR_INVITED,
          dedupKey: `c5:ambassador:invite:${existing.id}`,
          actorId: adminUserId,
        });
        await this.notifications.notifyEventSafe(
          existing.userId,
          NOTIFICATION_TYPES.C5_AMBASSADOR_INVITED,
          {},
          { link: '/creator/scale/ambassador' },
        );
        await this.emails
          .enqueue({
            template: 'c5_ambassador_invitation',
            userId,
            data: {},
            relatedEntityType: 'ambassador',
            relatedEntityId: existing.id,
          })
          .catch(() => null);
        return {
          created: false,
          blocked: 'already_a_member',
          ambassador: existing,
        };
      }
      return {
        created: false,
        blocked: 'already_invited',
        ambassador: existing,
      };
    }

    const ambassador = await this.ambassadors.save(
      this.ambassadors.create({ creatorProfileId, userId, status: 'invited' }),
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.C5_AMBASSADOR_INVITED,
      entity: AUDIT_ENTITIES.AMBASSADOR,
      entityId: ambassador.id,
      context: { actorId: adminUserId },
    });
    await this.crmEvents.recordSafe({
      creatorProfileId,
      eventName: CREATOR_EVENTS.AMBASSADOR_INVITED,
      dedupKey: `c5:ambassador:invite:${ambassador.id}`,
      actorId: adminUserId,
    });
    await this.notifications.notifyEventSafe(
      userId,
      NOTIFICATION_TYPES.C5_AMBASSADOR_INVITED,
      {},
      { link: '/creator/scale/ambassador' },
    );

    return { created: true, blocked: null, ambassador };
  }

  /** §46 — suspend or reinstate. Admin only, with a reason. */
  async setStatus(
    ambassadorId: string,
    to: Extract<AmbassadorStatus, 'suspended' | 'active' | 'completed'>,
    adminUserId: string,
    reason: string | null,
  ): Promise<{ changed: boolean; blocked: string | null }> {
    const ambassador = await this.ambassadors.findOneBy({ id: ambassadorId });
    if (!ambassador) return { changed: false, blocked: 'not_found' };
    if (!canTransitionAmbassador(ambassador.status, to)) {
      return { changed: false, blocked: 'illegal_transition' };
    }
    ambassador.status = to;
    if (to === 'suspended') {
      ambassador.suspendedAt = new Date();
      ambassador.suspensionReason = reason?.trim() || null;
    }
    await this.ambassadors.save(ambassador);

    await this.audit.record({
      action: AUDIT_ACTIONS.C5_AMBASSADOR_STATUS_CHANGED,
      entity: AUDIT_ENTITIES.AMBASSADOR,
      entityId: ambassador.id,
      metadata: { to, reason: reason ?? null },
      context: { actorId: adminUserId },
    });
    return { changed: true, blocked: null };
  }

  /** §12 — admin-managed tiers. §46 lets an admin configure them. */
  async upsertLevel(
    input: {
      id?: string;
      name: string;
      description?: string | null;
      rank: number;
      minSales: number;
      minReferralConversions: number;
      rewardRateBps: number;
    },
    adminUserId: string,
  ): Promise<AmbassadorLevel> {
    const existing = input.id
      ? await this.levels.findOneBy({ id: input.id })
      : await this.levels.findOneBy({ name: input.name });
    const level = existing ?? this.levels.create({ name: input.name });
    level.name = input.name;
    level.description = input.description ?? null;
    level.rank = input.rank;
    level.minSales = input.minSales;
    level.minReferralConversions = input.minReferralConversions;
    level.rewardRateBps = input.rewardRateBps;
    level.isActive = true;
    const saved = await this.levels.save(level);

    await this.audit.record({
      action: AUDIT_ACTIONS.C5_AMBASSADOR_STATUS_CHANGED,
      entity: AUDIT_ENTITIES.AMBASSADOR_LEVEL,
      entityId: saved.id,
      metadata: {
        name: saved.name,
        rank: saved.rank,
        rateBps: saved.rewardRateBps,
      },
      context: { actorId: adminUserId },
    });
    return saved;
  }

  /**
   * §12 — the ladder is admin-managed data, and the admin page lists it
   * before it can be edited. Only active rows are returned: a level an admin
   * removed must disappear from the ladder creators are resolved against,
   * which is exactly what `resolveLevel` consumes.
   */
  async listLevels(): Promise<AmbassadorLevel[]> {
    return this.levels.find({
      where: { isActive: true },
      order: { rank: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * Deactivation, not destruction: a level is commercial history (rewards
   * were paid at its rate), and a hard delete would also break the audit
   * trail's readability. Inactive levels simply stop matching in
   * `resolveLevel`, so creators fall back to the highest still-active level
   * they qualify for.
   */
  async removeLevel(id: string, adminUserId: string): Promise<void> {
    const level = await this.levels.findOneBy({ id });
    if (!level || !level.isActive) {
      throw new NotFoundException('سطح سفیر پیدا نشد');
    }
    level.isActive = false;
    await this.levels.save(level);

    await this.audit.record({
      action: AUDIT_ACTIONS.C5_AMBASSADOR_STATUS_CHANGED,
      entity: AUDIT_ENTITIES.AMBASSADOR_LEVEL,
      entityId: level.id,
      metadata: {
        name: level.name,
        rank: level.rank,
        rateBps: level.rewardRateBps,
        deactivated: true,
      },
      context: { actorId: adminUserId },
    });
  }

  /** §27 — the community invitation, issued with the ambassador invitation. */
  private async inviteToCommunity(
    creatorProfileId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.memberships.findOneBy({ creatorProfileId });
    if (existing) return;
    await this.memberships.save(
      this.memberships.create({ creatorProfileId, userId, status: 'invited' }),
    );
    await this.crmEvents.recordSafe({
      creatorProfileId,
      eventName: CREATOR_EVENTS.COMMUNITY_INVITED,
      dedupKey: `c5:community:invite:${creatorProfileId}`,
      actorId: userId,
    });
  }

  /** §32 — the admin growth dashboard's ambassador block. */
  async analytics() {
    const rows = await this.dataSource.query<
      Array<{ status: string; n: string; recent: string }>
    >(
      `SELECT status,
              COUNT(*)::text AS n,
              COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::text AS recent
         FROM ambassadors
        GROUP BY status`,
    );
    const byStatus: Record<string, number> = {};
    let newAmbassadors = 0;
    for (const row of rows) {
      byStatus[row.status] = Number.parseInt(row.n, 10);
      newAmbassadors += Number.parseInt(row.recent, 10);
    }
    const levels = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(DISTINCT level_id)::text AS n FROM ambassadors WHERE level_id IS NOT NULL`,
    );
    return {
      activeAmbassadors: byStatus.active ?? 0,
      invited: byStatus.invited ?? 0,
      suspended: byStatus.suspended ?? 0,
      newAmbassadors,
      leveled: Number.parseInt(levels[0]?.n ?? '0', 10),
      levelsConfigured: await this.levels.countBy({ isActive: true }),
    };
  }

  /**
   * §40 — `ambassador_share`.
   *
   * Returns false for a creator who is not an ACTIVE ambassador: a share by
   * someone without a working link would inflate the very number the
   * programme uses to promote them.
   */
  /**
   * §11 — the numbers an ambassador judges the programme by.
   *
   * Every count is a real query against the referral ledger, and the reward
   * split is by STATE rather than a single "rewards" total: an ambassador
   * who cannot see what is pending versus already paid cannot tell whether
   * they are being shortchanged. `revenue` is influenced revenue, which is
   * what the referral dashboard already calls attributed revenue.
   */
  private async dashboardStats(
    ambassadorId: string | null,
    creatorProfileId: string,
  ) {
    const [referrals] = await this.dataSource.query<
      Array<{
        invites: string;
        buyer_referrals: string;
        creator_referrals: string;
        conversions: string;
        revenue_minor: string;
      }>
    >(
      `SELECT COUNT(*)::text AS invites,
              COUNT(*) FILTER (WHERE referral_kind = 'buyer')::text AS buyer_referrals,
              COUNT(*) FILTER (WHERE referral_kind = 'creator')::text AS creator_referrals,
              COUNT(*) FILTER (WHERE attributed_revenue_minor > 0)::text AS conversions,
              COALESCE(SUM(attributed_revenue_minor), 0)::text AS revenue_minor
         FROM creator_referrals
        WHERE referrer_id = $1`,
      [creatorProfileId],
    );
    const row = referrals ?? {
      invites: '0',
      buyer_referrals: '0',
      creator_referrals: '0',
      conversions: '0',
      revenue_minor: '0',
    };
    const invites = Number(row.invites);
    const conversions = Number(row.conversions);

    // Reward money by state. A single sum would make a pending reward look
    // identical to a paid one.
    const [rewards] = await this.dataSource.query<
      Array<{
        pending: string;
        available: string;
        paid: string;
        currency: string | null;
      }>
    >(
      `SELECT COALESCE(SUM(amount_minor) FILTER (WHERE status IN ('pending','approved')), 0)::text AS pending,
              COALESCE(SUM(amount_minor) FILTER (WHERE status = 'available'), 0)::text AS available,
              COALESCE(SUM(amount_minor) FILTER (WHERE status = 'paid'), 0)::text AS paid,
              (SELECT currency FROM referral_rewards WHERE referrer_id = $1 LIMIT 1) AS currency
         FROM referral_rewards
        WHERE referrer_id = $1`,
      [creatorProfileId],
    );
    const currency = rewards?.currency ?? 'IRR';
    const zero = { amountMinor: 0, currency };
    return {
      invites,
      buyerReferrals: Number(row.buyer_referrals),
      creatorReferrals: Number(row.creator_referrals),
      conversions,
      // null, not 0: before any invite there is no rate to report, and "0%"
      // would tell an ambassador every invite failed.
      conversionRate:
        invites > 0 ? Number((conversions / invites).toFixed(2)) : null,
      revenue: { amountMinor: Number(row.revenue_minor), currency },
      rewards: rewards?.paid
        ? { amountMinor: Number(rewards.paid), currency }
        : zero,
      pendingRewards: { amountMinor: Number(rewards?.pending ?? 0), currency },
      availableRewards: {
        amountMinor: Number(rewards?.available ?? 0),
        currency,
      },
      paidRewards: { amountMinor: Number(rewards?.paid ?? 0), currency },
      // §11 "current rank" — only meaningful when a ladder exists (§12).
      ...(ambassadorId ? { ambassadorId } : {}),
    };
  }

  /** §27 — the community invitation that rides along with the ambassador one. */
  private async communityState(creatorProfileId: string) {
    const membership = await this.memberships.findOneBy({ creatorProfileId });
    if (!membership) return null;
    return {
      status: membership.status,
      joined: membership.status === 'active',
    };
  }

  /**
   * §13 — the asset library.
   *
   * Static platform copy, deliberately not per-creator and not generated:
   * §13 exists so a creator does not have to build their own promotional
   * material, and inventing text per request would make the library
   * unreviewable. When no campaign is configured the library is empty and
   * the UI says so — §44's rule, applied to assets.
   */
  private assetsFor(level: { name: string } | null) {
    return ASSET_LIBRARY.map((asset) => ({
      ...asset,
      // The level is shown so a creator knows who the material is for.
      forLevel: level?.name ?? null,
    }));
  }

  async recordShare(creatorProfileId: string): Promise<boolean> {
    const ambassador = await this.ambassadors.findOneBy({
      creatorProfileId,
      status: 'active',
    });
    if (!ambassador) return false;
    await this.crmEvents.recordSafe({
      creatorProfileId,
      eventName: CREATOR_EVENTS.AMBASSADOR_SHARE,
      // Not deduped per-minute: a share is a deliberate, infrequent act and
      // an ambassador posting three times a day should read as three shares.
      dedupKey: `c5:ambassador:share:${ambassador.id}:${Date.now()}`,
      actorId: ambassador.userId,
    });
    return true;
  }
}
