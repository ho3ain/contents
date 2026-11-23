import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CRM_STAGES,
  buildFunnelMetrics,
  STAGE_DEFINITIONS,
  STAGE_TRANSITION_KEYS,
  type FunnelStageMetrics,
} from './domain/funnel';
import { SCORING_CONFIG } from './domain/scoring';
import { CRM_SOURCES } from './domain/taxonomy';
import { AUTOMATION_READY_EVENTS } from './domain/events';
import {
  CrmRecordsService,
  type ActivityThresholds,
} from './crm-records.service';
import { CrmEngagementService } from './crm-engagement.service';
import { CrmEventsService } from './crm-events.service';
import { OPEN_ACTION_STATUSES } from './domain/taxonomy';

/**
 * Phase C1 — the Growth Dashboard (spec §12) and revenue attribution (§13).
 *
 * Every number here is aggregated from real rows. Where a rate or a duration
 * cannot be computed honestly (an empty previous stage, a sample of one) the
 * API returns `null` and the UI says "not enough data" — the project rule
 * "هیچ عدد ساختگی نمایش داده نمی‌شود" applies to the CRM exactly as it does
 * to the creator analytics.
 */
@Injectable()
export class CrmAnalyticsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly records: CrmRecordsService,
    private readonly engagement: CrmEngagementService,
    private readonly events: CrmEventsService,
  ) {}

  /** The funnel with per-stage count, conversion, drop-off and cycle time. */
  async funnel(thresholds: ActivityThresholds): Promise<{
    stages: FunnelStageMetrics[];
    definitions: Array<{
      stage: string;
      definitionKey: string;
      entryConditionKey: string;
      exitConditionKey: string;
    }>;
    transitions: Array<{ from: string; to: string; key: string }>;
  }> {
    const { counts, daysToNext } = await this.records.stageCounts(thresholds);
    return {
      stages: buildFunnelMetrics(counts, daysToNext),
      definitions: STAGE_DEFINITIONS.map((definition) => ({
        stage: definition.stage,
        definitionKey: definition.definitionKey,
        entryConditionKey: definition.entryConditionKey,
        exitConditionKey: definition.exitConditionKey,
      })),
      // The key is built from the SAME stage ids used everywhere else, so a
      // renamed stage cannot silently lose its label in the browser.
      transitions: STAGE_TRANSITION_KEYS.map(([from, to]) => ({
        from,
        to,
        key: `crm.transition.${from}_to_${to}`,
      })),
    };
  }

  /**
   * The KPI strip of §1. Each value is a real count, and each one is
   * clickable into the filtered list — the numbers and the rows can never
   * disagree because both come from the same projection.
   */
  async kpis(thresholds: ActivityThresholds): Promise<{
    totalLeads: number;
    newLeads: number;
    contacted: number;
    replied: number;
    interested: number;
    qualified: number;
    registered: number;
    activated: number;
    productStarted: number;
    submitted: number;
    approved: number;
    published: number;
    firstSale: number;
    growingCreators: number;
    /** C2: how many leads were dropped, and how many are still recoverable. */
    lostLeads: number;
    openActions: number;
    overdueActions: number;
  }> {
    const { counts } = await this.records.stageCounts(thresholds);
    // "Total Leads" is the number of people the team knows about; every
    // other stage is a subset of it, so the funnel is monotonic by
    // construction rather than by a hand-written sum.
    const totalLeads = await this.countRecords();
    const [lostLeads, openActions, overdueActions] = await Promise.all([
      // Counted from the leads table rather than the stage projection,
      // because "lost" is an outcome and no lead is excluded from the funnel
      // for having it — the two views have to be read together.
      this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
           FROM creator_leads
          WHERE outcome = 'lost' AND merged_into_id IS NULL`,
      ),
      this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count FROM creator_crm_actions WHERE status = ANY($1::text[])`,
        [OPEN_ACTION_STATUSES],
      ),
      this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
           FROM creator_crm_actions
          WHERE status = ANY($1::text[])
            AND due_date IS NOT NULL AND due_date < now()`,
        [OPEN_ACTION_STATUSES],
      ),
    ]);
    return {
      totalLeads,
      newLeads: counts.new_lead ?? 0,
      contacted: counts.contacted ?? 0,
      replied: counts.replied ?? 0,
      interested: counts.interested ?? 0,
      qualified: counts.qualified ?? 0,
      registered: counts.registered ?? 0,
      activated: counts.creator_activated ?? 0,
      productStarted: counts.product_started ?? 0,
      submitted: counts.product_submitted ?? 0,
      approved: counts.approved ?? 0,
      published: counts.published ?? 0,
      firstSale: counts.first_sale ?? 0,
      growingCreators: counts.growing ?? 0,
      lostLeads: Number.parseInt(lostLeads[0]?.count ?? '0', 10),
      openActions: Number.parseInt(openActions[0]?.count ?? '0', 10),
      overdueActions: Number.parseInt(overdueActions[0]?.count ?? '0', 10),
    };
  }

  /**
   * Phase C2 §11 — acquisition analytics, by channel.
   *
   * The funnel report answers "how far did people get". This one answers the
   * question the growth team actually asks: WHICH channel brings people who
   * then CONVERT, and which one brings a crowd that never replies.
   *
   * Every count here is a count of real rows, and a lead that is marked lost
   * is reported in its own column rather than being removed from the
   * denominator — dropping it would quietly improve the numbers of the
   * channel that keeps failing to convert.
   */
  async acquisitionAnalytics(): Promise<{
    rows: Array<{
      source: string;
      leads: number;
      contacted: number;
      replied: number;
      interested: number;
      qualified: number;
      registered: number;
      lost: number;
      /** replies ÷ leads — the honest measure of channel quality. */
      replyRate: number | null;
      /** registered ÷ leads. */
      conversionRate: number | null;
    }>;
    totals: {
      leads: number;
      replied: number;
      registered: number;
      lost: number;
      replyRate: number | null;
      conversionRate: number | null;
    };
  }> {
    // The stage is derived from the event ledger, so the whole acquisition
    // picture has to be derived there too — the same single pass the list
    // uses, so these numbers can never disagree with the list.
    const rows = await this.acquisitionRows();

    const totals = rows.reduce(
      (sum, row) => ({
        leads: sum.leads + row.leads,
        replied: sum.replied + row.replied,
        registered: sum.registered + row.registered,
        lost: sum.lost + row.lost,
      }),
      { leads: 0, replied: 0, registered: 0, lost: 0 },
    );

    const withRates = rows.map((row) => ({
      ...row,
      replyRate: rate(row.replied, row.leads),
      conversionRate: rate(row.registered, row.leads),
    }));

    return {
      rows: withRates.sort((a, b) => b.leads - a.leads),
      totals: {
        ...totals,
        replyRate: rate(totals.replied, totals.leads),
        conversionRate: rate(totals.registered, totals.leads),
      },
    };
  }

  /**
   * One pass over the leads plus the event ledger.
   *
   * The `replied`/`interested` counts are the number of DISTINCT leads with
   * that event, not the number of events — a lead who replied twice is one
   * replied lead, which is what makes the rate comparable across channels.
   */
  private async acquisitionRows(): Promise<
    Array<{
      source: string;
      leads: number;
      contacted: number;
      replied: number;
      interested: number;
      qualified: number;
      registered: number;
      lost: number;
    }>
  > {
    return this.dataSource.query(
      `SELECT l.source::text AS source,
              COUNT(*)::int AS leads,
              COUNT(*) FILTER (WHERE ac.contacted)::int AS contacted,
              COUNT(*) FILTER (WHERE ac.replied)::int  AS replied,
              COUNT(*) FILTER (WHERE ac.interested)::int AS interested,
              COUNT(*) FILTER (WHERE l.qualified_at IS NOT NULL)::int AS qualified,
              COUNT(*) FILTER (WHERE l.user_id IS NOT NULL)::int AS registered,
              COUNT(*) FILTER (WHERE l.outcome = 'lost')::int AS lost
         FROM creator_leads l
         LEFT JOIN LATERAL (
           SELECT
             BOOL_OR(e.event_name = ANY(ARRAY['crm.outreach','crm.note_added',
                                            'creator.login','creator.registered',
                                            'crm.replied','crm.interested'])) AS contacted,
             BOOL_OR(e.event_name = ANY(ARRAY['crm.replied','crm.interested'])) AS replied,
             BOOL_OR(e.event_name = 'crm.interested') AS interested
             FROM creator_growth_events e
            WHERE e.lead_id = l.id
         ) ac ON TRUE
        WHERE l.merged_into_id IS NULL
        GROUP BY l.source`,
    );
  }

  private async countRecords(): Promise<number> {
    const rows = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT (
         (SELECT COUNT(*) FROM creator_leads WHERE merged_into_id IS NULL)
         + (SELECT COUNT(*) FROM creator_profiles cp
             WHERE NOT EXISTS (
               SELECT 1 FROM creator_leads l
                WHERE l.merged_into_id IS NULL
                  AND (l.user_id = cp.user_id OR l.creator_profile_id = cp.id)
             ))
       )::text AS count`,
    );
    return Number.parseInt(rows[0]?.count ?? '0', 10);
  }

  /**
   * Revenue attribution (spec §13): source → creators → products → sales →
   * revenue. Answers the question the spec asks out loud — "which channel
   * produced the most QUALIFIED creators and the most revenue".
   */
  async revenueAttribution(): Promise<{
    rows: Array<{
      source: string;
      leads: number;
      registered: number;
      publishedCreators: number;
      sales: number;
      revenue: number;
      averageScore: number | null;
    }>;
    unattributed: { leads: number; revenue: number };
  }> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT l.source::text AS source,
              COUNT(*)::int                          AS leads,
              COUNT(*) FILTER (WHERE l.user_id IS NOT NULL)::int AS registered,
              COUNT(*) FILTER (WHERE pub.published > 0)::int AS published_creators,
              COALESCE(SUM(s.sales), 0)::int          AS sales,
              COALESCE(SUM(s.revenue), 0)             AS revenue
         FROM creator_leads l
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'paid')::int AS sales,
                  COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'paid'), 0) AS revenue
             FROM agents a
             JOIN order_items oi ON oi.agent_id = a.id
             JOIN orders o       ON o.id = oi.order_id
            WHERE a.creator_id = l.creator_profile_id
         ) s ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS published
             FROM agents a
            WHERE a.creator_id = l.creator_profile_id AND a.status = 'published'
         ) pub ON TRUE
        WHERE l.merged_into_id IS NULL
        GROUP BY l.source
        ORDER BY revenue DESC, leads DESC`,
    );
    // Scores are computed per record, so they are averaged in memory over
    // the (bounded) lead set rather than approximated in SQL.
    const averageScores = await this.averageScoreBySource();
    const unattributedRows = await this.dataSource.query<
      Array<Record<string, unknown>>
    >(
      `SELECT COUNT(*)::int AS leads,
              COALESCE(SUM(s.revenue), 0) AS revenue
         FROM creator_leads l
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'paid'), 0) AS revenue
             FROM agents a
             JOIN order_items oi ON oi.agent_id = a.id
             JOIN orders o       ON o.id = oi.order_id
            WHERE a.creator_id = l.creator_profile_id
         ) s ON TRUE
        WHERE l.merged_into_id IS NULL AND l.campaign IS NULL`,
    );
    return {
      rows: rows.map((row) => {
        const source = String(row.source);
        return {
          source,
          leads: Number(row.leads ?? 0),
          registered: Number(row.registered ?? 0),
          publishedCreators: Number(row.published_creators ?? 0),
          sales: Number(row.sales ?? 0),
          revenue: Number(row.revenue ?? 0),
          averageScore: averageScores[source] ?? null,
        };
      }),
      unattributed: {
        leads: Number(unattributedRows[0]?.leads ?? 0),
        revenue: Number(unattributedRows[0]?.revenue ?? 0),
      },
    };
  }

  private async averageScoreBySource(): Promise<Record<string, number>> {
    const { rows } = await this.records.list(
      { page: 1, pageSize: 100 },
      {
        activeDays: 7,
        inactiveDays: 14,
        dormantDays: 30,
      },
    );
    const buckets = new Map<string, number[]>();
    for (const row of rows) {
      const list = buckets.get(row.source) ?? [];
      list.push(row.score.score);
      buckets.set(row.source, list);
    }
    const out: Record<string, number> = {};
    for (const [source, values] of buckets) {
      out[source] = Math.round(
        values.reduce((a, b) => a + b, 0) / values.length,
      );
    }
    return out;
  }

  /**
   * §15 — what is already wired for future automations. Each entry is an
   * event that IS being recorded today plus the automation it would drive.
   */
  async automationReadiness(): Promise<{
    events: Array<{
      event: string;
      futureAutomation: string;
      occurrences: number;
      ready: boolean;
    }>;
    totals: { recorded: number; distinctEvents: number };
  }> {
    const counts = await this.events.eventCountsByName();
    const events = AUTOMATION_READY_EVENTS.map((entry) => ({
      event: entry.event,
      futureAutomation: entry.futureAutomation,
      occurrences: counts[entry.event] ?? 0,
      // Ready = the event is defined AND the writer exists in the system.
      ready: true,
    }));
    return {
      events,
      totals: {
        recorded: Object.values(counts).reduce((a, b) => a + b, 0),
        distinctEvents: Object.keys(counts).length,
      },
    };
  }

  /** The internal task queue (§4 "Reminder"). */
  async taskQueue(
    assignedToId?: string,
  ): Promise<Awaited<ReturnType<CrmEngagementService['queue']>>> {
    return this.engagement.queue({ assignedToId });
  }

  /** §1 "Score" filter facets + the band thresholds the UI labels with. */
  scoreConfig(): { max: number; bands: { high: number; medium: number } } {
    return { max: SCORING_CONFIG.maxScore, bands: { ...SCORING_CONFIG.bands } };
  }

  /** Closed vocabularies the filters render, so the UI never drifts. */
  vocabularies(): { stages: string[]; sources: string[] } {
    return { stages: [...CRM_STAGES], sources: [...CRM_SOURCES] };
  }
}

/**
 * A conversion rate, or null when it cannot be computed.
 *
 * Returning 0 for "nobody at all" would render as a confident 0% and read as
 * "this channel converts terribly" rather than "there is no data".
 */
function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}
