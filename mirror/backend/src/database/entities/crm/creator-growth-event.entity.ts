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
 * Phase C1 — an append-only lifecycle event for one CRM record.
 *
 * This is the backbone of §11 (tracking), §13 (timeline) and §15
 * (automation readiness): every real transition writes one row here under a
 * stable event name, with a UNIQUE dedup_key so a replayed webhook, a
 * double click or a retried transaction can never double-count (§29).
 *
 * `lead_id` is nullable on purpose: a stage/event can be derived for a
 * creator who registered before C1 existed and has no lead row. The record
 * is then anchored on creator_profile_id / user_id instead.
 */
@Entity({ name: 'creator_growth_events' })
@Index('idx_creator_growth_events_lead_time', ['leadId', 'occurredAt'])
@Index('idx_creator_growth_events_creator_time', [
  'creatorProfileId',
  'occurredAt',
])
@Index('idx_creator_growth_events_name_time', ['eventName', 'occurredAt'])
export class CreatorGrowthEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @ManyToOne(() => CreatorLead, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'lead_id' })
  lead: CreatorLead | null;

  @Column({ name: 'creator_profile_id', type: 'uuid', nullable: true })
  creatorProfileId: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  /** One of CREATOR_EVENTS (domain/events.ts) — the automation seam. */
  @Column({ name: 'event_name', type: 'varchar', length: 48 })
  eventName: string;

  /** The actor: an admin for CRM events, the user for system events. */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  /** 'system' | 'crm' | 'email' | 'attribution' (domain/events.ts). */
  @Column({ name: 'source', type: 'varchar', length: 16, default: 'system' })
  source: string;

  /**
   * The entity the event is about (agent / order / review …). Lets the UI
   * deep-link a timeline row to the real object.
   */
  @Column({ name: 'entity_type', type: 'varchar', length: 32, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  /** UNIQUE — the idempotency key required by §29. */
  @Column({ name: 'dedup_key', type: 'varchar', length: 200, unique: true })
  dedupKey: string;

  /**
   * Always passed through `sanitizeMetadata()` (domain/privacy.ts) before it
   * reaches this column: no card numbers, tokens, passwords or secrets.
   */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  occurredAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
