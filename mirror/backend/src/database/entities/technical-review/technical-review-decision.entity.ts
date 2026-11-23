import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TechnicalDecisionType } from '../../../modules/technical-review/domain/technical-review.types';

/** Append-only official decision trail. No decision row edits automated evidence or publication status. */
@Entity({ name: 'technical_review_decisions' })
@Index('idx_technical_review_decisions_case_created', ['caseId', 'createdAt'])
@Index(
  'uq_technical_review_decisions_actor_key',
  ['caseId', 'decidedBy', 'idempotencyKey'],
  { unique: true },
)
export class TechnicalReviewDecision {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'technical_review_case_id', type: 'uuid' }) caseId: string;
  @Column({ name: 'decision_type', type: 'varchar', length: 40 })
  decisionType: TechnicalDecisionType;
  @Column({ name: 'rationale', type: 'varchar', length: 2000 })
  rationale: string;
  @Column({ name: 'decided_by', type: 'uuid' }) decidedBy: string;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 120 })
  idempotencyKey: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
