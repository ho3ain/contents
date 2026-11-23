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
import { Agent } from '../agents/agent.entity';
import { AgentVersion } from '../agents/agent-version.entity';
import { AgentReviewSubmission } from '../agents/agent-review-submission.entity';
import { CreatorProfile } from '../identity/creator-profile.entity';
import { RuntimeRegistration } from '../runtime/runtime-registration.entity';
import { RuntimeRelease } from '../runtime/runtime-release.entity';
import type {
  EvaluationFinalStatus,
  EvaluationInputSnapshot,
  EvaluationProfile,
  EvaluationRunState,
  PlannedControl,
  RiskAssessment,
} from '../../../modules/evaluation-engine/domain/evaluation.types';
import { EvaluationPolicy } from './evaluation-policy.entity';

@Entity({ name: 'evaluation_runs' })
@Index('idx_evaluation_runs_creator_created', ['creatorId', 'createdAt'])
@Index('idx_evaluation_runs_agent_created', ['agentId', 'createdAt'])
@Index('idx_evaluation_runs_status_created', ['state', 'createdAt'])
@Index(
  'uq_evaluation_runs_creator_idempotency',
  ['creatorId', 'idempotencyKey'],
  {
    unique: true,
  },
)
export class EvaluationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => CreatorProfile, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creator_id' })
  creator: CreatorProfile;

  @Column({ name: 'agent_version_id', type: 'uuid' })
  agentVersionId: string;

  @ManyToOne(() => AgentVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'agent_version_id' })
  agentVersion: AgentVersion;

  @Column({ name: 'review_submission_id', type: 'uuid', nullable: true })
  reviewSubmissionId: string | null;

  @ManyToOne(() => AgentReviewSubmission, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'review_submission_id' })
  reviewSubmission: AgentReviewSubmission | null;

  @Column({ name: 'runtime_id', type: 'uuid', nullable: true })
  runtimeId: string | null;

  @ManyToOne(() => RuntimeRegistration, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'runtime_id' })
  runtime: RuntimeRegistration | null;

  @Column({ name: 'runtime_release_id', type: 'uuid', nullable: true })
  runtimeReleaseId: string | null;

  @ManyToOne(() => RuntimeRelease, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'runtime_release_id' })
  runtimeRelease: RuntimeRelease | null;

  @Column({ name: 'policy_id', type: 'uuid' })
  policyId: string;

  @ManyToOne(() => EvaluationPolicy, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'policy_id' })
  policy: EvaluationPolicy;

  @Column({ name: 'policy_key', type: 'varchar', length: 80 })
  policyKey: string;

  @Column({ name: 'policy_version', type: 'integer' })
  policyVersion: number;

  @Column({ name: 'engine_version', type: 'varchar', length: 32 })
  engineVersion: string;

  @Column({ type: 'varchar', length: 40 })
  profile: EvaluationProfile;

  @Column({ name: 'risk_level', type: 'varchar', length: 12 })
  riskLevel: RiskAssessment['level'];

  @Column({ name: 'risk_factors', type: 'jsonb', default: () => "'[]'::jsonb" })
  riskFactors: RiskAssessment['factors'];

  @Column({ type: 'varchar', length: 16 })
  state: EvaluationRunState;

  @Column({ name: 'final_status', type: 'varchar', length: 16, nullable: true })
  finalStatus: EvaluationFinalStatus | null;

  /** Client key is scoped to creator and compared with inputFingerprint server-side. */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 120 })
  idempotencyKey: string;

  @Column({ name: 'input_fingerprint', type: 'char', length: 64 })
  inputFingerprint: string;

  @Column({ name: 'input_snapshot', type: 'jsonb' })
  inputSnapshot: EvaluationInputSnapshot;

  @Column({ name: 'policy_snapshot', type: 'jsonb' })
  policySnapshot: Record<string, unknown>;

  @Column({ name: 'control_plan', type: 'jsonb' })
  controlPlan: PlannedControl[];

  @Column({
    name: 'result_summary',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  resultSummary: Record<string, unknown>;

  @Column({
    name: 'cancel_reason',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  cancelReason: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
