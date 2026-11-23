import { http } from './client';
import type { Paginated } from './types';

/**
 * SEO Studio + Knowledge Graph — typed client for `/admin/seo/*` and the
 * public head endpoint. Shapes mirror the backend services in
 * `agentHub_backend/src/modules/seo/*` (content-seo.service.ts,
 * knowledge-graph.service.ts, link-suggestions.service.ts, analysis/).
 */

export type SeoContentType = 'post' | 'agent';
export type SeoLanguage = 'fa' | 'en';
export type TwitterCard = 'summary' | 'summary_large_image';
export type SeoFieldSource = 'stored' | 'fallback' | 'forced';

export interface SeoFieldValue<T> {
  stored: T | null;
  effective: T;
  source: SeoFieldSource;
}

export interface SeoContentRef {
  type: SeoContentType;
  id: string;
  title: string;
  slug: string;
  path: string;
  status: string;
  published: boolean;
  updatedAt: string;
}

export interface SeoTranslationRef {
  type: SeoContentType;
  id: string;
  language: SeoLanguage;
  title: string;
  path: string;
  published: boolean;
}

export interface ContentSeoView {
  content: SeoContentRef;
  fields: {
    seoTitle: SeoFieldValue<string>;
    seoDescription: SeoFieldValue<string>;
    canonicalUrl: SeoFieldValue<string>;
    ogImageUrl: SeoFieldValue<string | null>;
    ogTitle: SeoFieldValue<string>;
    ogDescription: SeoFieldValue<string>;
    twitterCard: SeoFieldValue<TwitterCard>;
    robotsIndex: SeoFieldValue<boolean>;
    robotsFollow: SeoFieldValue<boolean>;
    language: SeoFieldValue<SeoLanguage>;
  };
  focusKeyword: string | null;
  relatedKeywords: string[];
  translationGroupId: string | null;
  translations: SeoTranslationRef[];
  storage: 'content_seo' | 'blog_posts+content_seo';
  updatedAt: string | null;
}

export interface UpsertContentSeoInput {
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  twitterCard?: TwitterCard;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
  focusKeyword?: string | null;
  relatedKeywords?: string[];
  language?: SeoLanguage;
}

// ---- analysis ---------------------------------------------------------------

export type SeoSeverity = 'critical' | 'warning' | 'info';
export interface Localized {
  fa: string;
  en: string;
}
export type SeoLocation =
  { kind: 'field'; field: string } | { kind: 'panel'; panel: 'seo' | 'links' | 'content' } | { kind: 'block'; position: number };

export interface SeoRecommendation {
  rule: string;
  severity: SeoSeverity;
  passed: boolean;
  applicable: boolean;
  title: Localized;
  problem: Localized;
  why: Localized;
  fix: Localized;
  location: SeoLocation;
  data?: Record<string, unknown>;
}

export interface SeoAnalysisReport {
  engine: 'mesh-rules';
  version: number;
  basis: 'unsaved' | 'saved';
  language: SeoLanguage;
  score: {
    value: number;
    label: string;
    criticalFailed: boolean;
    weights: Record<string, number>;
    note: Localized;
  };
  stats: {
    words: number;
    sentences: number;
    paragraphs: number;
    headings: number;
    images: number;
    imagesWithoutAlt: number;
    internalLinks: number;
    externalLinks: number;
    brokenLinks: number;
    unpublishedLinks: number;
    keyword: { occurrences: number; density: number } | null;
  };
  recommendations: SeoRecommendation[];
}

export interface AnalyzeContentInput {
  contentType: SeoContentType;
  contentId?: string | null;
  language: SeoLanguage;
  title: string;
  slug: string;
  excerpt?: string;
  bodyMarkdown?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  featuredImageUrl?: string | null;
  robotsIndex?: boolean;
  focusKeyword?: string | null;
  relatedKeywords?: string[];
}

// ---- graph ------------------------------------------------------------------

export type GraphNodeType = 'post' | 'agent' | 'keyword' | 'category';
export type GraphEdgeType = 'link' | 'relation' | 'keyword' | 'category' | 'suggestion' | 'translation';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  refId: string;
  label: string;
  slug: string | null;
  path: string | null;
  language: SeoLanguage | null;
  status: string | null;
  published: boolean;
  categoryId: string | null;
  inbound: number;
  outbound: number;
  issues: { orphan: boolean; brokenOut: number; noOutbound: boolean };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  anchor: string | null;
  status: 'ok' | 'broken' | 'unpublished' | null;
  position: number | null;
  language: SeoLanguage | null;
  suggestionId: string | null;
  reason: string | null;
  score: number | null;
  linkId: string | null;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    nodes: number;
    edges: number;
    truncated: boolean;
    limit: number;
    generatedAt: string;
    counts: Record<GraphNodeType, number> & { suggestions: number; broken: number; orphans: number };
  };
}

export interface GraphFilters {
  types?: GraphNodeType[];
  language?: SeoLanguage;
  status?: string;
  category?: string;
  keyword?: string;
  relations?: GraphEdgeType[];
  orphans?: 'no-inbound' | 'no-outbound';
  broken?: boolean;
  suggested?: boolean;
  q?: string;
  focus?: string;
  limit?: number;
}

export interface GraphLinkRow {
  id: string;
  href: string;
  anchor: string | null;
  position: number;
  status: 'ok' | 'broken' | 'unpublished';
  targetType?: string;
  target?: GraphContentRef | null;
  source?: GraphContentRef | null;
}
export interface GraphContentRef {
  type: SeoContentType;
  id: string;
  title: string;
  path: string;
  published: boolean;
  status: string;
}

export interface GraphNodeDetails {
  content: SeoContentRef;
  language: SeoLanguage;
  robots: string;
  keywords: { focus: string | null; related: string[] };
  translations: SeoTranslationRef[];
  outbound: GraphLinkRow[];
  inbound: GraphLinkRow[];
  relations: GraphContentRef[];
  agentRelations: GraphContentRef[];
  suggestions: Array<{
    id: string;
    reason: SuggestionReason;
    score: number;
    status: SuggestionStatus;
    evidence: Record<string, unknown>;
    direction: 'outbound' | 'inbound';
    source: GraphContentRef | null;
    target: GraphContentRef | null;
  }>;
  issues: { orphan: boolean; noOutbound: boolean; brokenOut: number; unpublishedOut: number };
}

// ---- links & suggestions ----------------------------------------------------

export type SuggestionReason = 'shared_keyword' | 'same_category' | 'orphan_target' | 'title_overlap';
export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface LinkSuggestionRow {
  id: string;
  reason: SuggestionReason;
  score: number;
  status: SuggestionStatus;
  evidence: { terms?: string[]; anchor?: string | null; inbound?: number; category?: string | null; overlap?: string[] } & Record<
    string,
    unknown
  >;
  source: GraphContentRef;
  target: GraphContentRef;
  createdAt: string;
  decidedAt: string | null;
}

export interface LinkMutationResult {
  applied: 'link' | 'relation';
  sourceId: string;
  targetId: string;
  href: string;
  anchor: string | null;
  version: number;
  suggestionId?: string;
}

const admin = '/admin/seo';

function graphQuery(f: GraphFilters): Record<string, string | number | boolean | undefined> {
  return {
    types: f.types?.length ? f.types.join(',') : undefined,
    relations: f.relations?.length ? f.relations.join(',') : undefined,
    language: f.language,
    status: f.status,
    category: f.category,
    keyword: f.keyword,
    orphans: f.orphans,
    broken: f.broken ? true : undefined,
    suggested: f.suggested ? true : undefined,
    q: f.q?.trim() || undefined,
    focus: f.focus,
    limit: f.limit,
  };
}

export const seoAdminApi = {
  view: (type: SeoContentType, id: string) => http.get<ContentSeoView>(`${admin}/content/${type}/${id}`),
  upsert: (type: SeoContentType, id: string, body: UpsertContentSeoInput) =>
    http.put<ContentSeoView>(`${admin}/content/${type}/${id}`, body),
  analysis: (type: SeoContentType, id: string) => http.get<SeoAnalysisReport>(`${admin}/content/${type}/${id}/analysis`),
  analyze: (body: AnalyzeContentInput) => http.post<SeoAnalysisReport>(`${admin}/analyze`, body),
  linkTranslation: (type: SeoContentType, id: string, targetType: SeoContentType, targetId: string) =>
    http.post<ContentSeoView>(`${admin}/content/${type}/${id}/translations`, { targetType, targetId }),
  unlinkTranslation: (type: SeoContentType, id: string) => http.delete<ContentSeoView>(`${admin}/content/${type}/${id}/translations`),

  graph: (filters: GraphFilters) => http.get<GraphResponse>(`${admin}/graph`, graphQuery(filters)),
  node: (type: SeoContentType, id: string) => http.get<GraphNodeDetails>(`${admin}/graph/nodes/${type}/${id}`),

  createLink: (body: {
    sourceType: SeoContentType;
    sourceId: string;
    targetType: SeoContentType;
    targetId: string;
    anchor?: string | null;
  }) => http.post<LinkMutationResult>(`${admin}/links`, body),
  deleteLink: (id: string) => http.delete<{ id: string; removed: boolean; version: number }>(`${admin}/links/${id}`),
  removeRelation: (body: { sourceId: string; targetType: SeoContentType; targetId: string }) =>
    http.post<{ removed: boolean; version: number }>(`${admin}/relations/remove`, body),
  rescan: () => http.post<{ sources: number; links: number; broken: number }>(`${admin}/links/rescan`),

  suggestions: (query: { status?: SuggestionStatus; sourceId?: string; page?: number; pageSize?: number }) =>
    http.get<Paginated<LinkSuggestionRow>>(`${admin}/suggestions`, { ...query }),
  generateSuggestions: (sourceId?: string) =>
    http.post<{ created: number; updated: number; skipped: number; sources: number }>(
      `${admin}/suggestions/generate`,
      sourceId ? { sourceId } : {},
    ),
  approveSuggestion: (id: string, anchor?: string | null) =>
    http.post<LinkMutationResult>(`${admin}/suggestions/${id}/approve`, anchor === undefined ? {} : { anchor }),
  rejectSuggestion: (id: string) => http.post<LinkSuggestionRow>(`${admin}/suggestions/${id}/reject`),
};

/** Public `GET /seo/head?path=` — what the crawler HTML carries for a page. */
export interface PublicHead {
  kind: 'ok';
  path: string;
  type: SeoContentType;
  title: string;
  description: string;
  canonical: string;
  robots: string;
  language: SeoLanguage;
  locale: string;
  hreflang: Array<{ lang: string; href: string }>;
  breadcrumbs: Array<{ name: string; path: string }>;
  jsonLd: Array<Record<string, unknown>>;
}
export const seoPublicApi = {
  head: (path: string) => http.get<PublicHead | { kind: 'redirect'; to: string }>('/seo/head', { path }),
};
