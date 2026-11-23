import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import {
  RuntimeRegistration,
  type RuntimeControlCapability,
  type RuntimeExecutionModel,
  type RuntimeOperationalStatus,
  type RuntimeState,
} from '../../database/entities/runtime/runtime-registration.entity';
import {
  RuntimeCredential,
  type RuntimeCredentialScope,
} from '../../database/entities/runtime/runtime-credential.entity';
import {
  RuntimeRelease,
  type RuntimeReleaseManifest,
} from '../../database/entities/runtime/runtime-release.entity';
import { RuntimeEvent } from '../../database/entities/runtime/runtime-event.entity';
import {
  RuntimeConformanceRun,
  type RuntimeConformanceOutcome,
} from '../../database/entities/runtime/runtime-conformance-run.entity';
import { Agent } from '../../database/entities/agents/agent.entity';
import { AgentVersion } from '../../database/entities/agents/agent-version.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { recordRuntimeEvent } from '../../common/observability/metrics';
import { ConnectorClientService } from './connector-client.service';
import { ManagedRuntimeService } from './managed-runtime.service';
import {
  MANAGED_REFERENCE_ARTIFACT_DIGEST,
  MESH_CONNECTOR_PROTOCOL_VERSION,
  RUNTIME_CONFORMANCE_SUITE_VERSION,
  assertRuntimeTransition,
  isServingModel,
  creatorIntegrationProfileFor,
  runtimeConfigurationFingerprint,
  validateManifestRuntimeCompatibility,
  validateReleaseManifest,
  verifiedCapabilitiesFor,
  manifestDigestValue,
} from './runtime-domain';

/**
 * Secret-free projection of a Runtime identity credential. Deliberately has no
 * `secretHash` / `credential` member so the one-time plaintext can never be
 * re-exposed through a list endpoint, a log line or a test fixture.
 */
export interface RuntimeCredentialView {
  id: string;
  scopes: RuntimeCredentialScope[];
  status: 'active' | 'expired' | 'revoked';
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  rotatedFromId: string | null;
}

export interface RuntimeView {
  id: string;
  agentId: string;
  agentName?: string;
  creatorId: string;
  executionModel: RuntimeExecutionModel;
  hostingProvider: string;
  environment: string;
  protocolVersion: string;
  connectorVersion: string | null;
  state: RuntimeState;
  operationalStatus: RuntimeOperationalStatus;
  declaredCapabilities: string[];
  verifiedCapabilities: RuntimeControlCapability[];
  verifiedAt: Date | null;
  verificationEvidenceRef: string | null;
  lastHeartbeatAt: Date | null;
  currentReleaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RuntimesService {
  private readonly bcryptRounds = 12;

  constructor(
    @InjectRepository(RuntimeRegistration)
    private readonly runtimes: Repository<RuntimeRegistration>,
    @InjectRepository(RuntimeCredential)
    private readonly credentials: Repository<RuntimeCredential>,
    @InjectRepository(RuntimeRelease)
    private readonly releases: Repository<RuntimeRelease>,
    @InjectRepository(RuntimeEvent)
    private readonly events: Repository<RuntimeEvent>,
    @InjectRepository(RuntimeConformanceRun)
    private readonly conformanceRuns: Repository<RuntimeConformanceRun>,
    @InjectRepository(Agent)
    private readonly agents: Repository<Agent>,
    @InjectRepository(AgentVersion)
    private readonly agentVersions: Repository<AgentVersion>,
    @InjectRepository(CreatorProfile)
    private readonly creators: Repository<CreatorProfile>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly connector: ConnectorClientService,
    private readonly managed: ManagedRuntimeService,
    private readonly audit: AuditService,
  ) {}

  async createForCreator(input: {
    userId: string;
    agentId: string;
    executionModel: RuntimeExecutionModel;
    hostingProvider: string;
    environment: string;
    endpointUrl?: string | null;
    protocolVersion?: string;
    connectorVersion?: string | null;
    declaredCapabilities?: string[];
  }): Promise<RuntimeView> {
    const creator = await this.creators.findOneBy({ userId: input.userId });
    if (!creator)
      throw this.forbidden(
        'A creator profile is required to register a Runtime',
      );
    const agent = await this.agents.findOneBy({
      id: input.agentId,
      creatorId: creator.id,
    });
    if (!agent) throw this.notFound('Product not found');
    this.validateRegistrationInput(input);
    const protocolVersion =
      input.protocolVersion ?? MESH_CONNECTOR_PROTOCOL_VERSION;
    const declaredCapabilities = this.normalizeStrings(
      input.declaredCapabilities,
    );
    const runtime = this.runtimes.create({
      agentId: agent.id,
      creatorId: creator.id,
      executionModel: input.executionModel,
      hostingProvider: input.hostingProvider.trim(),
      environment: input.environment.trim(),
      endpointUrl: input.endpointUrl?.trim() || null,
      protocolVersion,
      connectorVersion: input.connectorVersion?.trim() || null,
      declaredCapabilities,
      verifiedCapabilities: [],
      state: 'registered',
      operationalStatus: 'unknown',
      configurationFingerprint: runtimeConfigurationFingerprint({
        executionModel: input.executionModel,
        hostingProvider: input.hostingProvider,
        environment: input.environment,
        endpointUrl: input.endpointUrl?.trim() || null,
        protocolVersion,
        connectorVersion: input.connectorVersion?.trim() || null,
        declaredCapabilities,
      }),
      verifiedAt: null,
      verificationEvidenceRef: null,
      currentReleaseId: null,
      lastHeartbeatAt: null,
      lastFailureCode: null,
    });
    const saved = await this.dataSource.transaction(async (manager) => {
      const stored = await manager
        .getRepository(RuntimeRegistration)
        .save(runtime);
      await this.appendEvent(manager, stored, {
        type: 'registered',
        from: null,
        to: 'registered',
        actorUserId: input.userId,
        reasonCode: 'CREATOR_REGISTRATION',
        dedupKey: `runtime-register:${stored.id}`,
      });
      return stored;
    });
    await this.recordAudit(
      AUDIT_ACTIONS.RUNTIME_REGISTERED,
      saved,
      input.userId,
      { agentId: agent.id, executionModel: saved.executionModel },
    );
    return this.toView(saved, agent.name);
  }

  async listMine(userId: string): Promise<RuntimeView[]> {
    const creator = await this.creators.findOneBy({ userId });
    if (!creator) return [];
    const rows = await this.runtimes.find({
      where: { creatorId: creator.id },
      relations: { agent: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toView(row, row.agent?.name));
  }

  async getMine(
    userId: string,
    runtimeId: string,
  ): Promise<RuntimeRegistration> {
    const creator = await this.creators.findOneBy({ userId });
    if (!creator) throw this.notFound('Runtime not found');
    const runtime = await this.runtimes.findOne({
      where: { id: runtimeId, creatorId: creator.id },
      relations: { agent: true, currentRelease: true },
    });
    if (!runtime) throw this.notFound('Runtime not found');
    return runtime;
  }

  async configureForCreator(
    userId: string,
    runtimeId: string,
    input: {
      hostingProvider: string;
      environment: string;
      endpointUrl?: string | null;
      connectorVersion?: string | null;
      declaredCapabilities?: string[];
    },
  ): Promise<RuntimeView> {
    const runtime = await this.getMine(userId, runtimeId);
    if (!['registered', 'configured', 'degraded'].includes(runtime.state)) {
      throw this.conflict(
        'A verified, active, suspended or terminal Runtime cannot be edited; register a new configuration',
      );
    }
    const next = {
      ...runtime,
      hostingProvider: input.hostingProvider.trim(),
      environment: input.environment.trim(),
      endpointUrl: input.endpointUrl?.trim() || null,
      connectorVersion: input.connectorVersion?.trim() || null,
      declaredCapabilities: this.normalizeStrings(input.declaredCapabilities),
    };
    this.validateRegistrationInput(next);
    const saved = await this.dataSource.transaction(async (manager) => {
      const row = await manager
        .getRepository(RuntimeRegistration)
        .findOneByOrFail({ id: runtime.id });
      row.hostingProvider = next.hostingProvider;
      row.environment = next.environment;
      row.endpointUrl = next.endpointUrl;
      row.connectorVersion = next.connectorVersion;
      row.declaredCapabilities = next.declaredCapabilities;
      row.configurationFingerprint = runtimeConfigurationFingerprint(row);
      row.verifiedCapabilities = [];
      row.verifiedAt = null;
      row.verificationEvidenceRef = null;
      const previous = row.state;
      row.state = 'configured';
      row.operationalStatus = 'unknown';
      const updated = await manager
        .getRepository(RuntimeRegistration)
        .save(row);
      await this.appendEvent(manager, updated, {
        type: 'configured',
        from: previous,
        to: 'configured',
        actorUserId: userId,
        reasonCode: 'CREATOR_CONFIGURATION',
        dedupKey: `runtime-configure:${updated.id}:${updated.configurationFingerprint}`,
      });
      return updated;
    });
    await this.recordAudit(AUDIT_ACTIONS.RUNTIME_CONFIGURED, saved, userId, {
      agentId: saved.agentId,
    });
    return this.toView(saved);
  }

  async issueCredential(
    userId: string,
    runtimeId: string,
    input: { expiresInDays: number; rotateCredentialId?: string | null },
  ): Promise<{
    credentialId: string;
    credential: string;
    expiresAt: Date;
    scopes: RuntimeCredentialScope[];
  }> {
    const runtime = await this.getMine(userId, runtimeId);
    if (runtime.state === 'revoked' || runtime.state === 'retired')
      throw this.conflict('A terminal Runtime cannot receive credentials');
    const expiresInDays = Math.floor(input.expiresInDays);
    if (
      !Number.isInteger(expiresInDays) ||
      expiresInDays < 1 ||
      expiresInDays > 90
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'expiresInDays must be between 1 and 90',
        HttpStatus.BAD_REQUEST,
      );
    }
    const secret = randomBytes(32).toString('base64url');
    const secretHash = await bcrypt.hash(secret, this.bcryptRounds);
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
    const credential = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RuntimeCredential);
      if (input.rotateCredentialId) {
        const previous = await repo.findOneBy({
          id: input.rotateCredentialId,
          runtimeId: runtime.id,
        });
        if (!previous || previous.revokedAt)
          throw this.notFound('Active credential not found');
        previous.revokedAt = new Date();
        await repo.save(previous);
      }
      const created = await repo.save(
        repo.create({
          runtimeId: runtime.id,
          secretHash,
          scopes: ['health:write', 'usage:write'],
          expiresAt,
          revokedAt: null,
          rotatedFromId: input.rotateCredentialId ?? null,
          lastUsedAt: null,
        }),
      );
      await this.appendEvent(manager, runtime, {
        type: input.rotateCredentialId
          ? 'credential_rotated'
          : 'credential_issued',
        from: runtime.state,
        to: runtime.state,
        actorUserId: userId,
        reasonCode: input.rotateCredentialId ? 'ROTATION' : 'ISSUED',
        dedupKey: `runtime-credential:${created.id}`,
        metadata: {
          credentialId: created.id,
          scopes: created.scopes,
          expiresAt: created.expiresAt.toISOString(),
        },
      });
      return created;
    });
    await this.recordAudit(
      input.rotateCredentialId
        ? AUDIT_ACTIONS.RUNTIME_CREDENTIAL_ROTATED
        : AUDIT_ACTIONS.RUNTIME_CREDENTIAL_ISSUED,
      runtime,
      userId,
      {
        credentialId: credential.id,
        expiresAt: credential.expiresAt.toISOString(),
      },
    );
    // Returned once only; never put it into event/audit/log metadata.
    return {
      credentialId: credential.id,
      credential: `mrt_${credential.id}.${secret}`,
      expiresAt: credential.expiresAt,
      scopes: credential.scopes,
    };
  }

  /**
   * Creator-visible credential metadata. The bcrypt `secretHash` and the
   * one-time plaintext companion are never selected or returned here: a
   * revoked or lost credential must be rotated, not re-read.
   */
  async listCredentialsForCreator(
    userId: string,
    runtimeId: string,
  ): Promise<RuntimeCredentialView[]> {
    const runtime = await this.getMine(userId, runtimeId);
    const rows = await this.credentials.find({
      where: { runtimeId: runtime.id },
      order: { createdAt: 'DESC' },
    });
    const now = Date.now();
    return rows.map((row) => ({
      id: row.id,
      scopes: row.scopes,
      status: row.revokedAt
        ? ('revoked' as const)
        : row.expiresAt.getTime() <= now
          ? ('expired' as const)
          : ('active' as const),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
      rotatedFromId: row.rotatedFromId,
    }));
  }

  async revokeCredential(
    userId: string,
    runtimeId: string,
    credentialId: string,
  ): Promise<void> {
    const runtime = await this.getMine(userId, runtimeId);
    const credential = await this.credentials.findOneBy({
      id: credentialId,
      runtimeId: runtime.id,
    });
    if (!credential) throw this.notFound('Credential not found');
    if (!credential.revokedAt) {
      credential.revokedAt = new Date();
      await this.credentials.save(credential);
      await this.dataSource.transaction((manager) =>
        this.appendEvent(manager, runtime, {
          type: 'credential_revoked',
          from: runtime.state,
          to: runtime.state,
          actorUserId: userId,
          reasonCode: 'CREATOR_REVOKE',
          dedupKey: `runtime-credential-revoke:${credential.id}`,
          metadata: { credentialId: credential.id },
        }),
      );
    }
    await this.recordAudit(
      AUDIT_ACTIONS.RUNTIME_CREDENTIAL_REVOKED,
      runtime,
      userId,
      { credentialId },
    );
  }

  async authenticateRuntimeCredential(
    raw: string | undefined,
    runtimeId: string,
    requiredScope: RuntimeCredentialScope,
  ): Promise<RuntimeRegistration> {
    const token = raw?.startsWith('Runtime ')
      ? raw.slice('Runtime '.length)
      : '';
    const match = /^mrt_([0-9a-f-]{36})\.([A-Za-z0-9_-]{30,})$/.exec(token);
    if (!match)
      throw new ApiException(
        'UNAUTHORIZED',
        'Invalid Runtime credential',
        HttpStatus.UNAUTHORIZED,
      );
    const credential = await this.credentials.findOne({
      where: { id: match[1], runtimeId },
      relations: { runtime: true },
    });
    if (
      !credential ||
      credential.revokedAt ||
      credential.expiresAt.getTime() <= Date.now() ||
      !credential.scopes.includes(requiredScope)
    ) {
      throw new ApiException(
        'UNAUTHORIZED',
        'Invalid Runtime credential',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const valid = await bcrypt.compare(match[2], credential.secretHash);
    if (
      !valid ||
      credential.runtime.state === 'revoked' ||
      credential.runtime.state === 'retired'
    ) {
      throw new ApiException(
        'UNAUTHORIZED',
        'Invalid Runtime credential',
        HttpStatus.UNAUTHORIZED,
      );
    }
    credential.lastUsedAt = new Date();
    await this.credentials.save(credential);
    return credential.runtime;
  }

  async heartbeat(
    runtime: RuntimeRegistration,
    status: 'ready' | 'degraded',
  ): Promise<void> {
    runtime.lastHeartbeatAt = new Date();
    runtime.operationalStatus = status === 'ready' ? 'ready' : 'unavailable';
    if (status === 'degraded' && runtime.state === 'active')
      runtime.state = 'degraded';
    await this.runtimes.save(runtime);
    recordRuntimeEvent('heartbeat', status === 'ready' ? 'success' : 'failure');
  }

  /**
   * Creator-owned, non-persistent preflight for a release manifest. It reuses
   * exactly the registration rules used by release creation so a browser cannot
   * obtain an optimistic result from a weaker client-side checker.
   */
  async preflightReleaseForCreator(
    userId: string,
    runtimeId: string,
    manifest: RuntimeReleaseManifest,
  ): Promise<{
    valid: boolean;
    errors: string[];
    schemaVersion: number | null;
    standardVersion: string | null;
    integrationProfile: string;
  }> {
    const runtime = await this.getMine(userId, runtimeId);
    const errors = this.releaseManifestErrors(runtime, manifest);
    return {
      valid: errors.length === 0,
      errors,
      schemaVersion:
        typeof manifest?.schemaVersion === 'number'
          ? manifest.schemaVersion
          : null,
      standardVersion:
        manifest?.schemaVersion === 2 ? manifest.standardVersion : null,
      integrationProfile: creatorIntegrationProfileFor(runtime.executionModel),
    };
  }

  async createReleaseForCreator(
    userId: string,
    runtimeId: string,
    input: { agentVersionId?: string | null; manifest: RuntimeReleaseManifest },
  ): Promise<RuntimeRelease> {
    const runtime = await this.getMine(userId, runtimeId);
    const errors = this.releaseManifestErrors(runtime, input.manifest);
    if (!isServingModel(runtime.executionModel))
      throw this.conflict(
        'Independent and external-unconnected products do not accept Runtime releases',
      );
    if (errors.length)
      throw new ApiException(
        'VALIDATION_ERROR',
        'Invalid release manifest',
        HttpStatus.BAD_REQUEST,
        { errors },
      );
    let agentVersionId: string | null = null;
    if (input.agentVersionId) {
      const version = await this.agentVersions.findOneBy({
        id: input.agentVersionId,
        agentId: runtime.agentId,
      });
      if (!version) throw this.notFound('Product version not found');
      agentVersionId = version.id;
    }
    const release = await this.releases.save(
      this.releases.create({
        runtimeId: runtime.id,
        agentVersionId,
        releaseVersion: input.manifest.releaseVersion.trim(),
        artifactDigest: manifestDigestValue(input.manifest.artifactDigest),
        manifest: input.manifest,
        state: 'draft',
        integrityVerifiedAt: null,
        recoveryVerifiedAt: null,
      }),
    );
    await this.dataSource.transaction((manager) =>
      this.appendEvent(manager, runtime, {
        type: 'release_registered',
        from: runtime.state,
        to: runtime.state,
        actorUserId: userId,
        reasonCode: 'CREATOR_RELEASE',
        dedupKey: `runtime-release:${release.id}`,
        metadata: {
          releaseId: release.id,
          releaseVersion: release.releaseVersion,
          artifactDigest: release.artifactDigest,
        },
      }),
    );
    await this.recordAudit(
      AUDIT_ACTIONS.RUNTIME_RELEASE_REGISTERED,
      runtime,
      userId,
      { releaseId: release.id, releaseVersion: release.releaseVersion },
    );
    return release;
  }

  async listAdmin(state?: RuntimeState): Promise<RuntimeView[]> {
    const rows = await this.runtimes.find({
      where: state ? { state } : {},
      relations: { agent: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((runtime) => this.toView(runtime, runtime.agent?.name));
  }

  async getAdmin(runtimeId: string): Promise<RuntimeRegistration> {
    const runtime = await this.runtimes.findOne({
      where: { id: runtimeId },
      relations: { agent: true, currentRelease: true },
    });
    if (!runtime) throw this.notFound('Runtime not found');
    return runtime;
  }

  /** Server-side conformance is the only ordinary path to VERIFIED. */
  async runConformance(
    runtimeId: string,
    actorUserId: string,
  ): Promise<RuntimeConformanceRun> {
    let runtime = await this.getAdmin(runtimeId);
    if (
      !['configured', 'verifying', 'degraded', 'suspended'].includes(
        runtime.state,
      )
    )
      throw this.conflict(
        'Runtime must be configured before conformance can run',
      );
    if (!isServingModel(runtime.executionModel)) {
      return this.persistConformance(
        runtime,
        null,
        'blocked',
        {
          checks: [
            {
              name: 'serving_model',
              passed: false,
              detail:
                'independent/external Runtime has no MESH serving boundary',
            },
          ],
        },
        actorUserId,
      );
    }
    const release = await this.releases.findOne({
      where: { runtimeId: runtime.id },
      order: { createdAt: 'DESC' },
    });
    if (!release)
      return this.persistConformance(
        runtime,
        null,
        'failed',
        {
          checks: [
            { name: 'release', passed: false, detail: 'no release registered' },
          ],
        },
        actorUserId,
      );
    runtime.state = 'verifying';
    await this.runtimes.save(runtime);
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
    let integrity = false;
    let recovery = false;
    let isolation = false;
    let operational: RuntimeOperationalStatus = 'unknown';
    if (runtime.protocolVersion !== MESH_CONNECTOR_PROTOCOL_VERSION) {
      checks.push({
        name: 'protocol_version',
        passed: false,
        detail: 'unsupported connector protocol version',
      });
    } else {
      checks.push({
        name: 'protocol_version',
        passed: true,
        detail: MESH_CONNECTOR_PROTOCOL_VERSION,
      });
    }
    if (runtime.executionModel === 'mesh_managed') {
      integrity =
        release.manifest.artifactKind === 'mesh_reference_echo_v1' &&
        release.artifactDigest === MANAGED_REFERENCE_ARTIFACT_DIGEST;
      checks.push({
        name: 'artifact_integrity',
        passed: integrity,
        detail: integrity
          ? 'fixed reference digest matched'
          : 'digest or artifact kind did not match',
      });
      const first = await this.managed.probe();
      const second = first.ok ? await this.managed.probe() : first;
      isolation = first.isolation && second.isolation;
      recovery = first.ok && second.ok;
      checks.push({
        name: 'managed_isolation',
        passed: isolation,
        detail: first.detail,
      });
      checks.push({
        name: 'recovery',
        passed: recovery,
        detail: recovery
          ? 'fresh isolated invocation succeeded after prior completion'
          : second.detail,
      });
      operational = recovery ? 'ready' : 'unavailable';
    } else {
      try {
        const health = await this.connector.health(
          runtime.endpointUrl ?? '',
          runtime.id,
        );
        const healthy = health.status === 'ready';
        const bypassRejected = await this.connector.directBypassRejected(
          runtime.endpointUrl ?? '',
        );
        checks.push({
          name: 'connector_health',
          passed: healthy,
          detail: healthy
            ? 'protocol health response verified'
            : 'connector reported degraded',
        });
        checks.push({
          name: 'direct_bypass_rejected',
          passed: bypassRejected,
          detail: bypassRejected
            ? 'connector rejected unauthenticated direct execution'
            : 'connector did not reject direct execution',
        });
        // MESH validates the immutable manifest syntax/digest declaration, but
        // does not fetch or attest a creator-controlled connected artifact.
        // Never turn that declaration into a verified integrity capability.
        integrity = false;
        checks.push({
          name: 'release_manifest',
          passed: true,
          detail:
            'manifest validated; creator-controlled artifact integrity is not attested by MESH',
        });
        operational = healthy ? 'ready' : 'unavailable';
      } catch {
        checks.push({
          name: 'connector_health',
          passed: false,
          detail: 'connector health endpoint unavailable or incompatible',
        });
        operational = 'unavailable';
      }
    }
    const passed = checks.every((check) => check.passed);
    release.integrityVerifiedAt = integrity ? new Date() : null;
    release.recoveryVerifiedAt = recovery ? new Date() : null;
    release.state = passed ? 'verified' : 'draft';
    await this.releases.save(release);
    runtime = await this.getAdmin(runtime.id);
    runtime.operationalStatus = operational;
    runtime.state = passed ? 'verified' : 'degraded';
    runtime.verifiedAt = passed ? new Date() : null;
    runtime.verificationEvidenceRef = passed
      ? `conformance:${runtime.id}:${runtime.configurationFingerprint}`
      : null;
    runtime.verifiedCapabilities = passed
      ? verifiedCapabilitiesFor({
          model: runtime.executionModel,
          integrity,
          recovery,
          managedIsolation: isolation,
        })
      : [];
    runtime.lastFailureCode = passed ? null : 'CONFORMANCE_FAILED';
    await this.runtimes.save(runtime);
    const run = await this.persistConformance(
      runtime,
      release,
      passed ? 'passed' : 'failed',
      {
        checks,
        managedProfile:
          runtime.executionModel === 'mesh_managed'
            ? this.managed.profile()
            : undefined,
      },
      actorUserId,
    );
    await this.recordAudit(
      AUDIT_ACTIONS.RUNTIME_CONFORMANCE_COMPLETED,
      runtime,
      actorUserId,
      { runId: run.id, outcome: run.outcome, releaseId: release.id },
    );
    return run;
  }

  async activate(runtimeId: string, actorUserId: string): Promise<RuntimeView> {
    const runtime = await this.getAdmin(runtimeId);
    if (!isServingModel(runtime.executionModel))
      throw this.conflict(
        'This execution model cannot serve MESH Runtime traffic',
      );
    if (runtime.state !== 'verified' || !runtime.verifiedAt)
      throw this.conflict(
        'Only a successfully verified Runtime may be activated',
      );
    const release =
      (await this.releases.findOneBy({ id: runtime.currentReleaseId ?? '' })) ??
      (await this.releases.findOne({
        where: { runtimeId: runtime.id, state: 'verified' },
        order: { createdAt: 'DESC' },
      }));
    if (!release || release.state !== 'verified')
      throw this.conflict('A verified release is required before activation');
    const evidence = await this.conformanceRuns.findOne({
      where: {
        runtimeId: runtime.id,
        releaseId: release.id,
        outcome: 'passed',
        configurationFingerprint: runtime.configurationFingerprint,
      },
      order: { createdAt: 'DESC' },
    });
    if (!evidence)
      throw this.conflict(
        'No passing conformance evidence matches the current Runtime configuration and release',
      );
    if (runtime.executionModel === 'mesh_managed') {
      const probe = await this.managed.probe();
      if (!probe.ok)
        throw new ApiException(
          'SERVICE_UNAVAILABLE',
          'Managed Runtime isolation probe failed',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      runtime.operationalStatus = 'ready';
    } else if (runtime.operationalStatus !== 'ready') {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Connected Runtime is not ready',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const updated = await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .getRepository(RuntimeRegistration)
        .findOneByOrFail({ id: runtime.id });
      if (!assertRuntimeTransition(locked.state, 'active'))
        throw this.conflict('Runtime transition is no longer valid');
      locked.state = 'active';
      locked.currentReleaseId = release.id;
      locked.lastFailureCode = null;
      const saved = await manager
        .getRepository(RuntimeRegistration)
        .save(locked);
      release.state = 'deployed';
      await manager.getRepository(RuntimeRelease).save(release);
      await this.appendEvent(manager, saved, {
        type: 'activated',
        from: 'verified',
        to: 'active',
        actorUserId,
        reasonCode: 'CONFORMANCE_PASSED',
        dedupKey: `runtime-activate:${saved.id}:${release.id}:${saved.configurationFingerprint}`,
        evidenceRef: saved.verificationEvidenceRef,
      });
      return saved;
    });
    await this.recordAudit(
      AUDIT_ACTIONS.RUNTIME_ACTIVATED,
      updated,
      actorUserId,
      { releaseId: release.id },
    );
    return this.toView(updated);
  }

  async suspend(
    runtimeId: string,
    actorUserId: string,
    reasonCode = 'ADMIN_SUSPEND',
  ): Promise<RuntimeView> {
    return this.adminTransition(
      runtimeId,
      actorUserId,
      'suspended',
      reasonCode,
    );
  }

  async revoke(
    runtimeId: string,
    actorUserId: string,
    reasonCode = 'ADMIN_REVOKE',
  ): Promise<RuntimeView> {
    return this.adminTransition(runtimeId, actorUserId, 'revoked', reasonCode);
  }

  async retire(runtimeId: string, actorUserId: string): Promise<RuntimeView> {
    return this.adminTransition(
      runtimeId,
      actorUserId,
      'retired',
      'ADMIN_RETIRE',
    );
  }

  async restartManaged(
    runtimeId: string,
    actorUserId: string,
  ): Promise<RuntimeView> {
    const runtime = await this.getAdmin(runtimeId);
    if (runtime.executionModel !== 'mesh_managed' || runtime.state !== 'active')
      throw this.conflict('Only an active managed Runtime can be restarted');
    const probe = await this.managed.probe();
    runtime.operationalStatus = probe.ok ? 'ready' : 'unavailable';
    runtime.lastFailureCode = probe.ok ? null : 'MANAGED_RESTART_FAILED';
    const saved = await this.runtimes.save(runtime);
    await this.dataSource.transaction((manager) =>
      this.appendEvent(manager, saved, {
        type: 'managed_restarted',
        from: saved.state,
        to: saved.state,
        actorUserId,
        reasonCode: probe.ok ? 'RESTARTED' : 'RESTART_FAILED',
        dedupKey: `runtime-restart:${saved.id}:${Date.now()}`,
      }),
    );
    await this.recordAudit(
      AUDIT_ACTIONS.RUNTIME_RESTARTED,
      saved,
      actorUserId,
      { ok: probe.ok },
    );
    if (!probe.ok)
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Managed Runtime restart failed',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return this.toView(saved);
  }

  async servingRuntime(
    runtimeId: string,
  ): Promise<{ runtime: RuntimeRegistration; release: RuntimeRelease }> {
    const runtime = await this.runtimes.findOne({
      where: { id: runtimeId },
      relations: { currentRelease: true },
    });
    if (
      !runtime ||
      runtime.state !== 'active' ||
      !isServingModel(runtime.executionModel)
    )
      throw this.notFound('Runtime not available');
    if (runtime.operationalStatus !== 'ready')
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Runtime is not operationally ready',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const release = runtime.currentRelease;
    if (!release || release.state !== 'deployed')
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Runtime has no deployed verified release',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return { runtime, release };
  }

  async publicDisclosure(agentId: string): Promise<{
    executionModel: RuntimeExecutionModel;
    state: RuntimeState;
    operationalStatus: RuntimeOperationalStatus;
    verifiedCapabilities: RuntimeControlCapability[];
    controlled: boolean;
    limitation: string;
  } | null> {
    const runtime = await this.runtimes.findOne({
      where: { agentId },
      order: { createdAt: 'DESC' },
    });
    if (!runtime) return null;
    const controlled =
      runtime.state === 'active' && runtime.verifiedCapabilities.length > 0;
    return {
      executionModel: runtime.executionModel,
      state: runtime.state,
      operationalStatus: runtime.operationalStatus,
      verifiedCapabilities: runtime.verifiedCapabilities,
      controlled,
      limitation:
        runtime.executionModel === 'mesh_connected'
          ? 'Connected Runtime infrastructure remains creator-controlled; MESH cannot prevent an infrastructure administrator from bypassing its connector outside the protected gateway.'
          : runtime.executionModel === 'mesh_managed'
            ? 'The current managed provider supports only the fixed verified reference workload.'
            : 'MESH does not host or remotely enforce this delivery model.',
    };
  }

  /**
   * Buyer-facing execution descriptor for an agent the caller is entitled to.
   *
   * Exists because the protected gateway is keyed by `runtimeId`, which a buyer
   * previously had no authorized way to discover: the execute route was
   * therefore unreachable from any client. Callers MUST check entitlement
   * before invoking this, which the controller does.
   *
   * Deliberately omits `endpointUrl`, credential material, failure codes and
   * every other operator-only field. `executable` is computed from the same
   * preconditions `servingRuntime()` enforces, so the UI can never offer an
   * action the gateway would reject — but it is a hint, not an authorization:
   * the gateway re-checks entitlement and readiness on every call.
   */
  async buyerExecutionDescriptor(agentId: string): Promise<{
    agentId: string;
    runtimeId: string | null;
    executionModel: RuntimeExecutionModel | null;
    executable: boolean;
    /** Stable machine-readable reason the UI maps to localized copy. */
    reasonCode:
      | 'executable'
      | 'no_runtime'
      | 'model_not_served'
      | 'runtime_not_active'
      | 'runtime_not_ready'
      | 'no_deployed_release';
  }> {
    const base = { agentId, runtimeId: null, executionModel: null };
    const runtime = await this.runtimes.findOne({
      where: { agentId },
      relations: { currentRelease: true },
      order: { createdAt: 'DESC' },
    });
    if (!runtime) {
      return { ...base, executable: false, reasonCode: 'no_runtime' };
    }

    const descriptor = {
      agentId,
      executionModel: runtime.executionModel,
      // The id is only disclosed once the runtime is genuinely servable, so a
      // non-serving or suspended runtime's identifier is never handed out.
      runtimeId: null as string | null,
    };

    if (!isServingModel(runtime.executionModel)) {
      return {
        ...descriptor,
        executable: false,
        reasonCode: 'model_not_served',
      };
    }
    if (runtime.state !== 'active') {
      return {
        ...descriptor,
        executable: false,
        reasonCode: 'runtime_not_active',
      };
    }
    if (runtime.operationalStatus !== 'ready') {
      return {
        ...descriptor,
        executable: false,
        reasonCode: 'runtime_not_ready',
      };
    }
    if (
      !runtime.currentRelease ||
      runtime.currentRelease.state !== 'deployed'
    ) {
      return {
        ...descriptor,
        executable: false,
        reasonCode: 'no_deployed_release',
      };
    }
    return {
      ...descriptor,
      runtimeId: runtime.id,
      executable: true,
      reasonCode: 'executable',
    };
  }

  private async adminTransition(
    runtimeId: string,
    actorUserId: string,
    next: RuntimeState,
    reasonCode: string,
  ): Promise<RuntimeView> {
    const runtime = await this.getAdmin(runtimeId);
    if (!assertRuntimeTransition(runtime.state, next))
      throw this.conflict(
        `Cannot transition Runtime from ${runtime.state} to ${next}`,
      );
    const saved = await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .getRepository(RuntimeRegistration)
        .findOneByOrFail({ id: runtime.id });
      if (!assertRuntimeTransition(locked.state, next))
        throw this.conflict('Runtime transition is no longer valid');
      const from = locked.state;
      locked.state = next;
      if (next !== 'active')
        locked.operationalStatus =
          next === 'suspended' ? 'stopped' : locked.operationalStatus;
      if (next === 'revoked' || next === 'retired')
        locked.verifiedCapabilities = [];
      const updated = await manager
        .getRepository(RuntimeRegistration)
        .save(locked);
      await this.appendEvent(manager, updated, {
        type: next,
        from,
        to: next,
        actorUserId,
        reasonCode,
        dedupKey: `runtime-transition:${updated.id}:${from}:${next}:${Date.now()}`,
      });
      return updated;
    });
    const action =
      next === 'suspended'
        ? AUDIT_ACTIONS.RUNTIME_SUSPENDED
        : next === 'revoked'
          ? AUDIT_ACTIONS.RUNTIME_REVOKED
          : AUDIT_ACTIONS.RUNTIME_RETIRED;
    await this.recordAudit(action, saved, actorUserId, { reasonCode });
    return this.toView(saved);
  }

  private async persistConformance(
    runtime: RuntimeRegistration,
    release: RuntimeRelease | null,
    outcome: RuntimeConformanceOutcome,
    evidence: Record<string, unknown>,
    actorUserId: string,
  ): Promise<RuntimeConformanceRun> {
    const run = await this.conformanceRuns.save(
      this.conformanceRuns.create({
        runtimeId: runtime.id,
        releaseId: release?.id ?? null,
        suiteVersion: RUNTIME_CONFORMANCE_SUITE_VERSION,
        protocolVersion: runtime.protocolVersion,
        configurationFingerprint: runtime.configurationFingerprint,
        outcome,
        evidence,
      }),
    );
    await this.dataSource.transaction((manager) =>
      this.appendEvent(manager, runtime, {
        type: 'conformance_completed',
        from: runtime.state,
        to: runtime.state,
        actorUserId,
        reasonCode: outcome.toUpperCase(),
        dedupKey: `runtime-conformance:${run.id}`,
        evidenceRef: `conformance:${run.id}`,
        metadata: { runId: run.id, outcome, suiteVersion: run.suiteVersion },
      }),
    );
    recordRuntimeEvent(
      'conformance',
      outcome === 'passed'
        ? 'success'
        : outcome === 'blocked'
          ? 'blocked'
          : 'failure',
    );
    return run;
  }

  private async appendEvent(
    manager: EntityManager,
    runtime: RuntimeRegistration,
    input: {
      type: string;
      from: RuntimeState | null;
      to: RuntimeState | null;
      actorUserId: string | null;
      reasonCode: string;
      dedupKey: string;
      evidenceRef?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const existing = await manager
      .getRepository(RuntimeEvent)
      .findOneBy({ dedupKey: input.dedupKey });
    if (existing) return;
    await manager.getRepository(RuntimeEvent).save(
      manager.getRepository(RuntimeEvent).create({
        runtimeId: runtime.id,
        eventType: input.type,
        previousState: input.from,
        nextState: input.to,
        actorUserId: input.actorUserId,
        reasonCode: input.reasonCode,
        dedupKey: input.dedupKey,
        evidenceRef: input.evidenceRef ?? null,
        metadata: input.metadata ?? {},
      }),
    );
    recordRuntimeEvent('lifecycle', 'success');
  }

  /** Shared release and preflight validation. The registered model—not a
   * manifest declaration—chooses the allowed profile and artifact type. */
  private releaseManifestErrors(
    runtime: RuntimeRegistration,
    manifest: RuntimeReleaseManifest,
  ): string[] {
    const manifestErrors = validateReleaseManifest(manifest);
    // Never inspect artifact fields from an untrusted malformed body. The DTO
    // rejects it at HTTP boundaries; this keeps the service safe for any
    // programmatic caller as well.
    if (manifestErrors.length) return manifestErrors;
    const errors = [
      ...validateManifestRuntimeCompatibility(runtime.executionModel, manifest),
    ];
    if (!isServingModel(runtime.executionModel)) {
      errors.push('this execution model does not accept a Runtime release');
    } else if (
      runtime.executionModel === 'mesh_managed' &&
      (manifestDigestValue(manifest.artifactDigest) !==
        MANAGED_REFERENCE_ARTIFACT_DIGEST ||
        manifest.artifactKind !== 'mesh_reference_echo_v1')
    ) {
      errors.push(
        'Managed Runtime accepts only the fixed reference artifact and digest',
      );
    } else if (
      runtime.executionModel === 'mesh_connected' &&
      manifest.artifactKind !== 'connected_reference'
    ) {
      errors.push(
        'Connected Runtime releases must declare connected_reference',
      );
    }
    return [...new Set(errors)];
  }

  private validateRegistrationInput(input: {
    executionModel: RuntimeExecutionModel;
    hostingProvider: string;
    environment: string;
    endpointUrl?: string | null;
    protocolVersion?: string;
  }): void {
    if (!input.hostingProvider?.trim() || !input.environment?.trim())
      throw new ApiException(
        'VALIDATION_ERROR',
        'hostingProvider and environment are required',
        HttpStatus.BAD_REQUEST,
      );
    if (
      (input.protocolVersion ?? MESH_CONNECTOR_PROTOCOL_VERSION) !==
      MESH_CONNECTOR_PROTOCOL_VERSION
    )
      throw new ApiException(
        'VALIDATION_ERROR',
        `Only Connector Protocol ${MESH_CONNECTOR_PROTOCOL_VERSION} is supported`,
        HttpStatus.BAD_REQUEST,
      );
    if (input.executionModel === 'mesh_connected' && !input.endpointUrl?.trim())
      throw new ApiException(
        'VALIDATION_ERROR',
        'mesh_connected requires endpointUrl',
        HttpStatus.BAD_REQUEST,
      );
    if (input.executionModel !== 'mesh_connected' && input.endpointUrl?.trim())
      throw new ApiException(
        'VALIDATION_ERROR',
        'Only mesh_connected accepts endpointUrl',
        HttpStatus.BAD_REQUEST,
      );
  }

  private normalizeStrings(input: string[] | undefined): string[] {
    return [
      ...new Set((input ?? []).map((value) => value.trim()).filter(Boolean)),
    ].slice(0, 20);
  }

  private toView(
    runtime: RuntimeRegistration,
    agentName?: string,
  ): RuntimeView {
    return {
      id: runtime.id,
      agentId: runtime.agentId,
      ...(agentName ? { agentName } : {}),
      creatorId: runtime.creatorId,
      executionModel: runtime.executionModel,
      hostingProvider: runtime.hostingProvider,
      environment: runtime.environment,
      protocolVersion: runtime.protocolVersion,
      connectorVersion: runtime.connectorVersion,
      state: runtime.state,
      operationalStatus: runtime.operationalStatus,
      declaredCapabilities: runtime.declaredCapabilities,
      verifiedCapabilities: runtime.verifiedCapabilities,
      verifiedAt: runtime.verifiedAt,
      verificationEvidenceRef: runtime.verificationEvidenceRef,
      lastHeartbeatAt: runtime.lastHeartbeatAt,
      currentReleaseId: runtime.currentReleaseId,
      createdAt: runtime.createdAt,
      updatedAt: runtime.updatedAt,
    };
  }

  private async recordAudit(
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    runtime: RuntimeRegistration,
    actorId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      action,
      entity: AUDIT_ENTITIES.RUNTIME,
      entityId: runtime.id,
      context: { actorId },
      metadata,
    });
  }
  private notFound(message: string): ApiException {
    return new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
  private forbidden(message: string): ApiException {
    return new ApiException('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
  private conflict(message: string): ApiException {
    return new ApiException('CONFLICT', message, HttpStatus.CONFLICT);
  }
}
