// Domain types mirroring the backend REST contracts (envelope unwrapped in client.ts)

export interface Envelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

// ---- Identity ----
export type Role = "buyer" | "creator" | "admin";
export type UserStatus = "active" | "suspended";

export interface PublicUser {
  id: string;
  /** Optional — phone-primary accounts may have no email. */
  email: string | null;
  username: string | null;
  fullName: string | null;
  phone: string | null;
  country: string | null;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Backend-authoritative onboarding state (AUTH upgrade). */
  onboardingCompleted: boolean;
  /** Marketplace category slugs the user is interested in. */
  interests: string[];
  createdAt: string;
  /** Stable Multiavatar option ID. */
  avatarId?: string | null;
  /** Avatar background color token. */
  avatarBg?: string | null;
  /** Sprint 1 (B3) — consent record: when and which legal version (null = registered before versions were recorded). */
  termsAcceptedAt?: string | null;
  termsVersion?: string | null;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

/**
 * The picture buyers see, resolved by the server so every surface agrees:
 * an uploaded image, the account's generated avatar (rendered client-side
 * from its seed, like the header menu), or `null` when the creator switched
 * the picture off — initials only.
 */
export type PublicAvatar =
  | { kind: "image"; url: string }
  | { kind: "generated"; avatarId: string | null; avatarBg: string | null };

export interface CreatorProfileView {
  id: string;
  slug: string;
  displayName: string;
  bio: string;
  /** Uploaded picture URL — null when none, or when the creator hid it. */
  avatarUrl: string | null;
  /** Optional only for fixtures that predate the switch; the server always sends it. */
  avatar?: PublicAvatar | null;
  websiteUrl: string | null;
  socialLinks: string[];
  expertise: string[];
  /** Field of activity — marketplace category slugs (Creator Foundation). */
  activityAreas: string[];
  /** Gap closure — tools the creator works with (public expertise signal). */
  tools?: string[];
  /** Gap closure — null unless the creator chose to show it. */
  location?: { country: string | null; city: string | null } | null;
  verificationStatus: CreatorVerificationStatus;
  verifiedAt: string | null;
  createdAt: string;
  stats: {
    publishedAgentCount: number;
    averageRating: number | null;
    ratingCount: number;
    /** Gap closure — paid sales, server-computed from orders. */
    salesCount?: number;
    /** Gap closure — highest REACHED sales milestone (1/10/25/50/100). */
    topMilestone?: number | null;
  };
}

// ---- Gap closure — creator personalization ----
export const CREATOR_GOALS = [
  "monetize_expertise",
  "sell_ai_products",
  "productize_automations",
  "business_products",
  "other",
] as const;
export type CreatorGoal = (typeof CREATOR_GOALS)[number];
export const EXPERIENCE_LEVELS = [
  "beginner",
  "intermediate",
  "professional",
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export const PRODUCT_READINESS = ["ready", "idea", "no_idea"] as const;
export type ProductReadinessAnswer = (typeof PRODUCT_READINESS)[number];
export const KNOWN_TOOLS = [
  "n8n",
  "make",
  "zapier",
  "openai",
  "claude",
  "python",
  "apis",
] as const;
export type KnownTool = (typeof KNOWN_TOOLS)[number];
export const TOOLS_MAX = 12;
export const TOOL_MAX_LENGTH = 40;

export type IdeaDomain =
  | "support"
  | "sales"
  | "marketing"
  | "finance"
  | "hr"
  | "development"
  | "operations"
  | "data";
export type IdeaReason =
  | { kind: "expertise"; domain: IdeaDomain }
  | { kind: "area"; category: string }
  | { kind: "tool"; tool: KnownTool }
  | { kind: "level"; level: ExperienceLevel };
export interface IdeaSuggestion {
  key: string;
  domain: IdeaDomain;
  category: string;
  level: ExperienceLevel;
  tools: KnownTool[];
  score: number;
  reasons: IdeaReason[];
}
/** GET /creators/me/idea-suggestions — rule-based, from the creator's own answers. */
export interface IdeaSuggestions {
  relevant: boolean;
  personalized: boolean;
  missing: Array<"expertise" | "tools" | "experience">;
  items: IdeaSuggestion[];
}

/** Explicit targeting criteria over existing Creator profile fields. */
export interface CreatorOpportunityTargeting {
  activityAreas?: string[];
  expertise?: string[];
  tools?: string[];
  experienceLevels?: ExperienceLevel[];
  productReadiness?: ProductReadinessAnswer[];
}

export type CreatorOpportunityReason =
  | { kind: "activity_area"; value: string }
  | { kind: "expertise"; value: string }
  | { kind: "tool"; value: string }
  | { kind: "experience"; value: ExperienceLevel }
  | { kind: "readiness"; value: ProductReadinessAnswer };

/** Admin-authored opportunity after server-side profile matching. */
export interface CreatorOpportunityFeedItem {
  id: string;
  source: "admin_targeted";
  title: string;
  summary: string;
  categorySlug: string;
  useCases: string[];
  targetAudience: string[];
  problemStatement: string | null;
  buildTool: BuildToolName | null;
  buildToolDetail: string | null;
  publishedAt: string | null;
  reasons: CreatorOpportunityReason[];
}

export type CreatorOpportunityStatus = "draft" | "published" | "archived";

/** Admin-only persisted representation. */
export interface AdminCreatorOpportunity {
  id: string;
  title: string;
  summary: string;
  categorySlug: string;
  useCases: string[];
  targetAudience: string[];
  problemStatement: string | null;
  buildTool: BuildToolName | null;
  buildToolDetail: string | null;
  targeting: CreatorOpportunityTargeting;
  status: CreatorOpportunityStatus;
  createdByAdminId: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AdminCreatorOpportunityPayload = Omit<
  AdminCreatorOpportunity,
  | "id"
  | "status"
  | "createdByAdminId"
  | "publishedAt"
  | "archivedAt"
  | "createdAt"
  | "updatedAt"
>;

export interface CreatorOpportunityAudiencePreview {
  matchedCount: number;
  eligibleCount: number;
  samples: Array<{ displayName: string; slug: string }>;
  matchesAllEligible: boolean;
}

export type CreatorProfileStatus = "pending" | "approved" | "suspended";
export type CreatorVerificationStatus =
  "unverified" | "pending" | "verified" | "revoked";

/**
 * The owner's own creator profile (GET/PATCH /creators/me/profile): the
 * public shape plus owner-only account state. Served in every state —
 * including suspended — so the creator always sees why and what to do.
 */
export interface CreatorProfile extends CreatorProfileView {
  status: CreatorProfileStatus;
  approvedAt: string | null;
  /** Admin note on the latest verification decision (owner-only). */
  verificationNote: string | null;
  verificationRequestedAt: string | null;
  /** Why the account is restricted (owner-only). */
  statusReason: string | null;
  /** Gap closure — owner-only personalization + raw location settings. */
  creatorGoal?: CreatorGoal | null;
  experienceLevel?: ExperienceLevel | null;
  productReadiness?: ProductReadinessAnswer | null;
  locationCountry?: string | null;
  locationCity?: string | null;
  showLocation?: boolean;
  /** Owner-only: the avatar switch, and what exists behind it. */
  showAvatar?: boolean;
  /** The uploaded picture even while hidden, so the owner can tell hidden from missing. */
  storedAvatarUrl?: string | null;
  /** The account's generated avatar (managed from the profile workspace). */
  accountAvatar?: { avatarId: string | null; avatarBg: string | null };
}

// ---- Creator Foundation (Phase A1) ----
// Mirrors backend src/modules/creators/creator-foundation.ts — everything is
// DERIVED server-side from real state; the client never invents progress.
export type CreatorOnboardingStep =
  "intro" | "profile" | "trust" | "first_agent" | "submission";
export type CreatorOnboardingAction =
  "progress" | "dismiss" | "complete" | "resume";
export type CreatorAccountStatus =
  | "restricted"
  | "action_required"
  | "incomplete"
  | "pending_review"
  | "verified"
  | "active";
export type CreatorLifecycleStage =
  | "draft"
  | "ready"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "rejected"
  | "inactive";
export type CreatorNextActionKey =
  | "create_profile"
  | "contact_support"
  | "complete_profile"
  | "fix_agent"
  | "create_first_agent"
  | "explore_ideas"
  | "submit_for_review"
  | "await_profile_approval"
  | "complete_agent"
  | "view_review_status"
  | "view_product_page"
  | "create_agent";
export type CreatorStatusReasonKey =
  | "no_profile"
  | "suspended"
  | "trust_changes_requested"
  | "agent_changes_requested"
  | "profile_incomplete"
  | "profile_pending_approval";
export type CreatorCompletenessKey =
  | "avatar"
  | "display_name"
  | "bio"
  | "expertise"
  | "activity_areas"
  | "links"
  | "tools"
  | "trust";
/** Profile completion tiers (§39) — mirrors backend creator-foundation.ts. */
export type CreatorCompletenessTier = "required" | "recommended" | "optional";
export type CreatorChecklistKey =
  "profile" | "first_agent" | "complete_agent" | "submit" | "first_sale";
export type CreatorMilestoneKey =
  | "profile"
  | "trust"
  | "first_product"
  | "submission"
  | "review"
  | "approval"
  | "publication"
  | "first_view"
  | "first_sale"
  | "reviews"
  | "repeat_sales";
export type CreatorMilestoneGroupKey =
  "getting_ready" | "going_live" | "growing";

export interface CreatorNextAction {
  key: CreatorNextActionKey;
  agentId?: string;
  agentSlug?: string;
  agentName?: string;
}

export interface CreatorStatusReason {
  key: CreatorStatusReasonKey;
  agentId?: string;
  agentName?: string;
  note?: string | null;
}

export interface CreatorFoundation {
  hasProfile: boolean;
  account: { status: CreatorAccountStatus; reasons: CreatorStatusReason[] };
  completeness: {
    /** Weighted (required 3 / recommended 2 / optional 1), server-computed. */
    percent: number;
    completed: number;
    total: number;
    /** Every `tier === "required"` item is done (the completion card). */
    requiredComplete: boolean;
    /** The four public essentials are done (onboarding gate / account status). */
    publishReady: boolean;
    /** Per-tier counts — render these, never recount `items` client-side. */
    tiers: Record<CreatorCompletenessTier, { done: number; total: number }>;
    items: Array<{
      key: CreatorCompletenessKey;
      done: boolean;
      tier: CreatorCompletenessTier;
      required: boolean;
      /** Missing it is why the account reads «incomplete» (server-decided). */
      blocksPublish: boolean;
    }>;
  };
  trust: {
    status: CreatorVerificationStatus | null;
    note: string | null;
    requestedAt: string | null;
    canRequest: boolean;
  };
  onboarding: {
    step: CreatorOnboardingStep | null;
    completedAt: string | null;
    dismissedAt: string | null;
    shouldPrompt: boolean;
    steps: Array<{ key: CreatorOnboardingStep; done: boolean }>;
  };
  checklist: {
    allDone: boolean;
    items: Array<{
      key: CreatorChecklistKey;
      state: "done" | "current" | "todo";
      agentId?: string;
      blockedBy?: "profile_approval";
    }>;
  };
  milestones: Array<{
    key: CreatorMilestoneGroupKey;
    done: number;
    total: number;
    items: Array<{ key: CreatorMilestoneKey; done: boolean }>;
  }>;
  lifecycle: { counts: Record<CreatorLifecycleStage, number> };
  nextAction: CreatorNextAction;
}

// ---- Catalog ----
export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  /** Count INCLUDING subcategories (Taxonomy v2). */
  agentCount: number;
  // ---- Taxonomy v2 (optional so old mocks/responses stay valid) ----
  /** Persian display name (display-only; `slug` is the stable id). */
  nameFa?: string | null;
  descriptionFa?: string | null;
  parentId?: string | null;
  parentSlug?: string | null;
  aliases?: string[];
  directAgentCount?: number;
}

/** Taxonomy v2 — industry (flat, admin-managed, multi-select on products). */
export interface Industry {
  id: string;
  name: string;
  nameFa: string | null;
  slug: string;
  descriptionFa: string | null;
  aliases: string[];
  sortOrder: number;
  agentCount: number;
}

/** Admin rows carry status + counts. */
export interface AdminCategory extends Category {
  status: "active" | "inactive";
  childCount: number;
}
export interface AdminIndustry extends Industry {
  status: "active" | "inactive";
}
export interface TaxonomyCategoryInput {
  name?: string;
  nameFa?: string | null;
  slug?: string;
  description?: string | null;
  descriptionFa?: string | null;
  aliases?: string[];
  parentId?: string | null;
  sortOrder?: number;
  status?: "active" | "inactive";
}
export type TaxonomyIndustryInput = Omit<TaxonomyCategoryInput, "parentId" | "description">;

/** Category as attached to a product (card / detail). */
export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  nameFa?: string | null;
  parent?: { slug: string; name: string; nameFa: string | null } | null;
}
export interface IndustrySummary {
  slug: string;
  name: string;
  nameFa: string | null;
}

// ---- Agents (public marketplace) ----
export type AgentRiskLevel = "low" | "medium" | "high";
export type AgentSort =
  | "recommended"
  | "relevance"
  | "popular"
  | "price_asc"
  | "price_desc"
  | "rating"
  | "reviews"
  | "newest";

/**
 * Product Contract dimensions (docs/product/agenthub-product-model.md §5–§20).
 * These values are creator DECLARATIONS. Runtime control, where separately
 * disclosed on an AgentDetail, is a distinct platform fact; neither a
 * contract declaration nor listing review implies hosting or a guarantee.
 * Null = legacy listing that never declared a contract (§39 decision 21):
 * the UI must honestly show "Unknown", never invent.
 */
export interface ProductContract {
  productType: ProductTypeName | null;
  commercialProfile?: CommercialProfile | null;
  buildTool: BuildToolName | null;
  buildToolDetail: string | null;
  deliveryModel: DeliveryModelName | null;
  executionModel: ExecutionModelName | null;
  hostingResponsibility: HostingResponsibilityName | null;
  whatBuyerReceives: string[];
  whatBuyerDoesNotReceive: string[];
  additionalCosts: Array<{ label: string; note: string | null }>;
  /** Server-derived from isFree/price — never a client input. */
  usageModel: "free" | "one_time" | null;
  supportOwner: "creator" | "agenthub" | null;
  supportScope: string | null;
  supportPeriod: string | null;
}

// ---- Phase 1 commercial profile -----------------------------------------
// Payment, license and product family deliberately remain independent.
export type CommercialFamily = "standalone" | "service" | "hybrid";
export type PaymentModel = "free" | "one_time" | "subscription" | "usage_based" | "hybrid";
export type BillingInterval = "weekly" | "monthly" | "quarterly" | "annual";
export type LicenseType = "perpetual" | "term_based" | "usage_based" | "hybrid";
export type ServiceProvider = "creator" | "third_party" | "buyer" | "shared";
export type ConsumptionCostModel = "included" | "buyer_pays_provider" | "metered" | "included_with_overage";

/** Current declaration / frozen order snapshot. `null` means legacy unknown. */
export interface CommercialProfile {
  schemaVersion: 1;
  family?: CommercialFamily | null;
  delivery?: { model?: DeliveryModelName | null; commitment?: string | null } | null;
  payment?: { model?: PaymentModel | null; billingInterval?: BillingInterval | null } | null;
  license?: {
    type?: LicenseType | null;
    termDays?: number | null;
    usageAllowance?: number | null;
    usageUnit?: string | null;
    rights?: string[];
    restrictions?: string[];
  } | null;
  service?: {
    provider?: ServiceProvider | null;
    commitment?: string | null;
    accessTerms?: string | null;
  } | null;
  support?: {
    owner?: "creator" | "agenthub" | null;
    scope?: string | null;
    period?: string | null;
    updates?: string | null;
  } | null;
  dependencies?: string[];
  consumption?: { costModel?: ConsumptionCostModel | null; terms?: string | null } | null;
  lifecycle?: { refundTerms?: string | null; stopTerms?: string | null } | null;
  termsVersion?: string | null;
  termsReference?: string | null;
}

export type ProductTypeName =
  | "automation"
  | "ai_workflow"
  | "ai_agent"
  | "ai_assistant"
  | "template"
  | "api_service"
  | "setup_service";

export type BuildToolName =
  "n8n" | "dify" | "custom_code" | "python" | "nodejs" | "other";

export type DeliveryModelName =
  | "downloadable"
  | "hosted"
  | "external_hosted"
  | "api_access"
  | "setup"
  | "hybrid";

export type ExecutionModelName = "creator" | "buyer" | "third_party" | "hybrid";

export type HostingResponsibilityName =
  "creator" | "buyer" | "third_party" | "shared";

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
  rating: { average: number | null; count: number };
  verified: boolean;
  /** Product Contract type (§5) — null on legacy listings. */
  productType: ProductTypeName | null;
  category: CategorySummary | null;
  creator: {
    id: string;
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    verified: boolean;
  };
  publishedAt: string;
  /** Buyer Discovery — first creator-declared use cases (≤ 3). */
  useCases: string[];
  /** Integration names (≤ 4) from the real declarations. */
  integrationNames: string[];
  deliveryModel: string | null;
  executionModel: string | null;
  /** DERIVED from requirements, delivery and integrations (never claimed). */
  setupDifficulty: SetupDifficulty;
  /** Real adoption + views crossed the popularity threshold (no raw counts). */
  popular: boolean;
}

export type SetupDifficulty = "easy" | "medium" | "advanced" | "unknown";

export interface AgentDetail extends AgentCard {
  /** Phase 3 control-plane disclosure; absent/null for a legacy product without a Runtime registration. */
  runtime?: {
    executionModel: 'mesh_managed' | 'mesh_connected' | 'independent_deliverable' | 'external_unconnected';
    state: string;
    operationalStatus: string;
    verifiedCapabilities: string[];
    controlled: boolean;
    limitation: string;
  } | null;
  /** Taxonomy v2 — declared industries (absent on old mocks). */
  industries?: IndustrySummary[];
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
  /** Buyer Discovery (M7) — a creator-supplied demo video URL; null = none. */
  demoVideoUrl: string | null;
  /** Phase 1 commercial declaration; null on a legacy listing. */
  commercialProfile?: CommercialProfile | null;
  buildTool: BuildToolName | null;
  buildToolDetail: string | null;
  deliveryModel: DeliveryModelName | null;
  executionModel: ExecutionModelName | null;
  hostingResponsibility: HostingResponsibilityName | null;
  whatBuyerReceives: string[];
  whatBuyerDoesNotReceive: string[];
  additionalCosts: Array<{ label: string; note: string | null }>;
  usageModel: "free" | "one_time" | null;
  supportOwner: "creator" | "agenthub" | null;
  supportScope: string | null;
  supportPeriod: string | null;
  /** Product Creation (Phase A2) — buyer-clarity fields (empty on older listings). */
  problemStatement?: string;
  bestFor?: string[];
  notFor?: string[];
  infrastructureNeeds?: string | null;
  noRequirements?: boolean;
  pricingNote?: string | null;
  coverUrl?: string | null;
  screenshots?: string[];
  permissions: Array<{
    code: string;
    label: string;
    description: string | null;
    reason: string | null;
    required: boolean;
  }>;
  integrations: Array<{ slug: string; name: string; purpose: string | null }>;
  requirements: RequirementItem[];
  dataPolicy: {
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
    /** Phase A2: which user data is stored (optional on older payloads). */
    storedData?: string[];
  } | null;
  ratingDistribution: Array<{ rating: number; count: number }>;
  recentReviews: ReviewSummary[];
  reviewedAt: string | null;
  purchased: boolean;
  /** Deterministically related listings (shared category + capability overlap). */
  relatedAgents: AgentCard[];
  /** A5 §21 — other LIVE products of the same creator (≤ 4). */
  moreFromCreator?: AgentCard[];
  /** Gap closure — whether the signed-in viewer saved this product. */
  favorited?: boolean;
  /** Gap closure — the signed-in viewer is this product's creator. */
  isOwner?: boolean;
  /** Gap closure — public release facts (first publish, last update, latest notes). */
  release?: ReleaseInfo | null;
  /**
   * SEO Studio — effective public metadata (stored values or fallbacks),
   * identical to what the crawler HTML emits. Optional for older payloads.
   */
  seo?: {
    title: string;
    description: string;
    canonicalUrl: string;
    ogImageUrl: string | null;
    ogTitle: string;
    ogDescription: string;
    twitterCard: 'summary' | 'summary_large_image';
    robots: string;
    language: 'fa' | 'en';
    translations: Array<{ language: 'fa' | 'en'; path: string }>;
  };
}

// ---- Gap closure — buyer-facing changelog / freshness ----
export interface AgentChangelog {
  whatsNew: string;
  major: string[];
  improvements: string[];
  fixes: string[];
  /** Sprint 2 — what the buyer must DO after updating (≤300 chars). */
  actionRequired?: string;
}
export const CHANGELOG_LIMITS = {
  whatsNew: 600,
  item: 200,
  major: 10,
  improvements: 15,
  fixes: 15,
  actionRequired: 300,
} as const;
export interface ReleaseInfo {
  firstPublishedAt: string | null;
  lastUpdatedAt: string | null;
  versionCount: number;
  latest: {
    versionNumber: string;
    publishedAt: string | null;
    changelog: AgentChangelog | null;
  } | null;
  freshness: { kind: "new" | "updated"; days: number } | null;
}
export interface PublicVersionHistory {
  items: Array<{
    versionNumber: string;
    publishedAt: string | null;
    changelog: AgentChangelog | null;
    current: boolean;
  }>;
  release: ReleaseInfo;
}
export type ChangelogTarget = "version" | "first" | "locked";
export interface ChangelogState {
  target: ChangelogTarget;
  versionNumber: string | null;
  value: AgentChangelog | null;
}
export interface AdminVersionList {
  pendingChangelog: AgentChangelog | null;
  items: Array<{
    id: string;
    versionNumber: string;
    status: string;
    publishedAt: string | null;
    createdAt: string;
    changelog: AgentChangelog | null;
  }>;
}

// ---- Gap closure — favorites / storage ----
export interface FavoriteItem {
  savedAt: string;
  agent: AgentCard;
}

/** A saved product that is no longer publicly available (Buyer Discovery M8). */
export interface UnavailableFavorite {
  slug: string;
  name: string;
  savedAt: string;
}

export interface FavoritesResult extends Paginated<FavoriteItem> {
  unavailable: UnavailableFavorite[];
}
export type MediaKind = "logo" | "cover" | "screenshot" | "avatar";
export interface MediaRule {
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  minRatio: number;
  maxRatio: number;
}
export interface StorageCapabilities {
  enabled: boolean;
  driver: "local" | "none" | string;
  types: string[];
  rules: Record<MediaKind, MediaRule>;
  video: boolean;
}
export interface UploadedMedia {
  id: string;
  kind: MediaKind;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export type SolvedProblemAnswer = "yes" | "partly" | "no";

export interface ReviewSummary {
  id: string;
  rating: number;
  text: string;
  authorName: string;
  verified?: boolean;
  createdAt: string;
  /** A5 §10 — optional structured feedback (older payloads omit them). */
  pros?: string | null;
  cons?: string | null;
  useCase?: string | null;
  positiveTopics?: ReviewTopic[];
  negativeTopics?: ReviewTopic[];
  /** Gap closure — structured answers (optional). */
  solvedProblem?: SolvedProblemAnswer | null;
  wouldRecommend?: boolean | null;
  reply: {
    body: string;
    createdAt: string;
    /** A5 §12 — set when the creator edited the reply. */
    editedAt?: string | null;
    /** A5 §12 — "fixed in version X" (a version that really shipped). */
    resolvedInVersion?: string | null;
  } | null;
}

export interface AgentListQuery {
  q?: string;
  category?: string;
  free?: "true" | "false";
  minPrice?: string;
  maxPrice?: string;
  ratingMin?: string;
  /** Historic alias of `securityReviewed`, retained for URL compatibility. */
  verified?: "true" | "false";
  /** Historic transport name: latest granted listing-review record, not a security certification. */
  securityReviewed?: "true";
  verifiedCreator?: "true";
  clearDataPolicy?: "true";
  noSensitiveData?: "true";
  integration?: string;
  /** Taxonomy v2 — industry slugs, comma-separated. */
  industry?: string;
  creator?: string;
  /** Buyer Discovery — comma-separated multi-select filters. */
  productType?: string;
  deliveryModel?: string;
  executionModel?: string;
  setupDifficulty?: string;
  requirement?: string;
  useCase?: string;
  minReviews?: string;
  popular?: "true";
  sort?: AgentSort;
  page?: number;
  pageSize?: number;
}

// ---- Buyer Discovery (M1–M12) ----
export interface SearchMeta {
  query: string;
  normalized: string;
  /** No result satisfied every part of the query → partial matches shown. */
  relaxed: boolean;
  concepts: string[];
  sort: AgentSort;
  activeFilters: number;
  fuzzy: boolean;
  personalized: boolean;
}

export interface AgentListResult extends Paginated<AgentCard> {
  search: SearchMeta;
}

export interface FacetCount {
  value: string;
  label: string;
  count: number;
  /** Taxonomy v2 — Persian label from the catalog (categories / industries). */
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
  /** Taxonomy v2 — industries with at least one match (absent on old mocks). */
  industries?: FacetCount[];
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
    Pick<AgentCard, "id" | "slug" | "name" | "shortDescription" | "logoUrl"> & {
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
  withoutFilters: number;
}

export type FollowTarget = "agent" | "creator" | "category";

export interface FollowIds {
  agents: string[];
  creators: string[];
  categories: string[];
}

export type FollowItem =
  | {
      type: "agent";
      followedAt: string;
      slug: string;
      available: true;
      agent: AgentCard;
    }
  | {
      type: "agent";
      followedAt: string;
      slug: string;
      available: false;
      name: string;
    }
  | {
      type: "creator";
      followedAt: string;
      slug: string;
      available: true;
      creator: {
        slug: string;
        displayName: string;
        avatarUrl: string | null;
        verified: boolean;
        productCount: number;
      };
    }
  | {
      type: "category";
      followedAt: string;
      slug: string;
      available: true;
      category: { slug: string; name: string; productCount: number };
    };

export interface InterestDomain {
  category: { id: string; slug: string; name: string };
  score: number;
  strength: number;
  share: number;
  signals: Record<string, number>;
  lastSignalAt: string;
}

export interface InterestProfile {
  domains: InterestDomain[];
  totalSignals: number;
  halfLifeDays: number;
  hasProfile: boolean;
}

export type ClientEventType =
  | "marketplace_view"
  | "search"
  | "search_result_click"
  | "filter_used"
  | "sort_used"
  | "category_view"
  | "use_case_view"
  | "product_media_view"
  | "creator_view"
  // Sprint 2 — account-bound UI interactions
  | "buyer_dashboard_viewed"
  | "notification_opened"
  | "recommendation_clicked"
  | "product_comparison_viewed";

export interface ClientEvent {
  type: ClientEventType;
  slug?: string;
  categorySlug?: string;
  creatorSlug?: string;
  query?: string;
  resultCount?: number;
  name?: string;
  value?: string;
  source?: string;
  position?: number;
}

export interface DiscoveryAnalytics {
  days: number;
  since: string;
  discovery: {
    marketplaceVisits: number;
    marketplaceVisitors: number;
    searches: number;
    searchesWithResults: number;
    zeroResultSearches: number;
    searchSuccessRate: number | null;
    resultClicks: number;
    categoryViews: number;
    productViews: number;
    topCategories: Array<{ slug: string; name: string; views: number }>;
    topProducts: Array<{ slug: string; name: string; views: number }>;
    topZeroResultQueries: Array<{ query: string; count: number }>;
    topSearches: Array<{ query: string; count: number }>;
  };
  engagement: {
    saves: number;
    unsaves: number;
    follows: { agent: number; creator: number; category: number };
    buyersWithInterestProfile: number;
  };
  conversion: {
    viewers: number;
    signups: number;
    savers: number;
    checkouts: number;
    purchasers: number;
    rates: {
      viewToSignup: number | null;
      viewToSave: number | null;
      viewToCheckout: number | null;
      viewToPurchase: number | null;
    };
  };
}

// ---- Commerce ----
export type OrderStatus =
  | "created"
  | "pending_payment"
  | "paid"
  | "fulfilled"
  | "failed"
  | "cancelled"
  | "refunded";
export type PaymentStatus =
  "initiated" | "pending" | "successful" | "failed" | "cancelled" | "refunded";

export interface OrderItemView {
  id: string;
  agentId: string;
  agentNameSnapshot: string;
  agentSlugSnapshot: string;
  agentVersionSnapshot: string;
  /** Listing picture at purchase time; null for orders that predate the snapshot. */
  agentLogoUrlSnapshot?: string | null;
  creatorIdSnapshot: string | null;
  unitPrice: string;
  currencyCode: string;
  quantity: number;
  total: string;
  isFree: boolean;
  /** Frozen commercial commitment at checkout; null for historical orders. */
  commercialTermsSnapshot?: CommercialProfile | null;
}

/** `GET /me/orders?status=` — groups of ORDER statuses (never payment/refund). */
export type OrderStatusGroup = "pending" | "paid" | "failed" | "refunded";

export interface OrderView {
  id: string;
  status: OrderStatus;
  amount: string;
  currencyCode: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  items: OrderItemView[];
}

export interface CheckoutResult {
  orderId: string;
  paymentId: string;
  gatewayTransactionId: string;
  amount: string;
  currencyCode: string;
  status: string;
  /** Provider payment page (null for the dev sandbox — no external redirect). */
  paymentUrl: string | null;
}

/** POST /payments/confirm — the server-side verdict on a gateway return. */
export interface PaymentConfirmResult {
  status:
    | "confirmed"
    | "already_confirmed"
    | "duplicate"
    | "cancelled"
    | "failed"
    | "refunded"
    | "pending";
  orderId: string;
  orderStatus: string;
}

export type EntitlementLifecycleState =
  | 'pending_activation'
  | 'active'
  | 'grace'
  | 'expired'
  | 'suspended'
  | 'revoked';

export type EntitlementCapability =
  'product_access' | 'download' | 'runtime' | 'api';

/** MESH authority view — terms/status must never be inferred in the browser. */
export interface EntitlementView {
  id: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  agentVersion: string;
  /** Backward-compatible projection. Use lifecycleState for the actual state. */
  status: 'granted' | 'revoked';
  lifecycleState: EntitlementLifecycleState;
  grantedAt: string | null;
  revokedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  usageLimit: string | null;
  usageConsumed: string;
  usageUnit: string | null;
  licenseType: 'perpetual' | 'term_based' | 'usage_based' | 'hybrid' | null;
  capabilities: EntitlementCapability[];
  /** false means this entitlement predates immutable Phase 1 terms. */
  termsKnown: boolean;
  statusReasonCode: string | null;
}

export interface EntitlementEventView {
  id: string;
  type: string;
  previousState: EntitlementLifecycleState | null;
  nextState: EntitlementLifecycleState | null;
  sequence: number;
  reasonCode: string | null;
  sourceType: string;
  createdAt: string;
}

export interface EntitlementAccessDecision {
  allowed: boolean;
  reasonCode:
    | 'ALLOWED'
    | 'ALLOWED_GRACE'
    | 'ENTITLEMENT_NOT_FOUND'
    | 'ENTITLEMENT_PENDING_ACTIVATION'
    | 'ENTITLEMENT_REVOKED'
    | 'ENTITLEMENT_SUSPENDED'
    | 'ENTITLEMENT_EXPIRED'
    | 'USAGE_LIMIT_REACHED'
    | 'CAPABILITY_NOT_GRANTED';
  capability: EntitlementCapability;
  entitlementId: string | null;
  lifecycleState: EntitlementLifecycleState | null;
  validUntil: string | null;
  usageRemaining: string | null;
  decisionAt: string;
  policySequence: number | null;
}

export type RefundStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processed"
  | "rejected";

/** Eligibility verdict of `refund-policy.ts` (shared with the product journey types below). */
export interface RefundEligibilityView {
  eligible: boolean;
  reason: RefundIneligibleReason | null;
  windowEndsAt: string | null;
}

export interface OrderRefundView {
  id: string;
  status: RefundStatus;
  reason: string;
  amount: string;
  currencyCode: string;
  requestedAt: string;
  reviewStartedAt: string | null;
  decidedAt: string | null;
  response: string | null;
  timeline: RefundTimelineView;
}

export interface OrderPaymentView {
  id: string;
  gateway: string;
  reference: string;
  status: PaymentStatus | string;
  amount: string;
  currencyCode: string;
  createdAt: string;
  confirmedAt: string | null;
}

export interface OrderEntitlementView {
  id: string;
  agentId: string;
  status: "granted" | "revoked";
  grantedAt: string | null;
  revokedAt: string | null;
}

/** Internal payment/refund receipt — explicitly NOT a tax invoice. */
export interface OrderReceiptView {
  id: string;
  receiptNumber: string;
  kind: "PAYMENT" | "REFUND";
  amount: string;
  currencyCode: string;
  issuedAt: string;
  isTaxInvoice: false;
}

export interface ReceiptView extends OrderReceiptView {
  orderId: string;
  paymentId: string | null;
  refundId: string | null;
  disclaimer: string;
  details: Record<string, unknown>;
}

export type OrderTimelineEvent =
  | "created"
  | "paid"
  | "fulfilled"
  | "cancelled"
  | "refund_requested"
  | "refund_under_review"
  | "refund_approved"
  | "refund_rejected"
  | "refund_processed"
  | "refunded";

export interface OrderTimelineEntry {
  event: OrderTimelineEvent;
  at: string;
  refundId?: string;
}

/** `GET /me/orders/:id` — order + payment + access + refunds + receipts + history, each its own fact. */
export interface OrderDetailView extends OrderView {
  cancelledAt: string | null;
  refundedAt: string | null;
  summary: {
    subtotal: string;
    total: string;
    refundedAmount: string;
    currencyCode: string;
  };
  payment: OrderPaymentView | null;
  entitlements: OrderEntitlementView[];
  refunds: OrderRefundView[];
  refundEligibility: RefundEligibilityView;
  receipts: OrderReceiptView[];
  timeline: OrderTimelineEntry[];
}

// ---- Reviews ----
/** `hidden` = hidden by its author (reversible); `removed` = moderation (terminal). */
export type ReviewStatus = "submitted" | "published" | "hidden" | "removed";

export interface MyReview {
  id: string;
  agentId: string;
  agentSlug: string;
  agentName: string;
  agentLogoUrl: string | null;
  rating: number;
  title?: string | null;
  text: string;
  verified?: boolean;
  status: ReviewStatus;
  hiddenAt?: string | null;
  reply?: { id: string; body: string; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRow {
  id: string;
  userId: string;
  agentId: string;
  orderId: string | null;
  rating: number;
  /** Sprint 2 — one-line headline. */
  title?: string | null;
  text: string;
  verified?: boolean;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  reply?: { id: string; body: string; createdAt: string } | null;
  user?: { id: string; email: string; username: string | null };
  /** A5 §10 — structured feedback. */
  pros?: string | null;
  cons?: string | null;
  useCase?: string | null;
  positiveTopics?: ReviewTopic[];
  negativeTopics?: ReviewTopic[];
  solvedProblem?: SolvedProblemAnswer | null;
  wouldRecommend?: boolean | null;
}

// ---- Two-step sign-in (self-service) ----
export interface TwoFactorStatus {
  enabled: boolean;
  /** Setup was started but never confirmed: not protecting the account yet. */
  pendingSetup: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

// ---- Reports ----
export type ReportReason =
  | "misleading_claims"
  | "security_concern"
  | "inappropriate_content"
  | "copyright_violation"
  | "spam_or_fake"
  | "other";

export interface ReportView {
  id: string;
  agent: { id: string; name: string; slug: string } | null;
  reason: ReportReason;
  description: string | null;
  evidence: string[];
  status: "submitted" | "under_review" | "resolved" | "rejected";
  resolution: string | null;
  createdAt: string;
}

// ---- Notifications ----
export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** Optional in-app deep link rendered as the notification CTA. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
  /** Sprint 2 — visual weight decided by the server, never guessed here. */
  severity?: NotificationSeverity;
  /** Sprint 2 — the record the notification is about (entitlement, order…). */
  relatedType?: string | null;
  relatedId?: string | null;
}

// ---- Creator workspace ----
export type AgentStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "resubmitted"
  | "approved"
  | "ready_to_publish"
  | "published"
  /** A4: taken offline by the creator (buyers keep access; republish without re-review). */
  | "unpublished"
  | "rejected"
  | "suspended"
  | "archived"
  | "deprecated";

export interface PendingVersionInfo {
  versionNumber?: string;
  status: "draft" | "in_review" | "changes_requested" | "approved";
  reviewNote: string | null;
  reviewedAt?: string | null;
  updatedAt?: string;
}

export interface CreatorAgentCard {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  logoUrl: string | null;
  price: string;
  currency: string;
  isFree: boolean;
  status: AgentStatus;
  riskLevel: AgentRiskLevel;
  publishedVersion: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  pendingVersion: {
    versionNumber: string;
    status: "draft" | "in_review" | "changes_requested" | "approved";
    reviewNote: string | null;
    updatedAt: string;
  } | null;
  publishedAt: string | null;
  views: number;
  demoClicks: number;
  createdAt: string;
  updatedAt: string;
}

export interface VersionView {
  id: string;
  versionNumber: string;
  changeSummary: string | null;
  status:
    | "draft"
    | "in_review"
    | "changes_requested"
    | "approved"
    | "rejected"
    | "published"
    | "deprecated";
  reviewNote: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  /** Gap closure — buyer-facing release notes of this version. */
  changelog?: AgentChangelog | null;
}

/** Working copy of the next version (§5/§11). */
export interface AgentVersionContent {
  name: string;
  shortDescription: string;
  fullDescription: string;
  logoUrl: string | null;
  demoUrl: string | null;
  demoVideoUrl?: string | null;
  keywords?: string[];
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
  price: string;
  currency: string;
  isFree: boolean;
  category: string | null;
  /** Taxonomy v2 — industry slugs. */
  industries?: string[];
  permissions: Array<{
    code: string;
    reason: string | null;
    required: boolean;
  }>;
  integrations: Array<{ slug: string; purpose: string | null }>;
  requirements: RequirementItem[];
  dataPolicy: {
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
    /** Phase A2: which user data is stored (optional on older payloads). */
    storedData?: string[];
  } | null;
  productType?: ProductTypeName | null;
  commercialProfile?: CommercialProfile | null;
  buildTool?: BuildToolName | null;
  buildToolDetail?: string | null;
  deliveryModel?: DeliveryModelName | null;
  executionModel?: ExecutionModelName | null;
  hostingResponsibility?: HostingResponsibilityName | null;
  whatBuyerReceives?: string[];
  whatBuyerDoesNotReceive?: string[];
  additionalCosts?: Array<{ label: string; note: string | null }>;
  usageModel?: "free" | "one_time";
  supportOwner?: "creator" | "agenthub" | null;
  supportScope?: string | null;
  supportPeriod?: string | null;
  // Product Creation (Phase A2) — optional: content captured before A2.
  problemStatement?: string;
  bestFor?: string[];
  notFor?: string[];
  infrastructureNeeds?: string | null;
  noRequirements?: boolean;
  pricingNote?: string | null;
  coverUrl?: string | null;
  screenshots?: string[];
}

/** A declared buyer requirement (A2 §13: name, type, required, description, reason). */
export interface RequirementItem {
  type: string;
  name?: string | null;
  description: string;
  reason?: string | null;
  required: boolean;
}

export interface ReadinessCheck {
  key: string;
  passed: boolean;
}

export type ReadinessLevel = "required" | "recommended" | "optional";
export type ReadinessSectionKey =
  | "basics"
  | "audience"
  | "how"
  | "capabilities"
  | "requirements"
  | "delivery"
  | "data"
  | "pricing"
  | "media";

export interface ReadinessItem {
  key: string;
  level: ReadinessLevel;
  section: ReadinessSectionKey;
  /** `confirmation` (A5 §19): a duplicated group the creator must re-confirm. */
  kind: "completeness" | "consistency" | "quality" | "clarity" | "confirmation";
  passed: boolean;
  field: string;
}

/**
 * The central readiness engine's output (Phase A2 §19–§26). `checks` is the
 * legacy 18-item submit gate; `items` the granular required / recommended /
 * optional list the wizard renders.
 */
export interface ReadinessView {
  checks: ReadinessCheck[];
  allPassed: boolean;
  score?: number;
  readyToSubmit?: boolean;
  items?: ReadinessItem[];
  sections?: Array<{
    key: ReadinessSectionKey;
    state: "complete" | "attention" | "incomplete";
    requiredPassed: number;
    requiredTotal: number;
    recommendedPassed: number;
    recommendedTotal: number;
  }>;
  clarity?: Array<{ key: string; passed: boolean }>;
  counts?: {
    requiredFailed: number;
    recommendedFailed: number;
    optionalFailed: number;
  };
}

/** Every draft save/create response (A2 §31). */
export interface DraftSaveResult {
  id: string;
  slug: string;
  status: string;
  revision: number;
  wizardStep: string | null;
  savedAt: string;
  readiness: ReadinessView;
}

/** Lifecycle status of one listing (A2 §29/§32). */
export interface AgentStatusView {
  id: string;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  publishedAt: string | null;
  pendingVersion: {
    id: string;
    versionNumber: string;
    status: string;
    reviewNote: string | null;
    reviewedAt: string | null;
  } | null;
  editable: boolean;
}

export interface DashboardView {
  /** "Continue where you left off" (A2 §30) — null when nothing is in progress. */
  resumeDraft?: {
    agentId: string;
    agentName: string;
    status: string;
    isNewVersion: boolean;
    versionStatus: string | null;
    wizardStep: string | null;
    updatedAt: string;
    score: number;
    readyToSubmit: boolean;
    requiredRemaining: number;
  } | null;
  kpis: {
    published: number;
    drafts: number;
    inReview: number;
    changesRequested: number;
    sales: number;
    revenue: string;
    currency: string;
    averageRating: number | null;
    ratingCount: number;
    /** A4 — approved products waiting for the creator's publish step. */
    readyToPublish?: number;
    /** A4 — listings the creator took offline. */
    unpublished?: number;
  };
  actionRequired: Array<{
    key:
      | "changes_requested"
      | "draft_not_submitted"
      | "version_changes_requested"
      | "version_under_review"
      | "review_completed"
      | "ready_to_publish"
      | "version_ready_to_publish"
      | "unpublished";
    agentId: string;
    agentName: string;
  }>;
  recentActivity: Array<{
    type: string;
    at: string;
    agentId: string;
    agentName: string;
    amount?: string;
    currency?: string;
    rating?: number;
    link?: string;
  }>;
  recentSales: Array<{
    orderId: string;
    agentId: string;
    agentName: string;
    amount: string;
    currency: string;
    at: string;
  }>;
}

export interface SalesItem {
  id: string;
  orderId: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  version: string;
  unitPrice: string;
  total: string;
  currency: string;
  /** Null for failed payments (no relationship formed). */
  buyerUsername: string | null;
  at: string;
  /** Gap closure — order outcome (server truth). */
  orderStatus: OrderStatus;
  refundStatus: RefundStatusValue | null;
}
export type SalesStatusFilter = "paid" | "failed" | "refunded";

export interface CreatorSalesQuery {
  page: number;
  pageSize: number;
  status: SalesStatusFilter;
  agentId?: string;
  orderId?: string;
  from?: string;
  to?: string;
}

export interface CreatorSalesSummary {
  successfulCount: number;
  successfulAmount: string;
  currency: string;
  refundedCount: number;
  failedCount: number;
}

export interface CreatorSalesAgentOption {
  id: string;
  name: string;
  slug: string;
}

export interface CreatorSalesResult {
  items: SalesItem[];
  total: number;
  summary: CreatorSalesSummary;
  agents: CreatorSalesAgentOption[];
}

export interface CreatorEntitlementSummary {
  total: number;
  active: number;
  grace: number;
  pendingActivation: number;
  suspended: number;
  revoked: number;
  expired: number;
  usageExhausted: number;
}

export interface CreatorStats {
  publishedAgents: number;
  totalSales: number;
  lifetimeRevenue: string;
  currency: string;
  averageRating: number | null;
  ratingCount: number;
}

export interface CreatorAgentDetail extends CreatorAgentCard {
  fullDescription: string;
  demoUrl: string | null;
  demoVideoUrl?: string | null;
  keywords?: string[];
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
  productType: ProductTypeName | null;
  commercialProfile?: CommercialProfile | null;
  buildTool: BuildToolName | null;
  buildToolDetail: string | null;
  deliveryModel: DeliveryModelName | null;
  executionModel: ExecutionModelName | null;
  hostingResponsibility: HostingResponsibilityName | null;
  whatBuyerReceives: string[];
  whatBuyerDoesNotReceive: string[];
  additionalCosts: Array<{ label: string; note: string | null }>;
  usageModel: "free" | "one_time" | null;
  supportOwner: "creator" | "agenthub" | null;
  supportScope: string | null;
  supportPeriod: string | null;
  // Product Creation (Phase A2) — optional for older API payloads.
  problemStatement?: string;
  bestFor?: string[];
  notFor?: string[];
  infrastructureNeeds?: string | null;
  noRequirements?: boolean;
  pricingNote?: string | null;
  coverUrl?: string | null;
  screenshots?: string[];
  wizardStep?: string | null;
  revision?: number;
  submittedAt?: string | null;
  /** A5 §19 — set on drafts started from another product. */
  duplicate?: DuplicateInfo | null;
  /** Gap closure — where the release notes live and whether editable. */
  changelog?: ChangelogState;
  publishedVersionId: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  pendingVersion: {
    id: string;
    versionNumber: string;
    /** `approved` = approved by review, waiting to be published (A3). */
    status: "draft" | "in_review" | "changes_requested" | "approved";
    reviewNote: string | null;
    reviewedAt: string | null;
    updatedAt: string;
    draftContent: AgentVersionContent | null;
  } | null;
  permissions: Array<{
    code: string;
    label: string;
    reason: string | null;
    required: boolean;
  }>;
  integrations: Array<{ slug: string; name: string; purpose: string | null }>;
  requirements: RequirementItem[];
  categories: Array<{ id: string; name: string; slug: string }>;
  /** Taxonomy v2 — declared industries. */
  industries?: Array<{ id: string; name: string; slug: string; nameFa: string | null }>;
  dataPolicy: {
    id: string;
    agentId: string;
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
    /** Phase A2: which user data is stored (optional on older payloads). */
    storedData?: string[];
  } | null;
  verification: {
    id: string;
    verificationType: string;
    status: "granted" | "revoked";
    note: string | null;
    grantedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  } | null;
  securityReview: {
    verdict: string | null;
    notes: string | null;
    reviewedAt: string | null;
  } | null;
}

// ---- Admin ----
export interface AdminUserRow {
  id: string;
  email: string;
  username: string | null;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
}

export interface AdminAgentRow {
  id: string;
  name: string;
  slug: string;
  status: AgentStatus;
  isFree: boolean;
  price: string;
  currency: string;
  /** Product Contract — live declaration (null = legacy listing). */
  productType: ProductTypeName | null;
  /** Product Contract — the pending version's declaration, if any. */
  pendingProductType: ProductTypeName | null;
  /** Pending version lifecycle state — 'in_review' makes the row reviewable. */
  pendingVersionStatus:
    "draft" | "in_review" | "changes_requested" | "approved" | null;
  deliveryModel: DeliveryModelName | null;
  pendingDeliveryModel: DeliveryModelName | null;
  executionModel: ExecutionModelName | null;
  pendingExecutionModel: ExecutionModelName | null;
  /** Material contract changes (§19/§33) in the pending version. */
  materialChanges: string[];
  creator: { id: string; displayName: string; slug: string } | null;
  listingReviewed: boolean;
  publishedAt: string | null;
  createdAt: string;
}

export interface AdminCreatorRow {
  id: string;
  slug: string;
  displayName: string;
  status: CreatorProfileStatus;
  verificationStatus: CreatorProfile["verificationStatus"];
  createdAt: string;
  /** Gap closure (P18) — the creator's profile answers (admin only). */
  expertise?: string[];
  activityAreas?: string[];
  tools?: string[];
  creatorGoal?: CreatorGoal | null;
  experienceLevel?: ExperienceLevel | null;
  productReadiness?: ProductReadinessAnswer | null;
  locationCountry?: string | null;
  locationCity?: string | null;
  showLocation?: boolean;
}

export interface AdminOrderRow {
  id: string;
  buyer: { id: string; email: string; username: string | null } | null;
  status: OrderStatus;
  amount: string;
  currencyCode: string;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminPaymentRow {
  id: string;
  orderId: string;
  gateway: string;
  gatewayTransactionId: string | null;
  amount: string;
  currencyCode: string;
  status: string;
  confirmedAt: string | null;
  createdAt: string;
}

export interface AdminEntitlementRow {
  id: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  agentVersion: string;
  status: 'granted' | 'revoked';
  lifecycleState: EntitlementLifecycleState;
  grantedAt: string | null;
  revokedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  usageLimit: string | null;
  usageConsumed: string;
  usageUnit: string | null;
  licenseType: 'perpetual' | 'term_based' | 'usage_based' | 'hybrid' | null;
  capabilities: EntitlementCapability[];
  termsKnown: boolean;
  statusReasonCode: string | null;
  holder: { id: string; email: string | null; username: string | null };
}

export interface AdminRefundRow {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  reason: string;
  requestedBy: string;
  status: RefundStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  processedAt: string | null;
  createdAt: string;
  order?: { id: string; buyerId: string; amount: string; status: OrderStatus };
}

export interface AuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: { id: string; email: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ---- Support (Batch 3) ----
export type SupportStatus =
  "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type SupportDestination = "creator" | "support";

export interface SupportRequestListItem {
  id: string;
  /** Who opened the request — «close» is offered only to this user (server-enforced too). */
  requesterId: string;
  destinationType: SupportDestination;
  subject: string;
  status: SupportStatus;
  agent: { id: string; name: string; slug: string } | null;
  order: { id: string } | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface SupportMessageView {
  id: string;
  senderId: string;
  senderRole: "buyer" | "creator" | "admin";
  body: string;
  createdAt: string;
}

export interface SupportRequestDetail extends SupportRequestListItem {
  messages: SupportMessageView[];
}

export type SupportCategory =
  "product" | "setup" | "access" | "payment" | "other";

export interface CreateSupportRequest {
  destinationType: SupportDestination;
  /** Sprint 2 — what the buyer needs help with. */
  category?: SupportCategory;
  subject: string;
  message: string;
  agentId?: string;
  orderId?: string;
}

export interface AdminReportRow {
  id: string;
  agent: { id: string; name: string; slug: string } | null;
  reporter: { id: string; email: string } | null;
  reason: ReportReason;
  description: string | null;
  evidence?: string[];
  status: ReportView["status"];
  createdAt: string;
  /** A5 §37 — set when the report is about one review. */
  review?: {
    id: string;
    rating: number;
    text: string;
    status: ReviewStatus;
  } | null;
}

// ---- Phase A3 — Review workflow ----------------------------------------------

/** The official review state machine (A3 §3). */
export type ReviewState =
  | "submitted"
  | "under_review"
  | "action_required"
  | "resubmitted"
  | "approved"
  | "ready_to_publish"
  | "published"
  | "rejected";

export type FeedbackCategory =
  | "product_information"
  | "product_type"
  | "delivery_model"
  | "runtime_model"
  | "security"
  | "permissions"
  | "data_policy"
  | "integrations"
  | "requirements"
  | "pricing"
  | "marketplace_quality"
  | "content_claims"
  | "technical"
  | "other";
export type FeedbackSeverity = "required" | "important" | "suggestion";
export type FeedbackStatus =
  "open" | "resolved_by_creator" | "accepted" | "needs_more_changes";
export type FeedbackSection =
  | "basics"
  | "audience"
  | "how"
  | "capabilities"
  | "requirements"
  | "delivery"
  | "data"
  | "pricing"
  | "media";
export type RejectionCategory =
  | "prohibited_content"
  | "security_risk"
  | "misleading_claims"
  | "not_a_product"
  | "duplicate"
  | "legal"
  | "other";

export interface RevisionChange {
  field: string;
  section: FeedbackSection;
  kind: "added" | "changed" | "removed";
}

export interface ReviewSubmission {
  id: string;
  agentId: string;
  kind: "initial" | "version";
  revisionNumber: number;
  versionLabel: string;
  status: ReviewState;
  isCurrent: boolean;
  isResubmission: boolean;
  hasSnapshot: boolean;
  changeSummary: RevisionChange[];
  creatorNote: string | null;
  submittedAt: string;
  reviewStartedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  decisionNote: string | null;
  rejection: {
    category: RejectionCategory | null;
    reason: string | null;
    explanation: string | null;
  } | null;
  // Admin-only fields
  creatorId?: string;
  versionId?: string | null;
  reviewerId?: string | null;
  submittedBy?: string;
  checklist?: Record<string, boolean>;
}

export interface ReviewFeedback {
  id: string;
  submissionId: string;
  revisionNumber: number | null;
  fromCurrentRevision: boolean;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  title: string;
  description: string;
  whyImportant: string | null;
  requiredAction: string;
  affectedSection: FeedbackSection;
  status: FeedbackStatus;
  creatorNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reviewedAt: string | null;
  createdBy: string;
  reviewedBy?: string | null;
}

export interface ReviewTimelineEvent {
  id: string;
  event: string;
  at: string;
  actorRole: string | null;
  revisionNumber: number | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreatorReviewView {
  agent: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    status: AgentStatus;
    publishedAt: string | null;
  };
  current: ReviewSubmission | null;
  feedback: ReviewFeedback[];
  pastFeedback: ReviewFeedback[];
  revisions: ReviewSubmission[];
  counts: {
    total: number;
    open: number;
    openRequired: number;
    resolved: number;
    accepted: number;
  };
  actionRequired: boolean;
  canResubmit: boolean;
  hasChanges: boolean;
  changesSincePrevious: RevisionChange[];
  timeline: ReviewTimelineEvent[];
}

export interface CreatorReviewListItem {
  submissionId: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  logoUrl: string | null;
  agentStatus: AgentStatus;
  kind: "initial" | "version";
  revisionNumber: number;
  versionLabel: string;
  status: ReviewState;
  submittedAt: string;
  reviewStartedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  openItems: number;
}

export interface CreatorReviewList {
  items: CreatorReviewListItem[];
  page: number;
  pageSize: number;
  total: number;
  summary: {
    byStatus: Partial<Record<ReviewState, number>>;
    awaitingReview: number;
    actionRequired: number;
    attentionItems: number;
    approved: number;
    published: number;
    rejected: number;
  };
}

export interface SubmitResult {
  id: string;
  status: AgentStatus;
  submission: ReviewSubmission;
}

export interface RevisionPreview {
  submission: ReviewSubmission;
  preview: AgentDetail | null;
}

export type ReviewQueueStatus = "all" | "awaiting" | ReviewState;

export interface ReviewQueueQuery {
  status?: ReviewQueueStatus;
  q?: string;
  creatorId?: string;
  category?: string;
  priority?: "high" | "normal" | "low";
  /** Submitted between these days (YYYY-MM-DD, inclusive). */
  from?: string;
  to?: string;
  sort?: "submitted" | "updated";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ReviewQueueItem {
  submissionId: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  logoUrl: string | null;
  agentStatus: AgentStatus;
  creatorId: string;
  creatorName: string;
  category: string | null;
  kind: "initial" | "version";
  revisionNumber: number;
  versionLabel: string;
  status: ReviewState;
  isResubmission: boolean;
  submittedAt: string;
  reviewStartedAt: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  updatedAt: string;
  openFeedback: number;
  priority: "high" | "normal" | "low";
  waitingDays: number;
}

export interface ReviewQueue {
  items: ReviewQueueItem[];
  page: number;
  pageSize: number;
  total: number;
  counts: Partial<Record<ReviewQueueStatus, number>>;
}

export interface ReviewChecklistItem {
  key: string;
  group: string;
}

export interface ReviewContractFacts {
  productType: string | null;
  deliveryModel: string | null;
  executionModel: string | null;
}

export interface ReviewWorkspace {
  agent: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    status: AgentStatus;
    publishedAt: string | null;
    riskLevel: AgentRiskLevel;
  };
  creator: {
    id: string;
    displayName: string;
    slug: string;
    status: string;
    verificationStatus: string;
  } | null;
  current: ReviewSubmission;
  preview: AgentDetail;
  readiness: ReadinessView;
  /** Product Contract: live declaration (null before the first publish) vs the one under review. */
  contract: {
    live: ReviewContractFacts | null;
    proposed: ReviewContractFacts;
    materialChanges: string[];
  };
  checklist: { items: ReviewChecklistItem[]; state: Record<string, boolean> };
  feedback: ReviewFeedback[];
  pastFeedback: ReviewFeedback[];
  revisions: ReviewSubmission[];
  timeline: ReviewTimelineEvent[];
  gates: {
    canStart: boolean;
    claimedByOther: boolean;
    canEdit: boolean;
    canRequestChanges: boolean;
    canApprove: boolean;
    canReject: boolean;
    canReturn: boolean;
    canPublish: boolean;
    blockers: {
      missingChecklist: string[];
      openRequiredFeedback: string[];
      readinessFailed: boolean;
    };
  };
}

export interface FeedbackDraft {
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  title: string;
  description: string;
  whyImportant?: string;
  requiredAction: string;
  affectedSection?: FeedbackSection;
}

export interface ReviewActionResult {
  id: string;
  status: string;
  submission: ReviewSubmission;
}

// ---- Phase A4 — Launch & Growth ------------------------------------------------

export type PublishCheckStatus = "complete" | "needs_attention" | "required";
export type PublishCheckGroup =
  | "approval"
  | "creator_account"
  | "product_info"
  | "description"
  | "category"
  | "pricing"
  | "delivery_model"
  | "execution_model"
  | "security_disclosure"
  | "required_access"
  | "data_policy"
  | "logo"
  | "preview";

export interface PublishCheckItem {
  key: PublishCheckGroup;
  status: PublishCheckStatus;
  /** Failing readiness item keys (most important first). */
  failing: string[];
  /** Where to fix it: wizard section + field of the first failing item. */
  fix: { section: ReadinessSectionKey; field: string } | null;
}

/** GET /creators/me/agents/:id/publish-checklist (A4 §3). */
export interface PublishChecklistView {
  agentId: string;
  name: string;
  slug: string;
  status: AgentStatus;
  kind: "initial" | "version" | null;
  versionLabel: string | null;
  reviewState: string | null;
  approved: boolean;
  alreadyPublished: boolean;
  previewPath: string;
  productPath: string;
  items: PublishCheckItem[];
  canPublish: boolean;
  counts: { complete: number; needsAttention: number; required: number };
}

export interface ReleaseGateReadiness {
  eligible: boolean;
  status: 'Ready' | 'Blocked' | 'Published';
  blockers: Array<{ code: string; title: string; detail: string; nextAction: string; owner: string; controlId?: string; evaluationRunId?: string }>;
  anchors: { agentId: string; reviewSubmissionId: string | null; agentVersionId: string | null; technicalReviewCaseId: string | null; evaluationRunId: string | null; policy: { key: string; version: number } | null; contentDigest: string | null; runtimeId: string | null; runtimeReleaseId: string | null; artifactDigest: string | null };
}

export interface PublishResult {
  id: string;
  status: AgentStatus;
  alreadyPublished: boolean;
  kind: "initial" | "version" | null;
}

export type LaunchStepKey =
  | "published"
  | "page_ready"
  | "link_ready"
  | "shared"
  | "first_visitor"
  /** Gap closure — «اولین علاقه‌مند» (a real, sticky first save). */
  | "first_favorite"
  | "first_sale";
export interface LaunchProgress {
  steps: Array<{ key: LaunchStepKey; done: boolean }>;
  percent: number;
  next: LaunchStepKey | null;
}
export type CampaignKey =
  | "published"
  | "share_audience"
  | "share_social"
  | "improve_page"
  | "consider_promotion";
export type RecommendationKey =
  | "republish"
  | "share_first"
  | "no_views"
  | "low_views"
  | "improve_conversion"
  | "add_demo"
  | "request_reviews"
  | "promote_top_rated"
  | "improve_listing";
export type RecommendationCta =
  "republish" | "share" | "promote" | "improve" | "improve_media" | "buyers";
export interface Recommendation {
  key: RecommendationKey;
  cta: RecommendationCta;
  /** The measured numbers behind the advice. */
  evidence: Record<string, number>;
}

export type PromotionType = "boost" | "featured" | "mesh_social";
export type PromotionStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled";
export type PromotionPlacement =
  "category_boost" | "marketplace_featured" | "mesh_social";

export interface PromotionView {
  id: string;
  agentId: string;
  type: PromotionType;
  status: PromotionStatus;
  placement: PromotionPlacement;
  message: string | null;
  preferredStartAt: string | null;
  startAt: string | null;
  endAt: string | null;
  rejectionReason: string | null;
  publishedUrl: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** A5 §9 — real attributed funnel (null before the promotion started). */
  funnel?: PromotionFunnel | null;
}

export interface PromotionFunnel {
  impressions: number;
  clicks: number;
  views: number;
  checkouts: number;
  purchases: number;
  clickRate: number | null;
}

export interface AdminPromotionView extends PromotionView {
  agentName: string;
  agentSlug: string;
  agentStatus: string;
  creatorId: string;
  creatorName: string;
  adminNote: string | null;
  reviewedBy: string | null;
  budgetAmount: string | null;
  budgetCurrency: string | null;
}

export interface LaunchAgentSummary {
  id: string;
  name: string;
  slug: string;
  status: AgentStatus;
  shortDescription: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  isFree: boolean;
  price: string;
  currency: string;
  publishedAt: string | null;
  firstSaleAt: string | null;
  unpublishedAt: string | null;
  version: string | null;
  creatorName: string;
  category: { name: string; slug: string } | null;
  productPath: string;
  sharePath: string;
  /** A5 §7 — real listing facts for the social post generator. */
  highlights?: {
    capabilities: string[];
    bestFor: string[];
    problem: string | null;
  };
}

/** GET /creators/me/agents/:id/launch (A4 §7–§13, §19–§20). */
export interface LaunchOverview {
  agent: LaunchAgentSummary;
  isLive: boolean;
  readyToPublish: boolean;
  pendingVersion: { id: string; versionNumber: string; status: string } | null;
  progress: LaunchProgress;
  campaign: Array<{ key: CampaignKey; done: boolean }>;
  recommendations: Recommendation[];
  promotions: PromotionView[];
  /** Gap closure (P16) — how each promotion type works (optional: older APIs). */
  promotionCatalog?: PromotionCatalogEntry[];
  milestones: {
    firstShareAt: string | null;
    firstViewAt: string | null;
    firstSaleAt: string | null;
  };
}

/** GET /creators/me/launch-center — the dashboard block (A4 §9). */
export interface LaunchCenter {
  hasLive: boolean;
  readyToPublish: Array<{
    agentId: string;
    name: string;
    kind: "initial" | "version";
    versionLabel: string | null;
  }>;
  live: Array<{
    agent: LaunchAgentSummary;
    progress: LaunchProgress;
    topRecommendation: Recommendation | null;
  }>;
  recommendations: Array<
    Recommendation & { agentId: string; agentName: string }
  >;
  promotions: { open: number; active: number };
}

export type AnalyticsRange = "7d" | "30d" | "all";

/** Real, de-duplicated measurements (A4 §15–§18) — never estimates. */
export interface AnalyticsMetrics {
  range: AnalyticsRange;
  from: string | null;
  to: string;
  views: number;
  visitors: number;
  /** Signed-in unique viewers whose event-time offer snapshot is paid. */
  conversionVisitors: number;
  /** Distinct buyers matched to a prior same-agent paid-offer view. */
  convertedBuyers: number;
  shares: number;
  checkouts: number;
  /** Paid order items in the selected cohort; later-refunded orders stay visible. */
  purchases: number;
  /** Free entitlements currently granted; not included in purchases. */
  freeClaims: number;
  grossSales: string;
  /** @deprecated Compatibility alias for grossSales. */
  revenue: string;
  currency: string;
  conversionRate: number | null;
  lowSample: boolean;
  reviews: number;
  rating: number | null;
  reviewsAllTime: number;
  ratingAllTime: number | null;
  /** Earliest event observed for the selected agents, not rollout date. */
  trackingSince: string | null;
  partial: boolean;
  enoughData: boolean;
  sources: Array<{ source: string; views: number; sharePct: number }>;
  impressions: number;
  paidOrders: number;
  buyers: number;
  /** Buyers with 2+ distinct paid orders in the selected scope and period. */
  repeatBuyers: number;
  /** A paid path applies to this scope now or has measured paid history. */
  paidFunnelApplicable: boolean;
  funnel: FunnelResult | null;
  funnelUnclassifiedEvents: number;
  series: Array<{ day: string; views: number; purchases: number }>;
  seriesGranularity: "day" | "week" | "month" | null;
  previews: number;
  documentationViews: number;
  interested: number;
  accesses: number;
  searchAppearances: number;
  categoryViews: number;
  favorites: number;
  refunds: number;
  refundedAmount: string;
  refundRate: number | null;
  failedPayments: number;
  failureRate: number | null;
  aov: string | null;
  /** Finance-specific creator earnings are not exposed by this analytics endpoint. */
  netEarnings: null;
  netEarningsReason: "not_exposed_in_creator_analytics";
  comparison: PeriodComparison | null;
}

export interface MetricChange {
  current: number;
  previous: number;
  changePct: number | null;
  direction: "up" | "down" | "flat" | null;
  enoughData: boolean;
}
export interface ConversionChange {
  current: number | null;
  previous: number | null;
  /** Difference in percentage points. */
  changePoints: number | null;
  direction: "up" | "down" | "flat" | null;
  enoughData: boolean;
}
export interface PeriodComparison {
  days: number;
  views: MetricChange;
  visitors: MetricChange;
  sales: MetricChange;
  revenue: MetricChange;
  favorites: MetricChange;
  conversion: ConversionChange;
  enoughData: boolean;
}

export interface ProductBreakdownRow {
  agentId: string;
  name: string;
  slug: string;
  status: string;
  isFree: boolean;
  views: number;
  visitors: number;
  conversionVisitors: number;
  purchases: number;
  grossSales: string;
  /** @deprecated Compatibility alias for grossSales. */
  revenue: string;
  freeClaims: number;
  impressions: number;
  conversionRate: number | null;
  lowSample: boolean;
  /** A paid path applies to this product now or has measured paid history. */
  paidFunnelApplicable: boolean;
}

export interface CreatorAnalyticsAgentOption {
  agentId: string;
  name: string;
  isFree: boolean;
  status: string;
}

export interface CreatorAnalyticsResponse extends AnalyticsMetrics {
  agents: CreatorAnalyticsAgentOption[];
  selectedAgentId: string | null;
  products: ProductBreakdownRow[];
  totals: { totalProducts: number; liveProducts: number };
}

export type ShareChannel =
  | "copy_link"
  | "copy_text"
  | "native"
  | "telegram"
  | "whatsapp"
  | "linkedin"
  | "x"
  | "email"
  | "qr_download"
  | "card_download";

/** GET /creators/me/agents/sales/:orderId (A4 §22). */
export interface CreatorSaleDetail {
  orderId: string;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  buyerUsername: string | null;
  currency: string;
  total: string;
  paymentStatus: PaymentStatus | null;
  paymentAt: string | null;
  refundStatus: RefundStatusValue | null;
  refundAt: string | null;
  items: Array<{
    agentId: string;
    agentName: string;
    agentSlug: string;
    version: string;
    unitPrice: string;
    total: string;
    currency: string;
    isFirstSale: boolean;
  }>;
}

/** GET /promoted — labelled sponsored placement (A4 §21, decision 3). */
export interface PromotedPlacementView {
  placement: PromotionPlacement;
  label: "sponsored";
  /** A5 §9 — each sponsored card carries its promotion id (attribution). */
  items: Array<AgentCard & { promotionId?: string }>;
}

// ---- Phase A5 — Creator Growth ----------------------------------------------

export type ReviewTopic =
  | "ux"
  | "quality"
  | "price"
  | "docs"
  | "integration"
  | "reliability"
  | "missing_feature";

export type DuplicateConfirmGroup =
  | "pricing"
  | "product_type"
  | "delivery"
  | "runtime"
  | "security"
  | "data_policy"
  | "integrations"
  | "requirements";

export interface DuplicateInfo {
  mode: "duplicate" | "complement";
  sourceAgentId: string;
  sourceName: string;
  unconfirmed: DuplicateConfirmGroup[];
}

export type FunnelStepKey = "impression" | "view" | "checkout" | "purchase";
export interface FunnelResult {
  steps: Array<{
    key: FunnelStepKey;
    count: number;
    rate: number | null;
    /** The immediately preceding purchase-path step. */
    base: FunnelStepKey | null;
  }>;
  biggestDrop: { from: FunnelStepKey; to: FunnelStepKey; lost: number } | null;
  enoughData: boolean;
}

export type CreatorStage =
  "launch" | "first_sale" | "feedback" | "expand" | "scale";
export type ProductHealthStatus =
  "inactive" | "collecting" | "healthy" | "attention" | "at_risk";
export type OptimizationLevel = "important" | "suggestion" | "good";
export type OptimizationCta =
  | { kind: "share" }
  | { kind: "edit"; step: string }
  | { kind: "reviews"; filter?: "needs_reply" | "low" }
  | { kind: "sales"; status?: SalesStatusFilter }
  | { kind: "promotion" }
  | { kind: "publish" }
  | { kind: "analytics" };
export interface OptimizationItem {
  key: string;
  level: OptimizationLevel;
  params: Record<string, string | number>;
  cta: OptimizationCta | null;
}

export type NextActionKey =
  | "create_first"
  | "continue_draft"
  | "fix_feedback"
  | "publish_ready"
  | "await_review"
  | "reply_reviews"
  | "share_product"
  | "optimize_product"
  | "collect_reviews"
  | "second_product"
  | "request_promotion"
  | "view_analytics";
export interface NextAction {
  key: NextActionKey;
  agentId: string | null;
  agentName: string | null;
  params: Record<string, string | number>;
}

export type GrowthOpportunity =
  | {
      key: "best_converter";
      agentId: string;
      agentName: string;
      rate: number;
      conversionVisitors: number;
      convertedBuyers: number;
    }
  | {
      key: "most_visited";
      agentId: string;
      agentName: string;
      visitors: number;
      conversionVisitors: number;
      conversionDataSufficient: boolean;
      minimumConversionVisitors: number;
    }
  | null;

export type GrowthComponentKey =
  | "quality"
  | "conversion"
  | "reviews"
  | "satisfaction"
  | "activity"
  | "portfolio"
  | "momentum";
export interface GrowthComponent {
  key: GrowthComponentKey;
  weight: number;
  value: number | null;
  points: number | null;
  status: "strong" | "ok" | "weak" | "no_data";
}
export interface GrowthScore {
  score: number | null;
  coverage: number;
  components: GrowthComponent[];
  focus: GrowthComponentKey | null;
}

/** GET /creators/me/growth (A5 §26–§28, §31). */
export interface GrowthCenter {
  stage: CreatorStage;
  status: {
    liveProducts: number;
    totalProducts: number;
    sales: number;
    freeClaims: number;
    grossSalesByCurrency: Array<{ currency: string; amount: string }>;
    reviews: number;
    rating: number | null;
    unansweredReviews: number;
    customers30: number;
  };
  nextActions: NextAction[];
  opportunity: GrowthOpportunity;
  milestones: {
    items: Array<{
      target: number;
      reached: boolean;
      achievedAt: string | null;
    }>;
    next: { target: number; remaining: number } | null;
  };
  score: GrowthScore;
  /** Gap closure — last 30 days vs the 30 before (null before any product went live). */
  performance?: PeriodComparison | null;
  focusProducts: Array<{
    id: string;
    name: string;
    health: ProductHealthStatus;
    important: number;
    topItem: OptimizationItem | null;
  }>;
  attentionItems: Array<{
    id: string;
    name: string;
    item: OptimizationItem;
  }>;
}

export interface TopicCount {
  topic: ReviewTopic;
  positive: number;
  negative: number;
}
export interface ReviewInsights {
  count: number;
  average: number | null;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  taggedCount: number;
  topics: TopicCount[];
  strengths: TopicCount[];
  weaknesses: TopicCount[];
  needsReply: number;
  lowRatingNeedsReply: number;
  /** Gap closure — aggregated structured answers (rates null below the sample). */
  answers?: {
    solved: {
      yes: number;
      partly: number;
      no: number;
      answered: number;
      rate: number | null;
    };
    recommend: {
      yes: number;
      no: number;
      answered: number;
      rate: number | null;
    };
  };
  highlights: {
    pros: Array<{ reviewId: string; text: string; rating: number }>;
    cons: Array<{ reviewId: string; text: string; rating: number }>;
  };
}

export type PricingStatement =
  | "not_enough_data"
  | "free_product"
  | "low_conversion_review_value"
  | "healthy_conversion"
  | "steady";
export interface PricingInsight {
  statement: PricingStatement;
  conversionRate: number | null;
  peers: { count: number; median: number; min: number; max: number } | null;
  position: "below" | "within" | "above" | null;
}

/** Gap closure (P16) — facts derived from how promotions really work. */
export interface PromotionTransparency {
  surface: "marketplace_home" | "category_page" | "mesh_channels" | null;
  slots: number | null;
  order: "earliest_start_first" | null;
  duration: "admin_sets_end_date" | "scheduled_post" | null;
  conditions: Array<
    | "published"
    | "approved_creator"
    | "admin_approval"
    | "one_open_request"
    | "same_category"
  >;
  rankingEffect: "none";
  impressions: "measured" | "not_measured";
  paid: false;
}
export interface PromotionCatalogEntry {
  type: PromotionType | "creator_spotlight";
  available: boolean;
  placement: PromotionPlacement | null;
  transparency?: PromotionTransparency;
}

/** GET /creators/me/agents/:id/insights (A5 §14–§17). */
export interface ProductInsights {
  agent: {
    id: string;
    name: string;
    slug: string;
    status: AgentStatus;
    isFree: boolean;
    price: string;
    currency: string;
    publishedAt: string | null;
    lastUpdatedAt: string | null;
    categorySlug: string | null;
  };
  health: {
    status: ProductHealthStatus;
    metrics: {
      views30: number;
      visitors30: number;
      conversionVisitors30: number;
      convertedBuyers30: number;
      purchases30: number;
      freeClaims30: number;
      conversion30: number | null;
      grossSales30: string;
      /** @deprecated Compatibility alias for grossSales30. */
      revenue30: string;
      viewsAll: number;
      purchasesAll: number;
      freeClaimsAll: number;
      grossSalesAll: string;
      /** @deprecated Compatibility alias for grossSalesAll. */
      revenueAll: string;
      rating: number | null;
      reviewCount: number;
      shares: number;
      impressions30: number;
      /** Gap closure — server-side order outcomes, 30 days. */
      refunds30?: number;
      refundRate30?: number | null;
      failedPayments30?: number;
      failureRate30?: number | null;
      favorites?: number;
      aov30?: string | null;
    };
    lowSample: boolean;
    /** Gap closure — «Published · Growing» (null = not enough data). */
    growing?: { growing: boolean; changePct: number } | null;
  };
  /** Gap closure — 7d vs previous 7d, 30d vs previous 30d. */
  comparison?: { d7: PeriodComparison; d30: PeriodComparison };
  optimization: Record<OptimizationLevel, OptimizationItem[]>;
  analytics: AnalyticsMetrics;
  funnel: FunnelResult | null;
  reviews: ReviewInsights;
  pricing: PricingInsight;
  promotions: PromotionView[];
  promotionCatalog: PromotionCatalogEntry[];
}

/** Owner view of one currently published Agent and its persisted showcase selection. */
export interface CreatorShowcaseAgent extends AgentCard {
  selected: boolean;
  portfolioOrder: number | null;
}
export interface CreatorShowcaseView {
  items: CreatorShowcaseAgent[];
}

/** GET /creators/me/portfolio (A5 §20) — Growth Center product chooser. */
export interface PortfolioItem {
  agentId: string;
  name: string;
  slug: string;
  status: AgentStatus;
  isFree: boolean;
  price: string;
  currency: string;
  logoUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
  views: number;
  visitors: number;
  conversionVisitors: number;
  impressions: number;
  shares: number;
  checkouts: number;
  purchases: number;
  freeClaims: number;
  grossSales: string;
  /** @deprecated Compatibility alias for grossSales. */
  revenue: string;
  rating: number | null;
  reviewCount: number;
  unansweredReviews: number;
  conversionRate: number | null;
  lowSample: boolean;
  lastSaleAt: string | null;
}

/** GET /creators/me/agents/reviews (A5 §11 — creator review center). */
export type CreatorReviewFilter = "all" | "needs_reply" | "low" | "replied";
export interface CreatorReviewItem {
  id: string;
  agentId: string;
  agentSlug: string;
  agentName: string;
  rating: number;
  text: string;
  authorName: string | null;
  verified: boolean;
  createdAt: string;
  pros: string | null;
  cons: string | null;
  useCase: string | null;
  positiveTopics: ReviewTopic[];
  negativeTopics: ReviewTopic[];
  solvedProblem?: SolvedProblemAnswer | null;
  wouldRecommend?: boolean | null;
  reply: {
    id: string;
    body: string;
    createdAt: string;
    editedAt: string | null;
    resolvedInVersion: string | null;
  } | null;
}
export interface CreatorReviewPage extends Paginated<CreatorReviewItem> {
  counts: { all: number; needsReply: number; low: number; replied: number };
  agents: Array<{ id: string; name: string }>;
}
export interface CreatorReviewSummary {
  count: number;
  average: number | null;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  needsReply: number;
  low: number;
  topics: Array<{ topic: ReviewTopic; positive: number; negative: number }>;
}

/** GET /admin/growth/overview (A5 §37). */
export interface AdminGrowthOverview {
  range: { from: string; to: string; days: number };
  products: Array<{
    agentId: string;
    name: string;
    slug: string;
    creatorName: string;
    views: number;
    visitors: number;
    purchases: number;
    revenue: string;
    conversionRate: number | null;
  }>;
  creators: Array<{
    creatorId: string;
    name: string;
    liveProducts: number;
    purchases: number;
    revenue: string;
  }>;
  integrity: {
    eventsByType: Array<{ type: string; count: number }>;
    purchases: { orders: number; events: number; missingEvents: number };
    promotionAnomalies: Array<{
      promotionId: string;
      agentName: string;
      impressions: number;
      clicks: number;
    }>;
  };
  moderation: { openReviewReports: number; openListingReports: number };
  promotions: Record<string, number>;
}

export interface StructuredReviewInput {
  /** Sprint 2 — one-line headline (≤120). */
  title?: string;
  pros?: string;
  cons?: string;
  useCase?: string;
  positiveTopics?: ReviewTopic[];
  negativeTopics?: ReviewTopic[];
  solvedProblem?: SolvedProblemAnswer | null;
  wouldRecommend?: boolean | null;
}

// ---------------------------------------------------------------------------
// Phase C1 — Creator Growth Infrastructure (Creator CRM)
//
// These mirror `presentRow()` in crm.controller.ts EXACTLY. The row is flat
// on purpose: the list, the KPI strip and the 360 view all read the same
// shape, so a number can never disagree with itself between screens.
// Admin-only; the API enforces the role, the UI never offers a creator a path.
// ---------------------------------------------------------------------------

/**
 * C2 splits C1's single "engaged" rung into the three steps the growth team
 * actually observes. The order is the funnel order and is the same list the
 * API returns from /admin/crm/meta — the UI never hardcodes it.
 */
export type CrmStage =
  | "new_lead"
  | "contacted"
  | "replied"
  | "interested"
  | "qualified"
  | "registered"
  | "creator_activated"
  | "product_started"
  | "product_submitted"
  | "approved"
  | "published"
  | "first_sale"
  | "growing";

/**
 * C2: "lost" is an outcome, not a stage. A lead lost after replying still
 * genuinely replied, so keeping the two apart is what makes "where do we
 * lose people" answerable.
 */
export type CrmOutcome = "active" | "lost";

export type CrmScoreBand = "high" | "medium" | "low";

export type CrmActivityStatus = "active" | "inactive" | "dormant" | "unknown";

export type CrmProductStatus =
  "no_product" | "draft" | "submitted" | "approved" | "published" | "has_sales";

export interface CrmScoreFactor {
  key: string;
  points: number;
  maxPoints: number;
  /** i18n key resolved by the browser, never a sentence from the server. */
  reasonKey: string;
  reasonVars?: Record<string, string | number>;
}

export interface CrmOwner {
  id: string;
  name: string;
  username: string | null;
}

/** One record in the CRM list — the shape every screen shares. */
export interface CrmCreatorRow {
  leadId: string;
  userId: string | null;
  creatorProfileId: string | null;
  creatorSlug: string | null;
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
  /** The stage to show: the derived one, unless an admin lowered it. */
  stage: CrmStage;
  derivedStage: CrmStage;
  manualStage: CrmStage | null;
  isStageOverridden: boolean;
  /** C2 — an outcome, not a stage. A lost lead keeps its real stage. */
  outcome: CrmOutcome;
  lostAt: string | null;
  lostReason: string | null;
  /** C2 — the lead that referred this one, for the referral graph. */
  referredById: string | null;
  referredByName: string | null;
  score: number;
  scoreBand: CrmScoreBand;
  scoreBreakdown: CrmScoreFactor[];
  productStatus: CrmProductStatus;
  productCount: number;
  publishedProductCount: number;
  salesCount: number;
  revenue: number;
  views7d: number;
  lastActivityAt: string | null;
  lastActivityDays: number | null;
  activityStatus: CrmActivityStatus;
  nextAction: boolean;
  hasOverdueAction: boolean;
  openActionCount: number;
  ownerId: string | null;
  ownerName: string | null;
  tags: string[];
  isResolved: boolean;
  userRole: string | null;
  userStatus: string | null;
  profileStatus: string | null;
  verificationStatus: string | null;
  displayName: string | null;
  firstContactAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmNote {
  id: string;
  body: string;
  authorId: string | null;
  createdAt: string;
}

export interface CrmAction {
  id: string;
  type: string;
  title: string;
  dueDate: string | null;
  assignedToId: string | null;
  priority: string;
  status: string;
  completedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
}

/** A row of the internal task queue (§9). */
export interface CrmQueueAction {
  id: string;
  leadId: string;
  leadName: string | null;
  type: string;
  title: string;
  dueDate: string | null;
  assignedToId: string | null;
  assigneeName: string | null;
  priority: string;
  status: string;
  isOverdue: boolean;
}

export interface CrmAttribution {
  id: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  landingPage: string | null;
  referrer: string | null;
  touchCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  convertedAt: string | null;
}

/** The 360 payload: the list row plus notes, actions and attribution. */
export interface CrmLeadDetail extends CrmCreatorRow {
  notes: CrmNote[];
  actions: CrmAction[];
  attribution: CrmAttribution[];
}

export interface CrmTimelineItem {
  id: string;
  eventName: string;
  source: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface CrmSegment {
  id: string;
  slug: string;
  name: string;
  description: string;
  isSystem: boolean;
  matchCount: number;
}

export interface CrmSavedView {
  id: string;
  slug: string;
  name: string;
  description: string;
  filters: Record<string, unknown>;
  isSystem: boolean;
  position: number;
}

export interface CrmDuplicateGroup {
  key: string;
  reason: "email" | "user" | "creator" | "website_name";
  leadIds: string[];
  rows: CrmCreatorRow[];
}

export interface CrmKpis {
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
  /** C2 — outcome, not stage. Read next to the funnel, never inside it. */
  lostLeads: number;
  openActions: number;
  overdueActions: number;
}

export interface CrmFunnelStage {
  stage: CrmStage;
  count: number;
  /** count / previous count, 0..1. null when the previous stage is empty. */
  conversionFromPrevious: number | null;
  /** previous - count, 0..1. null when there is no previous stage. */
  dropOffFromPrevious: number | null;
  /** Average days in this stage before moving on; null without data. */
  averageDaysToNext: number | null;
}

export interface CrmDashboard {
  stages: CrmFunnelStage[];
  definitions: Array<{
    stage: CrmStage;
    definitionKey: string;
    entryConditionKey: string;
    exitConditionKey: string;
  }>;
  transitions: Array<{ from: CrmStage; to: CrmStage; key: string }>;
  kpis: CrmKpis;
}

export interface CrmRevenueRow {
  source: string;
  leads: number;
  registered: number;
  publishedCreators: number;
  sales: number;
  revenue: number;
  averageScore: number | null;
}

/**
 * C2 — channel quality, not just channel volume.
 *
 * A rate is null when it cannot be computed, never 0: "no data" and "0%
 * conversion" are completely different facts and only one of them is a
 * judgement about the channel.
 */
export interface CrmAcquisitionAnalytics {
  rows: Array<{
    source: string;
    leads: number;
    contacted: number;
    replied: number;
    interested: number;
    qualified: number;
    registered: number;
    lost: number;
    replyRate: number | null;
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
}

export interface CrmRevenueAttribution {
  rows: CrmRevenueRow[];
  unattributed: { leads: number; revenue: number };
}

export interface CrmAutomationReadiness {
  events: Array<{
    event: string;
    futureAutomation: string;
    occurrences: number;
    ready: boolean;
  }>;
}

export interface CrmMeta {
  stages: CrmStage[];
  stageDefinitions: Array<{
    stage: CrmStage;
    definitionKey: string;
    entryConditionKey: string;
    exitConditionKey: string;
  }>;
  sources: string[];
  creatorTypes: string[];
  actionTypes: string[];
  actionStatuses: string[];
  actionPriorities: string[];
  eventNames: string[];
  owners: CrmOwner[];
  tags: Array<{
    id: string;
    slug: string;
    label: string;
    group: string;
    count: number;
  }>;
  activity: { activeDays: number; inactiveDays: number; dormantDays: number };
}

/** `POST /admin/crm/leads` answers with the new id, not the full row. */
export interface CrmLeadRef {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

/** The audited bulk payload (§1). Bounded to 200 leads per call. */
export interface CrmBulkRequest {
  leadIds: string[];
  action:
    | "assign_owner"
    | "set_stage"
    | "add_tag"
    | "remove_tag"
    | "set_next_action"
    | "add_note"
    | "clear_stage";
  ownerId?: string;
  manualStage?: string;
  tag?: string;
  actionType?: string;
  actionTitle?: string;
  dueDate?: string;
  priority?: string;
  note?: string;
}

export interface CrmBulkResult {
  action: string;
  changed: number;
  skipped: Array<{ leadId: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Phase C3 — Creator Activation.
//
// These types mirror the backend contract exactly. They are hand-written
// rather than inferred, so a field that disappears on the server becomes a
// compile error here instead of an `undefined` that renders as a blank label
// in front of a creator who is trying to finish a product.
// ---------------------------------------------------------------------------

/** The eight states of the activation journey, in order. */
export type ActivationState =
  | "not_started"
  | "onboarding"
  | "activated"
  | "idea_selected"
  | "product_started"
  | "product_draft"
  | "ready_for_submission"
  | "submitted";

export type ActivationStepStatus = "done" | "current" | "upcoming";

export interface ActivationProgressStep {
  state: ActivationState;
  /** i18n key. The UI owns the wording — see C3 §38 on plain copy. */
  titleKey: string;
  descriptionKey: string;
  status: ActivationStepStatus;
}

export interface ActivationProgress {
  steps: ActivationProgressStep[];
  completed: number;
  total: number;
}

/** C3 §24: exactly ONE primary action per state. */
export interface ActivationNextAction {
  titleKey: string;
  descriptionKey: string;
  ctaKey: string;
  href: string;
  hintKey?: string | null;
}

/** C3 §11: persistent but SECONDARY help. */
export interface ActivationSupportOption {
  key: "IDEA_HELP" | "PRODUCT_HELP" | "SUBMISSION_HELP";
  href: string;
}

export interface ActivationReadiness {
  percent: number;
  isReady: boolean;
  items: Array<{ field: string; labelKey: string; done: boolean }>;
}

export interface CreatorActivationView {
  state: ActivationState;
  progress: ActivationProgress;
  nextAction: ActivationNextAction;
  support: ActivationSupportOption[];
  readiness: ActivationReadiness;
  hasOpenAssistance: boolean;
  openAssistanceId: string | null;
}

export interface ActivationIdeaCandidate {
  title: string;
  problem: string;
  targetAudience: string[];
  useCases: string[];
  rationale: string;
}

export interface CreatorIdea {
  id: string;
  userId: string;
  title: string;
  problem: string;
  targetAudience: string[];
  useCases: string[];
  rationale: string;
  selectedAt: string | null;
  createdAt: string;
}

export type AssistanceType =
  "IDEA_HELP" | "PRODUCT_HELP" | "SUBMISSION_HELP" | "GENERAL";
export type AssistanceStatus = "open" | "in_progress" | "resolved" | "closed";

export interface CreatorAssistanceRequest {
  id: string;
  creatorId: string;
  type: AssistanceType;
  message: string;
  stageSnapshot: string;
  productId: string | null;
  priority: "low" | "normal" | "high";
  status: AssistanceStatus;
  response: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export type ActivationBand =
  "at_risk" | "needs_attention" | "active" | "highly_activated";
export type ActivationHealth =
  "at_risk" | "needs_help" | "needs_attention" | "active" | "activated";

export interface AdminActivationView {
  userId: string;
  creatorProfileId: string | null;
  creatorSlug: string | null;
  displayName: string | null;
  email: string | null;
  state: ActivationState;
  score: number;
  band: ActivationBand;
  breakdown: Array<{
    key: string;
    labelKey: string;
    earned: number;
    possible: number;
  }>;
  health: ActivationHealth;
  readinessPercent: number;
  productId: string | null;
  productStatus: string | null;
  lastActivityAt: string | null;
  daysSinceActivity: number | null;
  openAssistanceCount: number;
  isStalled: boolean;
}

export interface ActivationFunnelStep {
  state: ActivationState;
  entered: number;
  completed: number;
  /** Null — never 0 — when nobody entered. See C3 §22. */
  conversionRate: number | null;
  dropOff: number;
  medianHours: number | null;
}

export interface TimeToFirstProduct {
  completedCount: number;
  medianHours: number | null;
  averageHours: number | null;
  p25Hours: number | null;
  p75Hours: number | null;
}

export interface ActivationFunnelReport {
  steps: ActivationFunnelStep[];
  timeToFirstProduct: TimeToFirstProduct;
  generatedAt: string;
}

export interface StalledCreator {
  creatorProfileId: string;
  userId: string;
  slug: string;
  displayName: string;
  lastActivityAt: string;
  lastEvent: string;
  daysSinceActivity: number;
  hoursSinceActivity: number;
  stalledHours: number;
}

// ---------------------------------------------------------------------------
// Phase C4 — Creator Success
// ---------------------------------------------------------------------------
//
// The Success & Proof Workspace. Every shape below mirrors a real response
// from `GET /api/v1/creator/success`, and every field is either a count the
// database can produce or a timestamp of a row that exists.
//
// Three rules the shapes encode:
//
//   1. There is no score, no rank, no percentile and no next action. Those
//      live on `/creator/growth`; their absence here IS the boundary between
//      the two surfaces.
//   2. Labels do not travel over the wire. The API returns stable keys
//      (`first_sale`, `five_sales`, …) and both dictionaries own the words,
//      because a Persian string baked into a JSON response cannot be
//      translated.
//   3. A proof row is only rendered when `available` is true, so the page can
//      never present a zero as an achievement.

export type AchievementCategory = "product" | "customer" | "trust";

/** The nine milestones the platform can evidence from real rows. */
export type AchievementKey =
  | "first_product"
  | "second_product"
  | "first_sale"
  | "five_sales"
  | "ten_sales"
  | "repeat_buyer"
  | "first_review"
  | "ten_reviews"
  | "rating_four_plus";

export interface Achievement {
  key: AchievementKey;
  category: AchievementCategory;
  achieved: boolean;
  /** When the row behind the achievement was created. Null when not achieved. */
  achievedAt: string | null;
  /** The threshold being counted toward. Null for a binary milestone. */
  target: number | null;
  /** Progress toward `target`, capped at the target itself. */
  current: number;
}

export interface AchievementGroup {
  category: AchievementCategory;
  items: Achievement[];
}

export type MajorSuccessKey = AchievementKey | "case_study_published";

export interface MajorSuccess {
  key: MajorSuccessKey;
  occurredAt: string;
  /** A real route — the workspace never links to a destination it invented. */
  href: string;
}

/**
 * How far the creator is, as a description of what EXISTS.
 *
 * Not a level and not a target: it exists so the sentence under the snapshot
 * can be state-aware, because telling a creator with zero sales that they
 * have moved past the starting stage is the kind of cheerful lie that makes
 * a product feel dishonest.
 */
export type SnapshotState =
  | "no_product"
  | "no_sales"
  | "first_sale"
  | "selling"
  | "established";

export interface SuccessSnapshot {
  state: SnapshotState;
  /** Realized sales: paid or fulfilled, never refunded, never free. */
  sales: number;
  /** Realized sales that were later refunded. Kept so the two reconcile. */
  refundedSales: number;
  /** `sales + refundedSales` — the number Analytics calls "purchases". */
  grossSales: number;
  /** Sum of item totals over every paid intent. Not Creator earnings. */
  grossSalesAmount: number;
  /** Sum of item totals over realized sales only. */
  realizedSalesAmount: number;
  /** ISO code, or null when the creator's sales mix currencies. */
  currency: string | null;
  reviews: number;
  averageRating: number | null;
  publishedProducts: number;
  repeatBuyers: number;
  firstSaleAt: string | null;
  /** Whole days from the first publication to the first sale. */
  timeToFirstSaleDays: number | null;
}

export type ProofKey =
  | "sales"
  | "satisfaction"
  | "feedback"
  | "retention"
  | "time_to_first_sale"
  | "catalogue";

export interface ProofItem {
  key: ProofKey;
  /** False when the data behind this proof does not exist. */
  available: boolean;
  value: number | null;
  /** e.g. the review count behind an average rating. */
  secondary: number | null;
}

export interface CaseStudyPreview {
  id: string;
  slug: string;
  status: CaseStudyStatus;
  productName: string;
  agentId: string | null;
  agentName: string | null;
  /**
   * Numbers the CREATOR typed into the wizard and confirmed at submit, not
   * figures the platform measured. Shown as the creator wrote them.
   */
  resultSales: number;
  resultUsers: number;
  resultRevenue: number | null;
  publishedAt: string | null;
  updatedAt: string;
}

/** One or two reviews that stand for the rest. Proof, not a work queue. */
export interface CustomerVoiceHighlight {
  id: string;
  agentId: string;
  agentName: string;
  rating: number;
  title: string | null;
  text: string;
  pros: string | null;
  createdAt: string;
  verified: boolean;
  /** A display name only — a review is public, a buyer's contact is not. */
  buyerName: string;
}

export interface CustomerVoice {
  total: number;
  verified: number;
  averageRating: number | null;
  highlights: CustomerVoiceHighlight[];
}

export type OpportunityKey = "case_study" | "referral" | "portfolio";

export interface CredibilityOpportunity {
  key: OpportunityKey;
  href: string;
  /** The count that makes offering this opportunity honest. */
  evidence: number;
}

export interface SuccessTools {
  feedbackInsights: string;
  caseStudy: string;
  referral: string;
  timeline: string;
  /** Where review MANAGEMENT lives. Never duplicated on this surface. */
  reviewsManagement: string;
}

export interface CreatorSuccessView {
  snapshot: SuccessSnapshot;
  majorSuccess: MajorSuccess | null;
  achievements: AchievementGroup[];
  proof: ProofItem[];
  caseStudy: {
    eligible: boolean;
    hasCaseStudy: boolean;
    current: CaseStudyPreview | null;
  };
  customerVoice: CustomerVoice;
  opportunities: CredibilityOpportunity[];
  tools: SuccessTools;
  /** Referrals that reached a person. Invitations prove nothing. */
  referral: { reached: number };
  facts: {
    publishedProducts: number;
    sales: number;
    refundedSales: number;
    reviews: number;
    verifiedReviews: number;
    averageRating: number | null;
    repeatBuyers: number;
    firstSaleAt: string | null;
    hasCaseStudy: boolean;
  };
}

export interface CaseStudyCriterion {
  key: string;
  met: boolean;
  actual: number;
  needed: number;
}

export type CaseStudyStatus =
  | "draft"
  | "submitted"
  | "reviewing"
  | "changes_requested"
  | "approved"
  | "published"
  | "archived";

export interface CaseStudyView {
  id: string;
  slug: string;
  status: CaseStudyStatus;
  creatorName: string;
  productName: string;
  agentId: string | null;
  problem: string;
  solution: string;
  resultSales: number;
  resultUsers: number;
  resultRevenue: number;
  resultTimeSaved: string | null;
  resultOther: string | null;
  meshExperience: string;
  quote: string;
  consentAt: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

/**
 * §17 — counts, never amounts. `pendingReward` is a count of referrals an
 * admin has not reviewed; the platform has no wallet, so no currency field
 * exists in this type and none may be added without a real payout system.
 */
export interface ReferralStats {
  invited: number;
  registered: number;
  productCreated: number;
  published: number;
  firstSale: number;
  pendingReward: number;
  approvedReward: number;
}

export type ReferralStage =
  | "invited"
  | "visited"
  | "registered"
  | "creator_started"
  | "product_created"
  | "product_submitted"
  | "approved"
  | "published"
  | "first_sale"
  | "reward_eligible"
  | "rewarded";

export interface ReferralRow {
  code: string;
  url: string;
  stage: ReferralStage;
  registeredAt: string | null;
  createdAt: string;
}

export interface ReviewCenterReview {
  id: string;
  agentId: string;
  agentName: string;
  rating: number;
  pros: string | null;
  cons: string | null;
  positiveTopics: string[];
  negativeTopics: string[];
  wouldRecommend: boolean | null;
  createdAt: string;
  /** A display name only — a review is public, a buyer's contact is not. */
  buyerName: string;
  reply: { id: string; body: string } | null;
}

export type InsightStrength = "weak" | "moderate" | "strong";

export type InsightCategory =
  | "strength"
  | "weakness"
  | "feature_request"
  | "usability_issue"
  | "pricing_concern"
  | "integration_issue"
  | "support_issue";

export interface ReviewInsight {
  key: string;
  category: InsightCategory;
  message: string;
  count: number;
  topic: string;
  reviewIds: string[];
  action: { key: string; label: string; href: string };
  strength: InsightStrength;
}

export interface ReviewCenterView {
  summary: {
    total: number;
    /** null, not 0, when there are no reviews — the two are different facts. */
    average: number | null;
    distribution: Record<string, number>;
    answered: number;
    unreplied: number;
  };
  reviews: ReviewCenterReview[];
  insights: ReviewInsight[];
}

export interface PublicCaseStudy {
  slug: string;
  creatorName: string;
  productName: string;
  problem: string;
  solution: string;
  results: {
    sales: number;
    users: number;
    revenue: number;
    timeSaved: string | null;
    other: string | null;
  };
  quote: string;
  meshExperience: string;
  publishedAt: string | null;
  agentId: string | null;
}

export interface AdminSuccessRow {
  id: string;
  display_name: string;
  user_id: string;
  published: number;
  sales: number;
  reviews: number;
  rating: number | null;
  case_studies: number;
  referrals: number;
  last_activity: string | null;
}

export type AdminSuccessFilter =
  | "first_sale_recently"
  | "no_review"
  | "high_performer"
  | "case_study_eligible"
  | "referral_active"
  | "inactive"
  | "at_risk";

export interface SuccessAnalytics {
  firstSale: {
    creatorsWithFirstSale: number;
    medianDaysToFirstSale: number | null;
  };
  review: {
    requested: number;
    opened: number;
    completed: number;
    conversionRate: number | null;
    openRate: number | null;
  };
  caseStudy: {
    total: number;
    submitted: number;
    published: number;
    publicationRate: number | null;
  };
  referral: {
    invited: number;
    registered: number;
    firstSale: number;
    registrationConversion: number | null;
    firstSaleConversion: number | null;
  };
  secondProduct: {
    creatorsWithTwoProducts: number;
    medianDaysToSecondProduct: number | null;
  };
}

/** §26 — one page of the creator's success timeline. */
export interface SuccessTimelineEvent {
  id: string;
  type: string;
  occurredAt: string;
  description: string;
  href: string | null;
}

export interface SuccessTimeline {
  events: SuccessTimelineEvent[];
  total: number;
  hasMore: boolean;
  page: number;
}

// ===========================================================================
// Phase C5 — SCALE
// ===========================================================================
//
// Every shape below mirrors a real C5 response. Three rules are encoded here
// rather than left to each page, because getting them wrong is the easiest way
// to ship a lie:
//
//  1. `conversionRate` and `approvalRate` are `number | null`. NULL means
//     "not measured yet" (no clicks, no clicks to convert). Rendering 0 would
//     claim a measurement nobody took.
//  2. `payoutMode` is the literal 'manual_admin_confirmed'. There is no
//     automated payout provider, and the type makes inventing one impossible.
//  3. Reward amounts are `amountMinor` integers, never floats — money is
//     minor units end to end.

/** §7 — a monetary amount in minor units plus its currency. */
export interface Money {
  amountMinor: number;
  currency: string;
}

/** §24 — the reward lifecycle. 'reversed' is terminal (§24). */
export type RewardStatus =
  "pending" | "approved" | "available" | "paid" | "reversed";

/** §7 — why a reward exists. Every one of these is server-decided. */
export type RewardReason =
  | "creator_published"
  | "creator_first_sale"
  | "buyer_purchase"
  | "ambassador_bonus"
  | "affiliate_commission";

export interface RewardRow {
  id: string;
  referralId: string | null;
  reason: RewardReason;
  amount: Money;
  status: RewardStatus;
  createdAt: string;
  updatedAt: string;
  paidReference: string | null;
  /** Present only when the reward is flagged; §47. */
  riskFlag: { reason: string; detail: string | null } | null;
}

/** §5 — one referral row, creator-facing. */
export interface ScaleReferralRow {
  id: string;
  kind: "creator" | "buyer";
  code: string;
  stage: string;
  clicks: number;
  registeredAt: string | null;
  attributedRevenue: Money;
  rewards: RewardRow[];
}

/** §6 — the referral dashboard. */
export interface ScaleReferralView {
  code: string;
  url: string;
  stats: {
    clicks: number;
    signups: number;
    conversions: number;
    /** §18 — null while there are no clicks. */
    conversionRate: number | null;
    revenue: Money;
    rewards: Money;
  };
  rows: ScaleReferralRow[];
  /**
   * §8 — what to do next, computed server-side.
   *
   * Only the KEY travels. The server decides which advice applies; the copy
   * lives in the i18n catalogue (`scale.referral.advice.<key>.title/body`)
   * so the same decision reads correctly in fa and en. Shipping title/body
   * strings in the response would have frozen the advice in one language.
   */
  advice: Array<{ key: string }>;
}

/** §10 — one eligibility criterion, shown individually. */
export interface AmbassadorCriterion {
  key: string;
  label: string;
  current: number | string;
  required: number | string;
  met: boolean;
}

/** §12 — a configured tier. There is no hard-coded ladder. */
export interface AmbassadorLevel {
  id: string;
  name: string;
  description: string | null;
  rank: number;
  rewardRateBps: number;
  /** §9 — the sales threshold that admits a creator to this tier. */
  minSales: number;
  /** §9 — the referral-conversion threshold for this tier. */
  minReferralConversions: number;
  /** §12 — whether an admin must grant this tier by hand. */
  requiresManualGrant: boolean;
}

export type AmbassadorStatus =
  | "not_eligible"
  | "eligible"
  | "invited"
  | "active"
  | "declined"
  | "suspended"
  | "completed";

/** §10 — the ambassador screen. */
export interface AmbassadorView {
  status: AmbassadorStatus;
  criteria: AmbassadorCriterion[];
  /** null until a level is granted; §12. */
  level: AmbassadorLevel | null;
  /** 0 means NO ladder is configured, which the UI must say. */
  levelsConfigured: number;
  nextLevel: AmbassadorLevel | null;
  /**
   * §11 — the invitation record.
   *
   * The service returns it as `existing`, and it is null for a creator who
   * has no ambassador row. The previous `invitation: {...} | null` shape was
   * never produced by the server, so a creator with an active membership
   * rendered without the date it was invited on.
   */
  existing: {
    status: AmbassadorStatus;
    levelId: string | null;
    invitedAt: string | null;
  } | null;
  /**
   * §11 — every number is split, not totalled. A single "rewards" figure
   * cannot distinguish money an admin has approved from money that has
   * already been transferred, which is exactly the question an ambassador
   * arrives with.
   */
  stats: {
    invites: number;
    /** §11 asks for buyer and creator referrals separately. */
    buyerReferrals: number;
    creatorReferrals: number;
    conversions: number;
    /** null before any invite: "0%" would read as "every invite failed". */
    conversionRate: number | null;
    revenue: Money;
    rewards: Money;
    pendingRewards: Money;
    availableRewards: Money;
    paidRewards: Money;
  };
  /** §13 — ready-made platform copy, so nothing needs to be written by hand. */
  assets: Array<{
    key: string;
    title: string;
    body: string;
    forLevel: string | null;
  }>;
  /** §27 — the community invitation that comes with the ambassador one. */
  community: { status: string; joined: boolean } | null;
}

/** §22 — the affiliate dashboard. */
export interface AffiliateView {
  affiliate: {
    id: string;
    status: "pending" | "approved" | "rejected" | "suspended";
    displayName: string;
    websiteUrl: string | null;
    /** §17 — what the affiliate actually shares. */
    code: string;
    url: string;
    commissionRateBps: number | null;
    /** §44 — always manual. There is no automated payout. */
    payoutMode: "manual_admin_confirmed";
    decisionReason: string | null;
    decidedAt: string | null;
  } | null;
  stats: {
    clicks: number;
    conversions: number;
    /** null before any click — §18. */
    conversionRate: number | null;
    revenue: Money;
    commissions: Money;
    pendingCommissions: Money;
  };
  commissions: Array<{
    id: string;
    orderId: string | null;
    amount: Money;
    status: RewardStatus;
    createdAt: string;
  }>;
  /**
   * There is deliberately NO `recentClicks` field.
   *
   * The platform stores a click COUNT on the affiliate row and nothing else
   * — no timestamped click table exists. A "recent clicks" timeline could
   * therefore only ever be empty or invented, and §18 forbids rendering a
   * control that cannot tell the truth. The real number (`stats.clicks`) is
   * shown instead.
   */
}

/** §15 — a partnership, admin-facing. */
export interface PartnershipRow {
  id: string;
  leadId: string;
  name: string;
  type: string;
  stage: string;
  agreementStatus: string;
  code: string;
  campaign: string | null;
  attributionMethod: string;
  brings: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  performance: { clicks: number; signups: number; revenue: Money } | null;
}

export interface PartnershipAnalytics {
  total: number;
  byStage: Record<string, number>;
  active: number;
  byType: Record<string, number>;
  revenue: Money;
  signups: number;
}

/** §15 — the pipeline, with the legal next steps spelled out. */
export interface PartnershipStageInfo {
  stage: string;
  allowedNext: string[];
}

/** §16 — a single transition outcome. */
export interface TransitionResult<T> {
  changed: boolean;
  /** Machine-readable reason when changed is false. */
  blocked: string | null;
  reward?: T;
  partnership?: T;
  affiliate?: T;
  ambassador?: T;
  commission?: T;
}

/** §29 — community content. */
export interface CommunityPost {
  id: string;
  title: string;
  body: string;
  category: string;
  authorName: string;
  createdAt: string;
  comments: number;
  reactions: number;
  reactedByMe: boolean;
  hidden: boolean;
}

export interface CommunityView {
  membership: {
    status: "invited" | "active" | "left" | "removed";
    joinedAt: string | null;
  } | null;
  posts: CommunityPost[];
  /**
   * The real `community_category` values with the number of posts in each.
   * `label` is deliberately absent: it is i18n copy
   * (`scale.community.category.<key>`), not data, and putting it here would
   * mean the API decides the language of the UI.
   */
  categories: Array<{ key: string; count: number }>;
  stats: { members: number; posts: number; today: number };
}

/** §30 — the public feed carries NO bodies and NO author ids. */
export interface PublicCommunityPost {
  id: string;
  title: string;
  category: string;
  authorName: string;
  createdAt: string;
  reactions: number;
  comments: number;
}

/** §32, §44 — the admin growth dashboard. */
export interface ScaleGrowthDashboard {
  referral: {
    totalReferrals: number;
    creatorReferrals: number;
    buyerReferrals: number;
    conversions: number;
    conversionRate: number | null;
    revenueMinor: number;
    /** A COUNT of rewards created, not an amount. */
    rewardsCreated: number;
    paidOutMinor: number;
  };
  ambassador: {
    activeAmbassadors: number;
    invited: number;
    suspended: number;
    newAmbassadors: number;
    leveled: number;
    levelsConfigured: number;
  };
  affiliate: {
    activeAffiliates: number;
    totalAffiliates: number;
    clicks: number;
    conversions: number;
    conversionRate: number | null;
    commissionMinor: number;
    grossCommissionMinor: number;
    payoutMode: string;
  };
  partnership: {
    activePartners: number;
    totalPartners: number;
    leads: number;
    /** The server sends null when the figure is not measured (§18). */
    conversions: number | null;
    revenueMinor: number | null;
    warnings: string[];
  };
  community: {
    members: number;
    activeMembers: number;
    posts: number;
    comments: number;
    returningCreators: number;
    /**
     * §31 — hidden posts, with their ids, so moderation has a real queue to
     * act on. A count alone would tell an admin that something is hidden and
     * give them no way to restore it.
     */
    hiddenPosts: number;
    hiddenPostIds: string[];
  };
  /**
   * §44 — what this system does NOT do, stated by the server. The UI renders
   * these as explicit limits instead of implying the capability exists.
   */
  capabilities: {
    automaticPayout: boolean;
    externalCommunityProvider: boolean;
    socialPublishing: boolean;
  };
}

/** §47 — a growth risk flag. */
export interface RiskFlag {
  id: string;
  subjectType: string;
  subjectId: string;
  reason: string;
  detail: string | null;
  status: "open" | "cleared" | "confirmed";
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface AdminRewardRow extends RewardRow {
  referrerId: string;
  referrerName: string | null;
}

/** The shape every /admin/scale list answers with: `items` plus a `total`. */
export interface AdminRewardsView {
  items: AdminRewardRow[];
  total: number;
  /** 0-based, as the server counts pages. */
  page?: number;
  hasMore?: boolean;
}

export interface AdminAffiliateRow {
  id: string;
  displayName: string;
  websiteUrl: string | null;
  status: string;
  channels: string[];
  applicantName: string;
  reason: string | null;
  decisionReason: string | null;
  createdAt: string;
  clicks: number;
  conversions: number;
}

export interface AdminAffiliatesView {
  items: AdminAffiliateRow[];
  total: number;
}

export interface AdminAmbassadorRow {
  id: string;
  creatorProfileId: string;
  creatorName: string;
  status: AmbassadorStatus;
  levelName: string | null;
  invitedAt: string | null;
  respondedAt: string | null;
  stats: { invites: number; conversions: number; revenue: Money };
}

/** Phase C5 §48 — the admin reporting suite. */
export interface GrowthReportsView {
  topCreatorsByReferral: Array<{
    profileId: string;
    name: string | null;
    referrals: number;
    signups: number;
    conversions: number;
    revenue: Money;
    /** Revenue minus reward cost. A negative net is the point of the report. */
    net: Money;
    formatted: string;
  }>;
  topAmbassadors: Array<{
    profileId: string;
    name: string | null;
    status: string;
    level: string | null;
    invites: number;
    conversions: number;
    shares: number;
    revenueMinor: number;
    netMinor: number;
  }>;
  topAffiliates: Array<{
    affiliateId: string;
    displayName: string;
    status: string;
    clicks: number;
    commissions: number;
    commissionMinor: number;
    rateBps: number;
  }>;
  topPartners: Array<{
    partnershipId: string;
    name: string;
    type: string;
    stage: string;
    agreementStatus: string | null;
    leads: number;
    /** null = not measurable yet, which is NOT the same as 0. */
    revenueMinor: number | null;
  }>;
  revenueByChannel: Array<{
    channel: string;
    orders: number;
    revenueMinor: number;
  }>;
  costOfAcquisition: {
    currency: string;
    totalCostMinor: number;
    paidCount: number;
    conversions: number;
    /** null before anything is paid — reporting 0 would read as "free". */
    costPerAcquisitionMinor: number | null;
    conversionsPerAcquisition: number | null;
  };
  conversionRates: {
    totalReferrals: number;
    signups: number;
    signupToPurchaseRate: number | null;
    buyerSignups: number;
    creatorSignups: number;
    creatorToCreatorRate: number | null;
  };
}

// ===========================================================================
// Sprint 2 — Buyer Experience, Conversion & Activation
// These mirror backend `buyer-journey/journey.types.ts` EXACTLY (dates arrive
// as ISO strings). The frontend never derives a status — it only renders it.
// ===========================================================================

export type JourneyStage =
  | "purchased"
  | "delivery_pending"
  | "ready"
  | "setup_in_progress"
  | "active"
  | "first_value";

export type JourneyStatus =
  JourneyStage | "needs_attention" | "updated" | "suspended" | "refunded";

export type ProductFilter =
  | "all"
  | "active"
  | "setup_required"
  | "in_progress"
  | "needs_attention"
  | "updated";

export type SetupState =
  "not_started" | "in_progress" | "blocked" | "completed";
export type SetupStepStatus =
  "pending" | "in_progress" | "completed" | "skipped" | "blocked";
export type SetupStepKind =
  | "api_key"
  | "external_account"
  | "integration"
  | "configuration"
  | "file"
  | "credential"
  | "manual"
  | "test";

export type NextActionCode =
  | "confirm_delivery"
  | "start_setup"
  | "continue_setup"
  | "complete_setup"
  | "resolve_attention"
  | "review_update"
  | "report_first_value"
  | "write_review"
  | "open_product"
  | "none";

export interface SetupProgress {
  total: number;
  done: number;
  requiredTotal: number;
  requiredDone: number;
  percent: number;
  blocked: number;
}

export interface SetupStepView {
  key: string;
  position: number;
  kind: SetupStepKind;
  /** creator-written text; null ⇒ render the localized text of `key` */
  title: string | null;
  description: string | null;
  required: boolean;
  status: SetupStepStatus;
  note: string | null;
  blockedReason: string | null;
  completedAt: string | null;
}

export interface ProductJourneyView {
  /** the entitlement id */
  id: string;
  agent: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    status: string;
    isFree: boolean;
    creator: { name: string; slug: string } | null;
  };
  version: {
    purchased: string | null;
    current: string | null;
    updateAvailable: boolean;
  };
  status: JourneyStatus;
  stage: JourneyStage;
  setup: { state: SetupState; progress: SetupProgress };
  nextAction: { code: NextActionCode; stepKey: string | null };
  orderId: string | null;
  purchasedAt: string;
  lastActivityAt: string;
  milestones: {
    deliveryConfirmedAt: string | null;
    setupStartedAt: string | null;
    setupCompletedAt: string | null;
    firstRunAt: string | null;
    firstValueAt: string | null;
  };
  attention: { reason: string | null; at: string } | null;
  hasReviewed: boolean;
}

export type RefundStatusValue =
  "requested" | "under_review" | "approved" | "rejected" | "processed";
export type RefundIneligibleReason =
  "no_order" | "not_paid" | "already_refunded" | "pending" | "window_expired";

export interface RefundTimelineView {
  current: "submitted" | "under_review" | "decision" | "completed";
  outcome: "pending" | "approved" | "rejected";
  steps: Array<{
    step: "submitted" | "under_review" | "decision" | "completed";
    state: "done" | "current" | "todo" | "rejected";
  }>;
}

export interface JourneyRefundView {
  id: string;
  status: RefundStatusValue;
  reason: string;
  amount: string;
  currency: string;
  requestedAt: string;
  reviewStartedAt: string | null;
  decidedAt: string | null;
  response: string | null;
  timeline: RefundTimelineView;
}

export interface BuyerContract {
  source: "snapshot" | "live";
  versionId: string | null;
  versionNumber: string | null;
  productType: string | null;
  deliveryModel: string | null;
  executionModel: string | null;
  hostingResponsibility: string | null;
  buildTool: string | null;
  whatBuyerReceives: string[];
  whatBuyerDoesNotReceive: string[];
  additionalCosts: Array<{ label: string; note?: string | null }>;
  supportOwner: string | null;
  supportScope: string | null;
  supportPeriod: string | null;
  infrastructureNeeds: string | null;
  usageGuide: string | null;
  howItWorks: Array<{ title: string; description?: string }>;
  limitations: string[];
  requirements: Array<{
    type: string;
    description: string;
    required: boolean;
    name?: string | null;
    reason?: string | null;
  }>;
  integrations: Array<{
    slug: string;
    name?: string | null;
    purpose: string | null;
  }>;
  noRequirements: boolean;
  dataPolicy: {
    storesUserData: boolean;
    sharesWithThirdParties: boolean;
    handlesSensitiveData: boolean;
    retentionDays: number | null;
    thirdParties: string[];
  } | null;
}

export interface TimeToValueView {
  purchaseToDelivery: number | null;
  deliveryToSetupStart: number | null;
  setupDuration: number | null;
  setupToFirstValue: number | null;
  purchaseToFirstValue: number | null;
}

export interface ProductJourneyDetail extends ProductJourneyView {
  steps: SetupStepView[];
  contract: BuyerContract;
  firstValueNote: string | null;
  timeToValue: TimeToValueView;
  updatesCount: number;
  refund: {
    eligibility: {
      eligible: boolean;
      reason: RefundIneligibleReason | null;
      windowEndsAt: string | null;
    };
    items: JourneyRefundView[];
  };
  support: Array<{
    id: string;
    subject: string;
    category: string | null;
    status: string;
    updatedAt: string;
  }>;
  review: {
    id: string;
    rating: number;
    title: string | null;
    text: string;
  } | null;
}

export interface ProductUpdateView {
  versionId: string;
  version: string;
  publishedAt: string | null;
  isCurrent: boolean;
  isNew: boolean;
  unseen: boolean;
  summary: string | null;
  changes: { major: string[]; improvements: string[]; fixes: string[] };
  impact: "major" | "improvement" | "fix" | "minor";
  actionRequired: string | null;
}

export interface ProductListResult {
  items: ProductJourneyView[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  counts: Record<ProductFilter, number>;
}

export interface BuyerDashboard {
  onboarding: { shouldShow: boolean };
  counts: {
    products: number;
    active: number;
    setupRequired: number;
    inProgress: number;
    needsAttention: number;
    updated: number;
    saved: number;
    unreadNotifications: number;
  };
  continue: ProductJourneyView | null;
  products: ProductJourneyView[];
  updates: {
    available: Array<{
      id: string;
      slug: string;
      name: string;
      currentVersion: string | null;
    }>;
    feed: Array<{
      id: string;
      type: string;
      title: string;
      body: string | null;
      link: string | null;
      severity: NotificationSeverity | string;
      readAt: string | null;
      createdAt: string;
    }>;
  };
}

export type RecommendationReasonCode =
  | "shared_integration"
  | "owned_category"
  | "followed_product"
  | "followed_creator"
  | "saved_category"
  | "followed_category"
  | "interest"
  | "onboarding_category"
  | "goal"
  | "new"
  | "top_rated";

export interface RecommendationItem {
  agent: {
    id: string;
    slug: string;
    name: string;
    shortDescription: string;
    logoUrl: string | null;
    isFree: boolean;
    price: string;
    currency: string;
    rating: number | null;
    reviewCount: number;
    creatorName: string | null;
  };
  reason: { code: RecommendationReasonCode; name: string | null };
}

export type BuyerGoal =
  | "support"
  | "sales"
  | "marketing"
  | "finance"
  | "operations"
  | "data"
  | "productivity"
  | "developer";
export type BuyerWorkType =
  "automate" | "assistant" | "template" | "integrate" | "done_for_you";

export interface BuyerPreferences {
  goals: BuyerGoal[];
  workTypes: BuyerWorkType[];
  categories: string[];
  completed: boolean;
  skipped: boolean;
  shouldShow: boolean;
}

export interface FunnelStepView {
  key:
    | "product_view"
    | "checkout_started"
    | "purchase"
    | "delivery_confirmed"
    | "setup_started"
    | "setup_completed"
    | "first_value"
    | "review"
    | "repeat_purchase";
  basis: "people" | "purchases" | "buyers";
  count: number;
  rateFromPrevious: number | null;
  dropFromPrevious: number | null;
}

export interface DurationStatsView {
  samples: number;
  medianSeconds: number | null;
  p90Seconds: number | null;
}

export interface BuyerJourneyAnalytics {
  days: number;
  since: string;
  funnel: FunnelStepView[];
  timeToValue: {
    purchaseToDelivery: DurationStatsView;
    deliveryToSetupStart: DurationStatsView;
    setupDuration: DurationStatsView;
    setupToFirstValue: DurationStatsView;
    purchaseToFirstValue: DurationStatsView;
  };
  stages: Record<string, number>;
  attention: { needsAttention: number };
  products: Array<{
    slug: string;
    name: string;
    purchases: number;
    setupCompleted: number;
    firstValue: number;
    setupCompletionRate: number | null;
    firstValueRate: number | null;
  }>;
  reminders: { sent: number };
}
