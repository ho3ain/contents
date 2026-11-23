import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EvaluationControlResult } from './evaluation-control-result.entity';
import { EvaluationRun } from './evaluation-run.entity';

/** Bounded/redacted observation, never a raw artifact, credential, URL or tool log. */
@Entity({ name: 'evaluation_evidence_records' })
@Index('idx_evaluation_evidence_run_created', ['evaluationRunId', 'createdAt'])
@Index('idx_evaluation_evidence_control', ['controlResultId', 'createdAt'])
export class EvaluationEvidenceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'evaluation_run_id', type: 'uuid' })
  evaluationRunId: string;

  @ManyToOne(() => EvaluationRun, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evaluation_run_id' })
  evaluationRun: EvaluationRun;

  @Column({ name: 'control_result_id', type: 'uuid' })
  controlResultId: string;

  @ManyToOne(() => EvaluationControlResult, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'control_result_id' })
  controlResult: EvaluationControlResult;

  @Column({ name: 'evidence_kind', type: 'varchar', length: 80 })
  evidenceKind: string;

  @Column({ type: 'varchar', length: 40 })
  source: string;

  @Column({ name: 'tool_name', type: 'varchar', length: 80 })
  toolName: string;

  @Column({ name: 'tool_version', type: 'varchar', length: 32 })
  toolVersion: string;

  @Column({ type: 'varchar', length: 16 })
  sensitivity: 'safe' | 'restricted';

  @Column({ name: 'value_redacted', type: 'jsonb' })
  valueRedacted: Record<string, unknown>;

  @Column({ name: 'value_digest', type: 'char', length: 64 })
  valueDigest: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
