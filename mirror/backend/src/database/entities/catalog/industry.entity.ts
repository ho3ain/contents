import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CategoryStatus } from './category.entity';

/**
 * Industry taxonomy (Taxonomy v2). A flat, admin-managed list; agents link to
 * up to MAX_AGENT_INDUSTRIES of them through `agent_industries`. `slug` is the
 * stable internal id; `nameFa` is display-only.
 */
@Entity({ name: 'industries' })
export class Industry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_industries_slug', { unique: true })
  @Column({ name: 'slug', type: 'varchar', length: 80 })
  slug: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'name_fa', type: 'varchar', length: 120, nullable: true })
  nameFa: string | null;

  @Column({
    name: 'description_fa',
    type: 'varchar',
    length: 400,
    nullable: true,
  })
  descriptionFa: string | null;

  @Column({ name: 'aliases', type: 'jsonb', default: () => "'[]'" })
  aliases: string[];

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

/** Product form limit — a product belongs to a few industries, not many. */
export const MAX_AGENT_INDUSTRIES = 3;
