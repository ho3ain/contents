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
import { CreatorProfile } from '../identity/creator-profile.entity';
import { CreatorReferral } from '../success/creator-referral.entity';
import { User } from '../identity/user.entity';
import {
  REWARD_STATUSES,
  type RewardStatus,
} from '../../../modules/scale/domain/money';

const REWARD_STATUS = Object.fromEntries(
  REWARD_STATUSES.map((s) => [s, s]),
) as Record<RewardStatus, RewardStatus>;

/**
 * Phase C5 §7 — a reward a creator earned by referring somebody.
 *
 * A reward is a LEDGER ENTRY, not a column on the referral. It has an amount,
 * a currency, a lifecycle, an approver and a reversal, and each of those is
 * an independent fact about an independent event. C4's `creator_referrals`
 * carries a `reward_reviewed_at` timestamp, which is a *flag*; this row is the
 * money.
 *
 * `uq_referral_rewards_reason` is the anti-duplicate guarantee (§38): a retried
 * payment webhook, a double-clicked admin button and a replayed queue message
 * all resolve to the same (referral, reason) pair, so the database refuses
 * the second insert. Idempotency is a constraint, not a hopeful `if (!x)`.
 */
@Entity({ name: 'referral_rewards' })
@Index('uq_referral_rewards_reason', ['referralId', 'reason'], { unique: true })
@Index('idx_referral_rewards_referrer', ['referrerId'])
@Index('idx_referral_rewards_status', ['status'])
export class ReferralReward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'referral_id', type: 'uuid' })
  referralId: string;

  @ManyToOne(() => CreatorReferral, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referral_id' })
  referral: CreatorReferral;

  @Column({ name: 'referrer_id', type: 'uuid' })
  referrerId: string;

  @ManyToOne(() => CreatorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrer_id' })
  referrer: CreatorProfile;

  /**
   * Why this reward exists. Part of the unique index, so "one reward for
   * reaching `published`" is enforced by the schema and not by a check in
   * application code that a future call site can forget.
   */
  @Column({ type: 'varchar', length: 48 })
  reason: string;

  /**
   * Minor units, as an integer. A float amount of money in a database is a
   * rounding bug waiting for the first odd number; the platform's own order
   * totals are integers for the same reason.
   */
  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor: string;

  @Column({ type: 'varchar', length: 8, default: 'IRR' })
  currency: string;

  @Column({
    type: 'enum',
    enum: REWARD_STATUS,
    enumName: 'reward_status',
    default: REWARD_STATUS.pending,
  })
  status: RewardStatus;

  /** The order that generated this reward, for a money trace. */
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver: User | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'available_at', type: 'timestamptz', nullable: true })
  availableAt: Date | null;

  /**
   * §55 owner decision: payout is MANUAL. `paid_at` records when an admin
   * confirmed an offline transfer happened — it is not a trigger for one, and
   * the UI says so rather than implying an automatic payment.
   */
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

  /** §38 — why this reward is being held for a human instead of auto-approved. */
  @Column({ name: 'risk_flag', type: 'varchar', length: 32, nullable: true })
  riskFlag: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
