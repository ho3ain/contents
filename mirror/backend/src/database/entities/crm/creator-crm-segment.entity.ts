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
import type { SegmentDocument } from '../../../modules/crm/domain/segments';

/**
 * Phase C1 — a dynamic segment (spec §9).
 *
 * The segment stores a RULE DOCUMENT, not a list of ids, so it keeps
 * answering "who matches right now" as the data changes. The grammar is
 * closed and validated (domain/segments.ts), so a stored document can never
 * contain arbitrary SQL.
 */
@Entity({ name: 'creator_crm_segments' })
@Index('uq_creator_crm_segments_slug', ['slug'], { unique: true })
export class CreatorCrmSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'slug', type: 'varchar', length: 64 })
  slug: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /** The validated rule document (see domain/segments.ts). */
  @Column({ type: 'jsonb' })
  document: SegmentDocument;

  /** System segments ship with the product and cannot be deleted. */
  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
