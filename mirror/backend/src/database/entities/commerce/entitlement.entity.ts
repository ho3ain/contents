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
import { Agent } from '../agents/agent.entity';
import { AgentVersion } from '../agents/agent-version.entity';
import { Order } from './order.entity';
import type { CommercialProfile } from '../agents/product-model';

export enum EntitlementStatus {
  /** Compatibility projection for historical callers. */
  GRANTED = 'granted',
  /** Compatibility projection for every non-access lifecycle state. */
  REVOKED = 'revoked',
}

/** Canonical authority state. `status` above remains for legacy contracts. */
export const ENTITLEMENT_LIFECYCLE_STATES = [
  'pending_activation',
  'active',
  'grace',
  'expired',
  'suspended',
  'revoked',
] as const;
export type EntitlementLifecycleState =
  (typeof ENTITLEMENT_LIFECYCLE_STATES)[number];

/** The present schema has users only; organisation holders need their model first. */
export const ENTITLEMENT_HOLDER_KINDS = ['user'] as const;
export type EntitlementHolderKind = (typeof ENTITLEMENT_HOLDER_KINDS)[number];

/**
 * The formal right to use an agent. Paid agents earn the entitlement after a
 * confirmed successful payment (order-linked); free agents are granted the
 * entitlement directly — no zero-value order is created for them. Revoked by
 * refund or suspension. Unpublishing never takes entitlements away.
 */
@Entity({ name: 'entitlements' })
@Index('idx_entitlements_user_agent', ['userId', 'agentId'], { unique: true })
export class Entitlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_entitlements_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('idx_entitlements_agent_id')
  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({ name: 'agent_version_id', type: 'uuid', nullable: true })
  agentVersionId: string | null;

  @ManyToOne(() => AgentVersion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_version_id' })
  agentVersion: AgentVersion | null;

  /** Set for paid purchases; NULL for free grants (no order exists). */
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EntitlementStatus,
    enumName: 'entitlement_status',
    default: EntitlementStatus.GRANTED,
  })
  status: EntitlementStatus;

  /** Canonical Phase 2 state. Null is a truthful legacy row and is mapped from `status`. */
  @Column({
    name: 'lifecycle_state',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  lifecycleState: EntitlementLifecycleState | null;

  /** Only `user` is valid while MESH has no organisation/team aggregate. */
  @Column({ name: 'holder_kind', type: 'varchar', length: 16, default: 'user' })
  holderKind: EntitlementHolderKind;

  /** Immutable purchase-time terms copied from the order item; null means legacy unknown. */
  @Column({ name: 'commercial_terms_snapshot', type: 'jsonb', nullable: true })
  commercialTermsSnapshot: CommercialProfile | null;

  /** Platform-controlled access scopes, derived at grant time — not creator-provided rights. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  capabilities: string[];

  @Column({ name: 'valid_from', type: 'timestamptz', nullable: true })
  validFrom: Date | null;

  @Index('idx_entitlements_valid_until')
  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  /** Decimal rather than float so a future trusted meter cannot lose units. */
  @Column({
    name: 'usage_limit',
    type: 'numeric',
    precision: 20,
    scale: 6,
    nullable: true,
  })
  usageLimit: string | null;

  @Column({
    name: 'usage_consumed',
    type: 'numeric',
    precision: 20,
    scale: 6,
    default: 0,
  })
  usageConsumed: string;

  /** Optimistic lifecycle sequence; each transition appends an event with this value. */
  @Column({ name: 'lifecycle_sequence', type: 'integer', default: 0 })
  lifecycleSequence: number;

  @Column({
    name: 'status_reason_code',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  statusReasonCode: string | null;

  @Column({ name: 'last_lifecycle_at', type: 'timestamptz', nullable: true })
  lastLifecycleAt: Date | null;

  @Column({ name: 'granted_at', type: 'timestamptz', nullable: true })
  grantedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_reason', type: 'text', nullable: true })
  revokedReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
