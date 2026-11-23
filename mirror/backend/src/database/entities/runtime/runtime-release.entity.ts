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
import { AgentVersion } from '../agents/agent-version.entity';
import { RuntimeRegistration } from './runtime-registration.entity';

export const RUNTIME_RELEASE_STATES = [
  'draft',
  'verified',
  'deployed',
  'retired',
] as const;
export type RuntimeReleaseState = (typeof RUNTIME_RELEASE_STATES)[number];

/**
 * Common, secret-free release fields. A Runtime release is an identity and
 * evidence record, not an uploaded package, a credential store, or an
 * attestation authority.
 */
interface RuntimeReleaseManifestBase {
  releaseVersion: string;
  artifactDigest: string;
  artifactKind: 'mesh_reference_echo_v1' | 'connected_reference';
  protocolVersions: string[];
  dependencyVersions: Record<string, string>;
  configurationRequirements: string[];
  healthCheck: { path: string; timeoutMs: number };
  externalDependencies: string[];
  continuity: {
    eligible: boolean;
    prerequisites: string[];
    limitations: string[];
  };
}

/**
 * Historical Phase 3 form. It remains accepted unchanged so stored and
 * in-flight creator releases do not become invalid when the Standard evolves.
 */
export interface RuntimeReleaseManifestV1 extends RuntimeReleaseManifestBase {
  schemaVersion: 1;
}

/**
 * Creator Technical Integration Standard v1 release form. It applies only to
 * serving profiles; Independent Deliverable and External Unconnected Service
 * intentionally have no MESH Runtime release artifact or execution boundary.
 */
export interface RuntimeReleaseManifestV2 extends RuntimeReleaseManifestBase {
  schemaVersion: 2;
  standardVersion: '1.0';
  integrationProfile: 'managed_runtime' | 'connected_runtime';
  executionContract: {
    version: '1.0';
    inputType: 'object';
    outputType: 'object';
    maxInputBytes: 64000;
    maxOutputBytes: 64000;
    downstreamTimeoutMs: 1500 | 5000;
    retryPolicy: 'no_automatic_retry';
    idempotency: 'not_supported';
  };
}

/**
 * A secret-free immutable release manifest. The platform records only the
 * references/configuration needed to verify and recover an eligible workload;
 * it never copies creator secrets or customer data into an artifact.
 */
export type RuntimeReleaseManifest =
  RuntimeReleaseManifestV1 | RuntimeReleaseManifestV2;

@Entity({ name: 'runtime_releases' })
@Index('uq_runtime_releases_runtime_version', ['runtimeId', 'releaseVersion'], {
  unique: true,
})
@Index('idx_runtime_releases_runtime_state', ['runtimeId', 'state'])
export class RuntimeRelease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'runtime_id', type: 'uuid' })
  runtimeId: string;

  @ManyToOne(() => RuntimeRegistration, (runtime) => runtime.releases, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'runtime_id' })
  runtime: RuntimeRegistration;

  @Column({ name: 'agent_version_id', type: 'uuid', nullable: true })
  agentVersionId: string | null;

  @ManyToOne(() => AgentVersion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_version_id' })
  agentVersion: AgentVersion | null;

  @Column({ name: 'release_version', type: 'varchar', length: 80 })
  releaseVersion: string;

  /** Canonical sha256 hex digest of the immutable artifact. */
  @Column({ name: 'artifact_digest', type: 'char', length: 64 })
  artifactDigest: string;

  @Column({ type: 'jsonb' })
  manifest: RuntimeReleaseManifest;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  state: RuntimeReleaseState;

  @Column({
    name: 'integrity_verified_at',
    type: 'timestamptz',
    nullable: true,
  })
  integrityVerifiedAt: Date | null;

  @Column({ name: 'recovery_verified_at', type: 'timestamptz', nullable: true })
  recoveryVerifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
