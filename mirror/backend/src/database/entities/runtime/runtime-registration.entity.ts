import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Agent } from '../agents/agent.entity';
import { CreatorProfile } from '../identity/creator-profile.entity';
import { RuntimeCredential } from './runtime-credential.entity';
import { RuntimeEvent } from './runtime-event.entity';
import { RuntimeRelease } from './runtime-release.entity';

/** Frozen RT-01 vocabulary. These are execution/delivery models, not entitlements. */
export const RUNTIME_EXECUTION_MODELS = [
  'mesh_managed',
  'mesh_connected',
  'independent_deliverable',
  'external_unconnected',
] as const;
export type RuntimeExecutionModel = (typeof RUNTIME_EXECUTION_MODELS)[number];

/** One canonical lifecycle with verification and traffic permission represented explicitly. */
export const RUNTIME_STATES = [
  'registered',
  'configured',
  'verifying',
  'verified',
  'active',
  'degraded',
  'suspended',
  'revoked',
  'retired',
] as const;
export type RuntimeState = (typeof RUNTIME_STATES)[number];

/** Operational health is distinct from security/lifecycle permission to serve. */
export const RUNTIME_OPERATIONAL_STATUSES = [
  'unknown',
  'starting',
  'ready',
  'stopped',
  'unavailable',
] as const;
export type RuntimeOperationalStatus =
  (typeof RUNTIME_OPERATIONAL_STATUSES)[number];

/** Evidence-derived controls exposed to users; declarations never enter this list. */
export const RUNTIME_CONTROL_CAPABILITIES = [
  'runtime_identity',
  'gateway_enforced_execution',
  'release_integrity',
  'managed_network_isolation',
  'managed_process_limits',
  'recovery_tested',
] as const;
export type RuntimeControlCapability =
  (typeof RUNTIME_CONTROL_CAPABILITIES)[number];

/**
 * Runtime registration is the control-plane record. `state = active` is the
 * only ordinary serving state; a release and conformance result are still
 * checked by the gateway before every protected invocation.
 */
@Entity({ name: 'runtime_registrations' })
@Index('idx_runtime_registrations_agent', ['agentId'])
@Index('idx_runtime_registrations_creator', ['creatorId'])
@Index('idx_runtime_registrations_state', ['state'])
export class RuntimeRegistration {
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

  @Column({ name: 'execution_model', type: 'varchar', length: 32 })
  executionModel: RuntimeExecutionModel;

  /** A descriptive provider identifier; no multi-cloud implementation is implied. */
  @Column({ name: 'hosting_provider', type: 'varchar', length: 80 })
  hostingProvider: string;

  @Column({ name: 'environment', type: 'varchar', length: 32 })
  environment: string;

  /** Connector base URL only for a connected Runtime; never a buyer URL. */
  @Column({ name: 'endpoint_url', type: 'text', nullable: true })
  endpointUrl: string | null;

  @Column({ name: 'protocol_version', type: 'varchar', length: 16 })
  protocolVersion: string;

  @Column({
    name: 'connector_version',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  connectorVersion: string | null;

  /** Creator declaration retained for review, never represented as verified control. */
  @Column({
    name: 'declared_capabilities',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  declaredCapabilities: string[];

  /** Set only from a successful server-side conformance result. */
  @Column({
    name: 'verified_capabilities',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  verifiedCapabilities: RuntimeControlCapability[];

  @Column({ name: 'state', type: 'varchar', length: 24, default: 'registered' })
  state: RuntimeState;

  @Column({
    name: 'operational_status',
    type: 'varchar',
    length: 24,
    default: 'unknown',
  })
  operationalStatus: RuntimeOperationalStatus;

  /** SHA-256 of non-secret configuration used to bind verification evidence. */
  @Column({ name: 'configuration_fingerprint', type: 'char', length: 64 })
  configurationFingerprint: string;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  /** ID/reference only; verification evidence must never contain credentials. */
  @Column({
    name: 'verification_evidence_ref',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  verificationEvidenceRef: string | null;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({
    name: 'last_failure_code',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  lastFailureCode: string | null;

  @Column({ name: 'current_release_id', type: 'uuid', nullable: true })
  currentReleaseId: string | null;

  @OneToOne(() => RuntimeRelease, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_release_id' })
  currentRelease: RuntimeRelease | null;

  @OneToMany(() => RuntimeCredential, (credential) => credential.runtime)
  credentials: RuntimeCredential[];

  @OneToMany(() => RuntimeRelease, (release) => release.runtime)
  releases: RuntimeRelease[];

  @OneToMany(() => RuntimeEvent, (event) => event.runtime)
  events: RuntimeEvent[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
