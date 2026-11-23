import { http } from './client';
import type { Paginated } from './types';

/**
 * Blog platform — typed client for the public reading API (`/blog/*`) and the
 * editorial CMS (`/admin/blog/*`). Shapes mirror the backend serializers in
 * `agentHub_backend/src/modules/blog/blog-serializers.ts`; nothing here is
 * ever rendered as HTML — article bodies arrive as a JSON block tree.
 */

// ---- structured body (server-parsed) ---------------------------------------

export type BlogInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: BlogInline[] }
  | { t: 'em'; c: BlogInline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: BlogInline[] }
  | { t: 'br' };

export type BlogCalloutKind = 'note' | 'tip' | 'warning';

export interface BlogListItem {
  c: BlogInline[];
  children?: { ordered: boolean; items: BlogListItem[] };
}

export type BlogBlock =
  | { type: 'heading'; level: 2 | 3 | 4; id: string; text: string; c: BlogInline[] }
  | { type: 'paragraph'; c: BlogInline[] }
  | { type: 'list'; ordered: boolean; items: BlogListItem[] }
  | { type: 'quote'; kind: BlogCalloutKind | null; paragraphs: BlogInline[][] }
  | { type: 'code'; lang: string | null; code: string }
  | { type: 'image'; src: string; alt: string; caption: string | null }
  | { type: 'table'; align: Array<'left' | 'center' | 'right' | null>; header: BlogInline[][]; rows: BlogInline[][][] }
  | { type: 'hr' };

export interface BlogTocEntry {
  id: string;
  text: string;
  level: 2 | 3 | 4;
}

export interface BlogContentWarning {
  code: 'unsafe_url' | 'image_without_alt' | 'empty_heading' | 'heading_level_skipped' | 'h1_demoted';
  line: number;
  detail?: string;
}

export interface BlogRenderedBody {
  blocks: BlogBlock[];
  toc: BlogTocEntry[];
  plainText: string;
  wordCount: number;
  readingMinutes: number;
  warnings: BlogContentWarning[];
}

export interface BlogSource {
  title: string;
  url: string;
}

// ---- public ----------------------------------------------------------------

export interface PublicBlogAuthor {
  name: string;
  /** Username — only present when the author has a public archive. */
  slug: string | null;
  avatarId: string | null;
  avatarBg: string | null;
}

export interface PublicBlogImage {
  url: string;
  alt: string;
  caption: string | null;
}

export interface PublicBlogCard {
  slug: string;
  title: string;
  excerpt: string;
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
  featuredImage: PublicBlogImage | null;
  author: PublicBlogAuthor | null;
  category: { slug: string; name: string } | null;
  tags: Array<{ slug: string; name: string }>;
  isFeatured: boolean;
  /** Reader engagement (denormalised on the server; 0 when nobody rated / commented). */
  ratingAvg: number;
  ratingCount: number;
  commentCount: number;
  /** Search results only (`q` set): where the best match was and the sentence around it. */
  snippet?: { field: 'title' | 'excerpt' | 'body'; text: string };
}

export interface PublicBlogAgentRef {
  slug: string;
  name: string;
  shortDescription: string | null;
  logoUrl: string | null;
}

export interface PublicMarketCategoryRef {
  slug: string;
  name: string;
  nameFa: string | null;
}

export interface PublicBlogPostDetail extends Omit<PublicBlogCard, 'publishedAt'> {
  /** Null for drafts in the authorised preview; never invent a publication date. */
  publishedAt: string | null;
  blocks: BlogBlock[];
  toc: BlogTocEntry[];
  wordCount: number;
  sources: BlogSource[];
  seo: {
    title: string;
    description: string;
    canonicalUrl: string | null;
    ogImageUrl: string | null;
    /** SEO Studio — effective public metadata (stored or fallback). */
    ogTitle: string;
    ogDescription: string;
    twitterCard: 'summary' | 'summary_large_image';
    robots: string;
    language: 'fa' | 'en';
    /** Real translations only (same translation group, published, indexable). */
    translations: Array<{ language: 'fa' | 'en'; path: string }>;
  };
  breadcrumbs: Array<{ name: string; path: string }>;
  related: PublicBlogCard[];
  pillar: PublicBlogCard | null;
  cluster: PublicBlogCard[];
  agents: PublicBlogAgentRef[];
  marketCategories: PublicMarketCategoryRef[];
}

export interface PublicBlogCategory {
  slug: string;
  name: string;
  description: string | null;
  parentSlug: string | null;
  postCount: number;
}

export interface PublicBlogTag {
  slug: string;
  name: string;
  postCount: number;
}

export interface PublicBlogHome {
  featured: PublicBlogCard | null;
  recent: PublicBlogCard[];
  categories: PublicBlogCategory[];
  totalPublished: number;
}

/** `relevance` needs `q` (the API falls back to `newest` without one). */
export type BlogSort = 'relevance' | 'newest' | 'oldest' | 'updated' | 'popular';
export const BLOG_SORTS: readonly BlogSort[] = ['relevance', 'newest', 'oldest', 'updated', 'popular'];

/** Reading-time buckets as the API defines them: ≤ 3 min, 4–8 min, ≥ 9 min. */
export type BlogReading = 'short' | 'medium' | 'long';
export const BLOG_READINGS: readonly BlogReading[] = ['short', 'medium', 'long'];

export interface PublicBlogListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  category?: string;
  tag?: string;
  author?: string;
  featured?: boolean;
  sort?: BlogSort;
  reading?: BlogReading;
}

export type PublicPostLookup = PublicBlogPostDetail | { redirectTo: string };

/** Default cards per page and the sizes a reader may pick (all ≤ the API's 100 cap). */
export const BLOG_PAGE_SIZE = 9;
export const BLOG_PAGE_SIZES: readonly number[] = [9];

export const blogApi = {
  home: () => http.get<PublicBlogHome>('/blog/home', undefined, true),
  posts: (query: PublicBlogListQuery) => http.get<Paginated<PublicBlogCard>>('/blog/posts', { pageSize: BLOG_PAGE_SIZE, ...query }, true),
  post: (slug: string) => http.get<PublicPostLookup>(`/blog/posts/${encodeURIComponent(slug)}`, undefined, true),
  categories: () => http.get<PublicBlogCategory[]>('/blog/categories', undefined, true),
  category: (slug: string) => http.get<PublicBlogCategory>(`/blog/categories/${encodeURIComponent(slug)}`, undefined, true),
  tags: () => http.get<PublicBlogTag[]>('/blog/tags', undefined, true),
  tag: (slug: string) => http.get<PublicBlogTag>(`/blog/tags/${encodeURIComponent(slug)}`, undefined, true),
  author: (username: string) => http.get<{ author: PublicBlogAuthor }>(`/blog/authors/${encodeURIComponent(username)}`, undefined, true),
};

// ---- engagement: ratings + comments (2026-10-14) ---------------------------

export interface BlogRatingSummary {
  average: number;
  count: number;
  /** Votes per star, 1..5 (always all five keys). */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface BlogEngagementSummary {
  rating: BlogRatingSummary;
  commentCount: number;
}

/** The signed-in reader's own state on one article (separate, authenticated request). */
export interface BlogEngagementMe {
  myRating: number | null;
  myCommentIds: string[];
  likedCommentIds: string[];
  reportedCommentIds: string[];
  /** false when the editorial team barred this account from commenting. */
  canComment: boolean;
}

export type BlogCommentStatus = 'published' | 'hidden' | 'removed';
export type BlogCommentSort = 'newest' | 'oldest' | 'top';
export const BLOG_COMMENT_SORTS: readonly BlogCommentSort[] = ['newest', 'oldest', 'top'];
export type BlogCommentBadge = 'author' | 'staff' | null;
export type BlogCommentReportReason = 'spam' | 'abuse' | 'off_topic' | 'other';
export const BLOG_COMMENT_REPORT_REASONS: readonly BlogCommentReportReason[] = ['spam', 'abuse', 'off_topic', 'other'];
export const BLOG_COMMENT_MAX_LENGTH = 2000;
export const BLOG_COMMENT_MIN_LENGTH = 2;
export const BLOG_COMMENTS_PAGE_SIZE = 20;

export interface PublicBlogComment {
  id: string;
  parentId: string | null;
  /** A hidden/removed top-level comment that still has replies arrives as a placeholder (body '', author null). */
  status: BlogCommentStatus;
  body: string;
  author: (PublicBlogAuthor & { badge: BlogCommentBadge }) | null;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  editedAt: string | null;
  replies: PublicBlogComment[];
}

export const blogEngagementApi = {
  summary: (slug: string) => http.get<BlogEngagementSummary>(`/blog/posts/${encodeURIComponent(slug)}/engagement`, undefined, true),
  me: (slug: string) => http.get<BlogEngagementMe>(`/blog/posts/${encodeURIComponent(slug)}/engagement/me`),
  rate: (slug: string, rating: number) =>
    http.put<BlogEngagementSummary & { myRating: number }>(`/blog/posts/${encodeURIComponent(slug)}/rating`, { rating }),
  unrate: (slug: string) => http.delete<BlogEngagementSummary>(`/blog/posts/${encodeURIComponent(slug)}/rating`),
  comments: (slug: string, query: { sort?: BlogCommentSort; page?: number; pageSize?: number }) =>
    http.get<Paginated<PublicBlogComment>>(
      `/blog/posts/${encodeURIComponent(slug)}/comments`,
      { pageSize: BLOG_COMMENTS_PAGE_SIZE, ...query },
      true,
    ),
  createComment: (slug: string, body: string, parentId?: string) =>
    http.post<PublicBlogComment>(`/blog/posts/${encodeURIComponent(slug)}/comments`, parentId ? { body, parentId } : { body }),
  updateComment: (id: string, body: string) => http.patch<PublicBlogComment>(`/blog/comments/${id}`, { body }),
  withdrawComment: (id: string) => http.delete<void>(`/blog/comments/${id}`),
  like: (id: string) => http.post<{ likeCount: number }>(`/blog/comments/${id}/like`),
  unlike: (id: string) => http.delete<{ likeCount: number }>(`/blog/comments/${id}/like`),
  report: (id: string, reason: BlogCommentReportReason, note?: string) =>
    http.post<{ id: string }>(`/blog/comments/${id}/report`, note ? { reason, note } : { reason }),
};

// ---- admin -----------------------------------------------------------------

export type BlogPostStatus = 'draft' | 'in_review' | 'scheduled' | 'published' | 'unpublished' | 'archived';
export const BLOG_POST_STATUSES: readonly BlogPostStatus[] = ['draft', 'in_review', 'scheduled', 'published', 'unpublished', 'archived'];

export type BlogWorkflowAction =
  'submit_review' | 'request_changes' | 'publish' | 'schedule' | 'cancel_schedule' | 'unpublish' | 'archive' | 'restore';

export interface AdminBlogUserRef {
  id: string;
  name: string;
  username: string | null;
}

export interface AdminBlogPostRow {
  id: string;
  slug: string;
  title: string;
  status: BlogPostStatus;
  isFeatured: boolean;
  readingMinutes: number;
  wordCount: number;
  ratingAvg: number;
  ratingCount: number;
  commentCount: number;
  author: AdminBlogUserRef | null;
  reviewer: AdminBlogUserRef | null;
  category: { id: string; slug: string; name: string } | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  contentUpdatedAt: string | null;
  updatedAt: string;
  createdAt: string;
  version: number;
  updatedBy: string | null;
}

export type BlogReadinessCode =
  | 'title_missing'
  | 'excerpt_missing'
  | 'body_empty'
  | 'category_missing'
  | 'author_missing'
  | 'image_alt_missing'
  | 'seo_description_long'
  | 'seo_title_long'
  | 'content_warnings';

export interface BlogReadinessIssue {
  code: BlogReadinessCode;
  severity: 'error' | 'warning';
  detail?: string;
}

export interface AdminBlogPostDetail extends AdminBlogPostRow {
  excerpt: string;
  bodyMarkdown: string;
  blocks: BlogBlock[];
  toc: BlogTocEntry[];
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  featuredImageCaption: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  pillarPostId: string | null;
  editorialNote: string | null;
  sources: BlogSource[];
  tagIds: string[];
  relatedPostIds: string[];
  agentIds: string[];
  marketCategoryIds: string[];
  availableActions: BlogWorkflowAction[];
  readiness: BlogReadinessIssue[];
  revisionCount: number;
  redirects: string[];
  /** Labelled copies of the id lists so the editor can render chips without extra lookups. */
  refs: {
    tags: Array<{ id: string; name: string; slug: string }>;
    related: Array<{ id: string; title: string; slug: string; status: BlogPostStatus }>;
    pillar: { id: string; title: string; slug: string; status: BlogPostStatus } | null;
    agents: Array<{ id: string; name: string; slug: string; status: string }>;
    marketCategories: Array<{ id: string; name: string; nameFa: string | null; slug: string }>;
  };
}

/** Everything an editor may send; the server treats omitted keys as "unchanged". */
export interface BlogPostInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  bodyMarkdown?: string;
  featuredImageUrl?: string | null;
  featuredImageAlt?: string | null;
  featuredImageCaption?: string | null;
  authorUserId?: string | null;
  reviewerUserId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  primaryCategoryId?: string | null;
  pillarPostId?: string | null;
  isFeatured?: boolean;
  editorialNote?: string | null;
  sources?: BlogSource[];
  tagIds?: string[];
  relatedPostIds?: string[];
  agentIds?: string[];
  marketCategoryIds?: string[];
}

export interface AdminBlogListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: BlogPostStatus;
  category?: string;
  author?: string;
  tag?: string;
  featured?: boolean;
  sort?: 'updated' | 'created' | 'published' | 'title';
}

export interface BlogOverview {
  byStatus: Partial<Record<BlogPostStatus, number>>;
  featured: number;
  stale: number;
  scheduledNext: { id: string; slug: string; title: string; scheduledFor: string } | null;
  categories: number;
  tags: number;
}

export interface BlogAccess {
  can: { view: boolean; manage: boolean; publish: boolean };
}

export type BlogRevisionReason = 'save' | 'publish' | 'restore' | 'create';

export interface BlogRevisionRow {
  id: string;
  version: number;
  reason: BlogRevisionReason;
  createdAt: string;
  createdBy: AdminBlogUserRef | null;
  title: string;
  wordCount: number;
}

export interface BlogRevisionDetail {
  id: string;
  postId: string;
  version: number;
  reason: BlogRevisionReason;
  createdAt: string;
  snapshot: {
    title: string;
    slug: string;
    excerpt: string;
    bodyMarkdown: string;
    featuredImageUrl: string | null;
    featuredImageAlt: string | null;
    featuredImageCaption: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    canonicalUrl: string | null;
    ogImageUrl: string | null;
    sources: BlogSource[];
  };
}

export interface AdminBlogCategory {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  postCount: number;
  publishedCount: number;
  updatedAt: string;
}

export interface AdminBlogTag {
  id: string;
  slug: string;
  name: string;
  postCount: number;
  publishedCount: number;
}

export interface BlogCategoryInput {
  name: string;
  slug?: string;
  nameEn?: string | null;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface BlogBulkResult {
  done: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export interface BlogUploadedMedia {
  id: string;
  kind: 'blog';
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export type BlogBulkAction = 'unpublish' | 'archive' | 'feature' | 'unfeature' | 'set_category';

// ---- admin: comment moderation --------------------------------------------

export type BlogCommentReportStatus = 'open' | 'resolved' | 'dismissed';

export interface AdminBlogCommentReport {
  id: string;
  reason: BlogCommentReportReason;
  note: string | null;
  status: BlogCommentReportStatus;
  reporter: AdminBlogUserRef | null;
  createdAt: string;
}

export interface AdminBlogCommentRow {
  id: string;
  parentId: string | null;
  status: BlogCommentStatus;
  body: string;
  likeCount: number;
  replyCount: number;
  author: (AdminBlogUserRef & { banned: boolean }) | null;
  post: { id: string; slug: string; title: string } | null;
  openReportCount: number;
  reports: AdminBlogCommentReport[];
  removedReason: string | null;
  removedAt: string | null;
  editedAt: string | null;
  createdAt: string;
}

export interface AdminBlogCommentsQuery {
  page?: number;
  pageSize?: number;
  status?: BlogCommentStatus;
  reported?: boolean;
  postId?: string;
  userId?: string;
  q?: string;
}

export interface AdminBlogCommentOverview {
  published: number;
  hidden: number;
  removed: number;
  openReports: number;
  bans: number;
}

export interface AdminBlogCommentBan {
  user: AdminBlogUserRef | null;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

const admin = '/admin/blog';

export const blogAdminApi = {
  me: () => http.get<BlogAccess>(`${admin}/me`),
  overview: () => http.get<BlogOverview>(`${admin}/overview`),
  authors: (q?: string) => http.get<AdminBlogUserRef[]>(`${admin}/authors`, { q }),

  posts: (query: AdminBlogListQuery) => http.get<Paginated<AdminBlogPostRow>>(`${admin}/posts`, { ...query }),
  post: (id: string) => http.get<AdminBlogPostDetail>(`${admin}/posts/${id}`),
  create: (body: BlogPostInput) => http.post<AdminBlogPostDetail>(`${admin}/posts`, body),
  update: (id: string, version: number, body: BlogPostInput, autosave = false) =>
    http.patch<AdminBlogPostDetail>(`${admin}/posts/${id}`, { ...body, version, ...(autosave ? { autosave: true } : {}) }),
  remove: (id: string) => http.delete<void>(`${admin}/posts/${id}`),
  preview: (id: string) => http.get<PublicBlogPostDetail>(`${admin}/posts/${id}/preview`),
  render: (bodyMarkdown: string) => http.post<BlogRenderedBody>(`${admin}/render`, { bodyMarkdown }),
  bulk: (ids: string[], action: BlogBulkAction, categoryId?: string | null) =>
    http.post<BlogBulkResult>(`${admin}/posts/bulk`, { ids, action, ...(action === 'set_category' ? { categoryId } : {}) }),

  transition: (id: string, action: Exclude<BlogWorkflowAction, 'schedule'>, note?: string | null) =>
    http.post<AdminBlogPostDetail>(`${admin}/posts/${id}/${action.replace('_', '-')}`, note === undefined ? undefined : { note }),
  schedule: (id: string, scheduledFor: string) => http.post<AdminBlogPostDetail>(`${admin}/posts/${id}/schedule`, { scheduledFor }),

  revisions: (id: string) => http.get<BlogRevisionRow[]>(`${admin}/posts/${id}/revisions`),
  revision: (id: string, revisionId: string) => http.get<BlogRevisionDetail>(`${admin}/posts/${id}/revisions/${revisionId}`),
  restoreRevision: (id: string, revisionId: string) =>
    http.post<AdminBlogPostDetail>(`${admin}/posts/${id}/revisions/${revisionId}/restore`),

  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<BlogUploadedMedia>(`${admin}/media`, form);
  },

  categories: () => http.get<AdminBlogCategory[]>(`${admin}/categories`),
  createCategory: (body: BlogCategoryInput) => http.post<AdminBlogCategory>(`${admin}/categories`, body),
  updateCategory: (id: string, body: Partial<BlogCategoryInput>) => http.patch<AdminBlogCategory>(`${admin}/categories/${id}`, body),
  deleteCategory: (id: string, reassignToId: string | null) =>
    http.post<{ reassigned: number }>(`${admin}/categories/${id}/delete`, { reassignToId }),

  tags: () => http.get<AdminBlogTag[]>(`${admin}/tags`),
  createTag: (body: { name: string; slug?: string }) => http.post<AdminBlogTag>(`${admin}/tags`, body),
  updateTag: (id: string, body: { name?: string; slug?: string }) => http.patch<AdminBlogTag>(`${admin}/tags/${id}`, body),
  deleteTag: (id: string) => http.delete<void>(`${admin}/tags/${id}`),
  mergeTags: (sourceIds: string[], targetId: string) => http.post<AdminBlogTag>(`${admin}/tags/merge`, { sourceIds, targetId }),

  // comment moderation
  commentsOverview: () => http.get<AdminBlogCommentOverview>(`${admin}/comments/overview`),
  comments: (query: AdminBlogCommentsQuery) => http.get<Paginated<AdminBlogCommentRow>>(`${admin}/comments`, { ...query }),
  removeComment: (id: string, reason?: string) =>
    http.post<AdminBlogCommentRow>(`${admin}/comments/${id}/remove`, reason ? { reason } : {}),
  restoreComment: (id: string) => http.post<AdminBlogCommentRow>(`${admin}/comments/${id}/restore`),
  dismissCommentReports: (id: string) => http.post<AdminBlogCommentRow>(`${admin}/comments/${id}/dismiss-reports`),
  commentBans: () => http.get<AdminBlogCommentBan[]>(`${admin}/comment-bans`),
  banCommenter: (userId: string, reason?: string) =>
    http.post<AdminBlogCommentBan>(`${admin}/comment-bans`, reason ? { userId, reason } : { userId }),
  unbanCommenter: (userId: string) => http.delete<void>(`${admin}/comment-bans/${userId}`),
};
