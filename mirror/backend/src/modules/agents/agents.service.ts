import {
  releaseInfo,
  type PublicVersionRow,
  type ReleaseInfo,
} from './product-freshness';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import { AgentCategory } from '../../database/entities/agents/agent-category.entity';
import { AgentVerification } from '../../database/entities/agents/agent-verification.entity';
import {
  Entitlement,
  EntitlementStatus,
} from '../../database/entities/commerce/entitlement.entity';
import {
  Review,
  ReviewStatus,
} from '../../database/entities/reviews/review.entity';
import { User } from '../../database/entities/identity/user.entity';
import {
  PaginationMeta,
  buildPaginationMeta,
} from '../../common/dto/pagination.dto';
import { popularityScore, resolveRankingConfig } from './search/ranking';
import {
  AgentCard,
  AgentDetail,
  CategorySummary,
  IndustrySummary,
  CreatorSummary,
  DataPolicyView,
  IntegrationDeclaration,
  PermissionDeclaration,
  RequirementDeclaration,
  ReviewSummary,
} from './agents-views';
import { AgentVersionContent } from '../../database/entities/agents/agent-version.entity';
import type { CommercialProfile } from '../../database/entities/agents/product-model';
import { RuntimesService } from '../runtime/runtimes.service';

/**
 * The columns every marketplace CARD needs (alias `agent`, published version
 * joined as `pv`). One list, reused by every card query so a card field is
 * added in exactly one place.
 */
export const CARD_COLUMNS = `
  agent.id, agent.name, agent.slug, agent.short_description, agent.full_description,
  agent.logo_url, agent.demo_url, agent.capabilities, agent.limitations,
  agent.use_cases, agent.delivery_model, agent.execution_model,
  agent.price, agent.currency, agent.is_free, agent.risk_level,
  pv.version_number AS version,
  agent.published_at, agent.creator_id, agent.product_type`;

export interface AgentRow {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  full_description: string;
  logo_url: string | null;
  demo_url: string | null;
  capabilities: Array<{ title: string; description?: string }>;
  limitations: string[];
  use_cases: string[];
  target_audience: string[];
  inputs: string[];
  outputs: string[];
  how_it_works: Array<{ title: string; description?: string }>;
  example_input: string | null;
  example_output: string | null;
  usage_guide: string | null;
  price: string;
  currency: string;
  is_free: boolean;
  risk_level: string;
  version: string | null;
  published_at: Date;
  creator_id: string;
  // Product Contract (§5–§20) — nullable on legacy listings.
  product_type: string | null;
  commercial_profile: CommercialProfile | null;
  build_tool: string | null;
  build_tool_detail: string | null;
  delivery_model: string | null;
  execution_model: string | null;
  hosting_responsibility: string | null;
  what_buyer_receives: string[] | null;
  what_buyer_does_not_receive: string[] | null;
  additional_costs: Array<{ label: string; note: string | null }> | null;
  usage_model: string | null;
  support_owner: string | null;
  support_scope: string | null;
  support_period: string | null;
  // Product Creation (Phase A2) — detail query only.
  problem_statement?: string | null;
  best_for?: string[] | null;
  not_for?: string[] | null;
  infrastructure_needs?: string | null;
  no_requirements?: boolean | null;
  pricing_note?: string | null;
  cover_url?: string | null;
  screenshots?: string[] | null;
  demo_video_url?: string | null;
}

/** The per-listing declarations the detail page renders (A2 §23). */
interface DetailDeclarations {
  permissions: PermissionDeclaration[];
  integrations: IntegrationDeclaration[];
  requirements: RequirementDeclaration[];
  dataPolicy: DataPolicyView | null;
  industries: IndustrySummary[];
}

/** Marketplace-only context around a detail (reviews, purchase, related). */
interface DetailContext {
  ratingDistribution: Array<{ rating: number; count: number }>;
  recentReviews: AgentDetail['recentReviews'];
  purchased: boolean;
  relatedAgents: AgentCard[];
  moreFromCreator: AgentCard[];
  /** Gap closure — the signed-in viewer saved this product. */
  favorited: boolean;
  /** Gap closure — the signed-in viewer is this product's creator. */
  isOwner: boolean;
  /** Gap closure — real publish history (null in creator preview). */
  release: ReleaseInfo | null;
}

interface CreatorProfileRow {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  verification_status: string;
}

interface EnrichedCardFields {
  integrations: string[];
  setupDifficulty: AgentCard['setupDifficulty'];
  popular: boolean;
  rating: { average: number | null; count: number };
  verified: boolean;
  reviewedAt: Date | null;
  categories: CategorySummary[];
  creator: CreatorSummary;
}

interface ReviewListItem {
  id: string;
  rating: number;
  text: string;
  user: User;
  createdAt: Date;
  reply: {
    body: string;
    createdAt: Date;
    editedAt?: Date | null;
    resolvedInVersion?: string | null;
  } | null;
}

export interface AgentListResult {
  items: AgentCard[];
  meta: PaginationMeta;
}

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepository: Repository<Agent>,
    @InjectRepository(AgentVerification)
    private readonly agentVerificationsRepository: Repository<AgentVerification>,
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    @InjectRepository(Entitlement)
    private readonly entitlementsRepository: Repository<Entitlement>,
    @InjectRepository(AgentCategory)
    private readonly agentCategoriesRepository: Repository<AgentCategory>,
    private readonly runtimes: RuntimesService,
  ) {}

  async getBySlug(
    slug: string,
    viewerUserId?: string,
  ): Promise<AgentDetail | null> {
    const rows = await this.agentsRepository.query<AgentRow[]>(
      `
      SELECT
        agent.id, agent.name, agent.slug, agent.short_description, agent.full_description,
        agent.logo_url, agent.demo_url, agent.capabilities, agent.limitations,
        agent.use_cases, agent.target_audience, agent.inputs, agent.outputs,
        agent.how_it_works, agent.example_input, agent.example_output,
        agent.usage_guide,
        agent.price, agent.currency, agent.is_free, agent.risk_level,
        agent.product_type, agent.commercial_profile, agent.build_tool, agent.build_tool_detail,
        agent.delivery_model, agent.execution_model, agent.hosting_responsibility,
        agent.what_buyer_receives, agent.what_buyer_does_not_receive,
        agent.additional_costs, agent.usage_model,
        agent.support_owner, agent.support_scope, agent.support_period,
        agent.problem_statement, agent.best_for, agent.not_for,
        agent.infrastructure_needs, agent.no_requirements, agent.pricing_note,
        agent.cover_url, agent.screenshots, agent.demo_video_url,
        pv.version_number AS version,
        agent.published_at, agent.creator_id, agent.product_type
      FROM agents agent
      LEFT JOIN agent_versions pv ON pv.id = agent.published_version_id
      WHERE agent.slug = $1 AND agent.status = $2
      `,
      [slug, AgentStatus.PUBLISHED],
    );

    const row = rows[0];
    if (!row) return null;

    // Phase A4: views are counted by the explicit, de-duplicated view
    // beacon (POST agents/:slug/view), never by this data read.

    const [
      enriched,
      permissions,
      integrations,
      requirements,
      dataPolicy,
      recentReviews,
      purchased,
      related,
      favorited,
      versions,
      isOwner,
      industries,
    ] = await Promise.all([
      this.enrichCards([row]),
      this.loadPermissions(row.id),
      this.loadIntegrations(row.id),
      this.loadRequirements(row.id),
      this.loadDataPolicy(row.id),
      this.listReviewsOf(row.id, 4, 0),
      viewerUserId
        ? this.entitlementsRepository.existsBy({
            userId: viewerUserId,
            agentId: row.id,
            status: EntitlementStatus.GRANTED,
          })
        : Promise.resolve(false),
      this.loadRelatedAgents(row),
      viewerUserId
        ? this.agentsRepository
            .query<Array<{ one: number }>>(
              `SELECT 1 AS one FROM agent_favorites
                WHERE user_id = $1 AND agent_id = $2 LIMIT 1`,
              [viewerUserId, row.id],
            )
            .then((rows) => rows.length > 0)
        : Promise.resolve(false),
      this.publicVersionRows(row.id),
      viewerUserId
        ? this.agentsRepository
            .query<Array<{ one: number }>>(
              `SELECT 1 AS one FROM creator_profiles
                WHERE id = $1 AND user_id = $2 LIMIT 1`,
              [row.creator_id, viewerUserId],
            )
            .then((rows) => rows.length > 0)
        : Promise.resolve(false),
      this.loadIndustries(row.id),
    ]);
    // A5 §21 — cross-sell: the creator's other live products get their own
    // section. `relatedAgents` keeps its contract (it may include them); the
    // page de-duplicates so a product is never shown twice.
    const moreFromCreator = await this.loadMoreFromCreator(row);

    const fields = enriched.get(row.id);
    const ratingDistribution = await this.ratingDistribution(row.id);

    const detail = this.toDetail(
      row,
      fields,
      { permissions, integrations, requirements, dataPolicy, industries },
      {
        ratingDistribution,
        recentReviews: recentReviews.items,
        purchased,
        relatedAgents: related,
        moreFromCreator,
        favorited,
        isOwner,
        release: releaseInfo(versions),
      },
    );
    // Additive Phase 3 disclosure: absence stays null for legacy products;
    // no hosting/runtime conclusion is inferred from old delivery metadata.
    return { ...detail, runtime: await this.runtimes.publicDisclosure(row.id) };
  }

  /**
   * Gap closure — the PUBLIC version history of a live product: only
   * published / deprecated versions, only buyer-facing fields (version,
   * date, changelog). Review notes and internal summaries never leave.
   */
  async publicVersions(slug: string): Promise<{
    items: Array<{
      versionNumber: string;
      publishedAt: Date | null;
      changelog: PublicVersionRow['changelog'];
      current: boolean;
    }>;
    release: ReleaseInfo;
  } | null> {
    const agent = await this.agentsRepository.findOne({
      where: { slug, status: AgentStatus.PUBLISHED },
      select: { id: true, publishedVersionId: true },
    });
    if (!agent) return null;
    const rows = await this.agentsRepository.query<
      Array<PublicVersionRow & { id: string }>
    >(
      `SELECT id, version_number AS "versionNumber", status,
              published_at AS "publishedAt", changelog
         FROM agent_versions
        WHERE agent_id = $1 AND status IN ('published', 'deprecated')
          AND published_at IS NOT NULL
        ORDER BY published_at DESC
        LIMIT 50`,
      [agent.id],
    );
    return {
      items: rows.map((v) => ({
        versionNumber: v.versionNumber,
        publishedAt: v.publishedAt,
        changelog: v.changelog ?? null,
        current: v.id === agent.publishedVersionId,
      })),
      release: releaseInfo(rows),
    };
  }

  private async publicVersionRows(
    agentId: string,
  ): Promise<PublicVersionRow[]> {
    return this.agentsRepository.query<PublicVersionRow[]>(
      `SELECT version_number AS "versionNumber", status,
              published_at AS "publishedAt", changelog
         FROM agent_versions
        WHERE agent_id = $1 AND status IN ('published', 'deprecated')
          AND published_at IS NOT NULL`,
      [agentId],
    );
  }

  /**
   * "Preview as buyer" (Phase A2 §23) — renders a creator's WORKING COPY
   * through the exact same detail mapper as the public page, so preview and
   * marketplace can never drift. Only the data source differs: the content
   * snapshot instead of the live row, with catalog labels (permissions,
   * integrations, category) resolved from the same catalogs the public
   * loaders join. Ratings/reviews are the listing's real ones (none for a
   * first draft); `purchased` is always false; nothing is counted as a view.
   */
  async previewDetail(input: {
    agentId: string;
    creatorId: string;
    slug: string;
    version: string;
    publishedAt: Date | null;
    riskLevel: string;
    content: AgentVersionContent;
  }): Promise<AgentDetail> {
    const { content } = input;
    const row: AgentRow = {
      id: input.agentId,
      name: content.name,
      slug: input.slug,
      short_description: content.shortDescription,
      full_description: content.fullDescription,
      logo_url: content.logoUrl,
      demo_url: content.demoUrl,
      capabilities: content.capabilities ?? [],
      limitations: content.limitations ?? [],
      use_cases: content.useCases ?? [],
      target_audience: content.targetAudience ?? [],
      inputs: content.inputs ?? [],
      outputs: content.outputs ?? [],
      how_it_works: content.howItWorks ?? [],
      example_input: content.exampleInput,
      example_output: content.exampleOutput,
      usage_guide: content.usageGuide,
      price: content.price,
      currency: content.currency,
      is_free: content.isFree,
      risk_level: input.riskLevel,
      version: input.version,
      published_at: input.publishedAt as Date,
      creator_id: input.creatorId,
      product_type: content.productType ?? null,
      commercial_profile: content.commercialProfile ?? null,
      build_tool: content.buildTool ?? null,
      build_tool_detail: content.buildToolDetail ?? null,
      delivery_model: content.deliveryModel ?? null,
      execution_model: content.executionModel ?? null,
      hosting_responsibility: content.hostingResponsibility ?? null,
      what_buyer_receives: content.whatBuyerReceives ?? [],
      what_buyer_does_not_receive: content.whatBuyerDoesNotReceive ?? [],
      additional_costs: (content.additionalCosts ?? []).map((cost) => ({
        label: cost.label,
        note: cost.note ?? null,
      })),
      usage_model: content.usageModel ?? null,
      support_owner: content.supportOwner ?? null,
      support_scope: content.supportScope ?? null,
      support_period: content.supportPeriod ?? null,
      problem_statement: content.problemStatement ?? '',
      best_for: content.bestFor ?? [],
      not_for: content.notFor ?? [],
      infrastructure_needs: content.infrastructureNeeds ?? null,
      no_requirements: content.noRequirements ?? false,
      pricing_note: content.pricingNote ?? null,
      cover_url: content.coverUrl ?? null,
      screenshots: content.screenshots ?? [],
      demo_video_url: content.demoVideoUrl ?? null,
    };

    const permissionCodes = (content.permissions ?? []).map((p) => p.code);
    const integrationSlugs = (content.integrations ?? []).map((i) => i.slug);
    const [
      enriched,
      permissionCatalog,
      integrationCatalog,
      categoryRows,
      ratingDistribution,
      recentReviews,
      industryRows,
    ] = await Promise.all([
      this.enrichCards([row]),
      permissionCodes.length
        ? this.agentsRepository.query<
            Array<{ code: string; label: string; description: string | null }>
          >(
            `SELECT code, label, description FROM permissions WHERE code = ANY($1)`,
            [permissionCodes],
          )
        : Promise.resolve([]),
      integrationSlugs.length
        ? this.agentsRepository.query<Array<{ slug: string; name: string }>>(
            `SELECT slug, name FROM integrations WHERE slug = ANY($1)`,
            [integrationSlugs],
          )
        : Promise.resolve([]),
      content.category
        ? this.agentsRepository.query<CategorySummary[]>(
            `SELECT c.id, c.name, c.slug, c.name_fa AS "nameFa",
                    CASE WHEN p.id IS NULL THEN NULL
                         ELSE json_build_object('slug', p.slug, 'name', p.name, 'nameFa', p.name_fa) END AS parent
               FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
              WHERE c.slug = $1`,
            [content.category],
          )
        : Promise.resolve([] as CategorySummary[]),
      this.ratingDistribution(input.agentId),
      this.listReviewsOf(input.agentId, 4, 0),
      content.industries?.length
        ? this.agentsRepository.query<IndustrySummary[]>(
            `SELECT slug, name, name_fa AS "nameFa" FROM industries
              WHERE slug = ANY($1) ORDER BY sort_order ASC`,
            [content.industries],
          )
        : Promise.resolve([] as IndustrySummary[]),
    ]);

    // The working copy's category — not the live row's — is what the buyer
    // will see after approval.
    const fields = enriched.get(row.id);
    if (fields) fields.categories = categoryRows;

    const permissionByCode = new Map(permissionCatalog.map((p) => [p.code, p]));
    const integrationBySlug = new Map(
      integrationCatalog.map((i) => [i.slug, i]),
    );
    const policy = content.dataPolicy;
    return this.toDetail(
      row,
      fields,
      {
        // Same ordering as the public loaders (code ASC / name ASC /
        // required first).
        permissions: (content.permissions ?? [])
          .map((p) => ({
            code: p.code,
            label: permissionByCode.get(p.code)?.label ?? p.code,
            description: permissionByCode.get(p.code)?.description ?? null,
            reason: p.reason,
            required: p.required,
          }))
          .sort((a, b) => a.code.localeCompare(b.code)),
        integrations: (content.integrations ?? [])
          .map((i) => ({
            slug: i.slug,
            name: integrationBySlug.get(i.slug)?.name ?? i.slug,
            purpose: i.purpose,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        requirements: [...(content.requirements ?? [])]
          .map((r) => ({
            type: r.type,
            name: r.name ?? null,
            description: r.description,
            reason: r.reason ?? null,
            required: r.required,
          }))
          .sort((a, b) => Number(b.required) - Number(a.required)),
        industries: industryRows,
        dataPolicy: policy
          ? {
              storesUserData: policy.storesUserData,
              retentionDays: policy.retentionDays,
              processingLocation: policy.processingLocation,
              sharesWithThirdParties: policy.sharesWithThirdParties,
              thirdParties: policy.thirdParties ?? [],
              handlesSensitiveData: policy.handlesSensitiveData,
              sensitiveDataCategories: policy.sensitiveDataCategories ?? [],
              dataAccessed: policy.dataAccessed ?? [],
              inputsDescription: policy.inputsDescription ?? '',
              outputsDescription: policy.outputsDescription ?? '',
              storedData: policy.storedData ?? [],
            }
          : null,
      },
      {
        ratingDistribution,
        recentReviews: recentReviews.items,
        purchased: false,
        relatedAgents: [],
        moreFromCreator: [],
        favorited: false,
        isOwner: true,
        release: null,
      },
    );
  }

  /**
   * THE buyer-facing detail mapper (single source of truth, A2 §23/§37):
   * every field a buyer sees on the product page is shaped here, for both
   * the published listing and the creator's preview.
   */
  private toDetail(
    row: AgentRow,
    fields: EnrichedCardFields | undefined,
    declarations: DetailDeclarations,
    context: DetailContext,
  ): AgentDetail {
    return {
      ...this.toCard(row, fields),
      runtime: null,
      fullDescription: row.full_description,
      capabilities: row.capabilities,
      limitations: row.limitations,
      useCases: row.use_cases ?? [],
      targetAudience: row.target_audience ?? [],
      inputs: row.inputs ?? [],
      outputs: row.outputs ?? [],
      howItWorks: row.how_it_works ?? [],
      exampleInput: row.example_input,
      exampleOutput: row.example_output,
      usageGuide: row.usage_guide,
      demoUrl: row.demo_url,
      // Product Contract (§5–§20) — null = legacy listing (honest
      // "Unknown" in the UI, never invented values).
      commercialProfile: row.commercial_profile ?? null,
      buildTool: row.build_tool ?? null,
      buildToolDetail: row.build_tool_detail ?? null,
      deliveryModel: row.delivery_model ?? null,
      executionModel: row.execution_model ?? null,
      hostingResponsibility: row.hosting_responsibility ?? null,
      whatBuyerReceives: row.what_buyer_receives ?? [],
      whatBuyerDoesNotReceive: row.what_buyer_does_not_receive ?? [],
      additionalCosts: row.additional_costs ?? [],
      usageModel: row.usage_model ?? null,
      supportOwner: row.support_owner ?? null,
      supportScope: row.support_scope ?? null,
      supportPeriod: row.support_period ?? null,
      // Product Creation (Phase A2) — buyer-clarity fields.
      problemStatement: row.problem_statement ?? '',
      bestFor: row.best_for ?? [],
      notFor: row.not_for ?? [],
      infrastructureNeeds: row.infrastructure_needs ?? null,
      noRequirements: row.no_requirements ?? false,
      pricingNote: row.pricing_note ?? null,
      coverUrl: row.cover_url ?? null,
      screenshots: row.screenshots ?? [],
      demoVideoUrl: row.demo_video_url ?? null,
      permissions: declarations.permissions,
      integrations: declarations.integrations,
      requirements: declarations.requirements,
      dataPolicy: declarations.dataPolicy,
      industries: declarations.industries,
      ratingDistribution: context.ratingDistribution,
      recentReviews: context.recentReviews,
      reviewedAt: fields?.reviewedAt ?? null,
      purchased: context.purchased,
      relatedAgents: context.relatedAgents,
      moreFromCreator: context.moreFromCreator,
      favorited: context.favorited,
      isOwner: context.isOwner,
      release: context.release,
    };
  }

  /** A5 §21 — up to 4 other LIVE products of the same creator. */
  private async loadMoreFromCreator(row: AgentRow): Promise<AgentCard[]> {
    const rows = await this.agentsRepository.query<AgentRow[]>(
      `SELECT ${CARD_COLUMNS}
      FROM agents agent
      LEFT JOIN agent_versions pv ON pv.id = agent.published_version_id
      WHERE agent.creator_id = $1 AND agent.id <> $2 AND agent.status = $3
      ORDER BY agent.published_at DESC NULLS LAST, agent.id
      LIMIT 4`,
      [row.creator_id, row.id, AgentStatus.PUBLISHED],
    );
    if (rows.length === 0) return [];
    const enriched = await this.enrichCards(rows);
    return rows.map((other) => this.toCard(other, enriched.get(other.id)));
  }

  /**
   * Related agents (BUY upgrade §27) — deterministic, real relevance only.
   * Candidates are all OTHER published listings; the ranking score uses
   * real signals in priority order: shared categories (3), shared
   * capability titles (2), same creator (1), then rating, then recency.
   * Never random, never paid placement.
   */
  private async loadRelatedAgents(row: AgentRow): Promise<AgentCard[]> {
    const titles = [
      ...new Set(
        (row.capabilities ?? [])
          .map((cap) => cap.title)
          .filter((title): title is string => typeof title === 'string'),
      ),
    ];
    const params: unknown[] = [
      row.id,
      JSON.stringify(titles),
      AgentStatus.PUBLISHED,
      row.creator_id,
    ];
    // One `capabilities @> [{"title": …}]` test per title: served by the GIN
    // index (a function scan over every listing's capabilities is not).
    const capabilityBranch = titles.length
      ? `UNION
         SELECT a.id FROM agents a
          WHERE a.status = $3 AND a.id <> $1
            AND (${titles
              .map((title) => {
                params.push(JSON.stringify([{ title }]));
                return `a.capabilities @> $${params.length}::jsonb`;
              })
              .join(' OR ')})`
      : '';

    // Candidates first (cheap, index-driven), score only those, then fetch
    // the rating tie-break just for the rows that can reach the top 4.
    // Semantics are unchanged: shared categories (3) + shared capability
    // titles (2) + same creator (1), then rating, then recency.
    const rows = await this.agentsRepository.query<AgentRow[]>(
      `WITH cat AS (
         SELECT other.agent_id AS id, COUNT(*)::int AS n
           FROM agent_categories mine
           JOIN agent_categories other ON other.category_id = mine.category_id
          WHERE mine.agent_id = $1 AND other.agent_id <> $1
          GROUP BY other.agent_id
       ),
       cand AS (
         SELECT id FROM cat
         UNION
         SELECT a.id FROM agents a
          WHERE a.creator_id = $4 AND a.status = $3 AND a.id <> $1
         ${capabilityBranch}
       ),
       scored AS (
         SELECT a.id,
                3 * COALESCE(cat.n, 0)
                + 2 * (
                  SELECT COUNT(*) FROM (
                    SELECT e->>'title' AS title
                    FROM jsonb_array_elements(COALESCE(a.capabilities, '[]'::jsonb)) e
                    INTERSECT
                    SELECT jsonb_array_elements_text($2::jsonb)
                  ) shared_capabilities
                )
                + (CASE WHEN a.creator_id = $4 THEN 1 ELSE 0 END) AS score
           FROM cand
           JOIN agents a ON a.id = cand.id AND a.status = $3
           LEFT JOIN cat ON cat.id = a.id
       ),
       cutoff AS (
         SELECT COALESCE(MIN(score), 0) AS floor
           FROM (SELECT score FROM scored ORDER BY score DESC LIMIT 4) top
       )
       SELECT ${CARD_COLUMNS}
         FROM scored s
         JOIN agents agent ON agent.id = s.id
         LEFT JOIN agent_versions pv ON pv.id = agent.published_version_id
        WHERE s.score >= (SELECT floor FROM cutoff)
        ORDER BY s.score DESC,
                 (SELECT AVG(r.rating) FROM reviews r
                   WHERE r.agent_id = agent.id AND r.status = 'published') DESC NULLS LAST,
                 agent.published_at DESC
        LIMIT 4`,
      params,
    );

    if (rows.length === 0) return [];
    const enriched = await this.enrichCards(rows);
    return rows.map((related) =>
      this.toCard(related, enriched.get(related.id)),
    );
  }

  /**
   * Phase A4 — marketplace cards for the given PUBLISHED agents, in the
   * given order (used by the labelled «Sponsored» row). The search/listing
   * ranking is never touched: this is a separate, explicit placement.
   */
  async cardsByIds(ids: string[]): Promise<AgentCard[]> {
    if (!ids.length) return [];
    const rows = await this.agentsRepository.query<AgentRow[]>(
      `SELECT ${CARD_COLUMNS}
      FROM agents agent
      LEFT JOIN agent_versions pv ON pv.id = agent.published_version_id
      WHERE agent.id = ANY($1::uuid[]) AND agent.status = $2`,
      [ids, AgentStatus.PUBLISHED],
    );
    if (!rows.length) return [];
    const enriched = await this.enrichCards(rows);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is AgentRow => Boolean(row))
      .map((row) => this.toCard(row, enriched.get(row.id)));
  }

  /** Phase A4 — the minimum needed to attribute a real product view. */
  async findPublishedForAnalytics(slug: string): Promise<{
    id: string;
    creatorUserId: string | null;
    isFree: boolean;
  } | null> {
    const rows = await this.agentsRepository.query<
      Array<{ id: string; user_id: string | null; is_free: boolean }>
    >(
      `SELECT a.id, cp.user_id, a.is_free
         FROM agents a
         LEFT JOIN creator_profiles cp ON cp.id = a.creator_id
        WHERE a.slug = $1 AND a.status = $2
        LIMIT 1`,
      [slug, AgentStatus.PUBLISHED],
    );
    const row = rows[0];
    return row
      ? { id: row.id, creatorUserId: row.user_id, isFree: row.is_free }
      : null;
  }

  async trackDemoClick(slug: string): Promise<boolean> {
    const agent = await this.agentsRepository.findOneBy({
      slug,
      status: AgentStatus.PUBLISHED,
    });
    if (!agent) return false;
    // Property name, not the column name — `'demo_clicks'` made TypeORM
    // throw ("Column demo_clicks was not found"), a 500 on every click.
    await this.agentsRepository.increment({ id: agent.id }, 'demoClicks', 1);
    return true;
  }

  async listReviews(
    slug: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ReviewSummary[]; meta: PaginationMeta }> {
    const agent = await this.agentsRepository.findOneBy({
      slug,
      status: AgentStatus.PUBLISHED,
    });
    if (!agent)
      return { items: [], meta: buildPaginationMeta(page, pageSize, 0) };

    const { items, total } = await this.listReviewsOf(
      agent.id,
      pageSize,
      (page - 1) * pageSize,
    );
    return { items, meta: buildPaginationMeta(page, pageSize, total) };
  }

  // ---------------- Enrichment ----------------

  private async enrichCards(
    rows: AgentRow[],
  ): Promise<Map<string, EnrichedCardFields>> {
    const ids = rows.map((row) => row.id);
    const result = new Map<string, EnrichedCardFields>();

    const [ratingRows, verificationRows, categoryRows, creators, extras] =
      await Promise.all([
        this.ratingRows(ids),
        this.latestVerificationRows(ids),
        this.categoryRows(ids),
        this.creatorRows(rows),
        this.cardExtras(ids),
      ]);

    const ratingByAgent = new Map(
      ratingRows.map((row) => [
        row.agent_id,
        {
          average: row.average !== null ? Number(row.average) : null,
          count: Number(row.count),
        },
      ]),
    );
    const verificationByAgent = new Map(
      verificationRows.map((row) => [row.agent_id, row]),
    );
    const categoriesByAgent = new Map<string, CategorySummary[]>();
    for (const row of categoryRows) {
      const list = categoriesByAgent.get(row.agent_id) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        nameFa: row.nameFa,
        parent: row.parent ?? null,
      });
      categoriesByAgent.set(row.agent_id, list);
    }
    const creatorById = new Map(
      creators.map((creator) => [creator.id, creator]),
    );

    for (const row of rows) {
      const verification = verificationByAgent.get(row.id);
      const creator = creatorById.get(row.creator_id);
      const extra = extras.get(row.id);
      result.set(row.id, {
        integrations: extra?.integrations ?? [],
        setupDifficulty: extra?.setupDifficulty ?? 'unknown',
        popular: extra?.popular ?? false,
        rating: ratingByAgent.get(row.id) ?? { average: null, count: 0 },
        verified: verification?.status === 'granted',
        reviewedAt:
          verification?.status === 'granted' ? verification.created_at : null,
        categories: categoriesByAgent.get(row.id) ?? [],
        creator: creator
          ? {
              id: creator.id,
              slug: creator.slug,
              displayName: creator.display_name,
              avatarUrl: creator.avatar_url,
              verified: creator.verification_status === 'verified',
            }
          : {
              id: row.creator_id,
              slug: '',
              displayName: 'Unknown creator',
              avatarUrl: null,
              verified: false,
            },
      });
    }

    return result;
  }

  /**
   * Discovery card extras from REAL data: integration names, the derived
   * setup difficulty (SQL `mesh_setup_difficulty`) and a public "popular"
   * flag (same popularity formula + threshold as the `popular` filter;
   * the raw adopter / view numbers never leave the server).
   */
  private async cardExtras(ids: string[]): Promise<
    Map<
      string,
      {
        integrations: string[];
        setupDifficulty: AgentCard['setupDifficulty'];
        popular: boolean;
      }
    >
  > {
    const config = resolveRankingConfig(process.env.MARKETPLACE_RANKING_CONFIG);
    const [signals, integrations] = await Promise.all([
      this.agentsRepository.query<
        Array<{
          id: string;
          setup: AgentCard['setupDifficulty'];
          adopters: number;
          views: number;
        }>
      >(
        `SELECT a.id, mesh_setup_difficulty(a) AS setup, a.views,
                (SELECT COUNT(DISTINCT e.user_id)::int FROM entitlements e
                  WHERE e.agent_id = a.id AND e.status = 'granted') AS adopters
           FROM agents a WHERE a.id = ANY($1::uuid[])`,
        [ids],
      ),
      this.agentsRepository.query<Array<{ agent_id: string; name: string }>>(
        `SELECT ai.agent_id, i.name
           FROM agent_integrations ai JOIN integrations i ON i.id = ai.integration_id
          WHERE ai.agent_id = ANY($1::uuid[]) ORDER BY i.name ASC`,
        [ids],
      ),
    ]);
    const integrationsByAgent = new Map<string, string[]>();
    for (const row of integrations) {
      const list = integrationsByAgent.get(row.agent_id) ?? [];
      list.push(row.name);
      integrationsByAgent.set(row.agent_id, list);
    }
    return new Map(
      signals.map((row) => [
        row.id,
        {
          integrations: (integrationsByAgent.get(row.id) ?? []).slice(0, 4),
          setupDifficulty: row.setup,
          popular:
            popularityScore(Number(row.adopters), Number(row.views), config) >=
            config.popularThreshold,
        },
      ]),
    );
  }

  /** Public: card mapper for rows selected with `CARD_COLUMNS` (search module). */
  async toCards(rows: AgentRow[]): Promise<AgentCard[]> {
    if (rows.length === 0) return [];
    const enriched = await this.enrichCards(rows);
    return rows.map((row) => this.toCard(row, enriched.get(row.id)));
  }

  private async ratingRows(ids: string[]) {
    return this.agentsRepository.query<
      Array<{ agent_id: string; average: string | null; count: string }>
    >(
      `SELECT r.agent_id, AVG(r.rating)::numeric(4,2) AS average, COUNT(*) AS count
       FROM reviews r
       WHERE r.agent_id = ANY($1) AND r.status = 'published'
       GROUP BY r.agent_id`,
      [ids],
    );
  }

  private async latestVerificationRows(ids: string[]) {
    return this.agentVerificationsRepository.query<
      Array<{ agent_id: string; status: string; created_at: Date }>
    >(
      `SELECT DISTINCT ON (agent_id) agent_id, status, created_at
       FROM agent_verifications
       WHERE agent_id = ANY($1)
       ORDER BY agent_id, created_at DESC`,
      [ids],
    );
  }

  private async categoryRows(ids: string[]) {
    return this.agentCategoriesRepository.query<
      Array<{
        agent_id: string;
        id: string;
        name: string;
        slug: string;
        nameFa: string | null;
        parent: CategorySummary['parent'];
      }>
    >(
      `SELECT ac.agent_id, c.id, c.name, c.slug, c.name_fa AS "nameFa",
              CASE WHEN p.id IS NULL THEN NULL
                   ELSE json_build_object('slug', p.slug, 'name', p.name, 'nameFa', p.name_fa) END AS parent
       FROM agent_categories ac
       JOIN categories c ON c.id = ac.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE ac.agent_id = ANY($1)
       ORDER BY c.sort_order ASC, c.name ASC`,
      [ids],
    );
  }

  private async loadIndustries(agentId: string): Promise<IndustrySummary[]> {
    return this.agentsRepository.query<IndustrySummary[]>(
      `SELECT i.slug, i.name, i.name_fa AS "nameFa"
       FROM agent_industries ai
       JOIN industries i ON i.id = ai.industry_id
       WHERE ai.agent_id = $1 AND i.status = 'active'
       ORDER BY i.sort_order ASC, i.name ASC`,
      [agentId],
    );
  }

  private async creatorRows(rows: AgentRow[]): Promise<CreatorProfileRow[]> {
    const creatorIds = [...new Set(rows.map((row) => row.creator_id))];
    return this.agentsRepository.query<CreatorProfileRow[]>(
      // The creator's avatar switch applies to cards too: a hidden picture
      // must be hidden everywhere a buyer looks, not only on the profile.
      `SELECT id, slug, display_name,
              CASE WHEN show_avatar THEN avatar_url ELSE NULL END AS avatar_url,
              verification_status
       FROM creator_profiles
       WHERE id = ANY($1)`,
      [creatorIds],
    );
  }

  private toCard(
    row: AgentRow,
    enriched: EnrichedCardFields | undefined,
  ): AgentCard {
    const categories = enriched?.categories ?? [];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      shortDescription: row.short_description,
      logoUrl: row.logo_url,
      tags: (row.capabilities ?? [])
        .map((capability) => capability.title)
        .slice(0, 5),
      isFree: row.is_free,
      price: row.price,
      currency: row.currency,
      riskLevel: row.risk_level as AgentCard['riskLevel'],
      version: row.version ?? '',
      rating: enriched?.rating ?? { average: null, count: 0 },
      verified: enriched?.verified ?? false,
      category: categories[0] ?? null,
      creator: enriched?.creator ?? {
        id: row.creator_id,
        slug: '',
        displayName: 'Unknown creator',
        avatarUrl: null,
        verified: false,
      },
      publishedAt: row.published_at,
      productType: row.product_type ?? null,
      useCases: (row.use_cases ?? []).slice(0, 3),
      integrationNames: enriched?.integrations ?? [],
      deliveryModel: row.delivery_model ?? null,
      executionModel: row.execution_model ?? null,
      setupDifficulty: enriched?.setupDifficulty ?? 'unknown',
      popular: enriched?.popular ?? false,
    };
  }

  // ---------------- Detail loaders ----------------

  private latestVerificationGrantedSql(): string {
    return `EXISTS (
      SELECT 1 FROM (
        SELECT status FROM agent_verifications av
        WHERE av.agent_id = agent.id
        ORDER BY av.created_at DESC
        LIMIT 1
      ) latest_av
      WHERE latest_av.status = 'granted'
    )`;
  }

  private async loadPermissions(agentId: string) {
    return this.agentsRepository.query<
      Array<{
        code: string;
        label: string;
        description: string | null;
        reason: string | null;
        required: boolean;
      }>
    >(
      `SELECT p.code, p.label, p.description, ap.reason, ap.required
       FROM agent_permissions ap
       JOIN permissions p ON p.id = ap.permission_id
       WHERE ap.agent_id = $1
       ORDER BY p.code ASC`,
      [agentId],
    );
  }

  private async loadIntegrations(agentId: string) {
    return this.agentsRepository.query<
      Array<{ slug: string; name: string; purpose: string | null }>
    >(
      `SELECT i.slug, i.name, ai.purpose
       FROM agent_integrations ai
       JOIN integrations i ON i.id = ai.integration_id
       WHERE ai.agent_id = $1
       ORDER BY i.name ASC`,
      [agentId],
    );
  }

  private async loadRequirements(agentId: string) {
    return this.agentsRepository.query<RequirementDeclaration[]>(
      `SELECT type, name, description, reason, required
       FROM agent_requirements
       WHERE agent_id = $1
       ORDER BY required DESC, created_at ASC, description ASC`,
      [agentId],
    );
  }

  private async loadDataPolicy(agentId: string) {
    const rows = await this.agentsRepository.query<
      Array<{
        stores_user_data: boolean;
        retention_days: number | null;
        processing_location: string | null;
        shares_with_third_parties: boolean;
        third_parties: string[];
        handles_sensitive_data: boolean;
        sensitive_data_categories: string[];
        data_accessed: string[];
        inputs_description: string;
        outputs_description: string;
        stored_data: string[] | null;
      }>
    >(
      `SELECT stores_user_data, retention_days, processing_location, shares_with_third_parties,
              third_parties, handles_sensitive_data, sensitive_data_categories, data_accessed,
              inputs_description, outputs_description, stored_data
       FROM agent_data_policies
       WHERE agent_id = $1`,
      [agentId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      storesUserData: row.stores_user_data,
      retentionDays: row.retention_days,
      processingLocation: row.processing_location,
      sharesWithThirdParties: row.shares_with_third_parties,
      thirdParties: row.third_parties,
      handlesSensitiveData: row.handles_sensitive_data,
      sensitiveDataCategories: row.sensitive_data_categories,
      dataAccessed: row.data_accessed,
      inputsDescription: row.inputs_description,
      outputsDescription: row.outputs_description,
      storedData: row.stored_data ?? [],
    };
  }

  private async ratingDistribution(
    agentId: string,
  ): Promise<Array<{ rating: number; count: number }>> {
    const rows = await this.reviewsRepository.query<
      Array<{ rating: string; count: string }>
    >(
      `SELECT rating, COUNT(*) AS count
       FROM reviews
       WHERE agent_id = $1 AND status = 'published'
       GROUP BY rating
       ORDER BY rating DESC`,
      [agentId],
    );
    const counts = new Map(
      rows.map((row) => [Number(row.rating), Number(row.count)]),
    );
    const distribution: Array<{ rating: number; count: number }> = [];
    for (let stars = 5; stars >= 1; stars -= 1) {
      distribution.push({ rating: stars, count: counts.get(stars) ?? 0 });
    }
    return distribution;
  }

  private async listReviewsOf(
    agentId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: ReviewSummary[]; total: number }> {
    const [raw, total] = await Promise.all([
      this.reviewsRepository
        .createQueryBuilder('review')
        .innerJoinAndSelect('review.user', 'reviewer')
        .leftJoinAndSelect('review.reply', 'reply')
        .where('review.agent_id = :agentId', { agentId })
        .andWhere('review.status = :status', { status: ReviewStatus.PUBLISHED })
        // Order by the entity property (camelCase), not the raw column:
        // combining a raw order-by expression with take/skip makes TypeORM
        // generate an invalid ORDER BY against the joined alias (500 at runtime).
        .orderBy('review.createdAt', 'DESC')
        .take(limit)
        .skip(offset)
        .getMany(),
      this.reviewsRepository.countBy({
        agentId,
        status: ReviewStatus.PUBLISHED,
      }),
    ]);

    const items = (
      raw as Array<Review & { user: User; reply: ReviewListItem['reply'] }>
    ).map((review) => ({
      id: review.id,
      rating: review.rating,
      text: review.text,
      authorName:
        review.user.username ?? review.user.email?.split('@')[0] ?? 'user',
      verified: review.verified,
      createdAt: review.createdAt,
      pros: review.pros ?? null,
      cons: review.cons ?? null,
      useCase: review.useCase ?? null,
      positiveTopics: review.positiveTopics ?? [],
      negativeTopics: review.negativeTopics ?? [],
      solvedProblem: review.solvedProblem ?? null,
      wouldRecommend: review.wouldRecommend ?? null,
      reply: review.reply
        ? {
            body: review.reply.body,
            createdAt: review.reply.createdAt,
            editedAt: review.reply.editedAt ?? null,
            resolvedInVersion: review.reply.resolvedInVersion ?? null,
          }
        : null,
    }));

    return { items, total };
  }
}
