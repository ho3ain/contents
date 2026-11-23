import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Agent,
  AgentStatus,
} from '../../../database/entities/agents/agent.entity';
import {
  PaginationMeta,
  buildPaginationMeta,
} from '../../../common/dto/pagination.dto';
import { ListAgentsQueryDto, AgentSort } from '../dto/list-agents.dto';
import { AgentCard } from '../agents-views';
import { AgentRow, AgentsService, CARD_COLUMNS } from '../agents.service';
import {
  INTEREST_HALF_LIFE_DAYS,
  INTEREST_SATURATION,
  INTEREST_TOP_N,
} from '../../discovery/interest.constants';
import {
  CatalogFilters,
  FacetKey,
  parseFilters,
  activeFilterCount,
} from './filters';
import { SearchPlan, buildSearchPlan } from './query-plan';
import {
  RankingConfig,
  effectiveRecommended,
  resolveRankingConfig,
} from './ranking';

export interface SearchMeta {
  /** The query as typed (trimmed). */
  query: string;
  normalized: string;
  /** No result satisfied every part of the query → partial matches shown. */
  relaxed: boolean;
  /** Concept ids understood from the query ("support", "automation"…). */
  concepts: string[];
  sort: AgentSort;
  activeFilters: number;
  /** Typo-tolerant matching available in this deployment. */
  fuzzy: boolean;
  personalized: boolean;
}

export interface AgentListResult {
  items: AgentCard[];
  meta: PaginationMeta;
  search: SearchMeta;
}

export interface FacetCount {
  value: string;
  label: string;
  count: number;
  /** Taxonomy v2 — Persian display label when the catalog has one. */
  labelFa?: string | null;
  /** Taxonomy v2 — parent category slug for subcategory facets. */
  parent?: string | null;
}

export interface AgentFacets {
  total: number;
  categories: FacetCount[];
  productTypes: FacetCount[];
  deliveryModels: FacetCount[];
  executionModels: FacetCount[];
  integrations: FacetCount[];
  /** Taxonomy v2 — industries with at least one match. */
  industries: FacetCount[];
  setupDifficulties: FacetCount[];
  requirements: FacetCount[];
  useCases: FacetCount[];
  trust: {
    listingReviewed: number;
    verifiedCreator: number;
    noSensitiveData: number;
    clearDataPolicy: number;
  };
  quality: {
    popular: number;
    rating4: number;
    rating3: number;
    reviews5: number;
  };
  pricing: {
    free: number;
    paid: number;
    minPrice: string | null;
    maxPrice: string | null;
  };
}

export interface SearchSuggestions {
  query: string;
  products: Array<
    Pick<AgentCard, 'id' | 'slug' | 'name' | 'shortDescription' | 'logoUrl'> & {
      category: { slug: string; name: string } | null;
    }
  >;
  categories: Array<{ slug: string; name: string; count: number }>;
  useCases: string[];
  popularQueries: string[];
}

export interface NoResultsGuidance {
  query: string;
  concepts: string[];
  nearMatches: AgentCard[];
  categories: Array<{ slug: string; name: string; count: number }>;
  popular: AgentCard[];
  /** Count with ONLY the query applied (helps the "remove filters" hint). */
  withoutFilters: number;
}

type RankedRow = AgentRow & {
  total_count: string | number;
};

type OmitKey = FacetKey | 'price' | 'rating';
type Personal = { ids: string[]; weights: number[] } | null;

/** Normalizes a number for safe inlining into SQL (config-derived only). */
const num = (value: number): string => {
  if (!Number.isFinite(value)) throw new Error('Non-finite ranking constant');
  return value.toString();
};

const FACET_CONCURRENCY = 3;

/** Runs the given async tasks with at most `limit` in flight. */
export function concurrencyLimiter(
  limit: number,
): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((r) => waiting.push(r));
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

class ParamBag {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

const FROM_BASE_SQL = `
  FROM agents agent
  JOIN creator_profiles cp ON cp.id = agent.creator_id
  LEFT JOIN agent_versions pv ON pv.id = agent.published_version_id`;

/**
 * Per-listing aggregates. Each is a LEFT JOIN LATERAL that yields at most one
 * row per listing (an aggregate without GROUP BY, or LIMIT 1), so joining or
 * omitting one NEVER changes which listings are returned — only the cost.
 */
const LATERALS: Array<{ alias: string; sql: string }> = [
  {
    alias: 'rv',
    sql: `LEFT JOIN LATERAL (
    SELECT AVG(r.rating)::float8 AS avg_rating, COUNT(*)::int AS review_count
      FROM reviews r WHERE r.agent_id = agent.id AND r.status = 'published'
  ) rv ON true`,
  },
  {
    alias: 'ad',
    sql: `LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT e.user_id)::int AS adopters
      FROM entitlements e WHERE e.agent_id = agent.id AND e.status = 'granted'
  ) ad ON true`,
  },
  {
    alias: 'vf',
    sql: `LEFT JOIN LATERAL (
    SELECT (av.status = 'granted') AS granted
      FROM agent_verifications av WHERE av.agent_id = agent.id
     ORDER BY av.created_at DESC LIMIT 1
  ) vf ON true`,
  },
];

/** Everything every query needs (ranking, `list`). */
const FROM_SQL = `${FROM_BASE_SQL}\n  ${LATERALS.map((l) => l.sql).join('\n  ')}`;

/**
 * The same three aggregates computed ONCE for the whole catalogue (hash joins)
 * instead of once per listing (correlated lookups). When the query does not
 * narrow the catalogue — every published listing is a candidate anyway — this
 * is the cheaper algorithm (measured 2x at 20 000 listings); for a selective
 * query the per-listing lookups stay cheaper, so those keep using FROM_SQL.
 * Same aliases and column names, same NULL-for-no-rows behaviour.
 */
const FROM_BROAD_SQL = `${FROM_BASE_SQL}
  LEFT JOIN (
    SELECT r.agent_id, AVG(r.rating)::float8 AS avg_rating, COUNT(*)::int AS review_count
      FROM reviews r WHERE r.status = 'published' GROUP BY r.agent_id
  ) rv ON rv.agent_id = agent.id
  LEFT JOIN (
    SELECT e.agent_id, COUNT(DISTINCT e.user_id)::int AS adopters
      FROM entitlements e WHERE e.status = 'granted' GROUP BY e.agent_id
  ) ad ON ad.agent_id = agent.id
  LEFT JOIN (
    SELECT DISTINCT ON (av.agent_id) av.agent_id, (av.status = 'granted') AS granted
      FROM agent_verifications av ORDER BY av.agent_id, av.created_at DESC
  ) vf ON vf.agent_id = agent.id`;

/**
 * FROM clause with only the aggregates the given SQL text actually reads.
 * Facet counts (12 queries per request) mostly read none of them; paying three
 * correlated lookups per listing for each was the dominant cost at catalogue
 * scale (measured: see docs/foundation/W4-PERFORMANCE_REPORT.md).
 */
export function fromSqlFor(referencedSql: string): string {
  const used = LATERALS.filter((l) =>
    new RegExp(`\\b${l.alias}\\.`).test(referencedSql),
  );
  return `${FROM_BASE_SQL}${used.map((l) => `\n  ${l.sql}`).join('')}`;
}

const TS_WEIGHTS = `'{0.1, 0.2, 0.4, 1.0}'::float4[]`;

const NO_FILTERS = (): CatalogFilters =>
  parseFilters({} as unknown as ListAgentsQueryDto);

/**
 * Marketplace search, filtering, ranking and suggestions (M1–M4).
 *
 * ONE implementation behind GET /agents, /agents/suggest, /agents/facets and
 * the zero-result guidance. It runs on the existing `agents.search_vector`
 * (weighted tsvector A>B>C>D, trigger-maintained) plus the trigram
 * `search_text`; only `status = 'published'` listings can ever be returned,
 * for every method in this class.
 */
@Injectable()
export class AgentSearchService implements OnModuleInit {
  private readonly logger = new Logger(AgentSearchService.name);
  private trigram = false;
  private readonly config: RankingConfig = resolveRankingConfig(
    process.env.MARKETPLACE_RANKING_CONFIG,
  );

  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepository: Repository<Agent>,
    private readonly agentsService: AgentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const rows = await this.agentsRepository.query<Array<{ ok: boolean }>>(
        `SELECT (
           EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')
           AND EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'agents' AND column_name = 'search_text')
         ) AS ok`,
      );
      this.trigram = Boolean(rows[0]?.ok);
    } catch {
      this.trigram = false;
    }
    if (!this.trigram) {
      this.logger.warn('pg_trgm unavailable — typo-tolerant search disabled');
    }
  }

  /** Test/ops hook: ranking constants actually in force. */
  get rankingConfig(): RankingConfig {
    return this.config;
  }

  // ------------------------------------------------------------------ list

  async search(
    query: ListAgentsQueryDto,
    viewerUserId?: string | null,
  ): Promise<AgentListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;
    const filters = parseFilters(query);
    const hasQuery = Boolean(query.q?.trim());
    const requestedSort: AgentSort =
      query.sort ?? (hasQuery ? 'relevance' : 'recommended');

    let plan = hasQuery ? buildSearchPlan(query.q) : null;
    if (plan && plan.groups.length === 0) plan = null;
    // "relevance" without a usable query is just the recommended order.
    const sort: AgentSort =
      requestedSort === 'relevance' && !plan ? 'recommended' : requestedSort;

    const personal =
      sort === 'recommended' && viewerUserId
        ? await this.personalization(viewerUserId)
        : null;

    let relaxed = false;
    let result = await this.runList(
      filters,
      plan,
      sort,
      page,
      pageSize,
      personal,
    );
    if (result.total === 0 && plan && plan.groups.length > 1) {
      const relaxedPlan = buildSearchPlan(query.q, { relax: true });
      const retry = await this.runList(
        filters,
        relaxedPlan,
        sort,
        page,
        pageSize,
        personal,
      );
      if (retry.total > 0) {
        relaxed = true;
        plan = relaxedPlan;
        result = retry;
      }
    }

    const items = await this.agentsService.toCards(result.rows);
    return {
      items,
      meta: buildPaginationMeta(page, pageSize, result.total),
      search: {
        query: query.q?.trim() ?? '',
        normalized: plan?.normalized ?? '',
        relaxed,
        concepts: plan?.concepts ?? [],
        sort,
        activeFilters: activeFilterCount(filters),
        fuzzy: this.trigram,
        personalized: Boolean(personal),
      },
    };
  }

  private async runList(
    filters: CatalogFilters,
    plan: SearchPlan | null,
    sort: AgentSort,
    page: number,
    pageSize: number,
    personal: Personal,
  ): Promise<{ rows: AgentRow[]; total: number }> {
    const bag = new ParamBag();
    const status = bag.add(AgentStatus.PUBLISHED);
    const conditions = [
      `agent.status = ${status}`,
      ...this.filterConditions(filters, bag),
    ];
    const search = plan ? this.searchSql(plan, bag, true) : null;
    if (search) conditions.push(search.prefilter);

    const signals = this.signalSql(personal ? bag : null, personal);
    const recommendedW = effectiveRecommended(this.config, Boolean(personal));
    const recommended = `(
      ${num(recommendedW.quality)} * ${signals.quality}
      + ${num(recommendedW.popularity)} * ${signals.popularity}
      + ${num(recommendedW.freshness)} * ${signals.freshness}
      + ${num(recommendedW.verification)} * ${signals.verification}
      + ${num(recommendedW.personal)} * ${signals.personal}
    )`;
    const relevance = search
      ? `(${search.relevance} * ${num(1 - this.config.relevance.tieBreak)}
          + ${num(this.config.relevance.tieBreak)} * ${recommended})`
      : '0.0';

    const limit = bag.add(pageSize);
    const offset = bag.add((page - 1) * pageSize);
    const minMatch = plan ? bag.add(plan.minMatch) : null;

    // Nothing narrows the catalogue (no search, no filter): every published
    // listing is a candidate, so aggregate once instead of once per listing.
    const fromSql =
      !search && conditions.length === 1 ? FROM_BROAD_SQL : FROM_SQL;
    const sql = `
      WITH ranked AS (
        SELECT ${CARD_COLUMNS},
          agent.created_at AS created_at,
          COALESCE(rv.review_count, 0) AS review_count,
          ${signals.bayes} AS bayes,
          ${signals.popularity} AS sig_popularity,
          COALESCE(ad.adopters, 0) AS adopters,
          agent.views AS views,
          ${recommended} AS recommended,
          ${relevance} AS relevance,
          ${search ? search.matched : '1'} AS matched
        ${fromSql}
        WHERE ${conditions.join('\n          AND ')}
      )
      SELECT r.*, COUNT(*) OVER() AS total_count
        FROM ranked r
       ${minMatch ? `WHERE r.matched >= ${minMatch}::int` : ''}
       ${this.orderSql(sort)}
       LIMIT ${limit} OFFSET ${offset}`;

    const rows = await this.agentsRepository.query<RankedRow[]>(
      sql,
      bag.values,
    );
    if (rows.length > 0) {
      return { rows, total: Number(rows[0].total_count) };
    }
    if (page === 1) return { rows: [], total: 0 };
    // Page beyond the end: the window count has no row to ride on.
    const countBag = new ParamBag();
    const countStatus = countBag.add(AgentStatus.PUBLISHED);
    const countConditions = [
      `agent.status = ${countStatus}`,
      ...this.filterConditions(filters, countBag),
    ];
    const countSearch = plan ? this.searchSql(plan, countBag) : null;
    if (countSearch) countConditions.push(countSearch.prefilter);
    const minCount = plan ? countBag.add(plan.minMatch) : null;
    const counted = await this.agentsRepository.query<Array<{ total: string }>>(
      `SELECT COUNT(*) AS total FROM (
         SELECT ${countSearch ? countSearch.matched : '1'} AS matched
         ${fromSqlFor(`${countSearch ? countSearch.matched : ''} ${countConditions.join(' AND ')}`)}
         WHERE ${countConditions.join(' AND ')}
       ) c ${minCount ? `WHERE c.matched >= ${minCount}::int` : ''}`,
      countBag.values,
    );
    return { rows: [], total: Number(counted[0]?.total ?? 0) };
  }

  private orderSql(sort: AgentSort): string {
    switch (sort) {
      case 'relevance':
        return 'ORDER BY r.relevance DESC, r.published_at DESC, r.id';
      case 'popular':
        return 'ORDER BY r.sig_popularity DESC, r.adopters DESC, r.views DESC, r.published_at DESC, r.id';
      case 'rating':
        // Bayesian average: one 5★ review cannot beat many 4.7★ reviews.
        return 'ORDER BY r.bayes DESC NULLS LAST, r.review_count DESC, r.published_at DESC, r.id';
      case 'reviews':
        return 'ORDER BY r.review_count DESC, r.published_at DESC, r.id';
      case 'price_asc':
        return 'ORDER BY r.is_free DESC, r.price ASC, r.published_at DESC, r.id';
      case 'price_desc':
        return 'ORDER BY r.price DESC, r.published_at DESC, r.id';
      case 'newest':
        return 'ORDER BY r.published_at DESC, r.created_at DESC, r.id';
      case 'recommended':
      default:
        return 'ORDER BY r.recommended DESC, r.published_at DESC, r.id';
    }
  }

  // ------------------------------------------------------- SQL fragments

  /** Normalized 0..1 ranking signals as SQL expressions. */
  private signalSql(bag: ParamBag | null, personal: Personal) {
    const c = this.config;
    const n = 'COALESCE(rv.review_count, 0)';
    const avg = `COALESCE(rv.avg_rating, ${num(c.priorMean)})`;
    const bayesExpr = `((${num(c.priorWeight)} * ${num(c.priorMean)} + ${n} * ${avg}) / (${num(c.priorWeight)} + ${n}))`;
    const quality = `LEAST(1.0, GREATEST(0.0,
      0.7 * ((${bayesExpr} - 1.0) / 4.0) + 0.3 * LEAST(1.0, LN(1 + ${n}) / LN(21))))`;
    const popularity = `LEAST(1.0, LN(1 + ${num(c.adopterWeight)} * COALESCE(ad.adopters, 0)
      + ${num(c.viewWeight)} * agent.views) / LN(501))`;
    const freshness = `EXP(-LN(2) * GREATEST(0, EXTRACT(EPOCH FROM (now() -
      GREATEST(agent.published_at, COALESCE(pv.published_at, agent.published_at)))) / 86400.0)
      / ${num(c.freshnessHalfLifeDays)})`;
    const verification = `(CASE WHEN COALESCE(vf.granted, false) THEN 0.6 ELSE 0.0 END
      + CASE WHEN cp.verification_status = 'verified' THEN 0.4 ELSE 0.0 END)`;
    let personalSql = '0.0';
    if (bag && personal && personal.ids.length > 0) {
      const ids = bag.add(personal.ids);
      const weights = bag.add(personal.weights);
      personalSql = `COALESCE((
        SELECT MAX(u.w) FROM unnest(${ids}::uuid[], ${weights}::float8[]) AS u(cid, w)
          JOIN agent_categories pac ON pac.category_id = u.cid AND pac.agent_id = agent.id
      ), 0.0)`;
    }
    return {
      bayes: `(CASE WHEN ${n} > 0 THEN ${bayesExpr} END)`,
      quality,
      popularity,
      freshness,
      verification,
      personal: personalSql,
    };
  }

  /** The popularity expression (for the `popular` filter). */
  private popularitySql(): string {
    return this.signalSql(null, null).popularity;
  }

  /**
   * Query → SQL. A listing matches when at least `minMatch` query GROUPS are
   * satisfied; each group is satisfied literally (prefix tolerant), through
   * a synonym/concept, or — for words ≥ 4 letters — through typo-tolerant
   * trigram similarity.
   */
  private searchSql(
    plan: SearchPlan,
    bag: ParamBag,
    withRelevance = false,
  ): { prefilter: string; matched: string; relevance: string } {
    const c = this.config;
    const groupCount = plan.groups.length;
    const hits: string[] = [];
    const strengths: string[] = [];
    const ranks: string[] = [];
    const fuzzyParts: string[] = [];

    for (const group of plan.groups) {
      const exact = bag.add(group.exact);
      const exactM = `(agent.search_vector @@ to_tsquery('simple', ${exact}::text))`;
      let expandedM = 'false';
      let rank = `ts_rank(${TS_WEIGHTS}, agent.search_vector, to_tsquery('simple', ${exact}::text)) / 0.3`;
      if (group.expanded) {
        const expanded = bag.add(group.expanded);
        expandedM = `(agent.search_vector @@ to_tsquery('simple', ${expanded}::text))`;
        rank = `GREATEST(${rank}, ${num(c.synonymFactor)} *
          ts_rank(${TS_WEIGHTS}, agent.search_vector, to_tsquery('simple', ${expanded}::text)) / 0.3)`;
      }
      let fuzzyM = 'false';
      if (this.trigram && group.fuzzy) {
        const fuzzy = bag.add(group.fuzzy);
        fuzzyM = `(${fuzzy}::text <% agent.search_text)`;
        fuzzyParts.push(fuzzyM);
      }
      hits.push(`(${exactM} OR ${expandedM} OR ${fuzzyM})::int`);
      strengths.push(
        `(CASE WHEN ${exactM} THEN 1.0 WHEN ${expandedM} THEN ${num(c.synonymFactor)}
          WHEN ${fuzzyM} THEN ${num(c.fuzzyFactor)} ELSE 0.0 END)`,
      );
      ranks.push(`LEAST(1.0, ${rank})`);
    }

    const any = bag.add(plan.anyExpression);
    const prefilter = `(agent.search_vector @@ to_tsquery('simple', ${any}::text)${
      fuzzyParts.length ? ` OR ${fuzzyParts.join(' OR ')}` : ''
    })`;

    const matched = `(${hits.join(' + ')})`;
    // Unreferenced parameters make Postgres fail to infer their type, so the
    // name-score parameter is only added when relevance is actually used.
    if (!withRelevance) return { prefilter, matched, relevance: '0.0' };

    const q = bag.add(plan.normalized);
    const name = 'mesh_normalize_text(agent.name)';
    const nameScore = `(CASE
        WHEN ${name} = ${q}::text THEN 1.0
        WHEN starts_with(${name}, ${q}::text) THEN 0.85
        WHEN strpos(${name}, ${q}::text) > 0 THEN 0.7
        ELSE ${this.trigram ? `0.6 * word_similarity(${q}::text, ${name})` : '0.0'} END)`;

    const w = c.relevance;
    const relevance = `(
      ${num(w.coverage)} * ((${strengths.join(' + ')}) / ${groupCount}.0)
      + ${num(w.text)} * ((${ranks.join(' + ')}) / ${groupCount}.0)
      + ${num(w.name)} * ${nameScore}
    )`;
    return { prefilter, matched, relevance };
  }

  /** Every filter → a SQL condition. `omit` drops facets (for their own counts). */
  private filterConditions(
    filters: CatalogFilters,
    bag: ParamBag,
    omit: ReadonlySet<OmitKey> = new Set(),
  ): string[] {
    const out: string[] = [];
    if (filters.category.length && !omit.has('category')) {
      // Taxonomy v2: a parent category matches its subcategories too
      // (`developer-tools` ⊇ `programming-agents`), max depth 2.
      const slugs = bag.add(filters.category);
      out.push(`EXISTS (
        SELECT 1 FROM agent_categories fac
        JOIN categories fc ON fc.id = fac.category_id
        LEFT JOIN categories fcp ON fcp.id = fc.parent_id
        WHERE fac.agent_id = agent.id
          AND (fc.slug = ANY(${slugs}::text[]) OR fcp.slug = ANY(${slugs}::text[]))
      )`);
    }
    if (filters.industry.length && !omit.has('industry')) {
      // Release hardening: a deactivated industry is not a usable filter —
      // the links stay in the DB, but the public result is empty (same as
      // the facet / index, which only expose active industries).
      out.push(`EXISTS (
        SELECT 1 FROM agent_industries fai
        JOIN industries fi ON fi.id = fai.industry_id
        WHERE fai.agent_id = agent.id AND fi.status = 'active'
          AND fi.slug = ANY(${bag.add(filters.industry)}::text[])
      )`);
    }
    if (filters.productType.length && !omit.has('productType')) {
      out.push(
        `agent.product_type = ANY(${bag.add(filters.productType)}::text[])`,
      );
    }
    if (filters.deliveryModel.length && !omit.has('deliveryModel')) {
      out.push(
        `agent.delivery_model = ANY(${bag.add(filters.deliveryModel)}::text[])`,
      );
    }
    if (filters.executionModel.length && !omit.has('executionModel')) {
      out.push(
        `agent.execution_model = ANY(${bag.add(filters.executionModel)}::text[])`,
      );
    }
    if (filters.integration.length && !omit.has('integration')) {
      out.push(`EXISTS (
        SELECT 1 FROM agent_integrations fai
        JOIN integrations fi ON fi.id = fai.integration_id
        WHERE fai.agent_id = agent.id AND fi.slug = ANY(${bag.add(filters.integration)}::text[])
      )`);
    }
    if (filters.setupDifficulty.length && !omit.has('setupDifficulty')) {
      out.push(
        `mesh_setup_difficulty(agent) = ANY(${bag.add(filters.setupDifficulty)}::text[])`,
      );
    }
    if (filters.requirement.length && !omit.has('requirement')) {
      const wantsNone = filters.requirement.includes('none');
      const types = filters.requirement.filter((type) => type !== 'none');
      const parts: string[] = [];
      if (wantsNone) {
        parts.push(`(COALESCE(agent.no_requirements, false) OR NOT EXISTS (
          SELECT 1 FROM agent_requirements nrq WHERE nrq.agent_id = agent.id AND nrq.required))`);
      }
      if (types.length) {
        parts.push(`EXISTS (
          SELECT 1 FROM agent_requirements rq
          WHERE rq.agent_id = agent.id AND rq.required AND rq.type = ANY(${bag.add(types)}::text[]))`);
      }
      out.push(`(${parts.join(' OR ')})`);
    }
    if (filters.useCase && !omit.has('useCase')) {
      out.push(`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(agent.use_cases, '[]'::jsonb)) fuc
        WHERE strpos(mesh_normalize_text(fuc), mesh_normalize_text(${bag.add(filters.useCase)}::text)) > 0
      )`);
    }
    if (filters.free !== null) {
      out.push(`agent.is_free = ${bag.add(filters.free)}`);
    }
    if (filters.minPrice !== null && !omit.has('price')) {
      out.push(`agent.price >= ${bag.add(filters.minPrice)}::numeric`);
    }
    if (filters.maxPrice !== null && !omit.has('price')) {
      out.push(`agent.price <= ${bag.add(filters.maxPrice)}::numeric`);
    }
    if (filters.ratingMin !== null && !omit.has('rating')) {
      out.push(
        `(COALESCE(rv.review_count, 0) > 0 AND rv.avg_rating >= ${bag.add(filters.ratingMin)}::float8)`,
      );
    }
    if (filters.minReviews !== null) {
      out.push(
        `COALESCE(rv.review_count, 0) >= ${bag.add(filters.minReviews)}::int`,
      );
    }
    if (filters.popular) {
      out.push(
        `${this.popularitySql()} >= ${num(this.config.popularThreshold)}`,
      );
    }
    if (filters.listingReviewed) out.push('COALESCE(vf.granted, false)');
    if (filters.verifiedCreator)
      out.push(`cp.verification_status = 'verified'`);
    if (filters.clearDataPolicy) {
      out.push(
        `EXISTS (SELECT 1 FROM agent_data_policies adp WHERE adp.agent_id = agent.id)`,
      );
    }
    if (filters.noSensitiveData) {
      // Only an agent that DECLARES a data policy can claim it handles no
      // sensitive data — no policy row means no claim (never inferred).
      out.push(`EXISTS (
        SELECT 1 FROM agent_data_policies adp2
        WHERE adp2.agent_id = agent.id AND adp2.handles_sensitive_data = false)`);
    }
    if (filters.creator) {
      out.push(`cp.slug = ${bag.add(filters.creator)}`);
    }
    return out;
  }

  // ------------------------------------------------------ personalization

  /**
   * The signed-in buyer's own category affinity (M11 profile → M4). Returns
   * null when the buyer has no signal yet, so the sort is identical to the
   * visitor's until real behaviour exists.
   */
  private async personalization(userId: string): Promise<Personal> {
    try {
      const rows = await this.agentsRepository.query<
        Array<{ category_id: string; s: number }>
      >(
        `SELECT category_id,
                score * POWER(0.5, EXTRACT(EPOCH FROM (now() - last_signal_at)) / 86400.0 / $2) AS s
           FROM buyer_interest_scores
          WHERE user_id = $1
          ORDER BY s DESC
          LIMIT $3`,
        [userId, INTEREST_HALF_LIFE_DAYS, INTEREST_TOP_N],
      );
      const positive = rows.filter((row) => Number(row.s) > 0.05);
      if (positive.length === 0) return null;
      return {
        ids: positive.map((row) => row.category_id),
        weights: positive.map((row) =>
          Math.min(1, Number(row.s) / INTEREST_SATURATION),
        ),
      };
    } catch {
      return null;
    }
  }

  // --------------------------------------------------------------- facets

  async facets(query: ListAgentsQueryDto): Promise<AgentFacets> {
    const filters = parseFilters(query);
    const plan = (() => {
      if (!query.q?.trim()) return null;
      const built = buildSearchPlan(query.q);
      return built.groups.length > 0 ? built : null;
    })();

    /** `base AS (…)` over every filter except the omitted facet(s). */
    const base = (omit: OmitKey[], extraColumns = '') => {
      const bag = new ParamBag();
      const conditions = [
        `agent.status = ${bag.add(AgentStatus.PUBLISHED)}`,
        ...this.filterConditions(filters, bag, new Set(omit)),
      ];
      const search = plan ? this.searchSql(plan, bag) : null;
      if (search) conditions.push(search.prefilter);
      const min = plan ? bag.add(plan.minMatch) : null;
      const where = conditions.join(' AND ');
      const matched = search ? search.matched : '1';
      const referenced = `${extraColumns} ${matched} ${where}`;
      const sql = `
        base AS (
          SELECT * FROM (
            SELECT agent.id, agent.product_type, agent.delivery_model,
                   agent.execution_model, agent.is_free, agent.price,
                   agent.use_cases, agent.no_requirements
                   ${extraColumns}
                   , ${matched} AS matched
            ${fromSqlFor(referenced)}
            WHERE ${where}
          ) b ${min ? `WHERE b.matched >= ${min}::int` : ''}
        )`;
      return { sql, values: bag.values };
    };
    // 12 queries are issued together; run at most FACET_CONCURRENCY at once so
    // ONE facets request can never occupy the whole connection pool (the pool
    // is shared with every other request, default 10 connections).
    const slots = concurrencyLimiter(FACET_CONCURRENCY);
    const run = async <T>(
      omit: OmitKey[],
      select: string,
      extraColumns = '',
    ): Promise<T[]> => {
      const { sql, values } = base(omit, extraColumns);
      return slots(() =>
        this.agentsRepository.query<T[]>(`WITH ${sql} ${select}`, values),
      );
    };
    const simple = (column: string, omit: FacetKey) =>
      run<{ value: string; count: number }>(
        [omit],
        `SELECT ${column} AS value, COUNT(*)::int AS count FROM base
          WHERE ${column} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 ASC`,
      );

    const [
      categories,
      productTypes,
      deliveryModels,
      executionModels,
      integrations,
      industryRows,
      setup,
      requirementRows,
      noneRow,
      useCases,
      misc,
      total,
    ] = await Promise.all([
      run<{
        slug: string;
        name: string;
        name_fa: string | null;
        parent_slug: string | null;
        count: number;
      }>(
        ['category'],
        // A parent's count includes its subcategories (same rule as the
        // category filter), so the facet number equals the result count.
        `SELECT c.slug, c.name, c.name_fa, p.slug AS parent_slug,
                COUNT(DISTINCT b.id)::int AS count
           FROM categories c
           LEFT JOIN categories p ON p.id = c.parent_id
           LEFT JOIN categories ch ON ch.parent_id = c.id
           LEFT JOIN agent_categories ac
             ON ac.category_id = c.id OR ac.category_id = ch.id
           LEFT JOIN base b ON b.id = ac.agent_id
          WHERE c.status = 'active'
            AND (p.id IS NULL OR p.status = 'active')
          GROUP BY c.id, p.slug ORDER BY c.sort_order ASC, c.name ASC`,
      ),
      simple('product_type', 'productType'),
      simple('delivery_model', 'deliveryModel'),
      simple('execution_model', 'executionModel'),
      run<{ slug: string; name: string; count: number }>(
        ['integration'],
        `SELECT i.slug, i.name, COUNT(DISTINCT b.id)::int AS count
           FROM base b
           JOIN agent_integrations ai ON ai.agent_id = b.id
           JOIN integrations i ON i.id = ai.integration_id
          GROUP BY i.id ORDER BY count DESC, i.name ASC LIMIT 24`,
      ),
      run<{
        slug: string;
        name: string;
        name_fa: string | null;
        count: number;
      }>(
        ['industry'],
        `SELECT i.slug, i.name, i.name_fa, COUNT(DISTINCT b.id)::int AS count
           FROM base b
           JOIN agent_industries ai ON ai.agent_id = b.id
           JOIN industries i ON i.id = ai.industry_id
          WHERE i.status = 'active'
          GROUP BY i.id ORDER BY count DESC, i.sort_order ASC, i.name ASC LIMIT 40`,
      ),
      run<{ value: string; count: number }>(
        ['setupDifficulty'],
        `SELECT setup AS value, COUNT(*)::int AS count FROM base GROUP BY 1`,
        ', mesh_setup_difficulty(agent) AS setup',
      ),
      run<{ value: string; count: number }>(
        ['requirement'],
        `SELECT rq.type AS value, COUNT(DISTINCT b.id)::int AS count
           FROM base b JOIN agent_requirements rq
             ON rq.agent_id = b.id AND rq.required
          GROUP BY rq.type ORDER BY count DESC`,
      ),
      run<{ count: number }>(
        ['requirement'],
        `SELECT COUNT(*)::int AS count FROM base b
          WHERE COALESCE(b.no_requirements, false) OR NOT EXISTS (
            SELECT 1 FROM agent_requirements nrq WHERE nrq.agent_id = b.id AND nrq.required)`,
      ),
      run<{ value: string; count: number }>(
        ['useCase'],
        `SELECT MIN(uc.value) AS value, COUNT(DISTINCT b.id)::int AS count
           FROM base b, jsonb_array_elements_text(COALESCE(b.use_cases, '[]'::jsonb)) AS uc(value)
          WHERE length(trim(uc.value)) > 2
          GROUP BY mesh_normalize_text(uc.value)
          ORDER BY count DESC, 1 ASC LIMIT 12`,
      ),
      run<Record<string, string | number | null>>(
        ['price', 'rating'],
        `SELECT
           COUNT(*) FILTER (WHERE reviewed)::int AS reviewed,
           COUNT(*) FILTER (WHERE creator_verified)::int AS creator_verified,
           COUNT(*) FILTER (WHERE has_policy)::int AS has_policy,
           COUNT(*) FILTER (WHERE no_sensitive)::int AS no_sensitive,
           COUNT(*) FILTER (WHERE pop_norm >= ${num(this.config.popularThreshold)})::int AS popular,
           COUNT(*) FILTER (WHERE review_count > 0 AND avg_rating >= 4)::int AS rating4,
           COUNT(*) FILTER (WHERE review_count > 0 AND avg_rating >= 3)::int AS rating3,
           COUNT(*) FILTER (WHERE review_count >= 5)::int AS reviews5,
           COUNT(*) FILTER (WHERE is_free)::int AS free,
           COUNT(*) FILTER (WHERE NOT is_free)::int AS paid,
           MIN(price) FILTER (WHERE NOT is_free)::text AS min_price,
           MAX(price) FILTER (WHERE NOT is_free)::text AS max_price
         FROM base`,
        `, COALESCE(vf.granted, false) AS reviewed,
           (cp.verification_status = 'verified') AS creator_verified,
           rv.avg_rating, COALESCE(rv.review_count, 0) AS review_count,
           ${this.popularitySql()} AS pop_norm,
           EXISTS (SELECT 1 FROM agent_data_policies p1 WHERE p1.agent_id = agent.id) AS has_policy,
           EXISTS (SELECT 1 FROM agent_data_policies p2 WHERE p2.agent_id = agent.id
                    AND p2.handles_sensitive_data = false) AS no_sensitive`,
      ),
      run<{ count: number }>([], `SELECT COUNT(*)::int AS count FROM base`),
    ]);

    const m = misc[0] ?? {};
    const labelled = (
      rows: Array<{ value: string; count: number }>,
    ): FacetCount[] =>
      rows.map((row) => ({
        value: row.value,
        label: row.value,
        count: Number(row.count),
      }));
    const requirements = labelled(requirementRows);
    const none = Number(noneRow[0]?.count ?? 0);
    if (none > 0) {
      requirements.push({ value: 'none', label: 'none', count: none });
    }

    return {
      total: Number(total[0]?.count ?? 0),
      categories: categories.map((row) => ({
        value: row.slug,
        label: row.name,
        labelFa: row.name_fa,
        parent: row.parent_slug,
        count: Number(row.count),
      })),
      productTypes: labelled(productTypes),
      deliveryModels: labelled(deliveryModels),
      executionModels: labelled(executionModels),
      integrations: integrations.map((row) => ({
        value: row.slug,
        label: row.name,
        count: Number(row.count),
      })),
      industries: industryRows.map((row) => ({
        value: row.slug,
        label: row.name,
        labelFa: row.name_fa,
        count: Number(row.count),
      })),
      setupDifficulties: labelled(
        setup.filter((row) => row.value !== 'unknown'),
      ),
      requirements,
      useCases: labelled(useCases),
      trust: {
        listingReviewed: Number(m.reviewed ?? 0),
        verifiedCreator: Number(m.creator_verified ?? 0),
        noSensitiveData: Number(m.no_sensitive ?? 0),
        clearDataPolicy: Number(m.has_policy ?? 0),
      },
      quality: {
        popular: Number(m.popular ?? 0),
        rating4: Number(m.rating4 ?? 0),
        rating3: Number(m.rating3 ?? 0),
        reviews5: Number(m.reviews5 ?? 0),
      },
      pricing: {
        free: Number(m.free ?? 0),
        paid: Number(m.paid ?? 0),
        minPrice: (m.min_price as string | null) ?? null,
        maxPrice: (m.max_price as string | null) ?? null,
      },
    };
  }

  // ---------------------------------------------------------- suggestions

  async suggest(rawQuery: string): Promise<SearchSuggestions> {
    const q = rawQuery.trim().slice(0, 80);
    const plan = q ? buildSearchPlan(q, { relax: true }) : null;

    const popularQueries = this.popularQueries(plan?.normalized ?? '');
    if (!plan || plan.groups.length === 0 || plan.normalized.length < 2) {
      const [categories, queries, useCases] = await Promise.all([
        this.topCategories(6),
        popularQueries,
        this.topUseCases(''),
      ]);
      return {
        query: q,
        products: [],
        categories,
        useCases,
        popularQueries: queries,
      };
    }

    const [products, categories, useCases, queries] = await Promise.all([
      this.runList(NO_FILTERS(), plan, 'relevance', 1, 5, null),
      this.matchingCategories(plan),
      this.topUseCases(plan.normalized),
      popularQueries,
    ]);
    const cards = await this.agentsService.toCards(products.rows);
    return {
      query: q,
      products: cards.map((card) => ({
        id: card.id,
        slug: card.slug,
        name: card.name,
        shortDescription: card.shortDescription,
        logoUrl: card.logoUrl,
        category: card.category
          ? { slug: card.category.slug, name: card.category.name }
          : null,
      })),
      categories,
      useCases,
      popularQueries: queries,
    };
  }

  private async topCategories(limit: number) {
    const rows = await this.agentsRepository.query<
      Array<{ slug: string; name: string; count: number }>
    >(
      `SELECT c.slug, c.name, COUNT(DISTINCT a.id)::int AS count
         FROM categories c
         JOIN agent_categories ac ON ac.category_id = c.id
         JOIN agents a ON a.id = ac.agent_id AND a.status = 'published'
        WHERE c.status = 'active'
        GROUP BY c.id ORDER BY count DESC, c.sort_order ASC LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }

  private async matchingCategories(plan: SearchPlan) {
    const rows = await this.agentsRepository.query<
      Array<{ slug: string; name: string; count: number }>
    >(
      `SELECT c.slug, c.name, COUNT(DISTINCT a.id)::int AS count
         FROM categories c
         JOIN agent_categories ac ON ac.category_id = c.id
         JOIN agents a ON a.id = ac.agent_id AND a.status = 'published'
        WHERE c.status = 'active'
          AND EXISTS (
            SELECT 1 FROM unnest($1::text[]) t
             WHERE length(t) >= 3
               AND strpos(mesh_normalize_text(c.name || ' ' || replace(c.slug, '-', ' ')), t) > 0)
        GROUP BY c.id ORDER BY count DESC, c.sort_order ASC LIMIT 4`,
      [plan.terms],
    );
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }

  private async topUseCases(normalized: string): Promise<string[]> {
    const rows = await this.agentsRepository.query<Array<{ value: string }>>(
      `SELECT MIN(uc.value) AS value, COUNT(DISTINCT a.id) AS n
         FROM agents a, jsonb_array_elements_text(COALESCE(a.use_cases, '[]'::jsonb)) AS uc(value)
        WHERE a.status = 'published' AND length(trim(uc.value)) > 2
          AND ($1::text = '' OR strpos(mesh_normalize_text(uc.value), $1::text) > 0)
        GROUP BY mesh_normalize_text(uc.value)
        ORDER BY n DESC, 1 ASC LIMIT 4`,
      [normalized],
    );
    return rows.map((row) => row.value);
  }

  /**
   * Real searches (last 30 days) that returned results, shown only when at
   * least two different visitors made them — a typed query never leaks as
   * a suggestion from a single person.
   */
  private async popularQueries(prefix: string): Promise<string[]> {
    try {
      const rows = await this.agentsRepository.query<Array<{ q: string }>>(
        `SELECT lower(query) AS q
           FROM buyer_events
          WHERE event_type = 'search' AND result_count > 0
            AND query IS NOT NULL AND length(query) >= 3
            AND occurred_at > now() - interval '30 days'
            AND ($1::text = '' OR lower(query) LIKE $1::text || '%')
          GROUP BY lower(query)
         HAVING COUNT(DISTINCT COALESCE(user_id::text, visitor_key)) >= 2
          ORDER BY COUNT(*) DESC LIMIT 4`,
        [prefix.replace(/[%_\\]/g, '')],
      );
      return rows.map((row) => row.q);
    } catch {
      return [];
    }
  }

  // ----------------------------------------------------------- zero result

  /**
   * Zero-result guidance (M1/M2): what was understood, the closest partial
   * matches (filters dropped, every word optional, typo-tolerant), real
   * categories and the most popular products — never invented content.
   */
  async noResults(query: ListAgentsQueryDto): Promise<NoResultsGuidance> {
    const q = query.q?.trim() ?? '';
    const strictPlan = q ? buildSearchPlan(q) : null;
    const plan = q ? buildSearchPlan(q, { relax: true }) : null;
    const none = NO_FILTERS();

    const [near, popularRows, categories, withoutFilters] = await Promise.all([
      plan && plan.groups.length > 0
        ? this.runList(none, plan, 'relevance', 1, 6, null)
        : Promise.resolve({ rows: [] as AgentRow[], total: 0 }),
      this.runList(none, null, 'popular', 1, 6, null),
      plan && plan.groups.length > 0
        ? this.matchingCategories(plan)
        : Promise.resolve([]),
      strictPlan && strictPlan.groups.length > 0
        ? this.runList(none, strictPlan, 'relevance', 1, 1, null).then(
            (result) => result.total,
          )
        : Promise.resolve(0),
    ]);
    const nearIds = new Set(near.rows.map((row) => row.id));
    const [nearMatches, popular, fallbackCategories] = await Promise.all([
      this.agentsService.toCards(near.rows),
      this.agentsService.toCards(
        popularRows.rows.filter((row) => !nearIds.has(row.id)).slice(0, 4),
      ),
      categories.length === 0
        ? this.topCategories(6)
        : Promise.resolve(categories),
    ]);
    return {
      query: q,
      concepts: plan?.concepts ?? [],
      nearMatches,
      categories: fallbackCategories,
      popular,
      withoutFilters,
    };
  }
}
