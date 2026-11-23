import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EvaluationRun } from './evaluation-run.entity';
import type { ClaimAssessmentStatus } from '../../../modules/evaluation-engine/domain/evaluation.types';

@Entity({ name: 'evaluation_claim_assessments' })
@Index(
  'uq_evaluation_claim_assessments_run_key',
  ['evaluationRunId', 'claimKey'],
  { unique: true },
)
@Index('idx_evaluation_claim_assessments_run_created', [
  'evaluationRunId',
  'createdAt',
])
export class EvaluationClaimAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'evaluation_run_id', type: 'uuid' })
  evaluationRunId: string;

  @ManyToOne(() => EvaluationRun, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evaluation_run_id' })
  evaluationRun: EvaluationRun;

  @Column({ name: 'claim_key', type: 'varchar', length: 120 })
  claimKey: string;

  @Column({ name: 'claim_type', type: 'varchar', length: 80 })
  claimType: string;

  @Column({ name: 'declared_value', type: 'jsonb', nullable: true })
  declaredValue: Record<string, unknown> | null;

  @Column({ name: 'observed_value', type: 'jsonb', nullable: true })
  observedValue: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 28 })
  status: ClaimAssessmentStatus;

  @Column({ type: 'varchar', length: 1000 })
  scope: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  limitation: string | null;

  @Column({ name: 'control_ids', type: 'jsonb', default: () => "'[]'::jsonb" })
  controlIds: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
