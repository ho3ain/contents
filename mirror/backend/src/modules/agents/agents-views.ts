import type { CommercialProfile } from '../../database/entities/agents/product-model';
import type { ReleaseInfo } from './product-freshness';
import { AgentRiskLevel } from '../../database/entities/agents/agent.entity';

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  /** Taxonomy v2 — Persian display name (null on legacy rows). */
  nameFa?: string | null;
  /** Parent category when this is a subcategory (Taxonomy v2). */
  parent?: { slug: string; name: string; nameFa: string | null } | null;
}

/** Taxonomy v2 — an industry the product is declared for. */
export interface IndustrySummary {
  slug: string;
  name: string;
  nameFa: string | null;
}

export interface CreatorSummary {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  verified: boolean;
}

export interface AgentCard {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  logoUrl: string | null;
  tags: string[];
  isFree: boolean;
  price: string;
  currency: string;
  riskLevel: AgentRiskLevel;
  version: string;
  rating: RatingSummary;
  verified: boolean;
  category: CategorySummary | null;
  creator: CreatorSummary;
  /** Null only in a creator's pre-publication preview (A2 §23). */
  publishedAt: Date | null;
  /** Product Contract type (§5) — null on legacy listings. */
  productType: string | null;
  /** Buyer Discovery — first creator-declared use cases (≤ 3). */
  useCases: string[];
  /** Integration names (≤ 4), from the real declarations. */
  integrationNames: string[];
  deliveryModel: string | null;
  executionModel: string | null;
  /** DERIVED from requirements, delivery and integrations (never claimed). */
  setupDifficulty: 'easy' | 'medium' | 'advanced' | 'unknown';
  /** Real adoption + views crossed the popularity threshold (no raw counts). */
  popular: boolean;
}

export interface PermissionDeclaration {
  code: string;
  label: string;
  description: string | null;
  reason: string | null;
  required: boolean;
}

export interface IntegrationDeclaration {
  slug: string;
  name: string;
  purpose: string | null;
}

export interface RequirementDeclaration {
  type: string;
  /** Phase A2: short name ("OpenAI API key"); null on older listings. */
  name: string | null;
  description: string;
  /** Phase A2: why the buyer needs it; null on older listings. */
  reason: string | null;
  required: boolean;
}

export interface DataPolicyView {
  storesUserData: boolean;
  retentionDays: number | null;
  processingLocation: string | null;
  sharesWithThirdParties: boolean;
  thirdParties: string[];
  handlesSensitiveData: boolean;
  sensitiveDataCategories: string[];
  dataAccessed: string[];
  inputsDescription: string;
  outputsDescription: string;
  /** Phase A2: what user data is stored (when storesUserData). */
  storedData: string[];
}

export interface ReviewSummary {
  id: string;
  rating: number;
  text: string;
  authorName: string;
  verified?: boolean;
  createdAt: Date;
  /** A5 §10 — optional structured feedback. */
  pros: string | null;
  cons: string | null;
  useCase: string | null;
  positiveTopics: string[];
  negativeTopics: string[];
  /** Gap closure — the reviewer's own structured answers (optional). */
  solvedProblem: 'yes' | 'partly' | 'no' | null;
  wouldRecommend: boolean | null;
  reply: {
    body: string;
    createdAt: Date;
    /** A5 §12 — set when the creator edited the reply. */
    editedAt: Date | null;
    /** A5 §12 — "fixed in version X" (a real published version). */
    resolvedInVersion: string | null;
  } | null;
}

export interface AgentDetail extends AgentCard {
  /** Phase 3: server-derived Runtime disclosure; null means no Runtime registration (legacy delivery stays unchanged). */
  runtime: {
    executionModel:
      | 'mesh_managed'
      | 'mesh_connected'
      | 'independent_deliverable'
      | 'external_unconnected';
    state: string;
    operationalStatus: string;
    verifiedCapabilities: string[];
    controlled: boolean;
    limitation: string;
  } | null;
  fullDescription: string;
  capabilities: Array<{ title: string; description?: string }>;
  limitations: string[];
  useCases: string[];
  targetAudience: string[];
  inputs: string[];
  outputs: string[];
  howItWorks: Array<{ title: string; description?: string }>;
  exampleInput: string | null;
  exampleOutput: string | null;
  usageGuide: string | null;
  demoUrl: string | null;
  /**
   * Product Contract (§20) — the declaration the creator submitted and
   * the admin approved for THIS published version. Null fields mean a
   * legacy listing that predates the contract (§39 decision 21) and the
   * UI must honestly render "Unknown" — never invent values (P13).
   * AgentHub itself delivers/hosts/executes nothing; delivery happens
   * entirely outside the platform.
   */
  /** Phase 1 commercial declaration; null means a legacy listing. */
  commercialProfile: CommercialProfile | null;
  buildTool: string | null;
  buildToolDetail: string | null;
  deliveryModel: string | null;
  executionModel: string | null;
  hostingResponsibility: string | null;
  whatBuyerReceives: string[];
  whatBuyerDoesNotReceive: string[];
  additionalCosts: Array<{ label: string; note: string | null }>;
  usageModel: string | null;
  supportOwner: string | null;
  supportScope: string | null;
  supportPeriod: string | null;
  /**
   * Product Creation (Phase A2) — buyer-clarity fields (§9, §14, §17, §18).
   * Empty values on listings created before A2; the UI hides empty blocks.
   */
  problemStatement: string;
  bestFor: string[];
  notFor: string[];
  infrastructureNeeds: string | null;
  /** The creator explicitly declared "no extra requirements". */
  noRequirements: boolean;
  pricingNote: string | null;
  coverUrl: string | null;
  screenshots: string[];
  /** Optional creator demo video (https URL, rendered only for known hosts). */
  demoVideoUrl: string | null;
  permissions: PermissionDeclaration[];
  integrations: IntegrationDeclaration[];
  requirements: RequirementDeclaration[];
  dataPolicy: DataPolicyView | null;
  /** Taxonomy v2 — declared industries (empty on legacy listings). */
  industries: IndustrySummary[];
  ratingDistribution: Array<{ rating: number; count: number }>;
  recentReviews: ReviewSummary[];
  reviewedAt: Date | null;
  purchased: boolean;
  /** Deterministically related listings (shared category, capability overlap). */
  relatedAgents: AgentCard[];
  /** A5 §21 — other live products of the same creator (≤ 4). */
  moreFromCreator: AgentCard[];
  /** Gap closure — the signed-in viewer saved this product. */
  favorited: boolean;
  /**
   * Gap closure — the signed-in viewer is this product's creator (the UI
   * hides «save» for them; the favorites API refuses it anyway).
   */
  isOwner: boolean;
  /**
   * Gap closure — real release history: first publish, last update, the
   * latest version's buyer-facing changelog and the freshness badge. Null
   * in the creator's "preview as buyer".
   */
  release: ReleaseInfo | null;
}
