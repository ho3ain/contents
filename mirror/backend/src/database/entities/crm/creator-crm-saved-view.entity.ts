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

/** The filter shape a saved view persists (mirrors the list query DTO). */
export interface CrmSavedViewFilters {
  search?: string;
  stage?: string;
  source?: string;
  scoreBand?: string;
  ownerId?: string;
  activity?: string;
  productStatus?: string;
  tags?: string[];
  segmentSlug?: string;
  hasNextAction?: boolean;
  sort?: string;
}

/**
 * Phase C1 — a saved view of the CRM list (spec §1 "Saved Views").
 *
 * The nine starter views from the specification are SEEDED, not hard-wired,
 * so the growth team can add, rename and delete their own views.
 */
@Entity({ name: 'creator_crm_saved_views' })
@Index('uq_creator_crm_saved_views_slug', ['slug'], { unique: true })
export class CreatorCrmSavedView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'slug', type: 'varchar', length: 64 })
  slug: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  filters: CrmSavedViewFilters;

  /** Starter views ship with the product; only admins may delete their own. */
  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  /** Display order in the saved-view bar. */
  @Column({ name: 'position', type: 'integer', default: 0 })
  position: number;

  /** null = shared with the whole growth team. */
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
