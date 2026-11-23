import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Affiliate } from '../../database/entities/scale/affiliate.entity';
import { RewardService } from './reward.service';
import { EmailService } from '../email/email.service';
import { AffiliateCommission } from '../../database/entities/scale/affiliate-commission.entity';
import { User } from '../../database/entities/identity/user.entity';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import {
  isSafeExternalUrl,
  nextAffiliateStatus,
  validateAffiliateContact,
  type AffiliateStatus,
} from './domain/affiliate';
import { CrmEventsService } from '../crm/crm-events.service';
import { CREATOR_EVENTS } from '../crm/domain/events';

/**
 * Phase C5 §19–§22 — the affiliate programme.
 *
 * Separate from C4's referral service on purpose (§19). They share
 * attribution and the money primitives; what they do NOT share is an
 * identity, a status and an approval flow. An affiliate applies, is approved
 * or rejected by an admin, and earns a percentage of orders. A referral is a
 * link a creator already had.
 *
 * Two rules carry the weight here:
 *
 *  - **A creator can apply but cannot approve.** `apply` is a creator
 *    capability; `approve`/`reject` are admin ones. §36 lists this
 *    prohibition explicitly and it is enforced by the capability table, not
 *    by a check inside this method that a new call site could forget.
 *
 *  - **The rate is set by config at approval, never sent by the applicant.**
 *    A form field that carries its own commission rate is a form that pays
 *    whatever it asks for.
 */

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(
    @InjectRepository(Affiliate)
    private readonly affiliates: Repository<Affiliate>,
    @InjectRepository(AffiliateCommission)
    private readonly commissions: Repository<AffiliateCommission>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly rewards: RewardService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly crmEvents: CrmEventsService,
    private readonly emails: EmailService,
  ) {}

  /**
   * §20 — the application, kept as short as the spec allows.
   *
   * No payment details are collected (owner decision, §55): there is no
   * automatic payout, so a bank account at application time would be data the
   * platform has no use for. A payout destination is recorded by an admin at
   * `paid` time, out of band.
   */
  async apply(input: {
    userId: string;
    displayName: string;
    website: string | null;
    socialLinks: string[];
    audienceSize: number | null;
    channels: string[];
    audienceType: string | null;
    reason: string | null;
  }): Promise<{ affiliate: Affiliate; created: boolean }> {
    const existing = await this.affiliates.findOneBy({ userId: input.userId });
    if (existing) {
      // Re-applying after a rejection resets the record to `pending` rather
      // than creating a second one: the unique index on user_id would reject
      // it anyway, and a person who was turned down once and came back must
      // be reviewable again.
      if (existing.status === 'rejected' || existing.status === 'suspended') {
        existing.status = 'pending';
        existing.decisionReason = null;
        existing.decidedAt = null;
        existing.decidedBy = null;
        await this.affiliates.save(existing);
        return { affiliate: existing, created: false };
      }
      return { affiliate: existing, created: false };
    }

    const contact = validateAffiliateContact({
      website: input.website,
      socialLinks: input.socialLinks,
    });
    if (!contact.ok) {
      // Refused with a FIELD, so the form can put the message on the right
      // input rather than at the top of the page.
      throw Object.assign(new Error('affiliate_contact_required'), {
        field: contact.field,
      });
    }
    // A stored URL is later rendered as a link in the admin console, so it
    // must be http(s). `javascript:` here would be stored as a "website" and
    // would attack the admin who clicks it.
    if (input.website && !isSafeExternalUrl(input.website)) {
      throw Object.assign(new Error('affiliate_website_invalid'), {
        field: 'website',
      });
    }
    const links = input.socialLinks.filter((link) => isSafeExternalUrl(link));

    const affiliate = await this.affiliates.save(
      this.affiliates.create({
        userId: input.userId,
        displayName: input.displayName.slice(0, 120),
        websiteUrl: input.website?.trim() || null,
        socialLinks: links,
        audienceSize: input.audienceSize,
        channels: input.channels,
        audienceType: input.audienceType,
        reason: input.reason,
        status: 'pending',
        code: await this.mintCode(),
        commissionRateBps: 0,
      }),
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.C5_AFFILIATE_APPLIED,
      entity: AUDIT_ENTITIES.AFFILIATE,
      entityId: affiliate.id,
      metadata: { channels: input.channels, audienceType: input.audienceType },
      context: { actorId: input.userId },
    });

    // §40 — the top of the affiliate funnel. Without it the console could
    // only count approvals, and an admin could not tell whether the drop-off
    // was in applications or in decisions.
    await this.crmEvents.recordSafe({
      userId: input.userId,
      eventName: CREATOR_EVENTS.AFFILIATE_APPLIED,
      dedupKey: `c5:affiliate:applied:${affiliate.id}`,
      entityType: 'affiliate',
      entityId: affiliate.id,
      metadata: { channels: input.channels, audienceType: input.audienceType },
    });

    return { affiliate, created: true };
  }

  /**
   * §21 — admin decision.
   *
   * `reason` is REQUIRED for a rejection. A rejected application with no
   * stated reason is unactionable for the applicant and un-auditable for the
   * platform, and §21 asks for the reason to be recorded.
   */
  async decide(
    affiliateId: string,
    decision: Extract<AffiliateStatus, 'approved' | 'rejected' | 'suspended'>,
    adminUserId: string,
    reason: string | null,
  ): Promise<{
    changed: boolean;
    blocked: string | null;
    affiliate: Affiliate | null;
  }> {
    const affiliate = await this.affiliates.findOneBy({ id: affiliateId });
    if (!affiliate)
      return { changed: false, blocked: 'not_found', affiliate: null };

    if (decision === 'rejected' && (!reason || reason.trim().length === 0)) {
      return { changed: false, blocked: 'reason_required', affiliate };
    }

    const next = nextAffiliateStatus(affiliate.status, decision);
    if (next === null) {
      return { changed: false, blocked: 'illegal_transition', affiliate };
    }
    if (next === affiliate.status) {
      return { changed: false, blocked: 'already_in_state', affiliate };
    }

    affiliate.status = next;
    affiliate.decisionReason = reason?.trim() || null;
    affiliate.decidedBy = adminUserId;
    affiliate.decidedAt = new Date();
    await this.affiliates.save(affiliate);

    await this.audit.record({
      action:
        decision === 'approved'
          ? AUDIT_ACTIONS.C5_AFFILIATE_APPROVED
          : decision === 'rejected'
            ? AUDIT_ACTIONS.C5_AFFILIATE_REJECTED
            : AUDIT_ACTIONS.C5_AFFILIATE_STATUS_CHANGED,
      entity: AUDIT_ENTITIES.AFFILIATE,
      entityId: affiliate.id,
      metadata: {
        from: affiliate.status,
        to: decision,
        reason: reason ?? null,
      },
      context: { actorId: adminUserId },
    });

    // §34 — the applicant is told, in their own language, what happened.
    // A partner-applied affiliate (§20 allows a Partner to apply) has no user
    // to notify: they are administered by staff, so the decision lives in the
    // admin console and an in-app notification would have nowhere to go.
    if (affiliate.userId) {
      await this.notifications.notifyEventSafe(
        affiliate.userId,
        NOTIFICATION_TYPES.C5_AFFILIATE_DECISION,
        { reason: reason ?? '' },
        {
          variant: decision === 'approved' ? 'approved' : 'rejected',
          link: '/creator/scale/affiliate',
        },
      );
      // §35 — approval is one of the six meaningful events. A rejection is
      // NOT emailed: it is a "no", and the in-app notification already says
      // it with the reason. Mailing a refusal is how a platform gets marked
      // as spam.
      if (decision === 'approved') {
        await this.crmEvents.recordSafe({
          userId: affiliate.userId,
          eventName: CREATOR_EVENTS.AFFILIATE_APPROVED,
          dedupKey: `c5:affiliate:approved:${affiliate.id}`,
          entityType: 'affiliate',
          entityId: affiliate.id,
          metadata: { decidedBy: adminUserId },
        });
        await this.emails
          .enqueue({
            template: 'c5_affiliate_approved',
            userId: affiliate.userId,
            data: { affiliateCode: affiliate.code },
            relatedEntityType: 'affiliate',
            relatedEntityId: affiliate.id,
          })
          .catch(() => null);
      }
    }

    return { changed: true, blocked: null, affiliate };
  }

  /**
   * §22 — the dashboard for a creator who has not applied yet.
   *
   * The creator page reads `stats` and `commissions` BEFORE it looks at
   * `affiliate`, and the contract (`AffiliateView`) says `affiliate` is the
   * nullable part, not the whole response. Returning a bare `null` here made
   * `useAsync` treat "no application" as a failed request, so every creator
   * who had never applied saw the error state instead of the apply form.
   */
  emptyDashboard() {
    const zero = { amountMinor: 0, currency: 'IRR' };
    return {
      affiliate: null,
      stats: {
        clicks: 0,
        conversions: 0,
        conversionRate: null,
        revenue: zero,
        commissions: zero,
        pendingCommissions: zero,
      },
      commissions: [],
      byStatus: {},
    };
  }

  /**
   * §22 — the affiliate's own dashboard numbers.
   *
   * Returns the contract in `api/types.ts` (`AffiliateView`). The previous
   * shape put every number at the top level (`purchases`, `rateBps`,
   * `byStatus`) while the page reads `stats.conversions`,
   * `affiliate.commissionRateBps` and a `commissions` array — so the page
   * destructured `stats` as `undefined` and threw on `stats.clicks`. Every
   * approved affiliate saw the error state.
   *
   * Money is `{ amountMinor, currency }` for the same reason everywhere else
   * in C5: an amount without a currency cannot be formatted correctly, and
   * the page's `formatMoney` divides by a per-currency factor.
   */
  async dashboard(affiliateId: string) {
    const affiliate = await this.affiliates.findOneBy({ id: affiliateId });
    if (!affiliate) return null;

    // One grouped pass gives the per-status split AND every total, instead of
    // four queries that can disagree with each other between statements.
    const rows = await this.dataSource.query<
      Array<{
        status: string;
        amount: string;
        n: string;
        order_total: string;
        currency: string;
      }>
    >(
      `SELECT status,
              COALESCE(SUM(amount_minor), 0)::text AS amount,
              COUNT(*)::text AS n,
              COALESCE(SUM(order_total_minor), 0)::text AS order_total,
              (SELECT currency FROM affiliate_commissions
                WHERE affiliate_id = $1 LIMIT 1) AS currency
         FROM affiliate_commissions
        WHERE affiliate_id = $1
        GROUP BY status`,
      [affiliateId],
    );

    const byStatus: Record<string, { amount: number; count: number }> = {};
    let revenueMinor = 0;
    let commissionsMinor = 0;
    let pendingMinor = 0;
    let conversions = 0;
    let currency = 'IRR';
    for (const row of rows) {
      byStatus[row.status] = {
        amount: Number.parseInt(row.amount, 10) || 0,
        count: Number.parseInt(row.n, 10) || 0,
      };
      revenueMinor += Number.parseInt(row.order_total, 10) || 0;
      commissionsMinor += Number.parseInt(row.amount, 10) || 0;
      conversions += Number.parseInt(row.n, 10) || 0;
      // §24: `pending` and `approved` are both not-yet-payable. Lumping them
      // in with `available` would tell an affiliate money is ready when an
      // admin has not released it.
      if (row.status === 'pending' || row.status === 'approved') {
        pendingMinor += Number.parseInt(row.amount, 10) || 0;
      }
      if (row.currency) currency = row.currency;
    }

    const recent = await this.dataSource.query<
      Array<{
        id: string;
        order_id: string | null;
        amount: string;
        currency: string;
        status: string;
        created_at: Date;
      }>
    >(
      `SELECT id,
              order_id,
              amount_minor::text AS amount,
              currency,
              status,
              created_at
         FROM affiliate_commissions
        WHERE affiliate_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [affiliateId],
    );

    return {
      affiliate: {
        id: affiliate.id,
        status: affiliate.status,
        displayName: affiliate.displayName,
        websiteUrl: affiliate.websiteUrl,
        // §17 — the thing the affiliate actually shares. The page used to
        // render `affiliate.id` (an internal UUID) inside the box labelled
        // "your code and link", which is neither a code nor a link and
        // cannot be shared with anyone.
        code: affiliate.code,
        url: this.shareUrl(affiliate.code),
        commissionRateBps: affiliate.commissionRateBps,
        // §44/§55 — always manual. There is no automated payout, and the UI
        // says so rather than implying one.
        payoutMode: 'manual_admin_confirmed' as const,
        decisionReason: affiliate.decisionReason,
        decidedAt: affiliate.decidedAt
          ? affiliate.decidedAt.toISOString()
          : null,
      },
      stats: {
        clicks: affiliate.clickCount,
        conversions,
        // `null`, not 0, when nobody clicked. "No traffic" and "everyone who
        // clicked declined" are different facts, and a dashboard that renders
        // the first as the second gets a good affiliate removed.
        conversionRate:
          affiliate.clickCount > 0
            ? Number((conversions / affiliate.clickCount).toFixed(2))
            : null,
        revenue: { amountMinor: revenueMinor, currency },
        commissions: { amountMinor: commissionsMinor, currency },
        pendingCommissions: { amountMinor: pendingMinor, currency },
      },
      commissions: recent.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        amount: {
          amountMinor: Number.parseInt(row.amount, 10) || 0,
          currency: row.currency,
        },
        status: row.status,
        createdAt: row.created_at,
      })),
      // Kept for the admin-facing aggregate; the creator page does not read
      // it, and the per-status split is the only place `available` vs `paid`
      // can be told apart.
      byStatus,
    };
  }

  /**
   * §17 — the affiliate's shareable URL, identical in shape to the creator
   * referral link and built from the same `publicSiteUrl` setting. Both
   * resolve through `GET /public/r/:code`, so one link format is one thing
   * less for an affiliate to get wrong.
   */
  private shareUrl(code: string): string {
    const origin =
      this.config.get<string>('publicSiteUrl') ?? 'https://mesh.ir';
    return `${origin.replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`;
  }

  /** §17 — record a click. Rate-limited at the controller. */
  async recordClick(code: string): Promise<boolean> {
    const result = await this.dataSource.query<Array<{ id: string }>>(
      `UPDATE affiliates SET click_count = click_count + 1, updated_at = now()
        WHERE code = $1 AND status = 'approved'
        RETURNING id`,
      [code],
    );
    return result.length > 0;
  }

  /**
   * §40 — the analytics events §40 names, recorded on the shared C1 ledger.
   *
   * `recordSafe` so a tracking failure can never roll back a business
   * transaction. A creator's conversion must not be un-done because an event
   * row could not be written.
   */
  async recordConversionEvent(
    affiliate: Affiliate,
    orderId: string,
  ): Promise<void> {
    // §40. `recordSafe` never throws, so no try/catch is needed here: a
    // tracking failure must not roll back the business transaction that
    // caused it, and that guarantee already lives in CrmEventsService.
    await this.crmEvents.recordSafe({
      userId: affiliate.userId,
      eventName: CREATOR_EVENTS.AFFILIATE_CONVERSION,
      dedupKey: `c5:affiliate:conversion:${orderId}`,
      entityType: 'order',
      entityId: orderId,
      metadata: { affiliateId: affiliate.id, code: affiliate.code },
    });
  }

  /**
   * §23 — the commission owed for a confirmed order, resolved from the
   * platform's own attribution rather than from anything the caller supplies.
   *
   * The affiliate is found by the buyer having clicked an APPROVED affiliate
   * link; a pending, rejected or self-referred affiliate earns nothing, and
   * that decision is made here rather than by the payment path so it cannot
   * be influenced from outside.
   */
  async creditOrderConversion(input: {
    buyerUserId: string;
    orderId: string;
    orderStatus: string;
    orderTotalMinor: number;
  }): Promise<'created' | 'duplicate' | 'ineligible' | 'none'> {
    // §25 — a creator buying through their own affiliate link is refused
    // before any money is reserved, not flagged afterwards.
    const selfHit = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT a.id FROM affiliates a
         JOIN creator_profiles p ON p.user_id = a.user_id
        WHERE a.user_id = $1 AND a.status = 'approved'
        LIMIT 1`,
      [input.buyerUserId],
    );
    if (selfHit.length > 0) return 'ineligible';

    // The affiliate is linked to a referred BUYER through the same
    // creator_referrals row the referral programme uses — there is no second
    // click table, and inventing one would let the two subsystems disagree
    // about who referred a buyer. `referral_kind = 'buyer'` is what
    // distinguishes a buyer referral from a creator referral.
    const attributed = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT a.id
         FROM creator_referrals cr
         JOIN affiliates a ON a.user_id = cr.referrer_user_id
        WHERE cr.referred_user_id = $1
          AND cr.referral_kind = 'buyer'
          AND cr.registered_at IS NOT NULL
          AND a.status = 'approved'
        ORDER BY cr.registered_at ASC
        LIMIT 1`,
      [input.buyerUserId],
    );
    if (attributed.length === 0) return 'none';

    const affiliateId = attributed[0].id;
    const rateBps = this.config.get<number>('scaleCommissionRateBps') ?? 0;
    if (rateBps <= 0) return 'ineligible';

    const affiliate = await this.affiliates.findOneBy({ id: affiliateId });
    if (!affiliate) return 'none';

    const result = await this.rewards.createCommissionIfEligible({
      affiliateId,
      orderId: input.orderId,
      orderStatus: input.orderStatus,
      orderTotalMinor: input.orderTotalMinor,
      rateBps,
      referredUserId: input.buyerUserId,
    });
    if (result.created) {
      await this.recordConversionEvent(affiliate, input.orderId);
      return 'created';
    }
    return result.blocked === 'duplicate' ? 'duplicate' : 'ineligible';
  }

  /** A short, non-sequential, non-guessable code. */
  private async mintCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = `af${Math.random().toString(36).slice(2, 10)}`;
      const taken = await this.affiliates.findOneBy({ code: candidate });
      if (!taken) return candidate;
    }
    // Unreachable in practice; if it ever is, a collision must fail loudly
    // rather than silently hand two affiliates the same code.
    throw new Error('could not mint a unique affiliate code');
  }
}
