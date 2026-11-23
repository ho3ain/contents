import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../identity/user.entity';
import { BlogCategory } from './blog-category.entity';
import {
  BLOG_POST_STATUSES,
  type BlogPostStatus,
} from '../../../modules/blog/domain/blog-status';
import type {
  BlogBlock,
  BlogTocEntry,
} from '../../../modules/blog/domain/blog-markdown';

const BLOG_POST_STATUS = Object.fromEntries(
  BLOG_POST_STATUSES.map((s) => [s, s]),
) as Record<BlogPostStatus, BlogPostStatus>;

export interface BlogSource {
  title: string;
  url: string;
}

/**
 * Blog platform — an article.
 *
 * The body is stored twice on purpose: `bodyMarkdown` is the editable source,
 * `bodyBlocks` the server-rendered structured tree the public API serves
 * (parsed at save time, never at read time, never containing HTML). `toc`,
 * `wordCount`, `readingMinutes` and `searchText` are derived from the same
 * render so every consumer sees identical numbers.
 *
 * `version` is the optimistic-concurrency counter (a stale editor gets 409,
 * never a silent overwrite). `publishedAt` is set once, at first publication;
 * later edits only move `contentUpdatedAt`.
 */
@Entity({ name: 'blog_posts' })
@Index('uq_blog_posts_slug', ['slug'], { unique: true })
@Index('idx_blog_posts_status_published', ['status', 'publishedAt'])
@Index('idx_blog_posts_category', ['primaryCategoryId'])
@Index('idx_blog_posts_author', ['authorUserId'])
@Index('idx_blog_posts_scheduled', ['scheduledFor'], {
  where: `"status" = 'scheduled'`,
})
export class BlogPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 140 })
  slug: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text', default: '' })
  excerpt: string;

  @Column({ name: 'body_markdown', type: 'text', default: '' })
  bodyMarkdown: string;

  @Column({ name: 'body_blocks', type: 'jsonb', default: () => `'[]'::jsonb` })
  bodyBlocks: BlogBlock[];

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  toc: BlogTocEntry[];

  @Column({ name: 'word_count', type: 'int', default: 0 })
  wordCount: number;

  @Column({ name: 'reading_minutes', type: 'int', default: 1 })
  readingMinutes: number;

  /** Title + excerpt + plain body, lower-cased; trigram-indexed for search. */
  @Column({ name: 'search_text', type: 'text', default: '' })
  searchText: string;

  @Column({ name: 'featured_image_url', type: 'text', nullable: true })
  featuredImageUrl: string | null;

  @Column({
    name: 'featured_image_alt',
    type: 'varchar',
    length: 240,
    nullable: true,
  })
  featuredImageAlt: string | null;

  @Column({
    name: 'featured_image_caption',
    type: 'varchar',
    length: 240,
    nullable: true,
  })
  featuredImageCaption: string | null;

  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_user_id' })
  author: User | null;

  @Column({ name: 'reviewer_user_id', type: 'uuid', nullable: true })
  reviewerUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewer_user_id' })
  reviewer: User | null;

  @Column({
    type: 'enum',
    enum: BLOG_POST_STATUS,
    enumName: 'blog_post_status',
    default: 'draft',
  })
  status: BlogPostStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'scheduled_for', type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  /** Last time the CONTENT (not workflow metadata) changed. */
  @Column({ name: 'content_updated_at', type: 'timestamptz', nullable: true })
  contentUpdatedAt: Date | null;

  @Column({ name: 'seo_title', type: 'varchar', length: 70, nullable: true })
  seoTitle: string | null;

  @Column({
    name: 'seo_description',
    type: 'varchar',
    length: 170,
    nullable: true,
  })
  seoDescription: string | null;

  /** Canonical override — only when this article is a syndicated copy. */
  @Column({ name: 'canonical_url', type: 'text', nullable: true })
  canonicalUrl: string | null;

  @Column({ name: 'og_image_url', type: 'text', nullable: true })
  ogImageUrl: string | null;

  @Column({ name: 'primary_category_id', type: 'uuid', nullable: true })
  primaryCategoryId: string | null;

  @ManyToOne(() => BlogCategory, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primary_category_id' })
  primaryCategory: BlogCategory | null;

  /** Topic cluster: the pillar guide this supporting article belongs to. */
  @Column({ name: 'pillar_post_id', type: 'uuid', nullable: true })
  pillarPostId: string | null;

  @ManyToOne(() => BlogPost, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pillar_post_id' })
  pillarPost: BlogPost | null;

  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured: boolean;

  // ---- reader engagement (denormalised; recomputed on every write) --------
  /** Average of `blog_post_ratings` (0 when nobody rated). */
  @Column({
    name: 'rating_avg',
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number | null) => Number(value ?? 0),
    },
  })
  ratingAvg: number;

  @Column({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount: number;

  /** Published comments + replies (hidden/removed excluded). */
  @Column({ name: 'comment_count', type: 'int', default: 0 })
  commentCount: number;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  sources: BlogSource[];

  /** Editorial note shown only in the CMS (why changes were requested, …). */
  @Column({ name: 'editorial_note', type: 'text', nullable: true })
  editorialNote: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
