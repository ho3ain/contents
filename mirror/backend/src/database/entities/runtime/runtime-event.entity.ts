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
import {
  RuntimeRegistration,
  RuntimeState,
} from './runtime-registration.entity';

/** Dedicated lifecycle/security history: unlike best-effort generic audit it is part of the control-plane transaction. */
@Entity({ name: 'runtime_events' })
@Index('idx_runtime_events_runtime_created', ['runtimeId', 'createdAt'])
@Index('uq_runtime_events_dedup_key', ['dedupKey'], { unique: true })
export class RuntimeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'runtime_id', type: 'uuid' })
  runtimeId: string;

  @ManyToOne(() => RuntimeRegistration, (runtime) => runtime.events, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'runtime_id' })
  runtime: RuntimeRegistration;

  @Column({ name: 'event_type', type: 'varchar', length: 48 })
  eventType: string;

  @Column({
    name: 'previous_state',
    type: 'varchar',
    length: 24,
    nullable: true,
  })
  previousState: RuntimeState | null;

  @Column({ name: 'next_state', type: 'varchar', length: 24, nullable: true })
  nextState: RuntimeState | null;

  @Column({ name: 'reason_code', type: 'varchar', length: 64, nullable: true })
  reasonCode: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: User | null;

  /** Idempotency identity, never a bearer credential or request body. */
  @Column({ name: 'dedup_key', type: 'varchar', length: 180 })
  dedupKey: string;

  @Column({
    name: 'evidence_ref',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  evidenceRef: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
