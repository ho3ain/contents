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
import { Partnership } from './partnership.entity';
import {
  AFFILIATE_STATUSES,
  type AffiliateStatus,
} from '../../../modules/scale/domain/affiliate';

const AFFILIATE_STATUS = Object.fromEntries(
  AFFILIATE_STATUSES.map((s) => [s, s]),
) as Record<AffiliateStatus, AffiliateStatus>;

/**
 * Phase C5 §19–§22 — an affiliate.
 *
 * §19: affiliate must stay separate from referral. This table is that
 * separation made concrete — an affiliate is an *identity with a status and
 * an application*, which is a different thing from a link a creator already
 * had in C4.
 *
 * `user_id` is nullable because §20 allows a Creator **or a Partner** to
 * apply: a partner that is not a MESH user has no account to hang this on,
 * and requiring one would have excluded exactly the agencies and consultancies
 * §14 is aimed at. When it IS null, `partnership_id` carries the identity and
 * the affiliate gets no login — they are administered by staff, which is the
 * correct posture for someone paid commission.
 *
 * Exactly one of `user_id` / `partnership_id` is set, and the migration
 * enforces it with a CHECK constraint so no code path can produce an affiliate
 * that belongs to nobody.
 */
@Entity({ name: 'affiliates' })
@Index('uq_affiliates_user', ['userId'], { unique: true })
@Index('uq_affiliates_code', ['code'], { unique: true })
@Index('idx_affiliates_status', ['status'])
export class Affiliate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'partnership_id', type: 'uuid', nullable: true })
  partnershipId: string | null;

  @ManyToOne(() => Partnership, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'partnership_id' })
  partnership: Partnership | null;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName: string;

  @Column({ name: 'website_url', type: 'varchar', length: 500, nullable: true })
  websiteUrl: string | null;

  /** §20 stores links as an array; §20's own rule is validated in the domain. */
  @Column({ name: 'social_links', type: 'jsonb', default: () => "'[]'::jsonb" })
  socialLinks: string[];

  @Column({ name: 'audience_size', type: 'integer', nullable: true })
  audienceSize: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  channels: string[];

  @Column({
    name: 'audience_type',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  audienceType: string | null;

  /** The applicant's own words. Shown to admins, never rendered as HTML. */
  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({
    type: 'enum',
    enum: AFFILIATE_STATUS,
    enumName: 'affiliate_status',
    default: AFFILIATE_STATUS.pending,
  })
  status: AffiliateStatus;

  /** The public referral code. One per affiliate; drives attribution. */
  @Column({ type: 'varchar', length: 24 })
  code: string;

  /** §23 — commission rate in basis points. Set at approval, from config. */
  @Column({ name: 'commission_rate_bps', type: 'integer', default: 0 })
  commissionRateBps: number;

  /**
   * §20: "payment information only if genuinely needed and at the right
   * stage". There is no automatic payout (§55), so NO payment details are
   * collected at all. A payout destination is added by an admin at
   * `paid` time, out of band. Collecting a bank card at application time to
   * never use it would be the platform asking for data it has no need for.
   */
  @Column({
    name: 'payout_reference',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  payoutReference: string | null;

  /** §21 — the admin records WHY. A rejection without a reason is unactionable. */
  @Column({
    name: 'decision_reason',
    type: 'varchar',
    length: 240,
    nullable: true,
  })
  decisionReason: string | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'click_count', type: 'integer', default: 0 })
  clickCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
