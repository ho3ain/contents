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
import { Affiliate } from './affiliate.entity';
import {
  REWARD_STATUSES,
  type RewardStatus,
} from '../../../modules/scale/domain/money';

const COMMISSION_STATUS = Object.fromEntries(
  REWARD_STATUSES.map((s) => [s, s]),
) as Record<RewardStatus, RewardStatus>;

/**
 * Phase C5 §23, §24, §38 — an affiliate commission.
 *
 * Separate from `referral_rewards` on purpose (§19): an affiliate is paid a
 * percentage of an order, a creator is paid a flat reward for a milestone,
 * and they are approved by different people on different schedules. Sharing
 * one table would mean one of the two is always wrong.
 *
 * `idempotency_key` carries `commissionKey()` from the domain module and is
 * UNIQUE. That single constraint is what makes §38 true: a retried payment
 * webhook, a replayed message and an admin double-click all compute the same
 * key, and the second insert is rejected by Postgres rather than by a
 * `SELECT` that another process could win a race against.
 */
@Entity({ name: 'affiliate_commissions' })
@Index('uq_affiliate_commissions_key', ['idempotencyKey'], { unique: true })
@Index('idx_affiliate_commissions_affiliate', ['affiliateId'])
@Index('idx_affiliate_commissions_status', ['status'])
@Index('idx_affiliate_commissions_order', ['orderId'])
export class AffiliateCommission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey: string;

  @Column({ name: 'affiliate_id', type: 'uuid' })
  affiliateId: string;

  @ManyToOne(() => Affiliate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'affiliate_id' })
  affiliate: Affiliate;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  /** The buyer the affiliate brought. Null for a creator referral. */
  @Column({ name: 'referred_user_id', type: 'uuid', nullable: true })
  referredUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'referred_user_id' })
  referredUser: User | null;

  @Column({ name: 'order_total_minor', type: 'bigint' })
  orderTotalMinor: string;

  @Column({ name: 'rate_bps', type: 'integer' })
  rateBps: number;

  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor: string;

  @Column({ type: 'varchar', length: 8, default: 'IRR' })
  currency: string;

  @Column({
    type: 'enum',
    enum: COMMISSION_STATUS,
    enumName: 'commission_status',
    default: COMMISSION_STATUS.pending,
  })
  status: RewardStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'available_at', type: 'timestamptz', nullable: true })
  availableAt: Date | null;

  /** §55: payout is manual. `paid_at` records an offline transfer. */
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({
    name: 'paid_reference',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  paidReference: string | null;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt: Date | null;

  @Column({
    name: 'reversal_reason',
    type: 'varchar',
    length: 240,
    nullable: true,
  })
  reversalReason: string | null;

  /** Why a commission was NOT created, when it was refused. §23 auditability. */
  @Column({
    name: 'blocked_reason',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  blockedReason: string | null;

  @Column({ name: 'risk_flag', type: 'varchar', length: 32, nullable: true })
  riskFlag: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
