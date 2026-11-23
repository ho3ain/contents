import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CreatorLead } from './creator-lead.entity';

/**
 * Phase C1 — a tag a growth member can attach to a CRM record (spec §9).
 *
 * Tags are ROWS, not an enum, so the team can add "AI Agent", "Strategic",
 * "Agency" or anything else at runtime without a migration. The starter set
 * in domain/taxonomy.ts is only seed data.
 */
@Entity({ name: 'creator_crm_tags' })
export class CreatorCrmTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Normalized (lowercase, hyphenated) — the unique lookup key. */
  @Index('uq_creator_crm_tags_slug', { unique: true })
  @Column({ name: 'slug', type: 'varchar', length: 48 })
  slug: string;

  /** What the team sees; localized copy lives in the UI, not the DB. */
  @Column({ name: 'label', type: 'varchar', length: 80 })
  label: string;

  @Column({ name: 'group', type: 'varchar', length: 20, default: 'custom' })
  group: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/**
 * Lead ↔ tag. UNIQUE (lead, tag) makes "add tag" idempotent; the extra
 * index on tag_id serves the "every lead with this tag" segment filter.
 */
@Entity({ name: 'creator_crm_record_tags' })
@Unique('uq_creator_crm_record_tags_lead_tag', ['leadId', 'tagId'])
@Index('idx_creator_crm_record_tags_tag', ['tagId'])
export class CreatorCrmRecordTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId: string;

  @ManyToOne(() => CreatorLead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: CreatorLead;

  @Column({ name: 'tag_id', type: 'uuid' })
  tagId: string;

  @Column({ name: 'added_by', type: 'uuid', nullable: true })
  addedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
