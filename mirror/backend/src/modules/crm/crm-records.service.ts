import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CRM_STAGES,
  deriveStage,
  resolveStage,
  type ResolvedStage,
  type StageFacts,
} from './domain/funnel';
import {
  SCORING_CONFIG,
  scoreCreator,
  type ScoreFacts,
  type ScoreResult,
} from './domain/scoring';
import {
  classifyActivity,
  type ActivityClassification,
  type ActivityThresholds,
} from './domain/activity';

export type { ActivityClassification, ActivityThresholds };
import { normalizeTagSlug } from './domain/taxonomy';

/**
 * The flattened, measured shape of ONE CRM record.
 *
 * Note it has BOTH `leadId` and `creatorProfileId`: a person can be known
 * as a lead before they register, and as a creator afterwards, and the CRM
 * must show them once — not twice (spec §6).
 */
export interface CrmRecordFacts {
  leadId: string | null;
  userId: string | null;
  creatorProfileId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  company: string | null;
  websiteUrl: string | null;
  socialLinks: string[];
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  landingPage: string | null;
  referrer: string | null;
  creatorType: string | null;
  manualStage: string | null;
  ownerId: string | null;
  ownerName: string | null;
  qualifiedAt: Date | null;
  mergedIntoId: string | null;
  tags: string[];
  lastActivityAt: Date | null;
  firstContactAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // ---- derived from the product/commerce tables ----
  stageFacts: StageFacts;
  scoreFacts: ScoreFacts;
  // ---- denormalized counters used for sorting/filtering in SQL ----
  productCount: number;
  publishedProductCount: number;
  salesCount: number;
  revenue: number;
  views7d: number;
  maxProductStatus: string | null;
  hasNextAction: boolean;
  hasOverdueAction: boolean;
  openActionCount: number;
  // ---- identity/verification mirrors ----
  userRole: string | null;
  userStatus: string | null;
  profileStatus: string | null;
  verificationStatus: string | null;
  displayName: string | null;
  creatorSlug: string | null;
  activityAreas: string[];
  expertise: string[];
  tools: string[];
  hasLocation: boolean;
}

export interface CrmRow extends CrmRecordFacts {
  stage: ResolvedStage;
  score: ScoreResult;
  activity: ActivityClassification;
  productStatus:
    | 'no_product'
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'published'
    | 'has_sales';
  isResolved: boolean;
  /** C2 — 'active' | 'lost'. Separate from the stage on purpose. */
  outcome: string;
  lostAt: string | null;
  lostReason: string | null;
  /** C2 — the referring lead, for the referral graph in the 360 view. */
  referredById: string | null;
  referredByName: string | null;
  daysInStage: number | null;
}

export interface CrmListQuery {
  search?: string;
  stage?: string;
  source?: string;
  scoreBand?: string;
  ownerId?: string;
  activity?: string;
  productStatus?: string;
  tags?: string[];
  hasNextAction?: boolean;
  resolved?: 'yes' | 'no';
  sort?: string;
  page: number;
  pageSize: number;
}

export const CRM_SORTABLE = [
  'created_at',
  'last_activity',
  'name',
  'score',
  'revenue',
  'stage',
] as const;
export type CrmSort = (typeof CRM_SORTABLE)[number];

/**
 * The CRM record set, as ONE reusable SQL fragment.
 *
 * It is deliberately plain SQL rather than a TypeORM query builder: the
 * projection is a UNION over two different identity sources with lateral
 * aggregates, and TypeORM's alias machinery cannot express a raw FROM
 * subquery. Keeping it as text also means the query that the index review in
 * the migration targets is the query that actually runs.
 *
 * The `r` alias is part of the fragment — every filter and sort below refers
 * to it, which keeps the list, the funnel and the export on exactly one
 * definition of "a CRM record".
 */
const BASE_SQL = `
  (
    SELECT
      l.id                                   AS "leadId",
      l.user_id                              AS "userId",
      l.creator_profile_id                   AS "creatorProfileId",
      COALESCE(cp.display_name, u.full_name, l.name) AS "name",
      l.email, l.phone,
      COALESCE(u.username, l.username)       AS "username",
      l.company, l.website_url AS "websiteUrl",
      -- social_links / activity_areas / expertise / tools are jsonb arrays in
      -- the pre-existing schema; the CRM reads them as text[] and never
      -- writes them, so the cast belongs here rather than in a migration.
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(l.social_links)), ARRAY[]::text[])
                                                              AS "socialLinks",
      l.source, l.medium, l.campaign, l.content, l.term,
      l.landing_page AS "landingPage", l.referrer,
      l.creator_type AS "creatorType",
      l.manual_stage AS "manualStage",
      l.outcome AS "outcome",
      l.lost_at AS "lostAt",
      l.lost_reason AS "lostReason",
      l.referred_by_id AS "referredById",
      ref.name AS "referredByName",
      l.owner_id AS "ownerId",
      owner.full_name AS "ownerName",
      l.qualified_at AS "qualifiedAt",
      l.merged_into_id AS "mergedIntoId",
      l.last_activity_at AS "lastActivityAt",
      l.first_contact_at AS "firstContactAt",
      l.created_at AS "createdAt",
      l.updated_at AS "updatedAt",
      -- stage facts (measured, never declared)
      (l.user_id IS NOT NULL)                                        AS f_registered,
      (cp.id IS NOT NULL AND cp.onboarding_completed_at IS NOT NULL)  AS f_activated,
      (COALESCE(agg_any.product_count, 0) > 0)                       AS f_product_started,
      (COALESCE(agg_any.submitted_count, 0) > 0)                     AS f_product_submitted,
      (COALESCE(agg_any.approved_count, 0) > 0)                      AS f_approved,
      (COALESCE(agg_any.published_count, 0) > 0)                     AS f_published,
      (COALESCE(agg_any.sales_count, 0) > 0)                         AS f_first_sale,
      EXISTS (
        SELECT 1 FROM creator_growth_events g
         WHERE g.event_name = 'creator.growing_signal'
           AND (g.lead_id = l.id OR g.creator_profile_id = l.creator_profile_id)
      )                                                             AS f_growing,
      -- scoring facts
      (l.email IS NOT NULL)                                          AS f_has_email,
      (l.website_url IS NOT NULL)                                    AS f_has_website,
      (l.company IS NOT NULL)                                        AS f_has_brand,
      (l.campaign IS NOT NULL OR l.source IS NOT NULL)                AS f_has_attribution,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(cp.activity_areas)), ARRAY[]::text[])
                                                              AS "activityAreas",
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(cp.expertise)), ARRAY[]::text[])
                                                              AS "expertise",
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(cp.tools)), ARRAY[]::text[])
                                                              AS "tools",
      (cp.location_country IS NOT NULL OR cp.location_city IS NOT NULL) AS f_has_location,
      cp.verification_status::text                                   AS "verificationStatus",
      -- the measured product/commerce counters, aliased to the names the
      -- list facets and sorts address them by
      COALESCE(agg_any.product_count, 0)::int                       AS "productCount",
      COALESCE(agg_any.published_count, 0)::int                     AS "publishedProductCount",
      COALESCE(agg_any.sales_count, 0)::int                         AS "salesCount",
      COALESCE(agg_any.revenue, 0)::bigint                         AS "revenue",
      COALESCE(agg_any.views7d, 0)::int                             AS "views7d",
      agg_any.max_product_status                                    AS "maxProductStatus",
      -- identity mirrors
      COALESCE(cp.display_name, u.full_name, l.name)                 AS "displayName",
      u.role::text                                                   AS "userRole",
      u.status::text                                                 AS "userStatus",
      cp.status::text                                                AS "profileStatus",
      cp.slug                                                        AS "creatorSlug"
    FROM creator_leads l
    LEFT JOIN users u             ON u.id = l.user_id
    LEFT JOIN creator_profiles cp ON cp.id = l.creator_profile_id
    LEFT JOIN users owner         ON owner.id = l.owner_id
    -- C2: one self-join resolves the referrer's name. It is a LEFT JOIN on
    -- the lead's own PK, so it cannot change the row count of the list.
    LEFT JOIN creator_leads ref  ON ref.id = l.referred_by_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int                            AS product_count,
        COUNT(*) FILTER (WHERE a.status = 'published')::int AS published_count,
        COUNT(*) FILTER (WHERE a.status IN
          ('submitted','under_review','changes_requested','resubmitted'))::int
                                                    AS submitted_count,
        COUNT(*) FILTER (WHERE a.status IN
          ('approved','ready_to_publish','published'))::int AS approved_count,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'paid')::int AS sales_count,
        COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'paid'), 0) AS revenue,
        COALESCE((
          SELECT COUNT(*) FROM agent_analytics_events ev
           WHERE ev.event_type = 'product_viewed'
             AND ev.occurred_at > now() - interval '7 days'
             AND ev.agent_id IN (SELECT id FROM agents WHERE creator_id = l.creator_profile_id)
        ), 0)::int                               AS views7d,
        (SELECT MAX(a2.status)::text FROM agents a2 WHERE a2.creator_id = l.creator_profile_id)
                                                    AS max_product_status
      FROM agents a
      LEFT JOIN order_items oi ON oi.agent_id = a.id
      LEFT JOIN orders o       ON o.id = oi.order_id
     WHERE a.creator_id = l.creator_profile_id
    ) agg_any ON TRUE
    WHERE l.merged_into_id IS NULL

    UNION ALL

    -- Creators who registered before C1 (or never had a lead): they still
    -- deserve a CRM row, with an honest "no attribution" state.
    SELECT
      NULL::uuid                                          AS "leadId",
      cp.user_id                                          AS "userId",
      cp.id                                               AS "creatorProfileId",
      COALESCE(cp.display_name, u.full_name, u.username)  AS "name",
      u.email, u.phone, u.username,
      -- Every arm is cast to the FIRST arm's type: UNION ALL resolves the
      -- column type from the leading SELECT, and a NULL literal is untyped.
      NULL::varchar,                                  -- company
      NULL::text,                                     -- websiteUrl
      ARRAY[]::text[],                                -- socialLinks
      'other'::varchar,                               -- source
      NULL::varchar,                                  -- medium
      NULL::varchar,                                  -- campaign
      NULL::varchar,                                  -- content
      NULL::varchar,                                  -- term
      NULL::varchar,                                  -- landingPage
      NULL::varchar,                                  -- referrer
      NULL::varchar,                                  -- creatorType
      NULL::varchar,                                  -- manualStage
      -- C2: a creator-only row has no lead, therefore no outcome and no
      -- referral. These are honest NULLs, not 'active' — the lead columns
      -- simply do not exist for this person.
      NULL::varchar,                                  -- outcome
      NULL::timestamptz,                              -- lostAt
      NULL::text,                                     -- lostReason
      NULL::uuid,                                     -- referredById
      NULL::varchar,                                  -- referredByName
      NULL::uuid,                                     -- ownerId
      NULL::varchar,                                  -- ownerName
      NULL::timestamptz,                              -- qualifiedAt
      NULL::uuid,                                     -- mergedIntoId
      NULL::timestamptz,                              -- lastActivityAt
      NULL::timestamptz,                              -- firstContactAt
      now()::timestamptz, now()::timestamptz,
      true, true, true,
      (COALESCE(agg_c.submitted_count, 0) > 0),
      (COALESCE(agg_c.approved_count, 0) > 0),
      (COALESCE(agg_c.published_count, 0) > 0),
      (COALESCE(agg_c.sales_count, 0) > 0),
      EXISTS (
        SELECT 1 FROM creator_growth_events g
         WHERE g.event_name = 'creator.growing_signal'
           AND g.creator_profile_id = cp.id
      ),
      (u.email IS NOT NULL), false, false, false,
      ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], false,
      'unverified'::text,
      COALESCE(agg_c.product_count, 0)::int,
      COALESCE(agg_c.published_count, 0)::int,
      COALESCE(agg_c.sales_count, 0)::int,
      COALESCE(agg_c.revenue, 0)::bigint,
      COALESCE(agg_c.views7d, 0)::int,
      agg_c.max_product_status,
      COALESCE(cp.display_name, u.full_name, u.username),
      u.role::text, u.status::text, cp.status::text, cp.slug
    FROM creator_profiles cp
    JOIN users u ON u.id = cp.user_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int                            AS product_count,
        COUNT(*) FILTER (WHERE a.status = 'published')::int AS published_count,
        COUNT(*) FILTER (WHERE a.status IN
          ('submitted','under_review','changes_requested','resubmitted'))::int
                                                    AS submitted_count,
        COUNT(*) FILTER (WHERE a.status IN
          ('approved','ready_to_publish','published'))::int AS approved_count,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'paid')::int AS sales_count,
        COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'paid'), 0) AS revenue,
        COALESCE((
          SELECT COUNT(*) FROM agent_analytics_events ev
           WHERE ev.event_type = 'product_viewed'
             AND ev.occurred_at > now() - interval '7 days'
             AND ev.agent_id IN (SELECT id FROM agents WHERE creator_id = cp.id)
        ), 0)::int                               AS views7d,
        (SELECT MAX(a2.status)::text FROM agents a2 WHERE a2.creator_id = cp.id)
                                                    AS max_product_status
      FROM agents a
      LEFT JOIN order_items oi ON oi.agent_id = a.id
      LEFT JOIN orders o       ON o.id = oi.order_id
     WHERE a.creator_id = cp.id
    ) agg_c ON TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM creator_leads l2
       WHERE l2.merged_into_id IS NULL
         AND (l2.user_id = cp.user_id OR l2.creator_profile_id = cp.id)
    )
  ) r`;

const TAGS_JOIN_SQL = `
  LEFT JOIN (
    SELECT rt.lead_id, ARRAY_AGG(t.slug ORDER BY t.slug) AS tag_slugs
      FROM creator_crm_record_tags rt
      JOIN creator_crm_tags t ON t.id = rt.tag_id
     GROUP BY rt.lead_id
  ) tags ON tags.lead_id = r."leadId"
`;

const ACTIONS_JOIN_SQL = `
  LEFT JOIN (
    SELECT lead_id,
           COUNT(*) FILTER (WHERE status IN ('open','snoozed'))::int AS open_actions,
           COALESCE(BOOL_OR(status = 'open'
             OR (status = 'snoozed' AND snoozed_until <= now())), false) AS has_next_action,
           COALESCE(BOOL_OR((due_date IS NOT NULL AND due_date < now())
             AND status IN ('open','snoozed')), false)                 AS has_overdue
      FROM creator_crm_actions
     GROUP BY lead_id
  ) acts ON acts.lead_id = r."leadId"
`;

/** The FROM clause every CRM read shares, with the given extra joins. */
function recordSetSql(extraJoins = ''): string {
  return `${BASE_SQL}${TAGS_JOIN_SQL}${ACTIONS_JOIN_SQL}${extraJoins}`;
}

/**
 * Phase C1 — the unified CRM record projection.
 *
 * ONE SQL fragment builds the base set (leads UNION creators-that-have-no-
 * lead), annotates each row with the measured product/sale/activity facts,
 * and pure domain functions turn those facts into the stage, the score and
 * the activity bucket. Nothing here is stored as a mutable "CRM stage" —
 * a creator who publishes a product is `published` because the publish
 * happened, not because a dropdown was used.
 */
/**
 * One row as the projection driver returns it: every declared column is
 * `unknown` because it comes from SQL, and the hydration step is what
 * narrows it. Typing it as `Record<string, any>` here would silence the
 * compiler on real bugs — this keeps the boundary honest.
 */
type RawValue = unknown;
interface RawRow {
  [key: string]: RawValue;
}

/** Narrowing helpers for the SQL boundary. */
const asScalarText = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      ? String(value)
      : (JSON.stringify(value) ?? '');
const asText = (value: RawValue): string | null =>
  value === null || value === undefined ? null : asScalarText(value);
const asCount = (value: RawValue): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(asScalarText(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};
const asTextList = (value: RawValue): string[] =>
  Array.isArray(value) ? value.map((entry) => asScalarText(entry)) : [];
const asDate = (value: RawValue): Date | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** The three C2 acquisition signals, plus C1's catch-all engagement. */
interface AcquisitionSignals {
  contacted: Set<string>;
  replied: Set<string>;
  interested: Set<string>;
  engaged: Set<string>;
}

@Injectable()
export class CrmRecordsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Exposed so the export and the analytics use the identical record set. */
  get recordSetSql(): string {
    return recordSetSql();
  }

  /**
   * C2 §6 splits "engaged" into three MEASURED steps, and each one is a
   * different question: did we reach out, did they answer, did they say yes.
   *
   * They are read from the event log in ONE pass rather than three queries,
   * because a lead set can be a full CRM page and the difference is a real
   * round trip on every list read.
   */
  private async acquisitionSets(
    leadIds: string[],
  ): Promise<AcquisitionSignals> {
    const empty: AcquisitionSignals = {
      contacted: new Set(),
      replied: new Set(),
      interested: new Set(),
      engaged: new Set(),
    };
    if (!leadIds.length) return empty;

    const rows = await this.dataSource.query<
      Array<{ lead_id: string; event_name: string }>
    >(
      `SELECT DISTINCT lead_id, event_name FROM creator_growth_events
        WHERE lead_id = ANY($1::uuid[])
          AND event_name = ANY($2::text[])`,
      [
        leadIds,
        [
          'crm.outreach',
          'crm.note_added',
          'creator.login',
          'creator.registered',
          'crm.replied',
          'crm.interested',
        ],
      ],
    );

    for (const row of rows) {
      if (row.event_name === 'crm.interested') {
        // Interest is strictly the strongest of the three: it implies a
        // reply, and a reply implies a contact. Deriving the lower steps here
        // is what makes "interested but never replied" impossible for the
        // ordered walk to be handed.
        empty.interested.add(row.lead_id);
        empty.replied.add(row.lead_id);
        empty.contacted.add(row.lead_id);
        continue;
      }
      if (row.event_name === 'crm.replied') {
        // A reply is itself proof of contact, but it is NOT evidence of
        // interest — only the explicit interest event may claim that.
        empty.replied.add(row.lead_id);
        empty.contacted.add(row.lead_id);
        continue;
      }
      // outreach / note / login / signup: a real interaction, none of which
      // says anything about whether the person got back to us.
      empty.engaged.add(row.lead_id);
      empty.contacted.add(row.lead_id);
    }
    return empty;
  }

  /** Admin-qualified lead ids (the audited human signal). */
  private async qualifiedSet(leadIds: string[]): Promise<Set<string>> {
    const set = new Set<string>();
    if (!leadIds.length) return set;
    const rows = await this.dataSource.query<Array<{ lead_id: string }>>(
      `SELECT DISTINCT e.lead_id
         FROM creator_growth_events e
        WHERE e.lead_id = ANY($1::uuid[])
          AND e.event_name = 'crm.stage_changed'
          AND e.metadata->>'to' = 'qualified'`,
      [leadIds],
    );
    for (const row of rows) set.add(row.lead_id);
    return set;
  }

  /** Turns one raw annotated row into the full domain view. */
  private hydrate(
    row: RawRow,
    signals: AcquisitionSignals,
    thresholds: ActivityThresholds,
    qualified: Set<string>,
  ): CrmRow {
    const leadId: string | null = asText(row.leadId);
    // A creator-only row (no lead) has no admin decision and no CRM
    // qualification event, so the live score band is the only honest
    // signal — the same threshold `scoreBand: 'high'` uses.
    const qualifiedAt = asDate(row.qualifiedAt);
    const stageFacts: StageFacts = {
      hasLead: true,
      wasContacted: leadId
        ? signals.contacted.has(leadId)
        : Boolean(row.f_registered),
      didReply: leadId ? signals.replied.has(leadId) : false,
      showedInterest: leadId ? signals.interested.has(leadId) : false,
      hasEngagement: leadId
        ? signals.engaged.has(leadId)
        : Boolean(row.f_registered),
      isQualified: leadId
        ? qualified.has(leadId) || qualifiedAt != null
        : asCount(row.score) >= SCORING_CONFIG.bands.high,
      isRegistered: Boolean(row.f_registered),
      isCreatorActivated: Boolean(row.f_activated),
      hasProductStarted: Boolean(row.f_product_started),
      hasProductSubmitted: Boolean(row.f_product_submitted),
      isApproved: Boolean(row.f_approved),
      isPublished: Boolean(row.f_published),
      hasFirstSale: Boolean(row.f_first_sale),
      isGrowing: Boolean(row.f_growing),
    };
    const derived = deriveStage(stageFacts);
    const scoreFacts: ScoreFacts = {
      hasEmail: Boolean(row.f_has_email),
      hasWebsite: Boolean(row.f_has_website),
      hasBrand: Boolean(row.f_has_brand),
      hasAttribution: Boolean(row.f_has_attribution),
      activityAreas: asTextList(row.activityAreas),
      expertise: asTextList(row.expertise),
      verificationStatus: asText(row.verificationStatus),
      hasLocation: Boolean(row.f_has_location),
      tools: asTextList(row.tools),
      stage: derived,
      productCount: asCount(row.productCount),
      publishedProductCount: asCount(row.publishedProductCount),
      salesCount: asCount(row.salesCount),
      views7d: asCount(row.views7d),
      daysSinceLastActivity: daysSince(asDate(row.lastActivityAt)),
      hasOwner: Boolean(row.ownerId),
    };
    const stage = resolveStage(derived, asText(row.manualStage));
    const score = scoreCreator(scoreFacts);
    const lastActivityAt = asDate(row.lastActivityAt);
    const activity = classifyActivity(lastActivityAt, thresholds);
    return {
      ...(row as unknown as CrmRecordFacts),
      leadId,
      tags: asTextList(row.tags),
      lastActivityAt,
      firstContactAt: asDate(row.firstContactAt),
      createdAt: asDate(row.createdAt) ?? new Date(0),
      qualifiedAt,
      manualStage: asText(row.manualStage),
      maxProductStatus: asText(row.maxProductStatus),
      socialLinks: asTextList(row.socialLinks),
      activityAreas: asTextList(row.activityAreas),
      expertise: asTextList(row.expertise),
      tools: asTextList(row.tools),
      verificationStatus: asText(row.verificationStatus),
      productCount: asCount(row.productCount),
      publishedProductCount: asCount(row.publishedProductCount),
      salesCount: asCount(row.salesCount),
      views7d: asCount(row.views7d),
      revenue: asCount(row.revenue),
      openActionCount: asCount(row.openActionCount),
      hasNextAction: Boolean(row.hasNextAction),
      hasOverdueAction: Boolean(row.hasOverdueAction),
      stage,
      score,
      activity,
      productStatus: productStatusOf(
        asCount(row.salesCount),
        asCount(row.publishedProductCount),
        asText(row.maxProductStatus),
      ),
      isResolved: Boolean(row.userId || row.creatorProfileId),
      outcome: asText(row.outcome) ?? 'active',
      lostAt: asText(row.lostAt),
      lostReason: asText(row.lostReason),
      referredById: asText(row.referredById),
      referredByName: asText(row.referredByName),
      daysInStage: daysSince(lastActivityAt),
    };
  }

  /** Hydrates a raw page, resolving the two event-derived facts in one shot. */
  private async hydrateAll(
    raw: RawRow[],
    thresholds: ActivityThresholds,
  ): Promise<CrmRow[]> {
    if (!raw.length) return [];
    const leadIds = raw
      .map((row) => row.leadId)
      .filter((id: unknown): id is string => typeof id === 'string');
    const [signals, qualified] = await Promise.all([
      this.acquisitionSets(leadIds),
      this.qualifiedSet(leadIds),
    ]);
    return raw.map((row) => this.hydrate(row, signals, thresholds, qualified));
  }

  // ---- filters ---------------------------------------------------------

  /**
   * Builds the WHERE clause for the list. Every value is bound as a
   * parameter — no caller-supplied text ever reaches the SQL string, and
   * the only interpolated fragments are the allow-listed sort key and the
   * numeric inactivity ladder, which is validated on the way in.
   */
  private buildFilters(
    query: CrmListQuery,
    thresholds: ActivityThresholds,
  ): { where: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const push = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const needle = query.search?.trim();
    if (needle) {
      const term = `%${needle.toLowerCase()}%`;
      const exact = push(needle);
      const like = push(term);
      // Search covers everything the spec lists: name, email, username,
      // brand, website and the creator identifier.
      clauses.push(`(
        lower(COALESCE(r."name", '')) LIKE ${like}
        OR lower(COALESCE(r."email", '')) LIKE ${like}
        OR lower(COALESCE(r."username", '')) LIKE ${like}
        OR lower(COALESCE(r."company", '')) LIKE ${like}
        OR lower(COALESCE(r."websiteUrl", '')) LIKE ${like}
        OR r."leadId"::text = ${exact}
        OR r."creatorProfileId"::text = ${exact}
        OR lower(COALESCE(r."creatorSlug", '')) LIKE ${like}
      )`);
    }
    if (query.source) clauses.push(`r."source" = ${push(query.source)}`);
    if (query.ownerId) clauses.push(`r."ownerId" = ${push(query.ownerId)}`);
    if (query.resolved === 'yes') clauses.push('r."userId" IS NOT NULL');
    if (query.resolved === 'no') clauses.push('r."userId" IS NULL');

    const tags = query.tags?.map(normalizeTagSlug).filter(Boolean) ?? [];
    if (tags.length) {
      clauses.push(
        `COALESCE(tags.tag_slugs, ARRAY[]::text[]) && ${push(tags)}::text[]`,
      );
    }
    const productStatus = productStatusClause(query.productStatus);
    if (productStatus) clauses.push(productStatus);

    if (query.hasNextAction !== undefined) {
      clauses.push(
        `COALESCE(acts.has_next_action, false) = ${query.hasNextAction ? 'true' : 'false'}`,
      );
    }
    const activity = activityClause(query.activity, thresholds);
    if (activity) clauses.push(activity);

    // stage / scoreBand need the DOMAIN result, not a column — they are
    // applied post-hydration by `listFiltered` below.
    return {
      where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  /** Allow-listed ORDER BY: the caller's string never reaches the SQL. */
  private buildSort(sort?: string): string {
    switch (sort) {
      case 'name':
        return `ORDER BY lower(COALESCE(r."name", '')) ASC NULLS LAST, r."createdAt" DESC`;
      case 'revenue':
        return 'ORDER BY COALESCE(r."revenue", 0) DESC, r."createdAt" DESC';
      case 'last_activity':
        return 'ORDER BY r."lastActivityAt" DESC NULLS LAST, r."createdAt" DESC';
      // `score` and `stage` are derived in TypeScript, so they cannot be
      // ordered in SQL; they degrade to the newest-first default and
      // `listFiltered` re-orders the hydrated page for the real sort.
      case 'created_at':
      default:
        return 'ORDER BY r."createdAt" DESC, r."name" ASC NULLS LAST';
    }
  }

  // ---- reads -----------------------------------------------------------

  async list(
    query: CrmListQuery,
    thresholds: ActivityThresholds,
  ): Promise<{ rows: CrmRow[]; total: number }> {
    const { where, params } = this.buildFilters(query, thresholds);
    const countRows = await this.dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total FROM ${recordSetSql()} ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const limit = Math.max(1, Math.min(query.pageSize, 200));
    const offset = Math.max(0, (query.page - 1) * limit);
    const raw = await this.dataSource.query<RawRow[]>(
      `SELECT * FROM ${recordSetSql()} ${where} ${this.buildSort(query.sort)}
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return { rows: await this.hydrateAll(raw, thresholds), total };
  }

  /**
   * The funnel needs EVERY record, not one page — but it must not load the
   * table into memory either. It pages through the record set in bounded
   * batches and aggregates stage counts as it goes.
   */
  async stageCounts(thresholds: ActivityThresholds): Promise<{
    counts: Record<string, number>;
    daysToNext: Record<string, number | null>;
  }> {
    const BATCH = 500;
    const counts: Record<string, number> = {};
    for (const stage of CRM_STAGES) counts[stage] = 0;
    const durations: Record<string, number[]> = {
      new_lead: [],
      engaged: [],
      qualified: [],
      registered: [],
      creator_activated: [],
      product_started: [],
      product_submitted: [],
      approved: [],
      published: [],
      first_sale: [],
    };

    let offset = 0;
    for (;;) {
      const raw = await this.dataSource.query<RawRow[]>(
        `SELECT * FROM ${recordSetSql()}
          ORDER BY r."createdAt" DESC, r."name" ASC NULLS LAST
          LIMIT ${BATCH} OFFSET ${offset}`,
      );
      if (!raw.length) break;
      for (const crm of await this.hydrateAll(raw, thresholds)) {
        counts[crm.stage.effective] = (counts[crm.stage.effective] ?? 0) + 1;
        collectDurations(durations, crm);
      }
      if (raw.length < BATCH) break;
      offset += BATCH;
    }

    const daysToNext: Record<string, number | null> = {};
    for (const stage of CRM_STAGES) {
      const values = durations[stage];
      daysToNext[stage] = values?.length
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) /
          10
        : null;
    }
    return { counts, daysToNext };
  }

  /** One record by its lead id (admin 360 view). */
  async byLeadId(
    leadId: string,
    thresholds: ActivityThresholds,
  ): Promise<CrmRow | null> {
    const raw = await this.dataSource.query<RawRow[]>(
      `SELECT * FROM ${recordSetSql()} WHERE r."leadId" = $1 LIMIT 1`,
      [leadId],
    );
    if (!raw.length) return null;
    const [row] = await this.hydrateAll(raw, thresholds);
    return row;
  }

  /** One record by the creator profile id (deep links from the admin). */
  async byCreatorProfileId(
    creatorProfileId: string,
    thresholds: ActivityThresholds,
  ): Promise<CrmRow | null> {
    const raw = await this.dataSource.query<RawRow[]>(
      `SELECT * FROM ${recordSetSql()} WHERE r."creatorProfileId" = $1 LIMIT 1`,
      [creatorProfileId],
    );
    if (!raw.length) return null;
    const [row] = await this.hydrateAll(raw, thresholds);
    return row;
  }

  /**
   * Stage and score-band filters are post-hydration by nature (they are
   * derived values, not columns). To keep the page honest we over-fetch a
   * bounded window, filter it, and report the true total separately — the
   * scan is capped so a huge table cannot be pulled into memory.
   */
  async listFiltered(
    query: CrmListQuery,
    thresholds: ActivityThresholds,
    options: { scanLimit?: number } = {},
  ): Promise<{ rows: CrmRow[]; total: number }> {
    const needsPostFilter = Boolean(query.stage || query.scoreBand);
    if (!needsPostFilter) return this.list(query, thresholds);

    const SCAN = options.scanLimit ?? 5000;
    const CHUNK = 500;
    const matched: CrmRow[] = [];
    let scanned = 0;
    for (;;) {
      const chunk = await this.list(
        { ...query, page: Math.floor(scanned / CHUNK) + 1, pageSize: CHUNK },
        thresholds,
      );
      for (const row of chunk.rows) {
        if (query.stage && row.stage.effective !== query.stage) continue;
        if (query.scoreBand && row.score.band !== query.scoreBand) continue;
        matched.push(row);
      }
      scanned += chunk.rows.length;
      if (chunk.rows.length < CHUNK || scanned >= SCAN) break;
    }
    if (query.sort === 'score' || query.sort === 'stage') {
      matched.sort((a, b) =>
        query.sort === 'score'
          ? b.score.score - a.score.score
          : CRM_STAGES.indexOf(b.stage.effective) -
            CRM_STAGES.indexOf(a.stage.effective),
      );
    }
    const start = (query.page - 1) * query.pageSize;
    return {
      rows: matched.slice(start, start + query.pageSize),
      total: matched.length,
    };
  }
}

function daysSince(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

/** The list-level product status the spec's "Product Status" filter uses. */
export function productStatusOf(
  salesCount: number,
  publishedCount: number,
  maxStatus: string | null,
): CrmRow['productStatus'] {
  if (salesCount > 0) return 'has_sales';
  if (publishedCount > 0 || maxStatus === 'published') return 'published';
  if (
    maxStatus === 'approved' ||
    maxStatus === 'ready_to_publish' ||
    maxStatus === 'under_review'
  ) {
    return 'approved';
  }
  if (
    maxStatus === 'submitted' ||
    maxStatus === 'changes_requested' ||
    maxStatus === 'resubmitted'
  ) {
    return 'submitted';
  }
  if (maxStatus) return 'draft';
  return 'no_product';
}

/** SQL for the product-status facet, or null when nothing was requested. */
function productStatusClause(status?: string): string | null {
  switch (status) {
    case 'no_product':
      return 'COALESCE(r."productCount", 0) = 0';
    case 'has_sales':
      return 'COALESCE(r."salesCount", 0) > 0';
    case 'published':
      return 'COALESCE(r."publishedProductCount", 0) > 0 AND COALESCE(r."salesCount", 0) = 0';
    case 'approved':
      return `COALESCE(r."maxProductStatus", '') IN ('approved','ready_to_publish','under_review')
              AND COALESCE(r."publishedProductCount", 0) = 0`;
    case 'submitted':
      return `COALESCE(r."maxProductStatus", '') IN ('submitted','changes_requested','resubmitted')`;
    case 'draft':
      return `COALESCE(r."productCount", 0) > 0
              AND COALESCE(r."maxProductStatus", '') IN
                  ('draft','unpublished','rejected','suspended','archived','deprecated')`;
    default:
      return null;
  }
}

/**
 * SQL for the inactivity facet. The thresholds come from configuration and
 * are interpolated as validated integers — never as caller strings.
 */
function activityClause(
  activity: string | undefined,
  thresholds: ActivityThresholds,
): string | null {
  const active = positiveInt(thresholds.activeDays, 7);
  const inactive = positiveInt(thresholds.inactiveDays, 14);
  switch (activity) {
    case 'active':
      return `(r."lastActivityAt" IS NOT NULL
              AND r."lastActivityAt" > now() - interval '${active} days')`;
    case 'inactive':
      return `(r."lastActivityAt" <= now() - interval '${active} days'
              AND r."lastActivityAt" > now() - interval '${inactive} days')`;
    case 'dormant':
      return `r."lastActivityAt" <= now() - interval '${inactive} days'`;
    case 'unknown':
      return 'r."lastActivityAt" IS NULL';
    default:
      return null;
  }
}

/** Defence in depth: an interval literal is only ever a positive integer. */
function positiveInt(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number'
      ? Math.trunc(value)
      : Number.parseInt(
          typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : '',
          10,
        );
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 3650
    ? parsed
    : fallback;
}

/**
 * How long a record sat in each stage before moving on — the "Time to Next
 * Stage" of §12. Derived from the real timestamps, not stored.
 */
function collectDurations(
  durations: Record<string, number[]>,
  row: CrmRow,
): void {
  const created = row.createdAt ? new Date(row.createdAt).getTime() : null;
  const resolved = row.qualifiedAt ? new Date(row.qualifiedAt).getTime() : null;
  const activity = row.lastActivityAt
    ? new Date(row.lastActivityAt).getTime()
    : null;
  const push = (stage: string, from: number | null, to: number | null) => {
    if (from === null || to === null) return;
    const days = (to - from) / 86_400_000;
    if (days < 0 || days > 3650) return;
    durations[stage]?.push(days);
  };
  // One "time to first touch" measurement is shared by the three acquisition
  // rungs: the duration is identical, so it is recorded on each of the stages
  // that the walk can actually stop at instead of being invented per stage.
  const firstTouch = created === null ? null : (resolved ?? activity);
  push('new_lead', created, firstTouch);
  push('contacted', created, firstTouch);
  push('replied', created, firstTouch);
  push('interested', created, firstTouch);
  push('qualified', created, resolved);
  push('registered', created, activity);
}
