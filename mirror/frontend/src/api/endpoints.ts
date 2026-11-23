import type {
  AdminSuccessFilter,
  AdminSuccessRow,
  CaseStudyStatus,
  CaseStudyView,
  CreatorSuccessView,
  PublicCaseStudy,
  ReferralRow,
  ReferralStats,
  ReviewCenterView,
  SuccessTimeline,
  SuccessAnalytics,
  GrowthReportsView,
} from "./types";
import type {
  BuyerDashboard,
  BuyerGoal,
  BuyerJourneyAnalytics,
  BuyerPreferences,
  BuyerWorkType,
  ProductFilter,
  ProductJourneyDetail,
  ProductListResult,
  ProductUpdateView,
  RecommendationItem,
  SetupStepStatus,
} from "./types";
import { apiOrigin, http, keepaliveRequest } from "./client";
import type { MfaChallenge } from "./control";
import type {
  AgentFacets,
  AgentListQuery as DiscoveryListQuery,
  AgentListResult,
  ClientEvent,
  DiscoveryAnalytics,
  FavoritesResult,
  FollowIds,
  FollowItem,
  FollowTarget,
  InterestProfile,
  NoResultsGuidance,
  Paginated as DiscoveryPaginated,
  SearchSuggestions,
} from "./types";
import type {
  AdminAffiliatesView,
  AdminAmbassadorRow,
  AdminRewardsView,
  AdminRewardRow,
  AffiliateView,
  AmbassadorLevel,
  AmbassadorView,
  CommunityPost,
  CommunityView,
  Money,
  PartnershipAnalytics,
  PartnershipRow,
  PublicCommunityPost,
  RewardStatus,
  RiskFlag,
  ScaleGrowthDashboard,
  ScaleReferralRow,
  ScaleReferralView,
  TransitionResult,
} from "./types";
import type {
  CrmAction,
  CrmQueueAction,
  CrmAutomationReadiness,
  CrmBulkRequest,
  CrmBulkResult,
  CrmCreatorRow,
  CrmDashboard,
  CrmDuplicateGroup,
  CrmKpis,
  CrmLeadDetail,
  CrmLeadRef,
  CrmMeta,
  CrmNote,
  CrmAcquisitionAnalytics,
  CrmRevenueAttribution,
  CrmSavedView,
  CrmSegment,
  CrmTimelineItem,
} from "./types";
import type {
  ActivationFunnelReport,
  ActivationProgress,
  ActivationState,
  ActivationIdeaCandidate,
  AdminActivationView,
  AdminPromotionView,
  AgentStatus,
  AssistanceStatus,
  AssistanceType,
  AnalyticsMetrics,
  AnalyticsRange,
  CreatorAnalyticsResponse,
  CreatorActivationView,
  CreatorAssistanceRequest,
  CreatorIdea,
  CreatorSaleDetail,
  LaunchCenter,
  LaunchOverview,
  PromotedPlacementView,
  PromotionStatus,
  PromotionType,
  StalledCreator,
  PromotionView,
  PublishChecklistView,
  ReleaseGateReadiness,
  PublishResult,
  ShareChannel,
  CreatorReviewList,
  CreatorReviewView,
  FeedbackDraft,
  ReviewActionResult,
  ReviewFeedback,
  ReviewQueue,
  ReviewQueueQuery,
  ReviewWorkspace,
  RevisionPreview,
  SubmitResult,
  CreatorFoundation,
  CreatorOnboardingAction,
  CreatorOnboardingStep,
  AdminAgentRow,
  AdminCreatorRow,
  AdminOrderRow,
  AdminEntitlementRow,
  AdminPaymentRow,
  AdminRefundRow,
  AdminReportRow,
  AdminUserRow,
  AgentDetail,
  AgentCard,
  AgentListQuery,
  AgentStatusView,
  DraftSaveResult,
  AuditLogRow,
  AuthResponse,
  Category,
  Industry,
  AdminCategory,
  AdminIndustry,
  TaxonomyCategoryInput,
  TaxonomyIndustryInput,
  CheckoutResult,
  PaymentConfirmResult,
  CreatorAgentCard,
  CreatorAgentDetail,
  CreatorProfile,
  CreatorProfileView,
  CreatorStats,
  CreatorEntitlementSummary,
  DashboardView,
  EntitlementView,
  EntitlementEventView,
  EntitlementAccessDecision,
  EntitlementCapability,
  MyReview,
  Notification,
  OrderView,
  OrderDetailView,
  OrderStatusGroup,
  ReceiptView,
  TwoFactorStatus,
  Paginated,
  PublicUser,
  ReadinessView,
  ReportView,
  ReviewRow,
  ReviewSummary,
  Role,
  UserStatus,
  VersionView,
  SupportRequestDetail,
  SupportRequestListItem,
  SupportStatus,
  CreateSupportRequest,
  BuildToolName,
  DeliveryModelName,
  ExecutionModelName,
  HostingResponsibilityName,
  ProductTypeName,
  AdminGrowthOverview,
  CreatorReviewFilter,
  CreatorReviewPage,
  CreatorReviewSummary,
  DuplicateConfirmGroup,
  GrowthCenter,
  CreatorShowcaseView,
  PortfolioItem,
  ProductInsights,
  ReviewInsights,
  StructuredReviewInput,
  AdminVersionList,
  AgentChangelog,
  ChangelogState,
  IdeaSuggestions,
  CreatorOpportunityFeedItem,
  AdminCreatorOpportunity,
  AdminCreatorOpportunityPayload,
  CreatorOpportunityTargeting,
  CreatorOpportunityAudiencePreview,
  MediaKind,
  PublicVersionHistory,
  CreatorSalesQuery,
  CreatorSalesResult,
  StorageCapabilities,
  UploadedMedia,
  CreatorGoal,
  ExperienceLevel,
  ProductReadinessAnswer,
} from "./types";

// ---- Auth ----
export const authApi = {
  /** Phone-primary registration: phone required, email optional. */
  register: (body: {
    email?: string;
    password: string;
    username: string;
    fullName?: string;
    phone: string;
    acceptTerms: boolean;
    /** Sprint 1 (B3) — the legal version shown at consent; the server refuses a stale one. */
    termsVersion?: string;
    locale?: "fa" | "en";
  }) => http.post<AuthResponse>("/auth/register", body, { skipAuth: true }),
  /** Phone-only login: phone + password, nothing else (mirrors LoginDto). */
  login: (body: { phone: string; password: string }) =>
    http.post<AuthResponse | MfaChallenge>("/auth/login", body, {
      skipAuth: true,
    }),
  logout: () => http.post<void>("/auth/logout"),
  /** Ends every login of this account, including the current one. */
  logoutAll: () => http.post<{ revoked: number }>("/auth/logout-all"),
  refresh: () =>
    http.post<AuthResponse>("/auth/refresh", undefined, { skipAuth: true }),
  verifyEmail: (code: string) =>
    http.post<PublicUser>("/auth/verify-email", { code }),
  resendVerification: () =>
    http.post<{ sent: boolean }>("/auth/verify-email/resend"),
  usernameAvailable: (username: string) =>
    http.get<{ available: boolean }>("/auth/username-available", {
      username,
    }),
  requestPasswordReset: (email: string) =>
    http.post<{ sent: boolean }>(
      "/auth/password-reset/request",
      { email },
      { skipAuth: true },
    ),
  confirmPasswordReset: (body: {
    email: string;
    code: string;
    newPassword: string;
  }) =>
    http.post<{ ok: boolean }>("/auth/password-reset/confirm", body, {
      skipAuth: true,
    }),
  /** Saves onboarding wizard progress; `complete` marks it finished. */
  saveOnboarding: (body: {
    username?: string;
    fullName?: string;
    phone?: string;
    country?: string;
    interests?: string[];
    complete?: boolean;
  }) => http.post<PublicUser>("/auth/onboarding", body),
};

// ---- Me ----
export const meApi = {
  get: () => http.get<PublicUser>("/me"),
  update: (body: {
    username?: string;
    fullName?: string;
    phone?: string | null;
    country?: string;
    locale?: "fa" | "en";
    interests?: string[];
  }) => http.patch<PublicUser>("/me", body),
  /** Account Center — active login sessions (current one flagged). */
  sessions: () =>
    http.get<
      Array<{
        id: string;
        createdAt: string;
        lastUsedAt: string;
        userAgent: string | null;
        /** Coarse device description computed by the server. */
        device?: {
          browser: string | null;
          os: string | null;
          kind: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
        };
        ip: string | null;
        current: boolean;
      }>
    >("/me/sessions"),
  revokeSession: (id: string) =>
    http.delete<{ ok: boolean }>(`/me/sessions/${id}`),
  revokeOtherSessions: () =>
    http.post<{ revoked: number }>("/me/sessions/revoke-others"),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    http.post<{ ok: boolean }>("/me/password", body),
  updateAvatar: (body: { avatarId?: string; avatarBg?: string }) =>
    http.patch<PublicUser>("/me/avatar", body),
};

// ---- Two-step sign-in (any signed-in role) ----
export const twoFactorApi = {
  status: () => http.get<TwoFactorStatus>("/auth/two-factor"),
  /** Returns the seed ONCE; confirm with a first code to turn it on. */
  setup: () => http.post<{ secret: string; otpauthUri: string }>("/auth/two-factor/setup"),
  confirm: (code: string) =>
    http.post<{ recoveryCodes: string[] }>("/auth/two-factor/confirm", { code }),
  disable: (body: { password: string; code: string }) =>
    http.post<{ disabled: true }>("/auth/two-factor/disable", body),
  regenerateRecoveryCodes: (body: { password: string; code: string }) =>
    http.post<{ recoveryCodes: string[] }>("/auth/two-factor/recovery-codes", body),
};

// ---- Internal receipts (not tax invoices) ----
export const receiptsApi = {
  get: (id: string) => http.get<ReceiptView>(`/receipts/${id}`),
};

// ---- Catalog ----
export interface CatalogPermission {
  id: string;
  code: string;
  label: string;
  description: string | null;
}

export interface CatalogIntegration {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string | null;
  description: string | null;
}

export const catalogApi = {
  categories: () => http.get<Category[]>("/categories"),
  /** Taxonomy v2 — active industries with product counts. */
  industries: () => http.get<Industry[]>("/industries"),
  permissions: () => http.get<CatalogPermission[]>("/reference/permissions"),
  integrations: () => http.get<CatalogIntegration[]>("/reference/integrations"),
};

// ---- Agents (public) ----
export const agentsApi = {
  list: (query: AgentListQuery) =>
    http.get<AgentListResult>("/agents", query as never),
  /** Buyer Discovery — autocomplete (products, categories, use cases, popular searches). */
  suggest: (q: string) => http.get<SearchSuggestions>("/agents/suggest", { q }),
  /** Facet counts for the current query/filters (each facet ignores its own filter). */
  facets: (query: DiscoveryListQuery) =>
    http.get<AgentFacets>("/agents/facets", query as never),
  /** Zero-result guidance: near matches, categories, popular products. */
  noResults: (query: DiscoveryListQuery) =>
    http.get<NoResultsGuidance>("/agents/discovery/no-results", query as never),
  detail: (slug: string) => http.get<AgentDetail>(`/agents/${slug}`),
  reviews: (slug: string, page = 1, pageSize = 10) =>
    http.get<Paginated<ReviewSummary>>(`/agents/${slug}/reviews`, {
      page,
      pageSize,
    }),
  /**
   * Gap closure — a real demo/preview open. The server de-duplicates per
   * visitor per day and excludes the owner and bots. Fire-and-forget.
   */
  demoClick: (
    slug: string,
    body: { visitorId?: string; source?: string } = {},
  ) => http.post<void>(`/agents/${slug}/demo-click`, body),
  /** Gap closure — the usage guide really came into view (de-duplicated server-side). */
  documentationView: (
    slug: string,
    body: { visitorId?: string; source?: string } = {},
  ) =>
    http.post<{ recorded: boolean }>(
      `/agents/${slug}/documentation-view`,
      body,
    ),
  /** Gap closure — public version history + release notes (live products only). */
  versions: (slug: string) =>
    http.get<PublicVersionHistory>(`/agents/${slug}/versions`),
};

// ---- Gap closure — favorites + library access ----
export const engagementApi = {
  /** Idempotent: saving twice keeps one row and one interest event. */
  favorite: (slug: string) =>
    http.post<{ favorited: boolean }>(`/agents/${slug}/favorite`),
  unfavorite: (slug: string) =>
    http.delete<{ favorited: boolean }>(`/agents/${slug}/favorite`),
  /** Slugs of my saved live products — renders the card-level save buttons. */
  favoriteSlugs: () => http.get<{ slugs: string[] }>("/me/favorites/ids"),
  myFavorites: (page = 1, pageSize = 20) =>
    http.get<FavoritesResult>("/me/favorites", { page, pageSize }),
  /** Records a real library open by an entitled buyer (403 NOT_ENTITLED otherwise). */
  access: (slug: string) =>
    http.post<{ recorded: boolean }>(`/agents/${slug}/access`),
};

// ---- Gap closure — media storage ----
export const storageApi = {
  capabilities: () => http.get<StorageCapabilities>("/storage/capabilities"),
  upload: (agentId: string, kind: MediaKind, file: File) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    return http.post<UploadedMedia>(
      `/creators/me/agents/${agentId}/media`,
      form,
    );
  },
  /** §13 — creator profile picture; 503 STORAGE_DISABLED when no driver. */
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return http.post<UploadedMedia>("/creators/me/avatar", form);
  },
};

// ---- Commerce (buyer) ----
export const commerceApi = {
  /**
   * `promotionId` (A5 §9) is attribution only — the server validates it.
   * `expectedAmount` (Sprint 2, P2-01) is the IRR amount the buyer reviewed;
   * the server refuses a listing whose price no longer matches with
   * 409 PRICE_CHANGED before creating any order. Both are optional.
   */
  checkout: (slug: string, promotionId?: string | null, expectedAmount?: string | null) =>
    http.post<CheckoutResult>(`/agents/${slug}/checkout`, {
      ...(promotionId ? { promotionId } : {}),
      ...(expectedAmount ? { expectedAmount } : {}),
    }),
  acquire: (slug: string) =>
    http.post<{ entitlementId: string }>(`/agents/${slug}/acquire`),
  /** `status` is an ORDER-status group filter applied by the server. */
  myOrders: (page = 1, pageSize = 20, status?: OrderStatusGroup) =>
    http.get<Paginated<OrderView>>("/me/orders", {
      page,
      pageSize,
      ...(status ? { status } : {}),
    }),
  myOrder: (id: string) => http.get<OrderDetailView>(`/me/orders/${id}`),
  requestRefund: (orderId: string, reason: string) =>
    http.post<{ id: string; status: string }>(`/me/orders/${orderId}/refunds`, {
      reason,
    }),
  myEntitlements: () => http.get<EntitlementView[]>("/me/entitlements"),
  myEntitlement: (id: string) => http.get<EntitlementView>(`/me/entitlements/${id}`),
  myEntitlementEvents: (id: string) => http.get<EntitlementEventView[]>(`/me/entitlements/${id}/events`),
  entitlementDecision: (id: string, capability: EntitlementCapability = "product_access") =>
    http.post<EntitlementAccessDecision>(`/me/entitlements/${id}/access-decisions`, { capability }),
  /**
   * Buyer returned from the gateway: the SERVER re-verifies with the
   * provider and finalizes (idempotent — safe on refresh/back-button).
   */
  confirmPayment: (transactionId: string, status: "OK" | "NOK") =>
    http.post<PaymentConfirmResult>("/payments/confirm", {
      transactionId,
      status,
    }),
  /**
   * Dev/test sandbox only: simulate a gateway FAILURE through the real
   * signed-webhook pipeline (the backend refuses this outside dev/test).
   */
  sandboxFail: (transactionId: string) =>
    http.post<{ status: string }>("/payments/sandbox/fail", { transactionId }),
};

// ---- Reviews ----
export const reviewsApi = {
  mineOnAgent: (slug: string) =>
    http.get<ReviewRow | null>(`/agents/${slug}/review`),
  submit: (
    slug: string,
    body: { rating: number; text: string } & StructuredReviewInput,
  ) => http.post<ReviewRow>(`/agents/${slug}/review`, body),
  update: (
    slug: string,
    body: { rating?: number; text?: string } & StructuredReviewInput,
  ) => http.patch<ReviewRow>(`/agents/${slug}/review`, body),
  myReviews: (page = 1, pageSize = 10) =>
    http.get<Paginated<MyReview>>("/me/reviews", { page, pageSize }),
  /** Author-controlled visibility (reversible). Removed reviews answer 409. */
  hideMine: (id: string) => http.post<MyReview>(`/me/reviews/${id}/hide`),
  unhideMine: (id: string) => http.post<MyReview>(`/me/reviews/${id}/unhide`),
  /** A5 §11 — the creator review center (filters + real counts). */
  onMyAgents: (
    query: {
      page?: number;
      pageSize?: number;
      filter?: CreatorReviewFilter;
      agentId?: string;
    } = {},
  ) =>
    http.get<CreatorReviewPage>("/creators/me/agents/reviews", {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      ...(query.filter && query.filter !== "all"
        ? { filter: query.filter }
        : {}),
      ...(query.agentId ? { agentId: query.agentId } : {}),
    }),
  reviewSummary: (agentId?: string) =>
    http.get<CreatorReviewSummary>("/creators/me/agents/reviews/summary", {
      ...(agentId ? { agentId } : {}),
    }),
  reply: (reviewId: string, body: string) =>
    http.post<{ id: string }>(`/reviews/${reviewId}/reply`, { body }),
  /** A5 §12 — edit the public reply and/or mark it fixed in a real version. */
  updateReply: (
    reviewId: string,
    body: { body?: string; resolvedInVersion?: string | null },
  ) => http.patch<{ id: string }>(`/reviews/${reviewId}/reply`, body),
  /** A5 §37 — report one review to moderators. */
  report: (reviewId: string, body: { reason: string; description?: string }) =>
    http.post<{ id: string; status: string }>(
      `/reviews/${reviewId}/report`,
      body,
    ),
};

// ---- Reports ----
export const reportsApi = {
  submit: (
    slug: string,
    body: { reason: string; description?: string; evidence?: string[] },
  ) =>
    http.post<{ id: string; status: string }>(`/agents/${slug}/report`, body),
  mine: (page = 1, pageSize = 10) =>
    http.get<Paginated<ReportView>>("/me/reports", { page, pageSize }),
  getMine: (id: string) => http.get<ReportView>(`/me/reports/${id}`),
};

// ---- Support (Batch 3) ----
/** Sprint 1 (C) — public website contact form; anonymous, persisted server-side. */
export const contactApi = {
  send: (body: {
    name: string;
    email: string;
    topic: "general" | "purchase" | "creator" | "partnership" | "privacy" | "bug";
    message: string;
    locale?: "fa" | "en";
    /** Honeypot — the visible form never sets it. */
    website?: string;
  }) =>
    http.post<{ id: string; status: "new"; receivedAt: string; notificationQueued: boolean }>("/contact", body, {
      skipAuth: true,
    }),
};

/** Sprint 1 (D) — the only public health probe (`GET /health`); 503 when the database is down. */
export const healthApi = {
  check: () => http.get<{ status: string; database: string; time: string }>("/health", undefined, true),
};

export const supportApi = {
  list: () => http.get<SupportRequestListItem[]>("/support/requests"),
  get: (id: string) =>
    http.get<SupportRequestDetail>(`/support/requests/${id}`),
  create: (body: CreateSupportRequest) =>
    http.post<SupportRequestDetail>("/support/requests", body),
  sendMessage: (id: string, message: string) =>
    http.post<SupportRequestDetail>(`/support/requests/${id}/messages`, {
      message,
    }),
  close: (id: string) =>
    http.patch<SupportRequestDetail>(`/support/requests/${id}/close`),
  updateStatus: (id: string, status: SupportStatus) =>
    http.patch<SupportRequestDetail>(`/support/requests/${id}/status`, {
      status,
    }),
};

// ---- Notifications ----
export const notificationsApi = {
  // filter: 'all' (default) | 'unread' | 'read' — server-side state filter.
  list: (
    page = 1,
    pageSize = 20,
    filter: "all" | "unread" | "read" = "all",
    type?: string,
  ) =>
    http.get<Paginated<Notification>>("/me/notifications", {
      page,
      pageSize,
      filter,
      ...(type ? { type } : {}),
    }),
  /** Types the user actually has — drives the type filter (no empty options). */
  types: () => http.get<{ types: string[] }>("/me/notifications/types"),
  markUnread: (id: string) =>
    http.patch<{ ok: boolean }>(`/me/notifications/${id}/unread`),
  unreadCount: () =>
    http.get<{ count: number }>("/me/notifications/unread-count"),
  markRead: (id: string) =>
    http.patch<{ ok: boolean }>(`/me/notifications/${id}/read`),
  markAllRead: () => http.post<{ ok: boolean }>("/me/notifications/read-all"),
};

// ---- Creators ----
export interface UpdateCreatorProfilePayload {
  displayName?: string;
  slug?: string;
  bio?: string;
  avatarUrl?: string | null;
  websiteUrl?: string | null;
  socialLinks?: string[];
  expertise?: string[];
  activityAreas?: string[];
  /** Gap closure — personalization (owner-only) + public tools / location. */
  creatorGoal?: CreatorGoal | null;
  experienceLevel?: ExperienceLevel | null;
  productReadiness?: ProductReadinessAnswer | null;
  tools?: string[];
  locationCountry?: string | null;
  locationCity?: string | null;
  showLocation?: boolean;
  /** Whether the public profile (and agent cards) show a picture at all. */
  showAvatar?: boolean;
}

export const creatorsApi = {
  become: (body: {
    displayName?: string;
    bio?: string;
    expertise?: string[];
  }) => http.post<{ slug: string; status: string }>("/creators/become", body),
  myProfile: () => http.get<CreatorProfile | null>("/creators/me/profile"),
  myShowcase: () => http.get<CreatorShowcaseView>("/creators/me/showcase"),
  updateMyShowcase: (agentIds: string[]) =>
    http.put<CreatorShowcaseView>("/creators/me/showcase", { agentIds }),
  myStats: () => http.get<CreatorStats>("/creators/me/stats"),
  entitlementSummary: () => http.get<CreatorEntitlementSummary>("/creators/me/entitlement-summary"),
  /**
   * Owner-only update. Optional URL fields accept '' / null to clear.
   * Returns the refreshed owner view.
   */
  updateMyProfile: (body: UpdateCreatorProfilePayload) =>
    http.patch<CreatorProfile>("/creators/me/profile", body),
  /** Creator Foundation: status, completeness, onboarding, checklist, milestones, next action. */
  foundation: () => http.get<CreatorFoundation>("/creators/me/foundation"),
  /** Persist onboarding navigation (idempotent); returns the fresh foundation. */
  updateOnboarding: (
    action: CreatorOnboardingAction,
    step?: CreatorOnboardingStep,
  ) =>
    http.patch<CreatorFoundation>(
      "/creators/me/onboarding",
      step ? { action, step } : { action },
    ),
  publicProfile: (slug: string) =>
    http.get<CreatorProfileView>(`/creators/${slug}`),
  publicPortfolio: (slug: string) =>
    http.get<{ items: AgentCard[] }>(
      `/creators/${encodeURIComponent(slug)}/portfolio`,
    ),
  submitVerification: () =>
    http.post<{ verificationStatus: string }>(
      "/creators/me/verification/submit",
    ),
  /** Gap closure — rule-based product ideas from the creator's own answers. */
  ideaSuggestions: () =>
    http.get<IdeaSuggestions>("/creators/me/idea-suggestions"),
  /** Admin-authored opportunities matched to the current creator profile. */
  myOpportunities: () =>
    http.get<CreatorOpportunityFeedItem[]>("/creators/me/opportunities"),
};

export interface SaveAgentPayload {
  name: string;
  /** Optional since Phase A2 (draft-first) — the submit gate enforces it. */
  fullDescription?: string;
  shortDescription?: string;
  slug?: string;
  logoUrl?: string | null;
  demoVideoUrl?: string | null;
  keywords?: string[];
  capabilities?: Array<{ title: string; description?: string }>;
  limitations?: string[];
  useCases?: string[];
  targetAudience?: string[];
  inputs?: string[];
  outputs?: string[];
  howItWorks?: Array<{ title: string; description?: string }>;
  exampleInput?: string | null;
  exampleOutput?: string | null;
  usageGuide?: string | null;
  demoUrl?: string | null;
  price?: number;
  isFree?: boolean;
  /** Taxonomy v2 — industry slugs (max 3). Omitting keeps the stored ones. */
  industries?: string[];
  // NOTE: riskLevel is intentionally NOT settable anymore — the backend
  // derives it from the declared access profile (Creator Studio §7).
  category?: string | null;
  // ---- Phase 1 commercial terms (declarations only; server validates).
  commercialProfile?: import('./types').CommercialProfile | null;
  // ---- Product Contract (§5–§20): creator declarations only.
  // usageModel is intentionally NOT settable — the backend derives it
  // from isFree/price (§39 decisions 9–10).
  productType?: ProductTypeName | null;
  buildTool?: BuildToolName | null;
  buildToolDetail?: string | null;
  deliveryModel?: DeliveryModelName | null;
  executionModel?: ExecutionModelName | null;
  hostingResponsibility?: HostingResponsibilityName | null;
  whatBuyerReceives?: string[];
  whatBuyerDoesNotReceive?: string[];
  additionalCosts?: Array<{ label: string; note?: string | null }>;
  supportOwner?: "creator" | "agenthub" | null;
  supportScope?: string | null;
  supportPeriod?: string | null;
  permissions?: Array<{ code: string; reason?: string; required?: boolean }>;
  integrations?: Array<{ slug: string; purpose?: string }>;
  requirements?: Array<{
    type: string;
    name?: string | null;
    description: string;
    reason?: string | null;
    required?: boolean;
  }>;
  dataPolicy?: {
    storesUserData?: boolean;
    retentionDays?: number | null;
    processingLocation?: string | null;
    sharesWithThirdParties?: boolean;
    thirdParties?: string[];
    handlesSensitiveData?: boolean;
    sensitiveDataCategories?: string[];
    dataAccessed?: string[];
    inputsDescription?: string;
    outputsDescription?: string;
    storedData?: string[];
  };
  // ---- Product Creation (Phase A2)
  problemStatement?: string;
  bestFor?: string[];
  notFor?: string[];
  infrastructureNeeds?: string | null;
  noRequirements?: boolean;
  pricingNote?: string | null;
  coverUrl?: string | null;
  screenshots?: string[];
  /** Resume point (creator-only). */
  wizardStep?: string;
  /** A5 §19 — duplicated groups the creator explicitly re-confirmed. */
  confirmDuplicated?: DuplicateConfirmGroup[];
  /** Optimistic concurrency: the revision this save is based on (409 when stale). */
  revision?: number;
}

export const creatorAgentsApi = {
  list: (page = 1, pageSize = 20) =>
    http.get<{ items: CreatorAgentCard[]; total: number }>(
      "/creators/me/agents",
      { page, pageSize },
    ),
  create: (body: SaveAgentPayload) =>
    http.post<DraftSaveResult>("/creators/me/agents", body),
  update: (id: string, body: SaveAgentPayload) =>
    http.post<DraftSaveResult>(`/creators/me/agents/${id}`, body),
  /** A5 §18–§19 — start a second product from one of your own. */
  duplicate: (id: string, mode: "duplicate" | "complement") =>
    http.post<DraftSaveResult>(`/creators/me/agents/${id}/duplicate`, { mode }),
  /** Preview as buyer (A2 §23): the working copy in the public detail shape. */
  preview: (id: string) =>
    http.get<AgentDetail>(`/creators/me/agents/${id}/preview`),
  status: (id: string) =>
    http.get<AgentStatusView>(`/creators/me/agents/${id}/status`),
  /**
   * A3 §6–§8: creates an immutable revision (idempotent server-side — a
   * replay answers 409, never a duplicate). `note` explains a resubmission.
   */
  submit: (id: string, note?: string) =>
    http.post<SubmitResult>(
      `/creators/me/agents/${id}/submit`,
      note?.trim() ? { note: note.trim() } : {},
    ),
  get: (id: string) =>
    http.get<CreatorAgentDetail>(`/creators/me/agents/${id}`),
  versions: (id: string) =>
    http.get<VersionView[]>(`/creators/me/agents/${id}/versions`),
  newVersion: (id: string) =>
    http.post<{ id: string; versionNumber: string; status: string }>(
      `/creators/me/agents/${id}/new-version`,
    ),
  readiness: (id: string) =>
    http.get<ReadinessView>(`/creators/me/agents/${id}/readiness`),
  dashboard: () => http.get<DashboardView>("/creators/me/agents/dashboard"),
  sales: (query: CreatorSalesQuery) =>
    http.get<CreatorSalesResult>("/creators/me/agents/sales", { ...query }),
  /** Gap closure — release notes of the version being prepared (409 CHANGELOG_LOCKED once in review). */
  updateChangelog: (id: string, body: Partial<AgentChangelog>) =>
    http.put<ChangelogState>(`/creators/me/agents/${id}/changelog`, body),
  /** A4 §22 — one sale of the creator's own products (404 for anyone else's). */
  saleDetail: (orderId: string) =>
    http.get<CreatorSaleDetail>(
      `/creators/me/agents/sales/${encodeURIComponent(orderId)}`,
    ),
};

// ---- Phase A4 — Launch & Growth (creator) ----
export const growthApi = {
  publishChecklist: (id: string) =>
    http.get<PublishChecklistView>(
      `/creators/me/agents/${id}/publish-checklist`,
    ),
  /** Server-authoritative Epic 3 readiness; publication still re-checks it transactionally. */
  releaseReadiness: (id: string) => http.get<ReleaseGateReadiness>(`/creators/me/agents/${id}/release-readiness`),
  /** Idempotent: a replay answers `{ alreadyPublished: true }`, never a duplicate. */
  publish: (id: string) =>
    http.post<PublishResult>(`/creators/me/agents/${id}/publish`),
  unpublish: (id: string, reason?: string) =>
    http.post<{ id: string; status: AgentStatus; alreadyUnpublished: boolean }>(
      `/creators/me/agents/${id}/unpublish`,
      reason?.trim() ? { reason: reason.trim() } : {},
    ),
  republish: (id: string) =>
    http.post<{ id: string; status: AgentStatus; alreadyPublished: boolean }>(
      `/creators/me/agents/${id}/republish`,
    ),
  launch: (id: string) =>
    http.get<LaunchOverview>(`/creators/me/agents/${id}/launch`),
  analytics: (id: string, range: AnalyticsRange) =>
    http.get<AnalyticsMetrics & { agentId: string }>(
      `/creators/me/agents/${id}/analytics`,
      { range },
    ),
  /** Records a REAL share action (server de-duplicates bursts). */
  shareEvent: (id: string, channel: ShareChannel) =>
    http.post<{ recorded: boolean }>(`/creators/me/agents/${id}/share-events`, {
      channel,
    }),
  promotions: (id: string) =>
    http.get<PromotionView[]>(`/creators/me/agents/${id}/promotions`),
  requestPromotion: (
    id: string,
    body: { type: PromotionType; message?: string; preferredStartAt?: string },
  ) =>
    http.post<{ promotion: PromotionView; alreadyRequested: boolean }>(
      `/creators/me/agents/${id}/promotions`,
      body,
    ),
  cancelPromotion: (promotionId: string) =>
    http.post<PromotionView>(`/creators/me/promotions/${promotionId}/cancel`),
  launchCenter: () => http.get<LaunchCenter>("/creators/me/launch-center"),
  creatorAnalytics: (range: AnalyticsRange, agentId?: string) =>
    http.get<CreatorAnalyticsResponse>("/creators/me/analytics", {
      range,
      ...(agentId ? { agentId } : {}),
    }),
  // ---- Phase A5 — Creator Growth ----
  growthCenter: () => http.get<GrowthCenter>("/creators/me/growth"),
  portfolio: () =>
    http.get<{ items: PortfolioItem[] }>("/creators/me/portfolio"),
  reviewInsights: (agentId?: string) =>
    http.get<ReviewInsights>(
      "/creators/me/review-insights",
      agentId ? { agentId } : undefined,
    ),
  productInsights: (id: string, range: AnalyticsRange = "30d") =>
    http.get<ProductInsights>(`/creators/me/agents/${id}/insights`, { range }),
};

// ---- Phase A5 — admin growth overview ----
export const adminGrowthApi = {
  overview: () => http.get<AdminGrowthOverview>("/admin/growth/overview"),
  /** Gap closure (P18) — the same product insights, read-only for admins. */
  productInsights: (agentId: string, range: AnalyticsRange = "30d") =>
    http.get<ProductInsights>(`/admin/growth/agents/${agentId}/insights`, {
      range,
    }),
};

// ---- Phase A4 — public growth surface ----
export const publicGrowthApi = {
  /** Labelled «Sponsored» placement — a separate row, never mixed into ranking. */
  promoted: (
    placement: "marketplace_featured" | "category_boost",
    category?: string,
  ) =>
    http.get<PromotedPlacementView>(
      "/promoted",
      category ? { placement, category } : { placement },
    ),
  /** Real product view beacon; the server de-duplicates and ignores owners/staff/bots. */
  recordView: (
    slug: string,
    body: { visitorId?: string; source?: string; promotionId?: string },
  ) =>
    http.post<{ counted: boolean; reason?: string }>(
      `/agents/${encodeURIComponent(slug)}/view`,
      body,
    ),
  /** A5 §23 — listing cards that were really visible (server de-duplicates). */
  recordImpressions: (body: {
    slugs: string[];
    visitorId?: string;
    source?: string;
  }) => http.post<{ recorded: number }>("/agents/impressions", body),
  /** A5 §9 — sponsored card shown / clicked (forged ids are ignored server-side). */
  recordPromotionEvent: (
    promotionId: string,
    kind: "impression" | "click",
    visitorId?: string,
  ) =>
    http.post<{ recorded: boolean }>(
      `/agents/promotions/${encodeURIComponent(promotionId)}/${kind}`,
      visitorId ? { visitorId } : {},
    ),
};

// ---- Phase A4 — admin promotion requests ----
export const adminPromotionsApi = {
  list: (query: {
    status?: PromotionStatus;
    type?: PromotionType;
    page?: number;
    pageSize?: number;
  }) =>
    http.get<{
      items: AdminPromotionView[];
      total: number;
      counts: Record<string, number>;
    }>("/admin/promotions", query),
  get: (id: string) => http.get<AdminPromotionView>(`/admin/promotions/${id}`),
  startReview: (id: string) =>
    http.post<AdminPromotionView>(`/admin/promotions/${id}/start-review`),
  approve: (
    id: string,
    body: { startAt?: string; endAt?: string; note?: string },
  ) => http.post<AdminPromotionView>(`/admin/promotions/${id}/approve`, body),
  schedule: (
    id: string,
    body: { startAt?: string; endAt?: string; note?: string },
  ) => http.post<AdminPromotionView>(`/admin/promotions/${id}/schedule`, body),
  reject: (id: string, reason: string) =>
    http.post<AdminPromotionView>(`/admin/promotions/${id}/reject`, { reason }),
  publish: (id: string, publishedUrl?: string) =>
    http.post<AdminPromotionView>(
      `/admin/promotions/${id}/publish`,
      publishedUrl?.trim() ? { publishedUrl: publishedUrl.trim() } : {},
    ),
  complete: (id: string) =>
    http.post<AdminPromotionView>(`/admin/promotions/${id}/complete`),
};

// ---- Admin ----
export const adminApi = {
  users: (query: {
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) =>
    http.get<{ items: AdminUserRow[]; total: number }>("/admin/users", query),
  changeUserState: (id: string, body: { role?: Role; status?: UserStatus }) =>
    http.patch<{ ok: boolean }>(`/admin/users/${id}/state`, body),
  agents: (query: {
    status?: string;
    q?: string;
    creatorId?: string;
    page?: number;
    pageSize?: number;
  }) =>
    http.get<{ items: AdminAgentRow[]; total: number }>("/admin/agents", query),
  agentDetail: (id: string) =>
    http.get<{
      id: string;
      name: string;
      slug: string;
      status: string;
      creator: { id: string; displayName: string; slug: string } | null;
      publishedVersion: string | null;
      securityReview: {
        verdict: string | null;
        review_created_at: string;
        items: Array<{
          item_key: string;
          passed: boolean | null;
          note: string | null;
        }>;
      } | null;
    }>(`/admin/agents/${id}`),
  /** Gap closure — every version with its release notes. */
  agentVersions: (id: string) =>
    http.get<AdminVersionList>(`/admin/agents/${id}/versions`),
  /** Gap closure — correct a (published) version's release notes (audited). */
  updateVersionChangelog: (
    id: string,
    versionId: string,
    body: Partial<AgentChangelog>,
  ) =>
    http.put<{ id: string; changelog: AgentChangelog | null }>(
      `/admin/agents/${id}/versions/${versionId}/changelog`,
      body,
    ),
  suspendAgent: (id: string, reason: string) =>
    http.post<{ id: string; status: string }>(`/admin/agents/${id}/suspend`, {
      reason,
    }),
  unpublishAgent: (id: string, reason: string) =>
    http.post<{ id: string; status: string }>(`/admin/agents/${id}/unpublish`, {
      reason,
    }),
  creators: (query: {
    status?: string;
    verificationStatus?: string;
    q?: string;
  }) =>
    http.get<{ items: AdminCreatorRow[]; total: number }>(
      "/admin/creators",
      query,
    ),
  approveCreator: (id: string) =>
    http.post<CreatorProfile>(`/admin/creators/${id}/approve`),
  suspendCreator: (id: string, reason: string) =>
    http.post<CreatorProfile>(`/admin/creators/${id}/suspend`, { reason }),
  setCreatorVerification: (
    id: string,
    status: "verified" | "revoked",
    note?: string,
  ) =>
    http.post<CreatorProfile>(`/admin/creators/${id}/verification`, {
      status,
      note,
    }),
  reports: (query: { status?: string; page?: number; pageSize?: number }) =>
    http.get<{ items: AdminReportRow[]; total: number }>(
      "/admin/reports",
      query,
    ),
  startReportReview: (id: string) =>
    http.post<{ id: string; status: string }>(`/admin/reports/${id}/review`),
  decideReport: (
    id: string,
    body: {
      decision: "resolve" | "reject";
      resolution?: string;
      suspendAgent?: boolean;
      removeReview?: boolean;
    },
  ) => http.post<{ id: string }>(`/admin/reports/${id}/decision`, body),
  entitlements: (query: { state?: string; page?: number; pageSize?: number }) =>
    http.get<{ items: AdminEntitlementRow[]; total: number }>("/admin/entitlements", query),
  entitlementEvents: (id: string) => http.get<EntitlementEventView[]>(`/admin/entitlements/${id}/events`),
  suspendEntitlement: (id: string) => http.post<AdminEntitlementRow>(`/admin/entitlements/${id}/suspend`),
  restoreEntitlement: (id: string) => http.post<AdminEntitlementRow>(`/admin/entitlements/${id}/restore`),
  orders: (query: { status?: string; page?: number; pageSize?: number }) =>
    http.get<{ items: AdminOrderRow[]; total: number }>("/admin/orders", query),
  payments: (query: { status?: string; page?: number; pageSize?: number }) =>
    http.get<{ items: AdminPaymentRow[]; total: number }>(
      "/admin/payments",
      query,
    ),
  refunds: (query: { status?: string; page?: number; pageSize?: number }) =>
    http.get<{ items: AdminRefundRow[]; total: number }>(
      "/admin/refunds",
      query,
    ),
  decideRefund: (id: string, decision: "approve" | "reject", note?: string) =>
    http.post<{ id: string; status: string }>(`/admin/refunds/${id}/decision`, {
      decision,
      note,
    }),
  auditLogs: (query: {
    action?: string;
    actorId?: string;
    entity?: string;
    page?: number;
    pageSize?: number;
  }) =>
    http.get<{ items: AuditLogRow[]; total: number }>(
      "/admin/audit-logs",
      query,
    ),
  stats: () =>
    http.get<{
      pendingCreators: number;
      pendingVerifications: number;
      submittedAgents: number;
      openReports: number;
      requestedRefunds: number;
      openSupport: number;
    }>("/admin/stats"),
  // ---- Taxonomy v2 (admin) --------------------------------------------------
  categories: () => http.get<AdminCategory[]>("/admin/categories"),
  createCategory: (body: TaxonomyCategoryInput) =>
    http.post<AdminCategory>("/admin/categories", body),
  updateCategory: (id: string, body: TaxonomyCategoryInput) =>
    http.patch<AdminCategory>(`/admin/categories/${id}`, body),
  industries: () => http.get<AdminIndustry[]>("/admin/industries"),
  createIndustry: (body: TaxonomyIndustryInput) =>
    http.post<AdminIndustry>("/admin/industries", body),
  updateIndustry: (id: string, body: TaxonomyIndustryInput) =>
    http.patch<AdminIndustry>(`/admin/industries/${id}`, body),
};

// ---- Phase A3 — Review workflow ----------------------------------------------

/** Creator side: Review Center (A3 §10, §16–§22). */
export const creatorReviewApi = {
  list: (page = 1, pageSize = 20) =>
    http.get<CreatorReviewList>("/creators/me/reviews", { page, pageSize }),
  get: (agentId: string) =>
    http.get<CreatorReviewView>(`/creators/me/agents/${agentId}/review`),
  revision: (agentId: string, submissionId: string) =>
    http.get<RevisionPreview>(
      `/creators/me/agents/${agentId}/review/revisions/${submissionId}`,
    ),
  /** §22 — «اصلاح کردم» (or re-open). The reviewer still has the last word. */
  resolveFeedback: (
    agentId: string,
    feedbackId: string,
    resolved: boolean,
    note?: string,
  ) =>
    http.patch<ReviewFeedback>(
      `/creators/me/agents/${agentId}/review/feedback/${feedbackId}`,
      {
        resolved,
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
    ),
};

/** Admin side: queue + workspace + actions (A3 §23–§31). */
export const adminReviewApi = {
  queue: (query: ReviewQueueQuery) =>
    http.get<ReviewQueue>(
      "/admin/reviews",
      query as Record<string, string | number | undefined>,
    ),
  get: (agentId: string) =>
    http.get<ReviewWorkspace>(`/admin/reviews/${agentId}`),
  revision: (agentId: string, submissionId: string) =>
    http.get<RevisionPreview>(
      `/admin/reviews/${agentId}/revisions/${submissionId}`,
    ),
  start: (agentId: string) =>
    http.post<ReviewActionResult>(`/admin/reviews/${agentId}/start`),
  saveChecklist: (agentId: string, checklist: Record<string, boolean>) =>
    http.put<{ state: Record<string, boolean>; missing: string[] }>(
      `/admin/reviews/${agentId}/checklist`,
      {
        checklist,
      },
    ),
  createFeedback: (agentId: string, body: FeedbackDraft) =>
    http.post<ReviewFeedback>(`/admin/reviews/${agentId}/feedback`, body),
  updateFeedback: (
    agentId: string,
    feedbackId: string,
    body: Partial<FeedbackDraft> & {
      status?: "open" | "accepted" | "needs_more_changes";
    },
  ) =>
    http.patch<ReviewFeedback>(
      `/admin/reviews/${agentId}/feedback/${feedbackId}`,
      body,
    ),
  deleteFeedback: (agentId: string, feedbackId: string) =>
    http.delete<{ id: string; deleted: boolean }>(
      `/admin/reviews/${agentId}/feedback/${feedbackId}`,
    ),
  requestChanges: (
    agentId: string,
    body: { note?: string; feedback?: FeedbackDraft[] },
  ) =>
    http.post<ReviewActionResult>(
      `/admin/reviews/${agentId}/request-changes`,
      body,
    ),
  approve: (
    agentId: string,
    body: {
      publishNow: boolean;
      note?: string;
      checklist?: Record<string, boolean>;
      /** Evidence for the «Listing Reviewed» badge (pre-A3 security checklist). */
      securityChecklist?: Array<{
        key: string;
        passed: boolean;
        note?: string;
      }>;
    },
  ) => http.post<ReviewActionResult>(`/admin/reviews/${agentId}/approve`, body),
  reject: (
    agentId: string,
    body: { reasonCategory: string; reason: string; explanation: string },
  ) => http.post<ReviewActionResult>(`/admin/reviews/${agentId}/reject`, body),
  returnToReview: (agentId: string, note?: string) =>
    http.post<ReviewActionResult>(
      `/admin/reviews/${agentId}/return`,
      note?.trim() ? { note: note.trim() } : {},
    ),
  publish: (agentId: string, note?: string) =>
    http.post<ReviewActionResult>(
      `/admin/reviews/${agentId}/publish`,
      note?.trim() ? { note: note.trim() } : {},
    ),
};

// ---------------------------------------------------------------------------
// Phase C1 — Creator CRM (admin only; the API enforces the role, the UI
// simply never surfaces it to a non-admin).
// ---------------------------------------------------------------------------

export interface CrmListQuery {
  search?: string;
  stage?: string;
  source?: string;
  scoreBand?: string;
  ownerId?: string;
  activity?: string;
  productStatus?: string;
  tags?: string;
  hasNextAction?: boolean;
  resolved?: "yes" | "no";
  segmentSlug?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** Serialises a list query, dropping empty values so the URL stays readable. */
function buildQuery(query: CrmListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

/**
 * Phase C2 §28 — the lead-import preview contract, owned by the API layer.
 * Declared here (not in the page) so the transport and the consumer cannot
 * drift apart: a renamed field becomes a compile error on both sides.
 */
export interface ImportRowReport {
  row: number;
  email: string;
  name: string | null;
  status: "valid" | "duplicate" | "invalid";
  problems: string[];
  existingLeadId?: string;
}

export interface ImportPreview {
  importId: string;
  filename: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  createCount: number;
  updateCount: number;
  report: ImportRowReport[];
}

export const crmApi = {
  meta: () => http.get<CrmMeta>("/admin/crm/meta"),
  kpis: () => http.get<CrmKpis>("/admin/crm/kpis"),
  dashboard: () => http.get<CrmDashboard>("/admin/crm/dashboard"),
  revenueAttribution: () =>
    http.get<CrmRevenueAttribution>("/admin/crm/revenue-attribution"),
  /** C2 — which channels bring leads who reply and convert. */
  acquisitionAnalytics: () =>
    http.get<CrmAcquisitionAnalytics>("/admin/crm/acquisition-analytics"),
  automationReadiness: () =>
    http.get<CrmAutomationReadiness>("/admin/crm/automation-readiness"),

  list: (query: CrmListQuery) =>
    http.get<{
      items: CrmCreatorRow[];
      meta: { page: number; pageSize: number; total: number };
    }>(
      "/admin/crm/creators",
      query as Record<string, string | number | boolean | null | undefined>,
    ),

  detail: (leadId: string) =>
    http.get<CrmLeadDetail>(`/admin/crm/leads/${leadId}`),
  timeline: (leadId: string, page = 1, pageSize = 30) =>
    http.get<{ items: CrmTimelineItem[]; meta: { total: number } }>(
      `/admin/crm/leads/${leadId}/timeline`,
      { page, pageSize } as Record<
        string,
        string | number | boolean | null | undefined
      >,
    ),

  createLead: (body: Record<string, unknown>) =>
    http.post<CrmLeadRef>("/admin/crm/leads", body),
  updateLead: (leadId: string, body: Record<string, unknown>) =>
    http.patch<CrmLeadRef>(`/admin/crm/leads/${leadId}`, body),

  addNote: (leadId: string, body: { body: string }) =>
    http.post<CrmNote>(`/admin/crm/leads/${leadId}/notes`, body),
  deleteNote: (leadId: string, noteId: string) =>
    http.delete<void>(`/admin/crm/leads/${leadId}/notes/${noteId}`),

  addAction: (leadId: string, body: Record<string, unknown>) =>
    http.post<CrmAction>(`/admin/crm/leads/${leadId}/actions`, body),
  updateAction: (
    leadId: string,
    actionId: string,
    body: Record<string, unknown>,
  ) =>
    http.patch<CrmAction>(
      `/admin/crm/leads/${leadId}/actions/${actionId}`,
      body,
    ),
  actionQueue: (query: { assignedToId?: string; limit?: number }) =>
    http.get<{ items: CrmQueueAction[]; total: number }>("/admin/crm/actions", {
      ...query,
    } as Record<string, string | number | boolean | null | undefined>),

  logOutreach: (leadId: string, body: { channel: string; summary: string }) =>
    http.post<CrmLeadRef>(`/admin/crm/leads/${leadId}/outreach`, body),

  // ---- C2: the acquisition conversation -------------------------------
  // Every one of these records a FACT; none of them sets a stage. The
  // backend derives the stage, so the UI has no way to fake a funnel.
  recordReply: (leadId: string, body: { channel: string; summary: string }) =>
    http.post<{ recorded: boolean }>(
      `/admin/crm/leads/${leadId}/replied`,
      body,
    ),
  recordInterest: (
    leadId: string,
    body: { channel: string; summary: string },
  ) =>
    http.post<{ recorded: boolean }>(
      `/admin/crm/leads/${leadId}/interested`,
      body,
    ),
  setLost: (leadId: string, body: { lost: boolean; reason?: string }) =>
    http.post<{ lost: boolean }>(`/admin/crm/leads/${leadId}/lost`, body),

  /** Sends an invite. It does NOT create the account — that stays automatic. */
  sendConversionInvite: (
    leadId: string,
    body: { channel: string; message?: string },
  ) =>
    http.post<{ sent: boolean; reason?: string; referralCode: string }>(
      `/admin/crm/leads/${leadId}/conversion-invite`,
      body,
    ),

  // ---- C2: referral relationship --------------------------------------
  setReferrer: (leadId: string, referredById: string | null) =>
    http.post<{ referredById: string | null }>(
      `/admin/crm/leads/${leadId}/referrer`,
      { referredById },
    ),
  referredLeads: (leadId: string) =>
    http.get<{
      data: Array<{ id: string; name: string | null; outcome: string }>;
    }>(`/admin/crm/leads/${leadId}/referred`),

  // ---- C2: CSV import, always preview then commit ---------------------

  previewImport: (body: { filename: string; content: string }) =>
    // Typed as the real shape rather than Record<string, unknown>: the
    // import preview IS the admin's only chance to see what will be written,
    // so a typo in a field name must be a compile error, not a runtime
    // "undefined" in the report table.
    http.post<ImportPreview>("/admin/crm/imports/preview", body),
  commitImport: (importId: string) =>
    http.post<{ created: number; updated: number; failed: number }>(
      "/admin/crm/imports/commit",
      { importId },
    ),
  discardImport: (importId: string) =>
    http.post<{ ok: boolean }>(`/admin/crm/imports/${importId}/discard`),

  segments: () =>
    http.get<{ items: CrmSegment[]; total: number }>("/admin/crm/segments"),
  createSegment: (body: Record<string, unknown>) =>
    http.post<CrmSegment>("/admin/crm/segments", body),
  deleteSegment: (id: string) => http.delete<void>(`/admin/crm/segments/${id}`),

  views: () =>
    http.get<{ items: CrmSavedView[]; total: number }>("/admin/crm/views"),
  createView: (body: Record<string, unknown>) =>
    http.post<CrmSavedView>("/admin/crm/views", body),
  deleteView: (id: string) => http.delete<void>(`/admin/crm/views/${id}`),

  duplicates: () =>
    http.get<{ items: CrmDuplicateGroup[]; total: number }>(
      "/admin/crm/duplicates",
    ),
  merge: (sourceLeadId: string, targetLeadId: string) =>
    http.post<CrmLeadRef>(`/admin/crm/leads/${sourceLeadId}/merge`, {
      targetLeadId,
    }),
  unmerge: (sourceLeadId: string) =>
    http.post<CrmLeadRef>(`/admin/crm/leads/${sourceLeadId}/unmerge`),

  /** One audited transaction for up to 200 leads (§1). */
  bulk: (body: CrmBulkRequest) =>
    http.post<CrmBulkResult>("/admin/crm/bulk", body),

  /**
   * The export is a FILE, not an envelope: it streams CSV with a
   * `x-crm-row-count` header. It is fetched with a bearer token, so it
   * cannot be a plain <a href> — the caller turns the blob into a URL.
   */
  exportCsvUrl: (query: CrmListQuery) =>
    `${apiOrigin()}/api/v1/admin/crm/export?${buildQuery(query)}`,
  exportCsvFilename: (query: CrmListQuery) =>
    `crm-export-${query.sort ?? "created_at"}.csv`,
};

/** Phase C3 §4 — the creator's own activation surface. */
export const activationApi = {
  // The user id is NEVER taken from the client: every one of these derives
  // it from the JWT, so there is no parameter through which one creator
  // could reach another's activation state.
  get: () => http.get<CreatorActivationView>("/creator/activation"),
  progress: () =>
    http.get<{ state: ActivationState; progress: ActivationProgress }>(
      "/creator/activation/progress",
    ),
  previewIdeas: (body: {
    expertise: string;
    problemSolved: string;
    tools: string;
    workflow: string;
    repeatedTask: string;
    automated: string;
  }) =>
    http.post<{ candidates: ActivationIdeaCandidate[] }>(
      "/creator/activation/ideas/preview",
      body,
    ),
  saveIdea: (body: {
    expertise: string;
    problemSolved: string;
    tools: string;
    workflow: string;
    repeatedTask: string;
    automated: string;
    candidateIndex: number;
  }) => http.post<CreatorIdea>("/creator/activation/ideas", body),
  listIdeas: () => http.get<CreatorIdea[]>("/creator/activation/ideas"),
  selectIdea: (id: string) =>
    http.post<CreatorIdea>(`/creator/activation/ideas/${id}/select`),
  /** C3 §10 — so the product form never re-asks what was already written. */
  prefill: () =>
    http.get<{
      ideaId: string;
      name: string;
      shortDescription: string;
      useCases: string[];
      targetAudience: string[];
      rationale: string;
    }>("/creator/activation/ideas/prefill"),
  requestAssistance: (body: {
    type: AssistanceType;
    message: string;
    productId?: string | null;
    priority?: "low" | "normal" | "high";
  }) =>
    http.post<CreatorAssistanceRequest>("/creator/activation/assistance", body),
  listAssistance: () =>
    http.get<CreatorAssistanceRequest[]>("/creator/activation/assistance"),
};

/** Admin-only editorial management for explicitly targeted Creator opportunities. */
export const adminCreatorOpportunitiesApi = {
  list: () =>
    http.get<AdminCreatorOpportunity[]>("/admin/creator-opportunities"),
  create: (body: AdminCreatorOpportunityPayload) =>
    http.post<AdminCreatorOpportunity>("/admin/creator-opportunities", body),
  update: (id: string, body: Partial<AdminCreatorOpportunityPayload>) =>
    http.patch<AdminCreatorOpportunity>(
      `/admin/creator-opportunities/${id}`,
      body,
    ),
  previewAudience: (targeting: CreatorOpportunityTargeting) =>
    http.post<CreatorOpportunityAudiencePreview>(
      "/admin/creator-opportunities/audience-preview",
      { targeting },
    ),
  publish: (
    id: string,
    expectedAudience: Pick<
      CreatorOpportunityAudiencePreview,
      "matchedCount" | "eligibleCount"
    >,
  ) =>
    http.post<{
      opportunity: AdminCreatorOpportunity;
      audience: CreatorOpportunityAudiencePreview;
    }>(`/admin/creator-opportunities/${id}/publish`, expectedAudience),
  archive: (id: string) =>
    http.post<AdminCreatorOpportunity>(
      `/admin/creator-opportunities/${id}/archive`,
    ),
};

/** C3 §13–§29 — the Operations side. Admin only, enforced server-side. */
export const adminActivationApi = {
  view: (userId: string) =>
    http.get<AdminActivationView>(`/admin/creators/${userId}/activation`),
  timeline: (userId: string) =>
    http.get<{ items: Array<Record<string, unknown>>; total: number }>(
      `/admin/creators/${userId}/timeline`,
    ),
  stalled: (limit?: number) =>
    http.get<{ stalledHours: number; creators: StalledCreator[] }>(
      "/admin/creators/stalled/queue",
      limit ? { limit } : undefined,
    ),
  funnel: (sinceDays?: number) =>
    http.get<ActivationFunnelReport>(
      "/admin/creators/analytics/funnel",
      sinceDays ? { sinceDays } : undefined,
    ),
  assistanceQueue: (status?: AssistanceStatus) =>
    http.get<CreatorAssistanceRequest[]>("/admin/creators/assistance/queue", {
      ...(status ? { status } : {}),
    }),
  updateAssistance: (
    id: string,
    body: {
      status?: AssistanceStatus;
      response?: string;
      assignedAdminId?: string | null;
    },
  ) =>
    http.post<CreatorAssistanceRequest>(
      `/admin/creators/assistance/${id}`,
      body,
    ),
  sendReminder: (userId: string) =>
    http.post<{ sent: boolean; reason?: string; kind?: string }>(
      `/admin/creators/${userId}/reminders`,
    ),
};

/**
 * Phase C4 — Creator Success.
 *
 * `successApi` is standalone rather than nested under `crmApi`: C4 is a
 * creator-facing product surface, not a CRM screen, and coupling them would
 * make the C4 pages depend on admin-ish paths they have no business touching.
 */
export const successApi = {
  center: () => http.get<CreatorSuccessView>("/creator/success"),
  reviews: () => http.get<ReviewCenterView>("/creator/success/reviews"),
  decideInsight: (body: {
    insightKey: string;
    decision: "applied" | "dismissed";
  }) =>
    http.post<{ recorded: boolean }>(
      "/creator/success/insights/decision",
      body,
    ),
  viewInsight: (insightKey: string) =>
    http.post<void>("/creator/success/insights/viewed", { insightKey }),

  timeline: (page: number, limit: number) =>
    http.get<SuccessTimeline>(
      `/creator/success/timeline?page=${page}&limit=${limit}`,
    ),
  caseStudy: () =>
    http.get<CaseStudyView | null>("/creator/success/case-study"),
  startCaseStudy: () =>
    http.post<{ id: string; slug: string; status: CaseStudyStatus }>(
      "/creator/success/case-study/start",
    ),
  saveCaseStudy: (body: Partial<CaseStudyView>) =>
    http.post<{ saved: boolean; id?: string; updatedAt?: string }>(
      "/creator/success/case-study/save",
      body,
    ),
  submitCaseStudy: (body: Partial<CaseStudyView> & { consent: boolean }) =>
    http.post<{ submitted: boolean; id?: string; status?: CaseStudyStatus }>(
      "/creator/success/case-study/submit",
      body,
    ),

  referral: () =>
    http.get<{
      code: string;
      url: string;
      stats: ReferralStats;
      rows: ReferralRow[];
    }>("/creator/success/referral"),
  shareReferral: (channel: "copy" | "email") =>
    http.post<{ recorded: boolean; url: string }>(
      "/creator/success/referral/share",
      {
        channel,
      },
    ),
};

export const adminSuccessApi = {
  // The board returns every bucket in one response, keyed by filter name, and
  // the server accepts `limit` only — sending a `filter` query made the
  // whitelist validator reject the whole request with 400.
  board: (limit?: number) =>
    http.get<Record<AdminSuccessFilter, { rows: AdminSuccessRow[]; total: number }>>(
      "/admin/creators/success",
      {
        ...(limit ? { limit } : {}),
      },
    ),
  analytics: () =>
    http.get<SuccessAnalytics>("/admin/creators/success/analytics"),
  caseStudyQueue: (status?: CaseStudyStatus) =>
    http.get<CaseStudyView[]>("/admin/creators/case-studies/queue", {
      ...(status ? { status } : {}),
    }),
  reviewCaseStudy: (
    id: string,
    body: { status: CaseStudyStatus; note?: string },
  ) =>
    http.post<CaseStudyView>(`/admin/creators/case-studies/${id}/status`, body),
  sweepReviewRequests: (limit?: number) =>
    http.post<{ considered: number; created: number }>(
      "/admin/creators/review-requests/sweep",
      { ...(limit ? { limit } : {}) },
    ),
  referralBoard: () =>
    http.get<{
      byStage: Array<{ stage: string; n: number }>;
      pendingRewardReview: number;
    }>("/admin/creators/referrals"),
  reviewReward: (id: string) =>
    http.post<void>(`/admin/creators/referrals/${id}/reward-reviewed`),
};

export const publicCaseStudyApi = {
  list: (limit?: number) =>
    http.get<
      Array<{
        slug: string;
        creatorName: string;
        productName: string;
        quote: string;
        publishedAt: string | null;
      }>
    >("/case-studies", { ...(limit ? { limit } : {}) }),
  one: (slug: string) => http.get<PublicCaseStudy>(`/case-studies/${slug}`),
};

/**
 * Phase C5 — SCALE.
 *
 * Standalone like `successApi`, and for the same reason: C5 is a creator-facing
 * growth engine, and its pages must not reach through the admin CRM client.
 *
 * Note the shape of every call: NONE of them carries a creator id. The server
 * resolves the profile from the authenticated identity, so a creator cannot
 * ask for somebody else's numbers by editing a URL (§52). `ambassadorRespond`
 * and `joinCommunity` are the same — no `id`, because there is nothing to
 * choose between.
 */
export const scaleApi = {
  // ---- C5.1 referral ----------------------------------------------------
  referral: () => http.get<ScaleReferralView>("/creator/scale/referral"),
  referralRow: (id: string) =>
    http.get<ScaleReferralRow>(`/creator/scale/referral/${id}`),
  shareReferral: (channel: "copy" | "email") =>
    http.post<{ recorded: boolean }>("/creator/scale/referral/share", {
      channel,
    }),

  // ---- C5.2 ambassador --------------------------------------------------
  ambassador: () => http.get<AmbassadorView>("/creator/scale/ambassador"),
  /**
   * §40 / §43 — the ambassador share click.
   *
   * A real POST rather than a client-side event: a share is the action the
   * programme is judged on, and it has to survive an ad blocker to be true.
   */
  ambassadorShare: () =>
    http.post<{ recorded: boolean }>("/creator/scale/ambassador/share"),
  ambassadorRespond: (body: { answer: "accept" | "decline" }) =>
    http.post<{ status: string }>("/creator/scale/ambassador/respond", body),

  // ---- C5.4 affiliate ---------------------------------------------------
  affiliate: () => http.get<AffiliateView>("/creator/scale/affiliate"),
  applyAffiliate: (body: {
    displayName: string;
    website?: string;
    socialLinks?: string[];
    audienceSize?: number;
    channels: string[];
    audienceType?: string;
    reason?: string;
  }) =>
    http.post<{ id: string; status: string; payoutMode: string }>(
      "/creator/scale/affiliate/apply",
      body,
    ),

  // ---- C5.5 community ---------------------------------------------------
  community: () => http.get<CommunityView>("/creator/scale/community"),
  joinCommunity: () =>
    http.post<{ joined: boolean; status: string }>(
      "/creator/scale/community/join",
    ),
  createPost: (body: { title: string; body: string; category: string }) =>
    http.post<CommunityPost>("/creator/scale/community/posts", body),
  createComment: (postId: string, body: { body: string; parentId?: string }) =>
    http.post<{ id: string }>(
      `/creator/scale/community/posts/${postId}/comments`,
      body,
    ),
  react: (body: { postId: string }) =>
    http.post<{ reacted: boolean; count: number }>(
      "/creator/scale/community/react",
      body,
    ),
  reportPost: (body: {
    postId: string;
    reason: string;
    description?: string;
  }) =>
    http.post<{ reported: boolean }>("/creator/scale/community/report", body),
};

/** §43 — the public, unauthenticated surface. */
export const scalePublicApi = {
  resolveCode: (code: string) =>
    http.get<{
      code: string;
      referrer: { kind: "creator" | "buyer" } | null;
      recorded: boolean;
    }>(`/public/r/${code}`),
  communityFeed: (limit = 10) =>
    http.get<PublicCommunityPost[]>(`/public/community?limit=${limit}`),
};

/** Phase C5 — admin. Every call is admin-gated server-side. */
/**
 * Every /admin/scale list counts pages from 0 (`skip = page * limit`), while
 * the UI and <Pagination/> count from 1. Translating here keeps the pages
 * 1-based and stops the first screen from silently skipping the first page of
 * rows — which rendered as "this list is empty".
 */
const scalePage = (page: number) => Math.max(0, page - 1);

export const scaleAdminApi = {
  dashboard: () => http.get<ScaleGrowthDashboard>("/admin/scale/dashboard"),

  // Every /admin/scale list names its status filter `filter`; sending
  // `status` was rejected by the whitelist validator with 400.
  rewards: (page = 1, status?: RewardStatus) =>
    http.get<AdminRewardsView>("/admin/scale/rewards", {
      page: scalePage(page),
      ...(status ? { filter: status } : {}),
    }),
  transitionReward: (
    id: string,
    body: { status: RewardStatus; reason?: string; paidReference?: string },
  ) =>
    http.post<TransitionResult<AdminRewardRow>>(
      `/admin/scale/rewards/${id}/transition`,
      body,
    ),
  markPaid: (id: string, body: { paidReference: string; reason?: string }) =>
    http.post<TransitionResult<AdminRewardRow>>(
      `/admin/scale/rewards/${id}/transition`,
      {
        status: "paid",
        ...body,
      },
    ),

  commissions: (page = 1, status?: RewardStatus) =>
    http.get<AdminRewardsView>("/admin/scale/commissions", {
      page: scalePage(page),
      ...(status ? { filter: status } : {}),
    }),
  transitionCommission: (
    id: string,
    body: { status: RewardStatus; reason?: string; paidReference?: string },
  ) =>
    http.post<TransitionResult<AdminRewardRow>>(
      `/admin/scale/commissions/${id}/transition`,
      body,
    ),

  // ---- C5 §48 admin reports -------------------------------------------
  growthReports: () => http.get<GrowthReportsView>("/admin/scale/reports"),
  ambassadors: (page = 1) =>
    http.get<{
      items: AdminAmbassadorRow[];
      total: number;
      analytics: ScaleGrowthDashboard["ambassador"];
    }>("/admin/scale/ambassadors", { page: scalePage(page) }),
  inviteAmbassador: (body: {
    creatorProfileId: string;
    levelId?: string;
    note?: string;
  }) =>
    http.post<{ created: boolean; blocked: string | null }>(
      "/admin/scale/ambassadors/invite",
      body,
    ),
  setAmbassadorStatus: (
    id: string,
    body: { status: string; reason?: string },
  ) =>
    http.post<TransitionResult<AdminAmbassadorRow>>(
      `/admin/scale/ambassadors/${id}/status`,
      body,
    ),
  ambassadorLevels: () =>
    http.get<{ levels: AmbassadorLevel[] }>("/admin/scale/ambassador-levels"),
  saveAmbassadorLevel: (
    body: Partial<AmbassadorLevel> & { name: string; rank: number },
  ) =>
    http.post<{ saved: boolean; level: AmbassadorLevel }>(
      "/admin/scale/ambassador-levels",
      body,
    ),
  deleteAmbassadorLevel: (id: string) =>
    http.delete<{ deleted: boolean }>(`/admin/scale/ambassador-levels/${id}`),

  partnerships: (page = 1) =>
    http.get<{
      items: PartnershipRow[];
      total: number;
      analytics: PartnershipAnalytics;
    }>("/admin/scale/partnerships", { page: scalePage(page) }),
  createPartnership: (body: {
    leadId: string;
    name: string;
    type: string;
    ownerId?: string;
    attributionMethod?: string;
    notes?: string;
    internalNotes?: string;
    brings?: string;
  }) =>
    http.post<{
      partnership: PartnershipRow;
      created: boolean;
      blocked: string | null;
    }>("/admin/scale/partnerships", body),
  transitionPartnership: (
    id: string,
    body: { stage: string; agreementStatus?: string; endDate?: string },
  ) =>
    http.post<TransitionResult<PartnershipRow>>(
      `/admin/scale/partnerships/${id}/transition`,
      body,
    ),
  partnershipPerformance: (id: string) =>
    http.get<{ clicks: number; signups: number; revenue: Money }>(
      `/admin/scale/partnerships/${id}/performance`,
    ),

  affiliates: (page = 1, status?: string) =>
    http.get<AdminAffiliatesView>("/admin/scale/affiliates", {
      page: scalePage(page),
      ...(status ? { filter: status } : {}),
    }),
  decideAffiliate: (
    id: string,
    body: { decision: "approved" | "rejected" | "suspended"; reason?: string },
  ) =>
    http.post<TransitionResult<{ id: string; status: string }>>(
      `/admin/scale/affiliates/${id}/decision`,
      body,
    ),

  // The server names this query `filter` and answers `{ items, total }`.
  riskFlags: (filter: "open" | "cleared" | "confirmed" = "open") =>
    http.get<{ items: RiskFlag[]; total: number }>("/admin/scale/risk-flags", {
      filter,
    }),
  resolveRiskFlag: (
    id: string,
    body: { status: "cleared" | "confirmed"; note: string },
  ) =>
    http.post<{ resolved: boolean }>(
      `/admin/scale/risk-flags/${id}/resolve`,
      body,
    ),

  moderateCommunity: (body: {
    postId: string;
    hidden: boolean;
    reason?: string;
  }) =>
    http.patch<{ postId: string; hidden: boolean }>(
      "/admin/scale/community/moderate",
      body,
    ),
};

// ---- Buyer Discovery — events, follows, interests ----
const followPath = (type: FollowTarget, slug: string) =>
  `/${type === "agent" ? "agents" : type === "creator" ? "creators" : "categories"}/${encodeURIComponent(slug)}/follow`;

export const discoveryApi = {
  /** Fire-and-forget: behaviour events never block or break the UI. */
  sendEvents: (visitorId: string, events: ClientEvent[]): boolean =>
    keepaliveRequest("/discovery/events", "POST", { visitorId, events }),
  follow: (type: FollowTarget, slug: string) =>
    http.post<{ following: boolean }>(followPath(type, slug)),
  unfollow: (type: FollowTarget, slug: string) =>
    http.delete<{ following: boolean }>(followPath(type, slug)),
  followIds: () => http.get<FollowIds>("/me/follows/ids"),
  follows: (type: FollowTarget | undefined, page = 1, pageSize = 20) =>
    http.get<DiscoveryPaginated<FollowItem>>("/me/follows", {
      type,
      page,
      pageSize,
    }),
  interests: () => http.get<InterestProfile>("/me/interests"),
  resetInterests: () => http.delete<{ reset: boolean }>("/me/interests"),
  adminAnalytics: (days = 30) =>
    http.get<DiscoveryAnalytics>("/admin/discovery/analytics", { days }),
};

// ---- Sprint 2 — buyer journey (dashboard, My Products, workspace) ----
export interface SetupStepPatch {
  status?: SetupStepStatus;
  note?: string;
  blockedReason?: string;
}

export const buyerApi = {
  dashboard: () => http.get<BuyerDashboard>("/me/dashboard"),
  recommendations: (limit = 6) =>
    http.get<{ items: RecommendationItem[] }>("/me/recommendations", { limit }),
  preferences: () => http.get<BuyerPreferences>("/me/buyer-preferences"),
  savePreferences: (body: {
    goals?: BuyerGoal[];
    workTypes?: BuyerWorkType[];
    categories?: string[];
    skip?: boolean;
    finish?: boolean;
  }) => http.put<BuyerPreferences>("/me/buyer-preferences", body),
  products: (filter: ProductFilter = "all", page = 1, pageSize = 12) =>
    http.get<ProductListResult>("/me/products", { filter, page, pageSize }),
  product: (id: string) => http.get<ProductJourneyDetail>(`/me/products/${id}`),
  updates: (id: string) =>
    http.get<ProductUpdateView[]>(`/me/products/${id}/updates`),
  acknowledgeUpdates: (id: string) =>
    http.post<ProductJourneyDetail>(`/me/products/${id}/updates/acknowledge`),
  viewDelivery: (id: string) =>
    http.post<ProductJourneyDetail>(`/me/products/${id}/delivery/view`),
  confirmDelivery: (id: string) =>
    http.post<ProductJourneyDetail>(`/me/products/${id}/delivery/confirm`),
  startSetup: (id: string) =>
    http.post<ProductJourneyDetail>(`/me/products/${id}/setup/start`),
  updateStep: (id: string, key: string, patch: SetupStepPatch) =>
    http.patch<ProductJourneyDetail>(
      `/me/products/${id}/setup/steps/${encodeURIComponent(key)}`,
      patch,
    ),
  completeSetup: (id: string) =>
    http.post<ProductJourneyDetail>(`/me/products/${id}/setup/complete`),
  firstRun: (id: string) =>
    http.post<ProductJourneyDetail>(`/me/products/${id}/first-run`),
  firstValue: (id: string, note?: string) =>
    http.post<ProductJourneyDetail>(
      `/me/products/${id}/first-value`,
      note ? { note } : {},
    ),
  raiseAttention: (id: string, reason: string) =>
    http.post<ProductJourneyDetail>(`/me/products/${id}/attention`, { reason }),
  clearAttention: (id: string) =>
    http.delete<ProductJourneyDetail>(`/me/products/${id}/attention`),
  requestRefund: (id: string, reason: string) =>
    http.post<ProductJourneyDetail>(`/me/products/${id}/refund`, { reason }),
  adminAnalytics: (days = 30) =>
    http.get<BuyerJourneyAnalytics>("/admin/buyer-journey/analytics", { days }),
  /** Admin: send the setup reminders that are due now (idempotent). */
  adminRunReminders: () =>
    http.post<{ sent: number; checked: number }>(
      "/admin/buyer-journey/reminders/run",
    ),
};
