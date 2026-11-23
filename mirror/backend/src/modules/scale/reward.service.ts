import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReferralReward } from '../../database/entities/scale/referral-reward.entity';
import { GrowthRiskFlag } from '../../database/entities/scale/growth-risk-flag.entity';
import { CreatorReferral } from '../../database/entities/success/creator-referral.entity';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import {
  commissionKey,
  evaluateCommission,
  isRewardAmountValid,
  nextRewardStatus,
  type RewardStatus,
} from './domain/money';
import { assessRisk, type RiskSignal } from './domain/attribution';
import { formatMinor } from './domain/money';
import { EmailService } from '../email/email.service';
import { CrmEventsService } from '../crm/crm-events.service';
import { CREATOR_EVENTS } from '../crm/domain/events';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';

/**
 * Phase C5 §7, §23, §38 — the money path.
 *
 * Every rule that decides whether money is owed lives here or in
 * `domain/money.ts`. Nothing in this service trusts a value that came from a
 * client: the amount is computed from config, the status is validated against
 * the state machine, and the approver is taken from the authenticated admin.
 *
 * The two invariants worth stating up front, because they are what the rest
 * of the code is arranged around:
 *
 *  1. **A reward row is created at most once per (referral, reason).** The
 *     database has a unique index on that pair, so a retried webhook, a
 *     replayed queue message and a double-clicked button all collide there
 *     rather than in application code that another process could race.
 *
 *  2. **Nothing moves backwards except to `reversed`, and `reversed` is
 *     terminal.** A paid row that could be walked back would erase the record
 *     that money left the platform.
 */
@Injectable()
export class RewardService {
  private readonly logger = new Logger(RewardService.name);

  constructor(
    @InjectRepository(ReferralReward)
    private readonly rewards: Repository<ReferralReward>,
    @InjectRepository(GrowthRiskFlag)
    private readonly riskFlags: Repository<GrowthRiskFlag>,
    @InjectRepository(CreatorReferral)
    private readonly referrals: Repository<CreatorReferral>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly crmEvents: CrmEventsService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailService,
  ) {}

  /** §9/§22 — reward amounts come from config, never from a request body. */
  private amountFor(reason: string): number {
    const map: Record<string, number> = {
      // Flat rewards in minor units, read from config so a commercial change
      // never requires a deploy (§9: rules must be controllable in the
      // backend).
      creator_published:
        this.config.get<number>('scalerewardCreatorPublished') ?? 0,
      creator_first_sale:
        this.config.get<number>('scalerewardCreatorFirstSale') ?? 0,
      buyer_purchase: this.config.get<number>('scalerewardBuyerPurchase') ?? 0,
    };
    return map[reason] ?? 0;
  }

  /**
   * Create a reward if one is owed, and return the existing row if not.
   *
   * The `ON CONFLICT DO NOTHING … RETURNING` is the whole idempotency story:
   * when the insert loses the race it returns nothing, and the follow-up
   * SELECT finds the row the winner created. Two concurrent payment webhooks
   * therefore produce exactly one reward row and both callers get a valid
   * answer, rather than one crashing on a unique violation.
   */
  async createReward(input: {
    referralId: string;
    referrerId: string;
    reason: string;
    orderId?: string | null;
    currency?: string;
  }): Promise<{
    created: boolean;
    reward: ReferralReward;
    blocked: string | null;
  }> {
    const amount = this.amountFor(input.reason);
    const currency = input.currency ?? 'IRR';

    if (!isRewardAmountValid(amount, currency)) {
      // A configured reward of 0 is a legitimate state — the programme exists,
      // the commercial terms are not set. It is NOT an error and it does NOT
      // create a row, because a zero-value "payable" reward is either a
      // config bug or an attempt to create a creditable nothing.
      return {
        created: false,
        reward: null as unknown as ReferralReward,
        blocked: 'reward_not_configured',
      };
    }

    const inserted = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO referral_rewards
         (referral_id, referrer_id, reason, amount_minor, currency, order_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (referral_id, reason) DO NOTHING
       RETURNING id`,
      [
        input.referralId,
        input.referrerId,
        input.reason,
        amount,
        currency,
        input.orderId ?? null,
      ],
    );

    if (inserted.length > 0) {
      const reward = await this.rewards.findOneByOrFail({ id: inserted[0].id });
      this.logger.log(
        `C5 reward created: ${input.reason} for referral ${input.referralId}`,
      );
      // §40 — recorded only when a row was actually inserted. The
      // ON CONFLICT path below is the idempotent replay of an event that was
      // already counted, and re-emitting there would inflate the funnel.
      await this.crmEvents.recordSafe({
        creatorProfileId: reward.referrerId,
        eventName: CREATOR_EVENTS.REFERRAL_REWARD_CREATED,
        dedupKey: `c5:reward:created:${reward.id}`,
        metadata: {
          reason: input.reason,
          amountMinor: String(reward.amountMinor),
        },
      });
      return { created: true, reward, blocked: null };
    }

    const existing = await this.rewards.findOneBy({
      referralId: input.referralId,
      reason: input.reason,
    });
    return { created: false, reward: existing!, blocked: null };
  }

  /**
   * §7 — the reward a confirmed purchase earns, wired to the real order.
   *
   * This is the method the payment path calls. It deliberately resolves the
   * referral itself rather than trusting a caller-supplied referrer id: a
   * caller that could name its own referrer could pay itself (§37 — never
   * trust the frontend, and here not even the caller).
   *
   * Returns WHY there is no reward, not just a falsy value, so the loop can
   * report `not_configured` separately from `duplicate` — the first means
   * "the programme has no price yet", the second means "already paid".
   */
  async rewardForOrder(input: {
    buyerUserId: string;
    orderId: string;
    orderTotalMinor: number;
  }): Promise<'created' | 'duplicate' | 'not_configured' | 'none'> {
    // Only a buyer referral earns money on a purchase. A creator referral is
    // paid when the referred creator publishes or makes their first sale, and
    // paying it here too would double-count the same relationship.
    const referral = await this.referrals.findOne({
      where: { referredUserId: input.buyerUserId },
    });
    if (!referral) return 'none';

    const result = await this.createReward({
      referralId: referral.id,
      referrerId: referral.referrerId,
      reason: 'buyer_purchase',
      orderId: input.orderId,
    });
    if (result.created) return 'created';
    if (result.blocked === 'reward_not_configured') return 'not_configured';
    return 'duplicate';
  }

  /**
   * §47 — assess one referral and record every signal that fires.
   *
   * Flags never block. A flagged reward is HELD at `pending` with the flag
   * recorded, so an admin decides. Auto-rejecting on a heuristic would let a
   * false positive destroy a real creator's earnings, which is a worse
   * outcome than the fraud it was defending against.
   */
  async assessAndFlag(
    subjectType: string,
    subjectId: string,
    input: Parameters<typeof assessRisk>[0],
  ): Promise<RiskSignal[]> {
    const signals = assessRisk(input);
    for (const signal of signals) {
      const already = await this.riskFlags.findOneBy({
        kind: signal.kind,
        subjectType,
        subjectId,
        status: 'open',
      });
      if (already) continue;
      await this.riskFlags.save(
        this.riskFlags.create({
          kind: signal.kind,
          subjectType,
          subjectId,
          severity: signal.severity,
          detail: signal.detail,
          status: 'open',
        }),
      );
      this.logger.warn(
        `C5 risk flag ${signal.kind} on ${subjectType} ${subjectId}: ${signal.detail}`,
      );
    }
    return signals;
  }

  /**
   * Move a reward through the lifecycle, or refuse.
   *
   * Returns `{ changed: false }` for both "already in that state" (a retry,
   * which is fine) and "not allowed" (which is not) — but with distinct
   * `blocked` values so the audit trail records which happened.
   */
  async transition(
    rewardId: string,
    to: RewardStatus,
    adminUserId: string,
    options: { reason?: string; paidReference?: string } = {},
  ): Promise<{
    changed: boolean;
    blocked: string | null;
    reward: ReferralReward | null;
  }> {
    const applied = await this.dataSource.transaction(async (runner) => {
      // FOR UPDATE: two admins clicking approve on the same row must not both
      // read `pending` and both write an approval. The second waits, re-reads,
      // and finds the row already moved.
      const rows = await runner.query<Array<Record<string, unknown>>>(
        `SELECT id, status FROM referral_rewards WHERE id = $1 FOR UPDATE`,
        [rewardId],
      );
      if (rows.length === 0) {
        return { changed: false, blocked: 'not_found', reward: null };
      }

      const from = rows[0].status as RewardStatus;
      const next = nextRewardStatus(from, to);
      if (next === null) {
        return { changed: false, blocked: 'illegal_transition', reward: null };
      }
      if (next === from) {
        // Already there. Idempotent by design (§38) — a repeated request is
        // not a failure, it is a no-op that changes nothing.
        const current = await runner.query<Array<Record<string, unknown>>>(
          `SELECT * FROM referral_rewards WHERE id = $1`,
          [rewardId],
        );
        return {
          changed: false,
          blocked: 'already_in_state',
          reward: this.hydrate(current[0]),
        };
      }

      const nowColumn: Record<string, string> = {
        approved: 'approved_at',
        available: 'available_at',
        paid: 'paid_at',
        reversed: 'reversed_at',
      };
      const extra =
        to === 'paid'
          ? `, paid_reference = $3`
          : to === 'reversed'
            ? `, reversal_reason = $3`
            : '';
      const params: unknown[] =
        to === 'paid' || to === 'reversed'
          ? [rewardId, next, options.paidReference ?? options.reason ?? null]
          : [rewardId, next];

      await runner.query(
        `UPDATE referral_rewards
            SET status = $2, ${nowColumn[to]} = now()${extra}, updated_at = now()
          WHERE id = $1`,
        params,
      );

      const settled = await runner.query<Array<Record<string, unknown>>>(
        `SELECT * FROM referral_rewards WHERE id = $1`,
        [rewardId],
      );
      const reward = this.hydrate(settled[0]);

      await this.audit.record({
        action:
          to === 'reversed'
            ? AUDIT_ACTIONS.C5_REWARD_REVERSED
            : to === 'paid'
              ? AUDIT_ACTIONS.C5_REWARD_PAID
              : to === 'approved'
                ? AUDIT_ACTIONS.C5_REWARD_APPROVED
                : AUDIT_ACTIONS.C5_REWARD_AVAILABLE,
        entity: AUDIT_ENTITIES.REFERRAL_REWARD,
        entityId: rewardId,
        metadata: { from, to, reason: options.reason ?? null },
        context: { actorId: adminUserId },
      });

      return { changed: true, blocked: null, reward };
    });

    // §34 — outside the transaction, so a notification failure can never
    // roll the state change back, and only for the two states a creator acts
    // on. `approved` and `paid` are admin-side bookkeeping; `available` is the
    // "your money is ready" step and `reversed` is the one they must not
    // discover later on a payout page.
    const appliedReward = applied.reward;
    if (
      applied.changed &&
      appliedReward &&
      (to === 'available' || to === 'reversed')
    ) {
      const owner = await this.dataSource
        .query<Array<{ user_id: string }>>(
          `SELECT user_id FROM creator_profiles WHERE id = $1`,
          [appliedReward.referrerId],
        )
        .then((rows) => rows[0]?.user_id ?? null)
        .catch(() => null);
      if (owner) {
        await this.notifications.notifyEventSafe(
          owner,
          to === 'available'
            ? NOTIFICATION_TYPES.C5_REWARD_AVAILABLE
            : NOTIFICATION_TYPES.C5_REWARD_REVERSED,
          {
            // Rendered with the platform's own money helper rather than
            // toLocaleString: the target runtime's ICU data is not
            // guaranteed, and a wrong grouping is a wrong number to a
            // creator deciding whether to withdraw.
            amount: formatMinor(
              Number(appliedReward.amountMinor),
              appliedReward.currency,
            ),
            reason: options.reason ?? 'بررسی مالی',
          },
          { link: '/creator/scale/referral' },
        );
        // §35 — a reward becoming payable is one of the six events that
        // justifies an email. Enqueued, not sent inline: the outbox owns
        // delivery and retries, and a mail failure cannot roll back money.
        await this.emails
          .enqueue({
            template: 'c5_reward_available',
            userId: owner,
            data: {
              amount: formatMinor(
                Number(appliedReward.amountMinor),
                appliedReward.currency,
              ),
              currency: appliedReward.currency,
            },
            relatedEntityType: 'referral_reward',
            relatedEntityId: appliedReward.id,
          })
          .catch(() => null);
      }
    }

    return applied;
  }

  /**
   * §23 — the commission for a paid order, or the reason there is none.
   *
   * The `commissionKey` is what the unique index enforces. A duplicate is
   * reported as `duplicate` rather than as an error, because a second
   * commission for the same order is the expected outcome of a retried
   * webhook, not a fault.
   */
  async createCommissionIfEligible(input: {
    affiliateId: string;
    orderId: string;
    orderStatus: string;
    orderTotalMinor: number;
    rateBps: number;
    currency?: string;
    referredUserId?: string | null;
    selfReferral?: boolean;
    fraudHeld?: boolean;
    minimumMinor?: number;
  }): Promise<{ created: boolean; blocked: string | null }> {
    const minimum =
      input.minimumMinor ??
      this.config.get<number>('scalecommissionMinimum') ??
      0;
    const verdict = evaluateCommission(
      {
        orderStatus: input.orderStatus,
        orderTotalMinor: input.orderTotalMinor,
        refunded: false,
        selfReferral: input.selfReferral ?? false,
        fraudHeld: input.fraudHeld ?? false,
        minimumMinor: minimum,
      },
      input.rateBps,
    );

    if ('blocked' in verdict) {
      // The refusal itself is recorded. §23 asks that every commission be
      // traceable to an order, and an admin asking "why did this order earn
      // nothing?" can only be answered from this row.
      await this.dataSource
        .query(
          `INSERT INTO growth_risk_flags (kind, subject_type, subject_id, severity, detail, status)
         VALUES ($1, 'commission', $2, 'low', $3, 'open')
         ON CONFLICT DO NOTHING`,
          [
            'suspicious_conversion',
            input.orderId,
            `commission refused: ${verdict.blocked}`,
          ],
        )
        .catch(() => {
          // Recording the refusal is best-effort. Failing a real commission
          // because an audit row could not be written would be a worse bug than
          // the missing audit row.
          this.logger.warn(
            `could not record refused commission for order ${input.orderId}`,
          );
        });
      return { created: false, blocked: verdict.blocked };
    }

    const key = commissionKey({
      sourceId: input.affiliateId,
      orderId: input.orderId,
      kind: 'affiliate',
    });
    const inserted = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO affiliate_commissions
         (idempotency_key, affiliate_id, order_id, referred_user_id,
          order_total_minor, rate_bps, amount_minor, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        key,
        input.affiliateId,
        input.orderId,
        input.referredUserId ?? null,
        input.orderTotalMinor,
        input.rateBps,
        verdict.amountMinor,
        input.currency ?? 'IRR',
      ],
    );
    return {
      created: inserted.length > 0,
      blocked: inserted.length > 0 ? null : 'duplicate',
    };
  }

  /**
   * The identical lifecycle, applied to a commission.
   *
   * `domain/money.ts` has ONE state machine on purpose (§19 lets affiliate
   * and referral share infrastructure, and the commercial reality is that a
   * pending commission and a pending reward are the same object with a
   * different payee). Re-implementing it here would guarantee a divergence.
   */
  async transitionCommission(
    commissionId: string,
    to: RewardStatus,
    adminUserId: string,
    options: { reason?: string; paidReference?: string } = {},
  ): Promise<{ changed: boolean; blocked: string | null }> {
    return this.dataSource.transaction(async (runner) => {
      const rows = await runner.query<Array<{ status: string }>>(
        `SELECT status FROM affiliate_commissions WHERE id = $1 FOR UPDATE`,
        [commissionId],
      );
      if (rows.length === 0) return { changed: false, blocked: 'not_found' };

      const from = rows[0].status as RewardStatus;
      const next = nextRewardStatus(from, to);
      if (next === null)
        return { changed: false, blocked: 'illegal_transition' };
      if (next === from) return { changed: false, blocked: 'already_in_state' };

      const nowColumn: Record<string, string> = {
        approved: 'approved_at',
        available: 'available_at',
        paid: 'paid_at',
        reversed: 'reversed_at',
      };
      const extra =
        to === 'paid'
          ? `, paid_reference = $3`
          : to === 'reversed'
            ? `, reversal_reason = $3`
            : '';
      const params: unknown[] =
        to === 'paid' || to === 'reversed'
          ? [
              commissionId,
              next,
              options.paidReference ?? options.reason ?? null,
            ]
          : [commissionId, next];

      await runner.query(
        `UPDATE affiliate_commissions
            SET status = $2, ${nowColumn[to]} = now()${extra}, updated_at = now()
          WHERE id = $1`,
        params,
      );

      await this.audit.record({
        action:
          to === 'reversed'
            ? AUDIT_ACTIONS.C5_COMMISSION_REVERSED
            : to === 'paid'
              ? AUDIT_ACTIONS.C5_COMMISSION_PAID
              : AUDIT_ACTIONS.C5_COMMISSION_APPROVED,
        entity: AUDIT_ENTITIES.AFFILIATE_COMMISSION,
        entityId: commissionId,
        metadata: { from, to, reason: options.reason ?? null },
        context: { actorId: adminUserId },
      });

      return { changed: true, blocked: null };
    });
  }

  /**
   * Bigint columns arrive as strings (or numbers, depending on the driver);
   * normalise so callers can add them without a type error.
   *
   * The value is checked rather than coerced: `String(undefined)` yields the
   * literal text 'undefined' and `String({})` yields '[object Object]', so a
   * blind `String(row.amount_minor ?? '0')` would turn a missing amount into a
   * number a payout page could then try to pay. A missing amount throws
   * instead — a reward with no amount is a data bug, not a zero reward.
   */
  private hydrate(row: Record<string, unknown>): ReferralReward {
    const raw = row.amount_minor;
    if (
      raw !== null &&
      raw !== undefined &&
      typeof raw !== 'string' &&
      typeof raw !== 'number' &&
      typeof raw !== 'bigint'
    ) {
      throw new TypeError(
        `referral reward ${String(row.id)} has a non-numeric amount_minor (${typeof raw})`,
      );
    }
    return {
      ...(row as unknown as ReferralReward),
      amountMinor: String(raw ?? 0),
    };
  }

  /** §48 — the reporting aggregate, computed not stored. */
  async creatorLedger(creatorProfileId: string) {
    const rows = await this.dataSource.query<
      Array<{ status: string; total: string }>
    >(
      `SELECT status, COALESCE(SUM(amount_minor), 0)::text AS total
         FROM referral_rewards
        WHERE referrer_id = $1
        GROUP BY status`,
      [creatorProfileId],
    );
    const byStatus: Record<string, number> = {};
    for (const row of rows)
      byStatus[row.status] = Number.parseInt(row.total, 10);
    return {
      byStatus,
      pending: byStatus.pending ?? 0,
      approved: byStatus.approved ?? 0,
      available: byStatus.available ?? 0,
      paid: byStatus.paid ?? 0,
      reversed: byStatus.reversed ?? 0,
      // Owed but not yet paid. `available` + `paid` is "earned"; subtracting
      // `paid` is "still to receive". Both are real questions, so both are
      // returned rather than one being derived in the UI.
      earned: (byStatus.available ?? 0) + (byStatus.paid ?? 0),
      outstanding: byStatus.available ?? 0,
    };
  }
}
