import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Content kinds that take part in SEO Studio and the knowledge graph. */
export const SEO_CONTENT_TYPES = ['post', 'agent'] as const;
export type SeoContentType = (typeof SEO_CONTENT_TYPES)[number];

export const SEO_LANGUAGES = ['fa', 'en'] as const;
export type SeoLanguage = (typeof SEO_LANGUAGES)[number];

export const TWITTER_CARDS = ['summary', 'summary_large_image'] as const;
export type TwitterCard = (typeof TWITTER_CARDS)[number];

export interface StoredKeyword {
  /** Exactly as the editor typed it (never normalised in storage). */
  text: string;
  /** Comparison key (`keywordKey`) — recomputed on write, never shown. */
  key: string;
}

/**
 * SEO metadata shared by articles and products (one row per content item).
 *
 * Articles keep their four historical columns on `blog_posts` (`seo_title`,
 * `seo_description`, `canonical_url`, `og_image_url`) so every existing
 * API/consumer stays compatible; the columns of the same name here are used
 * for products only and are ignored for posts (the service merges both).
 */
@Entity({ name: 'content_seo' })
@Index('uq_content_seo_content', ['contentType', 'contentId'], { unique: true })
@Index('idx_content_seo_translation', ['translationGroupId'])
@Index('idx_content_seo_focus', ['focusKeywordKey'])
export class ContentSeo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'content_type', type: 'varchar', length: 16 })
  contentType: SeoContentType;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @Column({ name: 'seo_title', type: 'varchar', length: 70, nullable: true })
  seoTitle: string | null;

  @Column({
    name: 'seo_description',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  seoDescription: string | null;

  @Column({ name: 'canonical_url', type: 'text', nullable: true })
  canonicalUrl: string | null;

  @Column({ name: 'og_image_url', type: 'text', nullable: true })
  ogImageUrl: string | null;

  @Column({ name: 'robots_index', type: 'boolean', default: true })
  robotsIndex: boolean;

  @Column({ name: 'robots_follow', type: 'boolean', default: true })
  robotsFollow: boolean;

  @Column({ name: 'og_title', type: 'varchar', length: 95, nullable: true })
  ogTitle: string | null;

  @Column({
    name: 'og_description',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  ogDescription: string | null;

  @Column({
    name: 'twitter_card',
    type: 'varchar',
    length: 24,
    default: 'summary_large_image',
  })
  twitterCard: TwitterCard;

  @Column({
    name: 'focus_keyword',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  focusKeyword: string | null;

  @Column({
    name: 'focus_keyword_key',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  focusKeywordKey: string | null;

  @Column({
    name: 'related_keywords',
    type: 'jsonb',
    default: () => `'[]'::jsonb`,
  })
  relatedKeywords: StoredKeyword[];

  @Column({ type: 'varchar', length: 5, default: 'fa' })
  language: SeoLanguage;

  /** Items sharing a group are translations of one another (one per language). */
  @Column({ name: 'translation_group_id', type: 'uuid', nullable: true })
  translationGroupId: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
