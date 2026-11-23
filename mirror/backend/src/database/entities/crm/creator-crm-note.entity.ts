import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../identity/user.entity';
import { CreatorLead } from './creator-lead.entity';

/**
 * Phase C1 — an internal note about a creator (spec §3).
 *
 * "فقط Internal باشند. برای Creator قابل مشاهده نباشند."
 *
 * That is enforced structurally, not by convention: this table is
 * registered ONLY in the CRM (admin) module and its service is never
 * exported to a creator-facing module, so no public/controller path can
 * reach it. There is no creator-facing read endpoint for notes at all.
 */
@Entity({ name: 'creator_crm_notes' })
@Index('idx_creator_crm_notes_lead', ['leadId', 'createdAt'])
export class CreatorCrmNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId: string;

  @ManyToOne(() => CreatorLead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: CreatorLead;

  @Column({ type: 'text' })
  body: string;

  /** users.id of the admin who wrote it. */
  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  /**
   * Set when a merge moved this note to the surviving lead, so the note's
   * original target is never lost.
   */
  @Column({ name: 'moved_from_lead_id', type: 'uuid', nullable: true })
  movedFromLeadId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
