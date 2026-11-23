import { Injectable, Logger } from '@nestjs/common';
import { ScaleReferralService } from './referral.service';
import { RewardService } from './reward.service';
import { AffiliateService } from './affiliate.service';
import { CrmEventsService } from '../crm/crm-events.service';
import { CREATOR_EVENTS } from '../crm/domain/events';
import { InjectRepository } from '@nestjs/typeorm';
import type { RiskAssessmentInput } from './domain/attribution';
import { Repository } from 'typeorm';
import { GrowthRiskFlag } from '../../database/entities/scale/growth-risk-flag.entity';

/**
 * Phase C5 §1 — the seam that makes SCALE a growth LOOP rather than five
 * disconnected subsystems.
 *
 * Everything C5 promises is a consequence of one purchase:
 *
 *   paid order → attribution → referral reward → affiliate commission
 *             → analytics events → risk flags → notifications
 *
 * Without a single caller of `ReferralService.attributeOrder` and
 * `RewardService.createCommissionIfEligible`, none of that ever happened:
 * the endpoints were real but the funnel was not, which is exactly what §1
 * forbids ("not a set of independent pages").
 *
 * Design constraints this class exists to satisfy:
 *
 *  - It NEVER throws. It is invoked from the payment confirmation path, and a
 *    lost attribution must not roll back a paid order (§6: a failure to
 *    attribute is a lost reward, not a failed purchase).
 *  - It runs AFTER the payment transaction commits, for the same reason
 *    PLAYBOOK Phase 8 gives: no rewards on a rolled-back payment.
 *  - It is idempotent. The payment webhook is retried by design, so every
 *    reward/commission is keyed on the order and the unique indexes turn a
 *    replay into a no-op rather than a second payout (§38).
 */
@Injectable()
export class GrowthLoopService {
  private readonly logger = new Logger(GrowthLoopService.name);

  constructor(
    private readonly referrals: ScaleReferralService,
    private readonly rewards: RewardService,
    private readonly affiliates: AffiliateService,
    private readonly crmEvents: CrmEventsService,
    @InjectRepository(GrowthRiskFlag)
    private readonly riskFlags: Repository<GrowthRiskFlag>,
  ) {}

  /**
   * §6, §7, §23, §40 — run the whole loop for one confirmed payment.
   *
   * Returns a report rather than throwing, so the caller can log it and the
   * tests can assert on which links actually fired. `errors` is populated
   * instead of being thrown, because a partially-failed loop must remain
   * observable rather than silent.
   */
  async onOrderPaid(input: {
    buyerUserId: string;
    orderId: string;
    orderTotalMinor: number;
  }): Promise<{
    attributedTo: string | null;
    kind: string | null;
    reason: string | null;
    referralReward: 'created' | 'duplicate' | 'not_configured' | 'none';
    affiliateCommission: 'created' | 'duplicate' | 'ineligible' | 'none';
    errors: string[];
  }> {
    const report = {
      attributedTo: null as string | null,
      kind: null as string | null,
      reason: null as string | null,
      referralReward: 'none' as
        'created' | 'duplicate' | 'not_configured' | 'none',
      affiliateCommission: 'none' as
        'created' | 'duplicate' | 'ineligible' | 'none',
      errors: [] as string[],
    };

    // ---- 1. Attribution (§6) ------------------------------------------
    try {
      const attribution = await this.referrals.attributeOrder({
        buyerUserId: input.buyerUserId,
        orderId: input.orderId,
        orderTotalMinor: input.orderTotalMinor,
      });
      report.attributedTo = attribution.attributedTo;
      report.kind = attribution.kind;
      report.reason = attribution.reason;
    } catch (error) {
      report.errors.push(`attribution:${this.describe(error)}`);
      this.logger.error(
        `C5 attribution failed for order ${input.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return report;
    }

    // ---- 2. Referral reward (§7) ---------------------------------------
    // Only a genuine attribution may mint money. `no_claimable_touch` and a
    // self-referral both leave the referrer null, so nothing is paid here.
    if (report.attributedTo) {
      try {
        const reward = await this.rewards.rewardForOrder({
          buyerUserId: input.buyerUserId,
          orderId: input.orderId,
          orderTotalMinor: input.orderTotalMinor,
        });
        report.referralReward = reward;
      } catch (error) {
        report.errors.push(`referralReward:${this.describe(error)}`);
        this.logger.error(
          `C5 referral reward failed for order ${input.orderId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // ---- 3. Affiliate commission (§23) ---------------------------------
    try {
      report.affiliateCommission = await this.affiliates.creditOrderConversion({
        buyerUserId: input.buyerUserId,
        orderId: input.orderId,
        orderStatus: 'paid',
        orderTotalMinor: input.orderTotalMinor,
      });
    } catch (error) {
      report.errors.push(`affiliateCommission:${this.describe(error)}`);
      this.logger.error(
        `C5 affiliate commission failed for order ${input.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return report;
  }

  /**
   * §47 — fraud signals, evaluated once per order and AFTER money is
   * reserved rather than before. A flag never blocks a reward (§7): it holds
   * the reward at `pending` so a human decides, because auto-rejecting on a
   * heuristic would let a false positive destroy a real creator's earnings.
   */
  async assessOrderRisk(
    input: RiskAssessmentInput & { subjectType: string; subjectId: string },
  ): Promise<{ flagged: boolean; signals: string[] }> {
    try {
      const signals = await this.rewards.assessAndFlag(
        input.subjectType,
        input.subjectId,
        input,
      );
      return {
        flagged: signals.length > 0,
        signals: signals.map((signal) => signal.kind),
      };
    } catch (error) {
      this.logger.warn(
        `C5 risk assessment failed for ${input.subjectType}:${input.subjectId} — ${this.describe(error)}`,
      );
      return { flagged: false, signals: [] };
    }
  }

  /** §40 — the conversion event, recorded once per order. */
  async recordConversion(input: {
    orderId: string;
    buyerUserId: string;
    attributedTo: string | null;
  }): Promise<void> {
    await this.crmEvents.recordSafe({
      userId: input.buyerUserId,
      creatorProfileId: input.attributedTo,
      eventName: CREATOR_EVENTS.REFERRAL_BUYER_CONVERSION,
      dedupKey: `c5:loop:conversion:${input.orderId}`,
      metadata: { orderId: input.orderId },
    });
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
