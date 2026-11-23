import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Entitlement } from './entitlement.entity';
import { User } from '../identity/user.entity';

/**
 * Append-only lifecycle evidence for the entitlement authority. Generic audit
 * logs remain useful operationally, but this record is written in the same
 * transaction as the authority state transition and is therefore the durable
 * lifecycle history.
 */
@Entity({ name: 'entitlement_events' })
@Index('uq_entitlement_events_dedup_key', ['dedupKey'], { unique: true })
@Index(
  'idx_entitlement_events_entitlement_sequence',
  ['entitlementId', 'sequence'],
  {
    unique: true,
  },
)
@Index('idx_entitlement_events_created_at', ['createdAt'])
export class EntitlementEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entitlement_id', type: 'uuid' })
  entitlementId: string;

  @ManyToOne(() => Entitlement, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'entitlement_id' })
  entitlement: Entitlement;

  /** Closed, server-owned event vocabulary; never a client supplied action. */
  @Column({ name: 'event_type', type: 'varchar', length: 48 })
  eventType: string;

  @Column({
    name: 'previous_state',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  previousState: string | null;

  @Column({ name: 'next_state', type: 'varchar', length: 32, nullable: true })
  nextState: string | null;

  /** Monotonically increasing per entitlement for concurrency/audit review. */
  @Column({ type: 'integer' })
  sequence: number;

  /** Stable idempotency key from an order/refund/job transition. */
  @Column({ name: 'dedup_key', type: 'varchar', length: 160 })
  dedupKey: string;

  @Column({ name: 'source_type', type: 'varchar', length: 32 })
  sourceType: string;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Column({ name: 'reason_code', type: 'varchar', length: 64, nullable: true })
  reasonCode: string | null;

  /** Actor identity when there is one; no IP, token or secret is stored. */
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: User | null;

  /** Safe, minimized operational context (never credentials or raw PII). */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
