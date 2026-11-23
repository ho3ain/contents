import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CreatorProfile } from '../identity/creator-profile.entity';
import { User } from '../identity/user.entity';
import { CreatorReferralEvent } from './creator-referral-event.entity';
import {
  REFERRAL_STAGES,
  type ReferralStage,
} from '../../../modules/success/domain/referral';

/** Runtime mirror of the canonical stage list (see case-study.entity.ts). */
const REFERRAL_STAGE = Object.fromEntries(
  REFERRAL_STAGES.map((s) => [s, s]),
) as Record<ReferralStage, ReferralStage>;

/**
 * Phase C4 §15–§17 — a creator-to-creator referral.
 *
 * Distinct from C2's `creator_leads.referred_by_id`, which is a CRM
 * attribution field an admin sets by hand. This is a program: the referrer
 * mints a code, a stranger carries it, and the referrer watches them move
 * through stages. Reusing the lead column would mean the public signup path
 * and the admin pipeline would be writing the same field with different
 * meanings — the exact duplicate-model failure §36 warns about.
 *
 * The link to C1 is by *code resolution*, not by copying: the same visitor
 * hash that `creator_attributions` already stores is what a referral click
 * records, so one visitor produces one row, not two competing captures.
 *
 * UNIQUE (referrer_id, referred_user_id) makes a referral one-way and
 * single: re-clicking a link by the same person is a no-op, not a second
 * referral. UNIQUE (referrer_id, code) makes codes unambiguous per referrer,
 * which is what allows a short human-typable code.
 */
@Entity({ name: 'creator_referrals' })
@Index('uq_creator_referrals_pair', ['referrerId', 'referredUserId'], {
  unique: true,
})
@Index('uq_creator_referrals_code', ['referrerId', 'code'], { unique: true })
@Index('idx_creator_referrals_referrer', ['referrerId'])
@Index('idx_creator_referrals_referred', ['referredUserId'])
@Index('idx_creator_referrals_stage', ['stage'])
export class CreatorReferral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'referrer_id', type: 'uuid' })
  referrerId: string;

  @ManyToOne(() => CreatorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrer_id' })
  referrer: CreatorProfile;

  @Column({ name: 'referrer_user_id', type: 'uuid' })
  referrerUserId: string;

  /**
   * The invited stranger. NULL until they register, which is what makes a
   * referral countable from the moment the link is shared rather than only
   * from the moment it converts.
   */
  @Column({ name: 'referred_user_id', type: 'uuid', nullable: true })
  referredUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'referred_user_id' })
  referredUser: User | null;

  /** The creator profile the stranger became, once they became one. */
  @Column({ name: 'referred_creator_id', type: 'uuid', nullable: true })
  referredCreatorId: string | null;

  @Column({ type: 'varchar', length: 24 })
  code: string;

  @Column({
    type: 'enum',
    enum: REFERRAL_STAGE,
    enumName: 'creator_referral_stage',
    default: REFERRAL_STAGE.invited,
  })
  stage: ReferralStage;

  /**
   * The C1 attribution row this referral resolved from, when it resolved from
   * one. Kept as a reference rather than a copy so the two cannot drift.
   */
  @Column({ name: 'attribution_id', type: 'uuid', nullable: true })
  attributionId: string | null;

  @Column({
    name: 'first_seen_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  firstSeenAt: Date;

  @Column({ name: 'registered_at', type: 'timestamptz', nullable: true })
  registeredAt: Date | null;

  /**
   * §17/§44 — a reward is *eligible* and *reviewed*, and nothing here is a
   * currency amount. The project has no wallet or payout system, so
   * persisting an amount would create a financial figure that no system
   * could ever honour. Admin marks eligibility reviewed; the money, if there
   * ever is any, happens outside Mesh and is not something this row
   * pretends to know about.
   */
  @Column({ name: 'reward_reviewed_at', type: 'timestamptz', nullable: true })
  rewardReviewedAt: Date | null;

  @Column({ name: 'reward_reviewed_by', type: 'uuid', nullable: true })
  rewardReviewedBy: string | null;

  @OneToMany(() => CreatorReferralEvent, (event) => event.referral, {
    cascade: false,
  })
  events: CreatorReferralEvent[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
