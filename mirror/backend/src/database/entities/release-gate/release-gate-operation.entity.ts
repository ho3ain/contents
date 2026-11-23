import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ReleaseGateOperationState = 'Executing' | 'Published' | 'Failed';

/** Durable publication request/result. It is a gate ledger, not a second product or publication authority. */
@Entity({ name: 'release_gate_operations' })
@Index('uq_release_gate_operations_submission', ['reviewSubmissionId'], {
  unique: true,
})
@Index(
  'uq_release_gate_operations_creator_key',
  ['creatorId', 'idempotencyKey'],
  { unique: true },
)
@Index('idx_release_gate_operations_agent_created', ['agentId', 'createdAt'])
export class ReleaseGateOperation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'agent_id', type: 'uuid' }) agentId: string;
  @Column({ name: 'creator_id', type: 'uuid' }) creatorId: string;
  @Column({ name: 'review_submission_id', type: 'uuid' })
  reviewSubmissionId: string;
  @Column({ name: 'agent_version_id', type: 'uuid' }) agentVersionId: string;
  @Column({ name: 'technical_review_case_id', type: 'uuid' })
  technicalReviewCaseId: string;
  @Column({ name: 'evaluation_run_id', type: 'uuid' }) evaluationRunId: string;
  @Column({ name: 'policy_key', type: 'varchar', length: 80 })
  policyKey: string;
  @Column({ name: 'policy_version', type: 'integer' }) policyVersion: number;
  @Column({ name: 'content_digest', type: 'char', length: 64 })
  contentDigest: string;
  @Column({ name: 'runtime_release_id', type: 'uuid', nullable: true })
  runtimeReleaseId: string | null;
  @Column({ name: 'artifact_digest', type: 'char', length: 64, nullable: true })
  artifactDigest: string | null;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey: string;
  @Column({ type: 'varchar', length: 16 }) state: ReleaseGateOperationState;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @Column({ name: 'failure_code', type: 'varchar', length: 80, nullable: true })
  failureCode: string | null;
  @Column({
    name: 'failure_summary',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  failureSummary: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
