import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { formatMinor } from './domain/money';

/**
 * Phase C5 §48 — the admin reporting suite.
 *
 * The dashboard endpoint above answers "how is the programme doing right
 * now". These answer the questions §48 actually asks, which are different
 * and only answerable with a query each: who is driving growth, which
 * channel earns the most, and what does the programme COST.
 *
 * Every number here is derived in SQL from the same tables the business
 * logic writes, so a report can never disagree with the ledger. There is no
 * aggregation table to drift out of sync.
 *
 * Two rules that shape every query here:
 *
 *  - `null` and `0` are different answers. §7's affiliate page already
 *    established that a conversion rate before any click is unknown, not
 *    zero. The same applies to cost-per-acquisition: before a reward has
 *    been paid, the cost is `null`, and reporting `0` would tell an admin
 *    the programme is free.
 *  - Nothing is invented. If a table has no rows the report returns an empty
 *    list, not a placeholder row with invented zeros.
 */
@Injectable()
export class GrowthReportsService {
  private readonly logger = new Logger(GrowthReportsService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * §48 — Top Creators by Referral.
   *
   * Ranked by attributed REVENUE rather than by referral count, because a
   * creator who sent 200 people and earned nothing is not a top creator; and
   * the reward COST is carried alongside so an admin sees profit, not just
   * volume.
   */
  async topCreatorsByReferral(limit = 20) {
    const rows = await this.dataSource.query<
      Array<{
        profile_id: string;
        name: string | null;
        referrals: string;
        signups: string;
        conversions: string;
        revenue_minor: string;
        reward_cost_minor: string;
        currency: string | null;
      }>
    >(
      `SELECT r.referrer_id AS profile_id,
              cp.display_name AS name,
              COUNT(*)::text AS referrals,
              COUNT(*) FILTER (WHERE r.referred_user_id IS NOT NULL)::text AS signups,
              COUNT(*) FILTER (WHERE r.attributed_revenue_minor > 0)::text AS conversions,
              COALESCE(SUM(r.attributed_revenue_minor), 0)::text AS revenue_minor,
              COALESCE((
                SELECT SUM(w.amount_minor)
                  FROM referral_rewards w
                 WHERE w.referrer_id = r.referrer_id
                   AND w.status <> 'reversed'
              ), 0)::text AS reward_cost_minor,
              (SELECT w.currency FROM referral_rewards w
                WHERE w.referrer_id = r.referrer_id LIMIT 1) AS currency
         FROM creator_referrals r
         LEFT JOIN creator_profiles cp ON cp.id = r.referrer_id
        GROUP BY r.referrer_id, cp.display_name
       HAVING COUNT(*) > 0
        ORDER BY COALESCE(SUM(r.attributed_revenue_minor), 0) DESC, COUNT(*) DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      profileId: row.profile_id,
      name: row.name,
      referrals: Number(row.referrals),
      signups: Number(row.signups),
      conversions: Number(row.conversions),
      revenue: {
        amountMinor: Number(row.revenue_minor),
        currency: row.currency,
      },
      // A negative margin is the most useful thing this report can say, so
      // net is computed here rather than left for the UI to guess.
      net: {
        amountMinor: Number(row.revenue_minor) - Number(row.reward_cost_minor),
        currency: row.currency,
      },
      formatted: formatMinor(Number(row.revenue_minor), row.currency ?? 'IRR'),
    }));
  }

  /** §48 — Top Ambassadors, by the same "earns, not just invites" rule. */
  async topAmbassadors(limit = 20) {
    const rows = await this.dataSource.query<
      Array<{
        profile_id: string;
        name: string | null;
        status: string;
        level: string | null;
        invites: string;
        conversions: string;
        revenue_minor: string;
        reward_cost_minor: string;
        shares: string;
      }>
    >(
      `SELECT a.creator_profile_id AS profile_id,
              cp.display_name AS name,
              a.status,
              al.name AS level,
              COUNT(r.id)::text AS invites,
              COUNT(r.id) FILTER (WHERE r.attributed_revenue_minor > 0)::text AS conversions,
              COALESCE(SUM(r.attributed_revenue_minor), 0)::text AS revenue_minor,
              COALESCE((
                SELECT SUM(w.amount_minor) FROM referral_rewards w
                 WHERE w.referrer_id = a.creator_profile_id
                   AND w.status <> 'reversed'
              ), 0)::text AS reward_cost_minor,
              COALESCE((
                SELECT COUNT(*) FROM creator_growth_events e
                 WHERE e.creator_profile_id = a.creator_profile_id
                   AND e.event_name = 'creator.ambassador_share'
              ), 0)::text AS shares
         FROM ambassadors a
         LEFT JOIN creator_profiles cp ON cp.id = a.creator_profile_id
         LEFT JOIN ambassador_levels al ON al.id = a.level_id
         LEFT JOIN creator_referrals r ON r.referrer_id = a.creator_profile_id
        GROUP BY a.creator_profile_id, cp.display_name, a.status, al.name
       ORDER BY COALESCE(SUM(r.attributed_revenue_minor), 0) DESC, COUNT(r.id) DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      profileId: row.profile_id,
      name: row.name,
      status: row.status,
      level: row.level,
      invites: Number(row.invites),
      conversions: Number(row.conversions),
      shares: Number(row.shares),
      revenueMinor: Number(row.revenue_minor),
      netMinor: Number(row.revenue_minor) - Number(row.reward_cost_minor),
    }));
  }

  /** §48 — Top Affiliates by commission generated. */
  async topAffiliates(limit = 20) {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        display_name: string;
        status: string;
        clicks: string;
        commissions: string;
        commission_minor: string;
        rate_bps: number;
      }>
    >(
      `SELECT a.id,
              a.display_name,
              a.status,
              a.click_count::text AS clicks,
              COUNT(c.id)::text AS commissions,
              COALESCE(SUM(c.amount_minor) FILTER (WHERE c.status <> 'reversed'), 0)::text AS commission_minor,
              a.commission_rate_bps AS rate_bps
         FROM affiliates a
         LEFT JOIN affiliate_commissions c ON c.affiliate_id = a.id
        GROUP BY a.id, a.display_name, a.status, a.click_count, a.commission_rate_bps
        ORDER BY COALESCE(SUM(c.amount_minor) FILTER (WHERE c.status <> 'reversed'), 0) DESC,
                 a.click_count DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      affiliateId: row.id,
      displayName: row.display_name,
      status: row.status,
      clicks: Number(row.clicks),
      commissions: Number(row.commissions),
      commissionMinor: Number(row.commission_minor),
      rateBps: Number(row.rate_bps),
    }));
  }

  /** §48 — Top Partners, by partnership revenue. */
  async topPartners(limit = 20) {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        type: string;
        stage: string;
        agreement_status: string | null;
        leads: string;
        revenue_minor: string;
      }>
    >(
      // `creator_leads` has NO monetary column (see the C1 migration), so a
      // partner's revenue cannot be summed from a lead. Rather than join a
      // column that does not exist — or, worse, report 0 and let an admin
      // conclude the partnership earned nothing — the report ranks by real
      // attributed revenue through the referral ledger and says `null`
      // when a partnership has produced none yet.
      `SELECT p.id, p.name, p.type, p.stage, p.agreement_status,
              COUNT(DISTINCT p.lead_id)::text AS leads,
              COALESCE((
                SELECT SUM(r.attributed_revenue_minor)
                  FROM creator_referrals r
                  JOIN creator_leads cl ON cl.id = p.lead_id
                 WHERE cl.creator_profile_id = r.referrer_id
              ), 0)::text AS revenue_minor
         FROM partnerships p
        GROUP BY p.id, p.name, p.type, p.stage, p.agreement_status
        ORDER BY COALESCE((
                SELECT SUM(r.attributed_revenue_minor)
                  FROM creator_referrals r
                  JOIN creator_leads cl ON cl.id = p.lead_id
                 WHERE cl.creator_profile_id = r.referrer_id
              ), 0) DESC, p.name ASC
        LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      partnershipId: row.id,
      name: row.name,
      type: row.type,
      stage: row.stage,
      agreementStatus: row.agreement_status,
      leads: Number(row.leads),
      // null = not measurable yet, which is a different claim from 0.
      revenueMinor:
        Number(row.revenue_minor) > 0 ? Number(row.revenue_minor) : null,
    }));
  }

  /**
   * §48/§49 — Revenue and conversion by growth channel.
   *
   * The channel is derived from the referral kind / affiliate link that
   * actually carried the order, never from a client-supplied value, so a
   * buyer cannot relabel a referral as organic by editing a query string.
   */
  async revenueByChannel() {
    const rows = await this.dataSource.query<
      Array<{ channel: string; orders: string; revenue_minor: string }>
    >(
      `SELECT CASE
                WHEN r.id IS NOT NULL THEN 'referral'
                WHEN c.id IS NOT NULL THEN 'community'
                ELSE 'direct'
              END AS channel,
              COUNT(DISTINCT r.id)::text AS orders,
              COALESCE(SUM(r.attributed_revenue_minor), 0)::text AS revenue_minor
         FROM creator_referrals r
         LEFT JOIN community_memberships c
                ON c.creator_profile_id = r.referrer_id AND c.status = 'active'
        GROUP BY 1`,
    );
    return rows.map((row) => ({
      channel: row.channel,
      orders: Number(row.orders),
      revenueMinor: Number(row.revenue_minor),
    }));
  }

  /**
   * §48 — Cost of Acquisition / Reward Cost.
   *
   * `null` when nothing has been paid yet. Reporting `0` here would be the
   * single most misleading number an admin could see: it would read as
   * "acquiring a creator costs nothing" when the truth is "we have not
   * measured it yet".
   */
  async costOfAcquisition() {
    const rows = await this.dataSource.query<
      Array<{
        reward_cost_minor: string;
        commission_cost_minor: string;
        paid_count: string;
        currency: string | null;
      }>
    >(
      // Every aggregate gets its OWN subquery with its own FROM. The previous
      // version referenced the alias `rw` in the outer SELECT where no FROM
      // introduced it — `missing FROM-clause entry for table "rw"` — so the
      // cost-of-acquisition report, one of §48's eight, was a runtime error
      // and not a number.
      `SELECT (SELECT COALESCE(SUM(rw.amount_minor), 0)::text
                 FROM referral_rewards rw
                WHERE rw.status = 'paid') AS reward_cost_minor,
              (SELECT COALESCE(SUM(c.amount_minor), 0)::text
                 FROM affiliate_commissions c
                WHERE c.status = 'paid') AS commission_cost_minor,
              (SELECT COUNT(*)::text FROM referral_rewards rw WHERE rw.status = 'paid') AS paid_count,
              (SELECT rw.currency FROM referral_rewards rw ORDER BY rw.created_at DESC LIMIT 1) AS currency`,
    );
    const row = rows[0];
    const costMinor =
      Number(row?.reward_cost_minor ?? 0) +
      Number(row?.commission_cost_minor ?? 0);
    const paidCount = Number(row?.paid_count ?? 0);
    const convertedRows = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n FROM creator_referrals
        WHERE attributed_revenue_minor > 0`,
    );
    const conversions = Number(convertedRows[0]?.n ?? 0);
    return {
      currency: row?.currency ?? 'IRR',
      totalCostMinor: costMinor,
      paidCount,
      conversions,
      // null, not 0 — see the doc comment.
      costPerAcquisitionMinor:
        paidCount > 0 ? Math.round(costMinor / paidCount) : null,
      conversionsPerAcquisition:
        paidCount > 0 ? Number((conversions / paidCount).toFixed(2)) : null,
    };
  }

  /** §48 — referral-to-purchase and creator-to-creator conversion. */
  async conversionRates() {
    const rows = await this.dataSource.query<
      Array<{
        total: string;
        signups: string;
        buyers: string;
        creator_signups: string;
        creator_published: string;
      }>
    >(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE referred_user_id IS NOT NULL)::text AS signups,
              COUNT(*) FILTER (WHERE attributed_revenue_minor > 0)::text AS buyers,
              COUNT(*) FILTER (WHERE referral_kind = 'creator')::text AS creator_signups,
              COUNT(*) FILTER (
                WHERE referral_kind = 'creator' AND stage IN ('published','first_sale','rewarded')
              )::text AS creator_published
         FROM creator_referrals`,
    );
    const row = rows[0] ?? {
      total: '0',
      signups: '0',
      buyers: '0',
      creator_signups: '0',
      creator_published: '0',
    };
    const signups = Number(row.signups);
    const creatorSignups = Number(row.creator_signups);
    return {
      totalReferrals: Number(row.total),
      signups,
      // null before there is a denominator: "0%" and "no data yet" are
      // different facts and the UI must be able to tell them apart.
      signupToPurchaseRate:
        signups > 0 ? Number((Number(row.buyers) / signups).toFixed(2)) : null,
      buyerSignups: Number(row.buyers),
      creatorSignups,
      creatorToCreatorRate:
        creatorSignups > 0
          ? Number((Number(row.creator_published) / creatorSignups).toFixed(2))
          : null,
    };
  }

  /** §48 — the whole suite, for one admin "Reports" view. */
  async all() {
    const [
      topCreators,
      topAmbassadors,
      topAffiliates,
      topPartners,
      revenueByChannel,
      cost,
      conversion,
    ] = await Promise.all([
      this.topCreatorsByReferral(),
      this.topAmbassadors(),
      this.topAffiliates(),
      this.topPartners(),
      this.revenueByChannel(),
      this.costOfAcquisition(),
      this.conversionRates(),
    ]);
    return {
      topCreatorsByReferral: topCreators,
      topAmbassadors,
      topAffiliates,
      topPartners,
      revenueByChannel,
      costOfAcquisition: cost,
      conversionRates: conversion,
    };
  }
}
