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

export enum CategoryStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * Category taxonomy. Taxonomy v2 (2026-10) adds Persian display fields and an
 * optional parent (max depth 2: category → subcategory). `slug` stays the
 * stable internal id and is never translated.
 */
@Entity({ name: 'categories' })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Index('uq_categories_slug', { unique: true })
  @Column({ name: 'slug', type: 'varchar', length: 110 })
  slug: string;

  @Column({ name: 'description', type: 'varchar', length: 400, nullable: true })
  description: string | null;

  /** Persian display name (display-only; never used as an id). */
  @Column({ name: 'name_fa', type: 'varchar', length: 120, nullable: true })
  nameFa: string | null;

  @Column({
    name: 'description_fa',
    type: 'varchar',
    length: 400,
    nullable: true,
  })
  descriptionFa: string | null;

  /** Search synonyms (FA + EN) — admin-editable, used by the search expander. */
  @Column({ name: 'aliases', type: 'jsonb', default: () => "'[]'" })
  aliases: string[];

  /** Parent category (null = top-level). Depth is capped at 2 in the service. */
  @Index('idx_categories_parent')
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_id' })
  parent: Category | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: CategoryStatus,
    enumName: 'category_status',
    default: CategoryStatus.ACTIVE,
  })
  status: CategoryStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
