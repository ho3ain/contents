import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CreatorReferral } from './creator-referral.entity';
import {
  REFERRAL_STAGES,
  type ReferralStage,
} from '../../../modules/success/domain/referral';

const REFERRAL_STAGE = Object.fromEntries(
  REFERRAL_STAGES.map((s) => [s, s]),
) as Record<ReferralStage, ReferralStage>;

/**
 * Phase C4 §16 — the stage history of one referral.
 *
 * `creator_referrals.stage` holds the current stage for fast dashboards; this
 * table holds how it got there. Without it, a referrer who sees "3 referred
 * creators published" cannot find out which of their 12 invites worked, and
 * the "when" is unrecoverable once the current stage overwrites it.
 *
 * UNIQUE (referral_id, stage) is the exactly-once guarantee. Stage
 * advancement is the thing §27 calls out ("duplicate milestone"), because a
 * replayed webhook or a double-clicked approve would otherwise produce two
 * `rewarded` rows and, downstream, two reward claims. A single unique index
 * makes a duplicate INSERT a no-op in the database rather than a race in
 * application code.
 */
@Entity({ name: 'creator_referral_events' })
@Index('uq_creator_referral_events_stage', ['referralId', 'stage'], {
  unique: true,
})
@Index('idx_creator_referral_events_referral', ['referralId'])
export class CreatorReferralEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'referral_id', type: 'uuid' })
  referralId: string;

  @ManyToOne(() => CreatorReferral, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referral_id' })
  referral: CreatorReferral;

  @Column({
    type: 'enum',
    enum: REFERRAL_STAGE,
    enumName: 'creator_referral_stage',
  })
  stage: ReferralStage;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
