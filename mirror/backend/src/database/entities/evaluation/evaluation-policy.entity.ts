import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { EvaluationPolicyDefinition } from '../../../modules/evaluation-engine/domain/evaluation.types';

/** Immutable policy rows: publish a higher version, never rewrite a definition. */
@Entity({ name: 'evaluation_policies' })
@Index('uq_evaluation_policies_key_version', ['policyKey', 'version'], {
  unique: true,
})
export class EvaluationPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'policy_key', type: 'varchar', length: 80 })
  policyKey: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ name: 'catalog_version', type: 'varchar', length: 32 })
  catalogVersion: string;

  @Column({ type: 'jsonb' })
  definition: EvaluationPolicyDefinition;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
