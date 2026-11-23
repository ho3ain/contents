import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RuntimeRegistration } from './runtime-registration.entity';
import { RuntimeRelease } from './runtime-release.entity';

export const RUNTIME_CONFORMANCE_OUTCOMES = [
  'passed',
  'failed',
  'blocked',
] as const;
export type RuntimeConformanceOutcome =
  (typeof RUNTIME_CONFORMANCE_OUTCOMES)[number];

/** Traceable, configuration-bound automated evidence; not a penetration-test substitute. */
@Entity({ name: 'runtime_conformance_runs' })
@Index('idx_runtime_conformance_runtime_created', ['runtimeId', 'createdAt'])
export class RuntimeConformanceRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'runtime_id', type: 'uuid' })
  runtimeId: string;

  @ManyToOne(() => RuntimeRegistration, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'runtime_id' })
  runtime: RuntimeRegistration;

  @Column({ name: 'release_id', type: 'uuid', nullable: true })
  releaseId: string | null;

  @ManyToOne(() => RuntimeRelease, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'release_id' })
  release: RuntimeRelease | null;

  @Column({ name: 'suite_version', type: 'varchar', length: 32 })
  suiteVersion: string;

  @Column({ name: 'protocol_version', type: 'varchar', length: 16 })
  protocolVersion: string;

  @Column({ name: 'configuration_fingerprint', type: 'char', length: 64 })
  configurationFingerprint: string;

  @Column({ type: 'varchar', length: 16 })
  outcome: RuntimeConformanceOutcome;

  /** Closed test names and safe result details only; never secrets or remote response bodies. */
  @Column({ type: 'jsonb' })
  evidence: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
