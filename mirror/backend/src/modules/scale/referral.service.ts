import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CreatorReferral } from '../../database/entities/success/creator-referral.entity';
import { CreatorReferralEvent } from '../../database/entities/success/creator-referral-event.entity';
import { Affiliate } from '../../database/entities/scale/affiliate.entity';
import { Partnership } from '../../database/entities/scale/partnership.entity';
import { CrmEventsService } from '../crm/crm-events.service';
import { CREATOR_EVENTS } from '../crm/domain/events';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';
import {
  resolveAttribution,
  isSelfAttribution,
  type AttributionTouch,
} from './domain/attribution';
import { type ReferralStage } from '../success/domain/referral';
import { RewardService } from './reward.service';

/**
 * §16 — the same short, human-typable alphabet the C4 referral centre mints
 * with (no I/O/0/1, so a code read aloud over the phone still resolves).
 * One alphabet for both surfaces, because a creator who shares two links
 * should not have to wonder why they look different.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Phase C5 §4, §5, §6 — referrals for BOTH creator and buyer acquisition.
 *
 * C4 built the creator-referral path on `creator_referrals`. C5 §4 requires
 * two acquisition types, and the second one — a referred BUYER who
 * purchases — has no representation in C4 at all. Rather than add a parallel
 * `buyer_referrals` table that would duplicate the code, the stage machine
 * and the cycle guard that C4 already got right, the same table gets a
 * `referral_kind` discriminator (added in the C5 migration) and the buyer
 * path reuses everything above it.
 *
 * The important part of §6 is that attribution is decided HERE, on the
 * server, in one place. A click writes a touch; a purchase asks
 * `resolveAttribution` who earned it. There is no path where a client can
 * assert an attribution, which §37 and §46 both require.
 */
@Injectable()
export class ScaleReferralService {
  private readonly logger = new Logger(ScaleReferralService.name);

  constructor(
    @InjectRepository(CreatorReferral)
    private readonly referrals: Repository<CreatorReferral>,
    @InjectRepository(CreatorReferralEvent)
    private readonly referralEvents: Repository<CreatorReferralEvent>,
    @InjectRepository(Affiliate)
    private readonly affiliates: Repository<Affiliate>,
    @InjectRepository(Partnership)
    private readonly partnerships: Repository<Partnership>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly crmEvents: CrmEventsService,
    private readonly notifications: NotificationsService,
    private readonly rewards: RewardService,
  ) {}

  /**
   * §4 — resolve a share code to a referrer, and record the click.
   *
   * The same URL shape serves a creator's code and an affiliate's or a
   * partner's, because the codes are namespaced by the table that owns them
   * and a visitor never needs to know which. A missing code is a plain `null`
   * — the public landing page still renders, it just has no referrer, because
   * a 404 on a shared link is a broken share.
   */
  async resolveCode(code: string): Promise<{
    kind: 'creator' | 'affiliate' | 'partnership';
    id: string;
    creatorProfileId: string | null;
  } | null> {
    // Order matters: the codes live in three different namespaces and an
    // affiliate code that happened to collide with a creator code would
    // otherwise be resolved by whichever query ran first.
    const affiliate = await this.affiliates.findOneBy({ code });
    if (affiliate && affiliate.status === 'approved') {
      // The counter is written here, on the row that owns it, so there is
      // one writer per counter rather than two services each maintaining one.
      // `affiliate.clickedBy` is NOT tracked: the platform has no per-visitor
      // click table, and inventing one would duplicate the attribution
      // ledger that §6 already defines.
      await this.affiliates.update(affiliate.id, {
        clickCount: affiliate.clickCount + 1,
      });
      return { kind: 'affiliate', id: affiliate.id, creatorProfileId: null };
    }
    const partnership = await this.partnerships.findOneBy({ code });
    if (partnership && partnership.stage === 'active') {
      // §40 — a partnership link view is a real funnel event and was
      // previously invisible: the public controller reported `recorded: true`
      // without a counter ever moving.
      await this.partnerships.update(partnership.id, {
        clickCount: partnership.clickCount + 1,
      });
      return {
        kind: 'partnership',
        id: partnership.id,
        creatorProfileId: null,
      };
    }
    const referral = await this.dataSource.query<
      Array<{ id: string; referrer_id: string; referral_kind: string }>
    >(
      `SELECT id::text, referrer_id::text, referral_kind
         FROM creator_referrals
        WHERE code = $1
        LIMIT 1`,
      [code],
    );
    if (referral.length === 0) return null;
    return {
      kind: 'creator',
      id: referral[0].referrer_id,
      creatorProfileId: referral[0].referrer_id,
    };
  }

  /** §4 — the click counter on a creator referral. */
  async recordCreatorClick(code: string): Promise<boolean> {
    // §40 requires `referral_link_viewed`. The referrer is selected in the
    // same statement as the counter increment so the event carries the right
    // creator even when two clicks race: only the row that actually updated
    // returns, and both would resolve to the same referrer anyway.
    const result = await this.dataSource.query<
      // `creator_referrals` names the referring CREATOR PROFILE `referrer_id`
      // and the referring USER `referrer_user_id`. There is no
      // `creator_profile_id` column — returning one made every referral link
      // view a 500, which is the most-shared action in the whole programme.
      Array<{ id: string; referrer_id: string; referrer_user_id: string }>
    >(
      `UPDATE creator_referrals
          SET click_count = click_count + 1, updated_at = now()
        WHERE code = $1
        RETURNING id, referrer_id, referrer_user_id`,
      [code],
    );
    if (result.length === 0) return false;
    const row = result[0];
    // A click is a top-of-funnel signal, not a conversion: it must never be
    // able to fail the public landing page, so the event is best-effort.
    await this.crmEvents.recordSafe({
      creatorProfileId: row.referrer_id,
      userId: row.referrer_user_id,
      eventName: CREATOR_EVENTS.REFERRAL_LINK_VIEWED,
      // One event per referral per hour: without this a creator refreshing
      // their own link would flood the ledger with meaningless rows.
      dedupKey: `c5:referral:viewed:${row.id}:${Math.floor(Date.now() / 3600000)}`,
      actorId: row.referrer_user_id,
    });
    return true;
  }

  /**
   * §6 — attribute a purchase.
   *
   * Returns the winning referrer id, or `null`. The decision is made by
   * `resolveAttribution` over the recorded touches; this method only gathers
   * them and persists the outcome. It is called from the payment path, so it
   * must never throw — a failure to attribute is a lost reward, not a failed
   * purchase.
   */
  async attributeOrder(input: {
    buyerUserId: string;
    orderId: string;
    orderTotalMinor: number;
  }): Promise<{
    attributedTo: string | null;
    kind: string | null;
    reason: string | null;
  }> {
    try {
      const touches = await this.touchesFor(input.buyerUserId);

      // §25: a creator who buys their own product through their own link is
      // the single most common payout fraud, and it is refused here rather
      // than being left for a fraud model to notice later.
      const selfHit = touches.find((touch) =>
        isSelfAttribution(touch.sourceId, input.buyerUserId),
      );
      if (selfHit) {
        return { attributedTo: null, kind: null, reason: 'self_referral' };
      }

      const winner = resolveAttribution(touches, {
        windowDays: this.config.get<number>('scaleattributionWindowDays') ?? 30,
      });
      if (!winner) {
        return { attributedTo: null, kind: null, reason: 'no_claimable_touch' };
      }

      await this.dataSource.query(
        `UPDATE creator_referrals
            SET attributed_revenue_minor = attributed_revenue_minor + $1,
                updated_at = now()
          WHERE referrer_id = $2 AND referred_user_id = $3`,
        [input.orderTotalMinor, winner.sourceId, input.buyerUserId],
      );

      await this.crmEvents.recordSafe({
        userId: input.buyerUserId,
        eventName: CREATOR_EVENTS.REFERRAL_BUYER_CONVERSION,
        dedupKey: `c5:referral:conversion:${input.orderId}`,
        actorId: input.buyerUserId,
        metadata: { sourceId: winner.sourceId, orderId: input.orderId },
      });

      return {
        attributedTo: winner.sourceId,
        kind: winner.channel,
        reason: null,
      };
    } catch (error) {
      this.logger.error(
        `C5 attribution failed for order ${input.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return { attributedTo: null, kind: null, reason: 'attribution_error' };
    }
  }

  /** The recorded touches for a user, newest last. */
  private async touchesFor(userId: string): Promise<AttributionTouch[]> {
    const rows = await this.dataSource.query<
      Array<{ channel: string; source_id: string | null; occurred_at: Date }>
    >(
      `SELECT 'referral' AS channel, referrer_id::text AS source_id, registered_at AS occurred_at
         FROM creator_referrals
        WHERE referred_user_id = $1 AND registered_at IS NOT NULL
       UNION ALL
       -- §6 multi-channel attribution: an APPROVED affiliate who referred
       -- this buyer is a real touch. The join is on a.USER_ID, not a.id —
       -- comparing the buyer's id against the affiliate's PK can never match,
       -- which meant an affiliate-sourced buyer had no affiliate touch at all
       -- and could only ever be attributed as a plain referral.
       SELECT 'affiliate' AS channel, a.user_id::text AS source_id, cr.registered_at AS occurred_at
         FROM creator_referrals cr
         JOIN affiliates a ON a.user_id = cr.referrer_user_id
        WHERE cr.referred_user_id = $1
          AND cr.referral_kind = 'buyer'
          AND cr.registered_at IS NOT NULL
          AND a.status = 'approved'
       UNION ALL
       -- §16: an ACTIVE partnership is a third channel, resolved through the
       -- partner's lead. Without this the referral_link attribution_method
       -- was configurable but not wired to anything.
       SELECT 'partnership' AS channel, p.lead_id::text AS source_id, cr.registered_at AS occurred_at
         FROM creator_referrals cr
         JOIN creator_leads l ON l.referred_by_id = cr.referrer_user_id
         JOIN partnerships p ON p.lead_id = l.id
        WHERE cr.referred_user_id = $1
          AND cr.referral_kind = 'buyer'
          AND cr.registered_at IS NOT NULL
          AND p.stage = 'active'`,
      [userId],
    );
    return rows.map((row) => ({
      channel: row.channel as AttributionTouch['channel'],
      sourceId: row.source_id,
      occurredAt: new Date(row.occurred_at),
    }));
  }

  /**
   * §5 — record a signup against a creator referral.
   *
   * `attributedUserId` is the NEW user's id and `referrerId` is the creator's,
   * so §25's self-referral check compares a creator PROFILE id with a USER
   * id. They are different id spaces, so the comparison is only meaningful
   * when the caller has already resolved the referrer to a user id — which is
   * why the guard is a parameter here rather than a lookup, and why the
   * creator path resolves it explicitly.
   */
  async attributeSignup(input: {
    referredUserId: string;
    referrerUserId: string;
    referrerProfileId: string;
    referralId: string;
  }): Promise<{ attributed: boolean; reason: string | null }> {
    if (input.referrerUserId === input.referredUserId) {
      return { attributed: false, reason: 'self_referral' };
    }
    // §6 "prevent double attribution": one user, one referrer, forever. If a
    // referral row already exists for this user under ANY referrer, this one
    // does not get to claim them.
    const existing = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id::text FROM creator_referrals WHERE referred_user_id = $1 LIMIT 1`,
      [input.referredUserId],
    );
    if (existing.length > 0) {
      return { attributed: false, reason: 'already_attributed' };
    }

    await this.dataSource.query(
      `UPDATE creator_referrals
          SET referred_user_id = $1, registered_at = now(), stage = 'registered', updated_at = now()
        WHERE id = $2`,
      [input.referredUserId, input.referralId],
    );

    await this.crmEvents.recordSafe({
      userId: input.referredUserId,
      creatorProfileId: input.referrerProfileId,
      eventName: CREATOR_EVENTS.REFERRAL_BUYER_SIGNUP,
      dedupKey: `c5:referral:signup:${input.referralId}`,
      actorId: input.referrerUserId,
    });
    // §40 — `referral_activation`. Activation is the first MEANINGFUL action
    // a referred account takes, which for a buyer is the purchase below; the
    // signup itself only proves an account exists, so the event is recorded
    // here as the funnel's activation marker and never as a conversion.
    await this.crmEvents.recordSafe({
      userId: input.referredUserId,
      creatorProfileId: input.referrerProfileId,
      eventName: CREATOR_EVENTS.REFERRAL_ACTIVATION,
      dedupKey: `c5:referral:activation:${input.referralId}`,
      actorId: input.referrerUserId,
    });

    // §34 — "somebody signed up with your link", in Persian, short.
    // The name comes from the users table so the message is about a person
    // the creator can recognise; a generic "somebody" makes the notification
    // impossible to act on.
    const referred = await this.dataSource.query<
      Array<{ name: string | null }>
    >(`SELECT COALESCE(full_name, username) AS name FROM users WHERE id = $1`, [
      input.referredUserId,
    ]);
    await this.notifications.notifyEventSafe(
      input.referrerUserId,
      NOTIFICATION_TYPES.C5_REFERRAL_SIGNUP,
      { referredName: referred[0]?.name ?? 'یک کاربر جدید' },
      { link: '/creator/scale/referral' },
    );

    return { attributed: true, reason: null };
  }

  /** §4/§8 — the creator's referral dashboard, with actionable advice. */
  async creatorDashboard(creatorProfileId: string) {
    const rows = await this.dataSource.query<
      Array<{
        stage: string;
        n: string;
        revenue: string;
        clicks: string;
      }>
    >(
      `SELECT stage,
              COUNT(*)::text AS n,
              COALESCE(SUM(attributed_revenue_minor), 0)::text AS revenue,
              COALESCE(SUM(click_count), 0)::text AS clicks
         FROM creator_referrals
        WHERE referrer_id = $1
        GROUP BY stage`,
      [creatorProfileId],
    );

    const byStage: Record<string, number> = {};
    let revenueMinor = 0;
    let clicks = 0;
    for (const row of rows) {
      byStage[row.stage] = Number.parseInt(row.n, 10);
      revenueMinor += Number.parseInt(row.revenue, 10);
      clicks += Number.parseInt(row.clicks, 10);
    }

    const registered = byStage.registered ?? 0;
    const activated = byStage.creator_started ?? 0;
    const converted = (byStage.first_sale ?? 0) + (byStage.rewarded ?? 0);

    return {
      clicks,
      registered,
      activated,
      converted,
      revenueMinor,
      byStage,
      // `null` when nobody clicked. §18's rule applied to the creator's own
      // dashboard: "no traffic" must not render as "0% conversion", or the
      // advice below tells a creator their link converts terribly when it has
      // never been seen.
      conversionRate: clicks > 0 ? registered / clicks : null,
      saleRate: registered > 0 ? converted / registered : null,
      byKind: await this.splitByKind(creatorProfileId),
    };
  }

  private async splitByKind(creatorProfileId: string) {
    const rows = await this.dataSource.query<
      Array<{ kind: string; n: string }>
    >(
      `SELECT referral_kind AS kind, COUNT(*)::text AS n
         FROM creator_referrals
        WHERE referrer_id = $1
        GROUP BY referral_kind`,
      [creatorProfileId],
    );
    const out: Record<string, number> = { creator: 0, buyer: 0 };
    for (const row of rows) out[row.kind] = Number.parseInt(row.n, 10);
    return out;
  }

  /** §8 — concrete next steps, chosen from what is actually missing. */
  adviceFor(dashboard: {
    clicks: number;
    registered: number;
    converted: number;
  }): string[] {
    const advice: string[] = [];
    if (dashboard.clicks === 0) {
      // §42: an empty state that names the next thing, not the absence.
      advice.push('share_your_link');
      return advice;
    }
    if (dashboard.registered === 0) {
      advice.push('link_not_shared');
      advice.push('share_your_link');
    } else if (dashboard.converted === 0) {
      advice.push('introduce_your_products');
    } else {
      advice.push('share_sales_page');
      advice.push('use_ready_content');
    }
    return advice;
  }

  // ------------------------------------------------------------------ //
  // §5 — the referral VIEW: the one shape the dashboard renders.        //
  // ------------------------------------------------------------------ //

  /**
   * §5/§6/§7/§8 — the whole referral dashboard, in the contract shape.
   *
   * Why this method exists: the handler used to return the RAW aggregate
   * (`clicks`, `registered`, `revenueMinor`, `byStage`), a `ledger`, and a
   * list of bare advice KEYS — while the page is written against the nested
   * contract in `api/types.ts` (`stats.revenue` as `{amountMinor,currency}`,
   * per-referral `rows`, a shareable `url`). The two disagreed on every
   * single field, so `const { stats } = data` produced `undefined` and the
   * first `stats.clicks` threw. Every creator saw the error state, on every
   * visit, with data in the database. The contract is the single source of
   * truth and this method produces it.
   *
   * Money is `{ amountMinor, currency }` rather than a bare number because
   * §7 requires a currency beside every amount: the UI divides by 100 for
   * IRR and by 10 for toman, and an amount without a currency cannot be
   * formatted correctly by anyone.
   */
  async creatorReferralView(
    creatorProfileId: string,
    creatorUserId: string,
  ): Promise<{
    code: string;
    url: string;
    stats: {
      clicks: number;
      signups: number;
      conversions: number;
      conversionRate: number | null;
      revenue: { amountMinor: number; currency: string };
      rewards: { amountMinor: number; currency: string };
    };
    rows: Array<{
      id: string;
      kind: 'creator' | 'buyer';
      code: string;
      stage: string;
      clicks: number;
      registeredAt: Date | null;
      attributedRevenue: { amountMinor: number; currency: string };
      rewards: Array<{
        id: string;
        referralId: string;
        reason: string;
        amount: { amountMinor: number; currency: string };
        status: string;
        createdAt: Date;
        updatedAt: Date;
        paidReference: string | null;
        riskFlag: { reason: string; detail: string | null } | null;
      }>;
    }>;
    advice: Array<{ key: string }>;
  }> {
    const link = await this.ensureLink(creatorProfileId, creatorUserId);
    const dashboard = await this.creatorDashboard(creatorProfileId);
    const ledger = await this.rewards.creatorLedger(creatorProfileId);
    const currency = await this.accountCurrency(creatorProfileId);
    const rows = await this.referralRows(creatorProfileId, currency);

    return {
      code: link.code,
      url: this.shareUrl(link.code),
      stats: {
        clicks: dashboard.clicks,
        signups: dashboard.registered,
        conversions: dashboard.converted,
        conversionRate: dashboard.conversionRate,
        revenue: { amountMinor: dashboard.revenueMinor, currency },
        // `earned` = available + paid, i.e. money that has actually been
        // recognised. A `pending` reward is a claim under review, and
        // putting it in the same box as transferred money overstates what a
        // creator has by an amount no one has approved.
        rewards: { amountMinor: ledger.earned, currency },
      },
      rows,
      // §8 — the server decides WHAT is worth suggesting; the client decides
      // how to SAY it. Shipping Persian `title`/`body` strings inside an API
      // response would freeze the advice in one language, so only the key
      // travels and the copy lives in the i18n catalogue.
      advice: this.adviceFor(dashboard).map((key) => ({ key })),
    };
  }

  /**
   * §5 — the creator's ONE link, minted the first time they look at it.
   *
   * Get-or-create, not a "create your link" button: a referral programme
   * whose first step is a form is a programme nobody starts. The insert is
   * retried against the UNIQUE (referrer_id, code) index, and a concurrent
   * request that won the race is returned instead of being an error — two
   * tabs opening the page at once must not produce a 500.
   */
  private async ensureLink(
    creatorProfileId: string,
    creatorUserId: string,
  ): Promise<CreatorReferral> {
    // `referred_user_id IS NULL` is what marks the LINK row. A real referral
    // always has a referred user; the link row is the code's home and the
    // place `click_count` accumulates.
    const existing = await this.referrals.findOne({
      where: { referrerId: creatorProfileId, referredUserId: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (existing) return existing;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = await this.mintCode(creatorProfileId);
      try {
        return await this.referrals.save(
          this.referrals.create({
            referrerId: creatorProfileId,
            referrerUserId: creatorUserId,
            code,
            stage: 'invited' as ReferralStage,
          }),
        );
      } catch {
        const raced = await this.referrals.findOne({
          where: { referrerId: creatorProfileId, referredUserId: IsNull() },
          order: { createdAt: 'ASC' },
        });
        if (raced) return raced;
      }
    }
    throw new BadRequestException('تولید کد دعوت ممکن نشد');
  }

  /** §16 — a code that is unique per referrer, checked against the index. */
  private async mintCode(creatorProfileId: string): Promise<string> {
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
    throw new BadRequestException('تولید کد دعوت ممکن نشد');
  }

  /**
   * §16 — the shareable URL. Identical in shape to the C4 referral centre's,
   * and it reads the SAME `publicSiteUrl` setting: a link that pointed at a
   * different host than every other share link on the site is a bug waiting
   * to be reported as "the link is broken".
   */
  private shareUrl(code: string): string {
    const origin =
      this.config.get<string>('publicSiteUrl') ?? 'https://mesh.ir';
    return `${origin.replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`;
  }

  /**
   * §7 — the currency this creator's money is denominated in.
   *
   * Taken from a reward row when there is one, so the figure on screen
   * matches the figure in the ledger rather than a hard-coded default that
   * would be wrong the first time a currency other than IRR is configured.
   */
  private async accountCurrency(creatorProfileId: string): Promise<string> {
    const rows = await this.dataSource.query<
      Array<{ currency: string | null }>
    >(
      `SELECT currency FROM referral_rewards
        WHERE referrer_id = $1
        LIMIT 1`,
      [creatorProfileId],
    );
    return rows[0]?.currency ?? 'IRR';
  }

  /**
   * §5 — one row per person the link actually brought in, newest first.
   *
   * `referred_user_id IS NOT NULL` is the whole distinction between a
   * REFERRAL and the creator's own LINK row. Without it every creator would
   * appear in their own table as having referred themselves, which is both
   * wrong and — on a page whose entire promise is "your link works" — a
   * number nobody can trust afterwards.
   */
  private async referralRows(
    creatorProfileId: string,
    currency: string,
  ) {
    const referrals = await this.dataSource.query<
      Array<{
        id: string;
        kind: string;
        code: string;
        stage: string;
        clicks: string;
        registered_at: Date | null;
        revenue: string;
      }>
    >(
      `SELECT id,
              referral_kind AS kind,
              code,
              stage,
              COALESCE(click_count, 0)::text AS clicks,
              registered_at,
              COALESCE(attributed_revenue_minor, 0)::text AS revenue
         FROM creator_referrals
        WHERE referrer_id = $1 AND referred_user_id IS NOT NULL
        ORDER BY created_at DESC`,
      [creatorProfileId],
    );
    if (referrals.length === 0) return [];

    // One grouped query for every reward of every row, not one query per
    // row: the table is small today and the N+1 would be the thing that
    // makes it slow the month it is not.
    const rewards = await this.dataSource.query<
      Array<{
        id: string;
        referral_id: string;
        reason: string;
        amount: string;
        currency: string;
        status: string;
        created_at: Date;
        updated_at: Date;
        paid_reference: string | null;
        risk_flag: string | null;
      }>
    >(
      `SELECT id,
              referral_id,
              reason,
              amount_minor::text AS amount,
              currency,
              status,
              created_at,
              updated_at,
              paid_reference,
              risk_flag
         FROM referral_rewards
        WHERE referral_id = ANY($1::uuid[])
        ORDER BY created_at ASC`,
      [referrals.map((r) => r.id)],
    );

    const byReferral = new Map<string, typeof rewards>();
    for (const reward of rewards) {
      const list = byReferral.get(reward.referral_id) ?? [];
      list.push(reward);
      byReferral.set(reward.referral_id, list);
    }

    return referrals.map((row) => ({
      id: row.id,
      kind: row.kind === 'buyer' ? ('buyer' as const) : ('creator' as const),
      code: row.code,
      stage: row.stage,
      clicks: Number.parseInt(row.clicks, 10) || 0,
      registeredAt: row.registered_at,
      attributedRevenue: {
        amountMinor: Number.parseInt(row.revenue, 10) || 0,
        // `creator_referrals.attributed_revenue_minor` carries no currency
        // of its own; it is always the account currency the rewards are
        // denominated in.
        currency,
      },
      rewards: (byReferral.get(row.id) ?? []).map((reward) => ({
        id: reward.id,
        referralId: reward.referral_id,
        reason: reward.reason,
        amount: {
          amountMinor: Number.parseInt(reward.amount, 10) || 0,
          currency: reward.currency,
        },
        status: reward.status,
        createdAt: reward.created_at,
        updatedAt: reward.updated_at,
        paidReference: reward.paid_reference,
        // §47 — a flagged reward is shown to the person it affects. The flag
        // is a `varchar` on the ledger row; the UI needs a reason it can
        // render, and there is no separate detail column to expose.
        riskFlag: reward.risk_flag
          ? { reason: reward.risk_flag, detail: null }
          : null,
      })),
    }));
  }
}
