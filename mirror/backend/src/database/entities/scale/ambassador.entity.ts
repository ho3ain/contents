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
import { User } from '../identity/user.entity';
import {
  AMBASSADOR_STATUSES,
  type AmbassadorStatus,
} from '../../../modules/scale/domain/ambassador';

const AMBASSADOR_STATUS = Object.fromEntries(
  AMBASSADOR_STATUSES.map((s) => [s, s]),
) as Record<AmbassadorStatus, AmbassadorStatus>;

/**
 * Phase C5 §11, §12 — a creator's ambassador record.
 *
 * One row per creator (1:1 with the profile). `status` is the invitation
 * state, NOT the tier: the tier lives in `level_id`, which is a
 * CONFIGURABLE row in `ambassador_levels` rather than an enum, because §12
 * says to build for tiers without hard-coding them. An admin can add
 * `Pro` and `Elite` with their own thresholds later and no migration.
 *
 * `level_id` is nullable ON PURPOSE: an ambassador with no level configured
 * is a real state (nobody has set up the tiers yet) and must be shown as
 * "level not configured" rather than as "Ambassador 0".
 */
@Entity({ name: 'ambassadors' })
@Index('uq_ambassadors_profile', ['creatorProfileId'], { unique: true })
@Index('uq_ambassadors_user', ['userId'], { unique: true })
@Index('idx_ambassadors_status', ['status'])
@Index('idx_ambassadors_level', ['levelId'])
export class Ambassador {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'creator_profile_id', type: 'uuid' })
  creatorProfileId: string;

  @ManyToOne(() => CreatorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_profile_id' })
  creator: CreatorProfile;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: AMBASSADOR_STATUS,
    enumName: 'ambassador_status',
    default: AMBASSADOR_STATUS.invited,
  })
  status: AmbassadorStatus;

  /**
   * FK to `ambassador_levels.id`, nullable. The relation is intentionally not
   * a TypeORM relation (no decorator): a nullable, config-driven lookup is not
   * a navigation relationship, and making it one would couple the creator's
   * ambassador row to the lifecycle of an admin-managed config table.
   */
  @Column({ name: 'level_id', type: 'uuid', nullable: true })
  levelId: string | null;

  @Column({ name: 'invited_at', type: 'timestamptz', default: () => 'now()' })
  invitedAt: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  /** §55 owner decision: admin approval. This is who said yes. */
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'suspended_at', type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @Column({
    name: 'suspension_reason',
    type: 'varchar',
    length: 240,
    nullable: true,
  })
  suspensionReason: string | null;

  /**
   * The referral code the ambassador shares. It REUSES the C4 referral code
   * rather than minting a second one: a creator who is an ambassador already
   * has a link, and two links for the same person would split their own
   * attribution and make their dashboard disagree with itself.
   */
  @Column({ name: 'share_code', type: 'varchar', length: 24, nullable: true })
  shareCode: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
