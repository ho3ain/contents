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
import { CreatorLead } from './creator-lead.entity';

/**
 * Phase C1 — the "next action" of spec §4.
 *
 * "این قسمت بسیار مهم است" — the CRM is not a contact list, it is a
 * to-do system: every record can carry an open action with a due date, an
 * owner, a priority and a status, and those are what the dashboard's
 * "needs follow-up" segment counts.
 */
@Entity({ name: 'creator_crm_actions' })
@Index('idx_creator_crm_actions_lead_status', ['leadId', 'status'])
@Index('idx_creator_crm_actions_assignee', ['assignedToId', 'status'])
@Index('idx_creator_crm_actions_due', ['dueDate', 'status'])
export class CreatorCrmAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId: string;

  @ManyToOne(() => CreatorLead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: CreatorLead;

  /** One of CRM_ACTION_TYPES. */
  @Column({ name: 'type', type: 'varchar', length: 40 })
  type: string;

  /** Short human summary the team can scan in a list. */
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  /** users.id of the team member responsible (an admin / growth member). */
  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: User | null;

  @Column({ name: 'priority', type: 'varchar', length: 8, default: 'normal' })
  priority: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'open' })
  status: string;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** When a snoozed action becomes visible again. */
  @Column({ name: 'snoozed_until', type: 'timestamptz', nullable: true })
  snoozedUntil: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'moved_from_lead_id', type: 'uuid', nullable: true })
  movedFromLeadId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
