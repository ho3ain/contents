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
import type {
  ControlOutcome,
  ControlRequirement,
} from '../../../modules/evaluation-engine/domain/evaluation.types';

/** Immutable result of exactly one planned control in one evaluation run. */
@Entity({ name: 'evaluation_control_results' })
@Index(
  'uq_evaluation_control_results_run_control',
  ['evaluationRunId', 'controlId'],
  { unique: true },
)
@Index('idx_evaluation_control_results_run_created', [
  'evaluationRunId',
  'createdAt',
])
export class EvaluationControlResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'evaluation_run_id', type: 'uuid' })
  evaluationRunId: string;

  @ManyToOne(() => EvaluationRun, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evaluation_run_id' })
  evaluationRun: EvaluationRun;

  @Column({ name: 'control_id', type: 'varchar', length: 80 })
  controlId: string;

  @Column({ name: 'control_version', type: 'varchar', length: 32 })
  controlVersion: string;

  @Column({ type: 'varchar', length: 64 })
  category: string;

  @Column({ type: 'varchar', length: 16 })
  requirement: ControlRequirement;

  @Column({ type: 'varchar', length: 16 })
  outcome: ControlOutcome;

  @Column({ name: 'reason_code', type: 'varchar', length: 80 })
  reasonCode: string;

  @Column({ name: 'reason', type: 'varchar', length: 1000 })
  reason: string;

  @Column({ name: 'requires_human_review', type: 'boolean', default: false })
  requiresHumanReview: boolean;

  @Column({ name: 'criterion_snapshot', type: 'jsonb' })
  criterionSnapshot: Record<string, unknown>;

  @Column({ name: 'tool_name', type: 'varchar', length: 80 })
  toolName: string;

  @Column({ name: 'tool_version', type: 'varchar', length: 32 })
  toolVersion: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
