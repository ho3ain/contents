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
  RISK_FLAGS,
  type RiskFlagKind,
} from '../../../modules/scale/domain/attribution';

const RISK_FLAG = Object.fromEntries(RISK_FLAGS.map((s) => [s, s])) as Record<
  RiskFlagKind,
  RiskFlagKind
>;

/**
 * Phase C5 §47 — a risk flag.
 *
 * §47 is explicit that flags are not necessarily automatic blocks, and that an
 * admin must be able to review them. So there is exactly one status here,
 * `open` → `cleared` / `confirmed`, and a flag NEVER stops a payout by
 * itself: a flagged reward sits at `pending` until a human decides. Making
 * fraud detection auto-blocking would let a false positive silently destroy a
 * real creator's earnings, and would be worse than the fraud it prevents.
 *
 * `subject_type` is deliberately a string pair rather than a polymorphic
 * relation. A flag can point at a referral, a commission, an affiliate or a
 * user, and four nullable FKs with a CHECK would be a worse schema than two
 * columns that cannot dangle.
 */
@Entity({ name: 'growth_risk_flags' })
@Index('idx_growth_risk_flags_kind', ['kind'])
@Index('idx_growth_risk_flags_status', ['status'])
@Index('idx_growth_risk_flags_subject', ['subjectType', 'subjectId'])
export class GrowthRiskFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: RISK_FLAG, enumName: 'risk_flag_kind' })
  kind: RiskFlagKind;

  /** What the flag is about: 'referral' | 'commission' | 'affiliate' | 'user'. */
  @Column({ name: 'subject_type', type: 'varchar', length: 24 })
  subjectType: string;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId: string;

  @Column({ type: 'varchar', length: 16, default: 'low' })
  severity: 'low' | 'medium' | 'high';

  @Column({ type: 'text' })
  detail: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: 'open' | 'cleared' | 'confirmed';

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolver: User | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({
    name: 'resolution_note',
    type: 'varchar',
    length: 240,
    nullable: true,
  })
  resolutionNote: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
