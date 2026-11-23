import type { BlogCategory } from '../../database/entities/blog/blog-category.entity';
import type {
  BlogPost,
  BlogSource,
} from '../../database/entities/blog/blog-post.entity';
import type { BlogTag } from '../../database/entities/blog/blog-tag.entity';
import type { User } from '../../database/entities/identity/user.entity';
import type { BlogBlock, BlogTocEntry } from './domain/blog-markdown';
import type { BlogPostStatus, BlogWorkflowAction } from './domain/blog-status';
import type { SearchSnippet } from './domain/blog-search';

/** Public author card — display data only, never contact details or ids. */
export interface PublicBlogAuthor {
  name: string;
  /** `username`, used for `/blog/author/:slug`; null when the user has none. */
  slug: string | null;
  avatarId: string | null;
  avatarBg: string | null;
}

export interface PublicBlogCategoryRef {
  slug: string;
  name: string;
}

export interface PublicBlogTagRef {
  slug: string;
  name: string;
}

export interface PublicBlogImage {
  url: string;
  alt: string;
  caption: string | null;
}

/** Card shape for lists, related articles and cluster navigation. */
export interface PublicBlogCard {
  slug: string;
  title: string;
  excerpt: string;
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
  featuredImage: PublicBlogImage | null;
  author: PublicBlogAuthor | null;
  category: PublicBlogCategoryRef | null;
  tags: PublicBlogTagRef[];
  isFeatured: boolean;
  /** Reader engagement (denormalised on the post; 0 when nobody rated/commented). */
  ratingAvg: number;
  ratingCount: number;
  commentCount: number;
  /**
   * Search results only (`GET /blog/posts?q=`): where the best match was and
   * the original sentence around it, for highlighting. Absent otherwise.
   */
  snippet?: SearchSnippet;
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

export interface PublicBlogPostDetail extends Omit<
  PublicBlogCard,
  'publishedAt'
> {
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
    robots: string;
    ogTitle: string;
    ogDescription: string;
    twitterCard: 'summary' | 'summary_large_image';
    language: 'fa' | 'en';
    translations: Array<{ language: 'fa' | 'en'; path: string }>;
  };
  breadcrumbs: Array<{ name: string; path: string }>;
  related: PublicBlogCard[];
  pillar: PublicBlogCard | null;
  cluster: PublicBlogCard[];
  agents: PublicBlogAgentRef[];
  marketCategories: PublicMarketCategoryRef[];
}

export const PUBLIC_AUTHOR_FALLBACK = 'تیم محتوای MESH';

export function publicAuthor(
  user: User | null | undefined,
): PublicBlogAuthor | null {
  if (!user) return null;
  return {
    name: user.fullName?.trim() || user.username || PUBLIC_AUTHOR_FALLBACK,
    slug: user.username ?? null,
    avatarId: user.avatarId ?? null,
    avatarBg: user.avatarBg ?? null,
  };
}

export function publicCategory(
  cat: BlogCategory | null | undefined,
): PublicBlogCategoryRef | null {
  if (!cat || !cat.isActive) return null;
  return { slug: cat.slug, name: cat.name };
}

export function publicImage(
  post: Pick<
    BlogPost,
    'featuredImageUrl' | 'featuredImageAlt' | 'featuredImageCaption'
  >,
): PublicBlogImage | null {
  if (!post.featuredImageUrl) return null;
  return {
    url: post.featuredImageUrl,
    alt: post.featuredImageAlt ?? '',
    caption: post.featuredImageCaption ?? null,
  };
}

export function publicCard(
  post: BlogPost,
  tags: BlogTag[] = [],
  snippet?: SearchSnippet | null,
): PublicBlogCard {
  const publishedAt = post.publishedAt ?? post.createdAt;
  const updatedAt =
    post.contentUpdatedAt && post.contentUpdatedAt > publishedAt
      ? post.contentUpdatedAt
      : publishedAt;
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    readingMinutes: post.readingMinutes,
    publishedAt: publishedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    featuredImage: publicImage(post),
    author: publicAuthor(post.author),
    category: publicCategory(post.primaryCategory),
    tags: tags.map((t) => ({ slug: t.slug, name: t.name })),
    isFeatured: post.isFeatured,
    ratingAvg: Number(post.ratingAvg ?? 0),
    ratingCount: post.ratingCount ?? 0,
    commentCount: post.commentCount ?? 0,
    ...(snippet ? { snippet } : {}),
  };
}

// ---------------------------------------------------------------------------
// Admin shapes
// ---------------------------------------------------------------------------

export interface AdminBlogUserRef {
  id: string;
  name: string;
  username: string | null;
}

export function adminUserRef(
  user: User | null | undefined,
): AdminBlogUserRef | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.fullName?.trim() || user.username || user.id.slice(0, 8),
    username: user.username ?? null,
  };
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

export interface BlogReadinessIssue {
  code:
    | 'title_missing'
    | 'excerpt_missing'
    | 'body_empty'
    | 'category_missing'
    | 'author_missing'
    | 'image_alt_missing'
    | 'seo_description_long'
    | 'seo_title_long'
    | 'content_warnings';
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
  /** Labelled copies of the id lists above so the editor can render chips without extra lookups. */
  refs: {
    tags: Array<{ id: string; name: string; slug: string }>;
    related: Array<{
      id: string;
      title: string;
      slug: string;
      status: BlogPostStatus;
    }>;
    pillar: {
      id: string;
      title: string;
      slug: string;
      status: BlogPostStatus;
    } | null;
    agents: Array<{ id: string; name: string; slug: string; status: string }>;
    marketCategories: Array<{
      id: string;
      name: string;
      nameFa: string | null;
      slug: string;
    }>;
  };
}

export function adminRow(post: BlogPost): AdminBlogPostRow {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    status: post.status,
    isFeatured: post.isFeatured,
    readingMinutes: post.readingMinutes,
    wordCount: post.wordCount,
    ratingAvg: Number(post.ratingAvg ?? 0),
    ratingCount: post.ratingCount ?? 0,
    commentCount: post.commentCount ?? 0,
    author: adminUserRef(post.author),
    reviewer: adminUserRef(post.reviewer),
    category: post.primaryCategory
      ? {
          id: post.primaryCategory.id,
          slug: post.primaryCategory.slug,
          name: post.primaryCategory.name,
        }
      : null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    scheduledFor: post.scheduledFor?.toISOString() ?? null,
    contentUpdatedAt: post.contentUpdatedAt?.toISOString() ?? null,
    updatedAt: post.updatedAt.toISOString(),
    createdAt: post.createdAt.toISOString(),
    version: post.version,
    updatedBy: post.updatedBy,
  };
}
