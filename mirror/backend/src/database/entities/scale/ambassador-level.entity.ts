import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Phase C5 §12 — configurable ambassador tiers.
 *
 * §12 is unambiguous: "if the tier is not settled in the business model, do
 * not hard-code it; the structure must be extensible". An enum would make
 * every tier change a migration, and would put a pricing decision into the
 * schema where nobody can change it without a deploy. A table lets an admin
 * add `Pro` or `Elite` with its own thresholds and reward today.
 *
 * `seeded` marks the rows a migration may insert as defaults. The migration
 * creates exactly one, deliberately unranked, because publishing a tier ladder
 * is a business decision this spec does not make.
 */
@Entity({ name: 'ambassador_levels' })
@Index('uq_ambassador_levels_name', ['name'], { unique: true })
@Index('idx_ambassador_levels_rank', ['rank'])
export class AmbassadorLevel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stored unlocalised; the UI owns display names per locale. */
  @Column({ type: 'varchar', length: 48 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Higher rank wins when several levels match. The spec's example ladder is
   * Ambassador < Pro < Elite, and an integer makes that ordering explicit
   * rather than alphabetical.
   */
  @Column({ type: 'integer', default: 0 })
  rank: number;

  /** Thresholds in the same units as the creator's facts. */
  @Column({ name: 'min_sales', type: 'integer', default: 0 })
  minSales: number;

  @Column({ name: 'min_referral_conversions', type: 'integer', default: 0 })
  minReferralConversions: number;

  /**
   * Rate in basis points (1% = 100). A rate belongs to the LEVEL, not to the
   * code, so changing the commercial terms is a data change an admin makes —
   * which is the opposite of hard-coding them in a TypeScript constant.
   */
  @Column({ name: 'reward_rate_bps', type: 'integer', default: 0 })
  rewardRateBps: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'seeded', type: 'boolean', default: false })
  seeded: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
