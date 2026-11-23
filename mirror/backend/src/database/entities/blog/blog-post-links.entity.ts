import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Agent } from '../agents/agent.entity';
import { Category } from '../catalog/category.entity';
import { User } from '../identity/user.entity';
import { BlogPost } from './blog-post.entity';
import { BlogTag } from './blog-tag.entity';

/** post ↔ tag */
@Entity({ name: 'blog_post_tags' })
@Index('idx_blog_post_tags_tag', ['tagId'])
export class BlogPostTag {
  @PrimaryColumn({ name: 'post_id', type: 'uuid' })
  postId: string;

  @PrimaryColumn({ name: 'tag_id', type: 'uuid' })
  tagId: string;

  @ManyToOne(() => BlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BlogPost;

  @ManyToOne(() => BlogTag, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag: BlogTag;
}

/** Hand-picked related articles (directed; `position` keeps editorial order). */
@Entity({ name: 'blog_post_relations' })
export class BlogPostRelation {
  @PrimaryColumn({ name: 'post_id', type: 'uuid' })
  postId: string;

  @PrimaryColumn({ name: 'related_post_id', type: 'uuid' })
  relatedPostId: string;

  @Column({ type: 'smallint', default: 0 })
  position: number;

  @ManyToOne(() => BlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BlogPost;

  @ManyToOne(() => BlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'related_post_id' })
  relatedPost: BlogPost;
}

/** Marketplace products an article talks about (`/agents/:slug`). */
@Entity({ name: 'blog_post_agents' })
@Index('idx_blog_post_agents_agent', ['agentId'])
export class BlogPostAgent {
  @PrimaryColumn({ name: 'post_id', type: 'uuid' })
  postId: string;

  @PrimaryColumn({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @Column({ type: 'smallint', default: 0 })
  position: number;

  @ManyToOne(() => BlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BlogPost;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;
}

/** Marketplace categories an article points readers to (`/categories/:slug`). */
@Entity({ name: 'blog_post_market_categories' })
@Index('idx_blog_post_market_categories_category', ['categoryId'])
export class BlogPostMarketCategory {
  @PrimaryColumn({ name: 'post_id', type: 'uuid' })
  postId: string;

  @PrimaryColumn({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ type: 'smallint', default: 0 })
  position: number;

  @ManyToOne(() => BlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BlogPost;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;
}

/**
 * Old slug → post. Written when the slug of an ever-published article changes
 * so the previous URL keeps resolving (the public API answers with the current
 * slug and the SPA replaces the location). A slug that is currently live can
 * never also be a redirect source, and a redirect always points at a post id —
 * so chains and loops are impossible by construction.
 */
@Entity({ name: 'blog_slug_redirects' })
@Index('idx_blog_slug_redirects_post', ['postId'])
export class BlogSlugRedirect {
  @PrimaryColumn({ name: 'old_slug', type: 'varchar', length: 140 })
  oldSlug: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => BlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BlogPost;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

export interface BlogRevisionSnapshot {
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
  sources: Array<{ title: string; url: string }>;
}

export type BlogRevisionReason = 'save' | 'publish' | 'restore' | 'create';

/**
 * Bounded revision history (content fields only — workflow state is in the
 * audit log). One row per MEANINGFUL save, never per keystroke: autosaves do
 * not create revisions and consecutive manual saves by the same editor within
 * {@link BLOG_REVISION_COALESCE_MS} collapse into one. The newest
 * {@link BLOG_REVISION_LIMIT} rows per post are kept.
 */
@Entity({ name: 'blog_post_revisions' })
@Index('idx_blog_post_revisions_post', ['postId', 'createdAt'])
export class BlogPostRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => BlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BlogPost;

  /** The post `version` this snapshot corresponds to. */
  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 16 })
  reason: BlogRevisionReason;

  @Column({ type: 'jsonb' })
  snapshot: BlogRevisionSnapshot;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

export const BLOG_REVISION_LIMIT = 50;
export const BLOG_REVISION_COALESCE_MS = 10 * 60 * 1000;
