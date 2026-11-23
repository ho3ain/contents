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

/**
 * Blog platform — EDITORIAL category (distinct from the marketplace taxonomy
 * in `categories`: a blog category groups articles by reader intent, a
 * marketplace category groups products by capability; the two are linked per
 * article through `blog_post_market_categories`, never merged).
 *
 * One optional parent level (`parentId`), the same shape as the marketplace
 * taxonomy so admins meet a familiar model. `slug` is the public URL
 * (`/blog/category/:slug`) and unique at the database level.
 */
@Entity({ name: 'blog_categories' })
@Index('uq_blog_categories_slug', ['slug'], { unique: true })
@Index('idx_blog_categories_parent', ['parentId'])
export class BlogCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 110 })
  slug: string;

  /** Persian display name (the product language of MESH). */
  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Optional Latin name, used in English UI / feeds; never a second URL. */
  @Column({ name: 'name_en', type: 'varchar', length: 120, nullable: true })
  nameEn: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => BlogCategory, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent: BlogCategory | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
