import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { TechnicalReviewCaseState } from '../../../modules/technical-review/domain/technical-review.types';

/** Mutable coordination envelope only. All evidence, findings, responses and decisions are separate append-only rows. */
@Entity({ name: 'technical_review_cases' })
@Index('uq_technical_review_cases_evaluation_run', ['evaluationRunId'], {
  unique: true,
})
@Index(
  'uq_technical_review_cases_creator_idempotency',
  ['creatorId', 'idempotencyKey'],
  { unique: true },
)
@Index('idx_technical_review_cases_queue', ['state', 'riskLevel', 'createdAt'])
@Index('idx_technical_review_cases_creator', ['creatorId', 'createdAt'])
export class TechnicalReviewCase {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'agent_id', type: 'uuid' }) agentId: string;
  @Column({ name: 'creator_id', type: 'uuid' }) creatorId: string;
  @Column({ name: 'agent_version_id', type: 'uuid' }) agentVersionId: string;
  @Column({ name: 'review_submission_id', type: 'uuid' })
  reviewSubmissionId: string;
  @Column({ name: 'evaluation_run_id', type: 'uuid' }) evaluationRunId: string;
  @Column({ type: 'varchar', length: 40 }) profile: string;
  @Column({ name: 'risk_level', type: 'varchar', length: 12 })
  riskLevel: string;
  @Column({ type: 'varchar', length: 32 }) state: TechnicalReviewCaseState;
  @Column({
    name: 'assigned_technical_reviewer_id',
    type: 'uuid',
    nullable: true,
  })
  assignedTechnicalReviewerId: string | null;
  @Column({
    name: 'assigned_security_reviewer_id',
    type: 'uuid',
    nullable: true,
  })
  assignedSecurityReviewerId: string | null;
  @Column({ name: 'first_approval_by', type: 'uuid', nullable: true })
  firstApprovalBy: string | null;
  @Column({ name: 'requires_second_approval', type: 'boolean', default: false })
  requiresSecondApproval: boolean;
  @Column({ name: 'predecessor_case_id', type: 'uuid', nullable: true })
  predecessorCaseId: string | null;
  @Column({ name: 'superseded_by_case_id', type: 'uuid', nullable: true })
  supersededByCaseId: string | null;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 120 })
  idempotencyKey: string;
  /** Optimistic revision. Every command requires it and a row lock serializes writers. */
  @Column({ name: 'revision', type: 'integer', default: 1 }) revision: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
