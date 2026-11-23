import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { Agent } from '../../database/entities/agents/agent.entity';
import { AgentReviewSubmission } from '../../database/entities/agents/agent-review-submission.entity';
import {
  AgentVersion,
  type AgentVersionContent,
} from '../../database/entities/agents/agent-version.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { RuntimeConformanceRun } from '../../database/entities/runtime/runtime-conformance-run.entity';
import { RuntimeRegistration } from '../../database/entities/runtime/runtime-registration.entity';
import { RuntimeRelease } from '../../database/entities/runtime/runtime-release.entity';
import {
  profileFromProductDeclaration,
  profileFromRuntime,
  sanitizedManifest,
  sha256,
} from './domain/evaluation-domain';
import type { EvaluationInputSnapshot } from './domain/evaluation.types';

export interface EvaluationSourceSelection {
  agentId: string;
  agentVersionId: string;
  reviewSubmissionId?: string;
  runtimeId?: string;
  runtimeReleaseId?: string;
}

export interface ResolvedEvaluationSource {
  creator: CreatorProfile;
  agent: Agent;
  version: AgentVersion;
  submission: AgentReviewSubmission | null;
  runtime: RuntimeRegistration | null;
  release: RuntimeRelease | null;
  conformance: RuntimeConformanceRun | null;
  content: AgentVersionContent;
  snapshot: EvaluationInputSnapshot;
}

/**
 * Server-side source resolution. The DTO carries identifiers only: product,
 * profile, digest, ownership, Runtime state and release facts all come from
 * canonical database records, never from the browser.
 */
@Injectable()
export class EvaluationSourceService {
  constructor(
    @InjectRepository(CreatorProfile)
    private readonly creators: Repository<CreatorProfile>,
    @InjectRepository(Agent)
    private readonly agents: Repository<Agent>,
    @InjectRepository(AgentVersion)
    private readonly versions: Repository<AgentVersion>,
    @InjectRepository(AgentReviewSubmission)
    private readonly submissions: Repository<AgentReviewSubmission>,
    @InjectRepository(RuntimeRegistration)
    private readonly runtimes: Repository<RuntimeRegistration>,
    @InjectRepository(RuntimeRelease)
    private readonly releases: Repository<RuntimeRelease>,
    @InjectRepository(RuntimeConformanceRun)
    private readonly conformanceRuns: Repository<RuntimeConformanceRun>,
  ) {}

  async resolveForCreator(
    userId: string,
    selection: EvaluationSourceSelection,
  ): Promise<ResolvedEvaluationSource> {
    const creator = await this.creators.findOneBy({ userId });
    if (!creator) throw this.notFound('Product not found');
    const agent = await this.agents.findOneBy({
      id: selection.agentId,
      creatorId: creator.id,
    });
    if (!agent) throw this.notFound('Product not found');
    const version = await this.versions.findOneBy({
      id: selection.agentVersionId,
      agentId: agent.id,
    });
    if (!version) throw this.notFound('Product version not found');

    const submission = selection.reviewSubmissionId
      ? await this.submissions.findOneBy({
          id: selection.reviewSubmissionId,
          agentId: agent.id,
          creatorId: creator.id,
        })
      : null;
    if (selection.reviewSubmissionId && !submission) {
      throw this.notFound('Review submission not found');
    }
    if (submission?.versionId && submission.versionId !== version.id) {
      throw new ApiException(
        'UNPROCESSABLE',
        'The review submission does not belong to the selected product version',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const content =
      submission?.snapshot ?? version.snapshot ?? version.draftContent;
    if (!content) {
      throw new ApiException(
        'UNPROCESSABLE',
        'The selected version has no content snapshot to evaluate',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const runtime = selection.runtimeId
      ? await this.runtimes.findOneBy({
          id: selection.runtimeId,
          agentId: agent.id,
          creatorId: creator.id,
        })
      : null;
    if (selection.runtimeId && !runtime)
      throw this.notFound('Runtime not found');
    if (selection.runtimeReleaseId && !runtime) {
      throw new ApiException(
        'UNPROCESSABLE',
        'A Runtime release requires a Runtime registration',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const release = runtime
      ? await this.releases.findOneBy({
          id: selection.runtimeReleaseId ?? runtime.currentReleaseId ?? '',
          runtimeId: runtime.id,
        })
      : null;
    if (selection.runtimeReleaseId && !release)
      throw this.notFound('Runtime release not found');
    if (release?.agentVersionId && release.agentVersionId !== version.id) {
      throw new ApiException(
        'UNPROCESSABLE',
        'The Runtime release is not bound to the selected product version',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const conformance = runtime
      ? await this.conformanceRuns.findOne({
          where: { runtimeId: runtime.id },
          order: { createdAt: 'DESC' },
        })
      : null;

    const snapshot = this.snapshot({
      creator,
      agent,
      version,
      submission,
      runtime,
      release,
      conformance,
      content,
    });
    return {
      creator,
      agent,
      version,
      submission,
      runtime,
      release,
      conformance,
      content,
      snapshot,
    };
  }

  private snapshot(
    input: Omit<ResolvedEvaluationSource, 'snapshot'>,
  ): EvaluationInputSnapshot {
    const {
      creator,
      agent,
      version,
      submission,
      runtime,
      release,
      conformance,
      content,
    } = input;
    const data = content.dataPolicy;
    const commercial = content.commercialProfile;
    const profile = runtime
      ? profileFromRuntime(runtime.executionModel)
      : profileFromProductDeclaration({
          deliveryModel: content.deliveryModel,
          executionModel: content.executionModel,
          serviceProvider: commercial?.service?.provider,
        });
    const manifest = release ? sanitizedManifest(release.manifest) : null;
    return {
      schemaVersion: 1,
      agentId: agent.id,
      creatorId: creator.id,
      agentVersionId: version.id,
      agentVersionNumber: version.versionNumber,
      reviewSubmissionId: submission?.id ?? null,
      profile,
      profileBasis: runtime ? 'runtime_registration' : 'product_declaration',
      product: {
        contentDigest: sha256(content),
        productType: content.productType ?? null,
        deliveryModel: content.deliveryModel ?? null,
        executionModel: content.executionModel ?? null,
        hostingResponsibility: content.hostingResponsibility ?? null,
        capabilityCount: content.capabilities?.length ?? 0,
        permissionCount: content.permissions?.length ?? 0,
        requiredPermissionCount: (content.permissions ?? []).filter(
          (permission) => permission.required,
        ).length,
        integrationCount: content.integrations?.length ?? 0,
        requirementCount: content.requirements?.length ?? 0,
        requiredRequirementCount: (content.requirements ?? []).filter(
          (requirement) => requirement.required,
        ).length,
        dataPolicy: {
          declared: !!data,
          storesUserData: data?.storesUserData ?? null,
          retentionDays: data?.retentionDays ?? null,
          sharesWithThirdParties: data?.sharesWithThirdParties ?? null,
          thirdPartyCount: data?.thirdParties?.length ?? 0,
          handlesSensitiveData: data?.handlesSensitiveData ?? null,
          sensitiveCategoryCount: data?.sensitiveDataCategories?.length ?? 0,
        },
        commercial: {
          declared: !!commercial,
          serviceProvider: commercial?.service?.provider ?? null,
          dependencyCount: commercial?.dependencies?.length ?? 0,
          consumptionModel: commercial?.consumption?.costModel ?? null,
        },
        buyerReceiveCount: content.whatBuyerReceives?.length ?? 0,
      },
      runtime: runtime
        ? {
            id: runtime.id,
            executionModel: runtime.executionModel,
            state: runtime.state,
            operationalStatus: runtime.operationalStatus,
            protocolVersion: runtime.protocolVersion,
            connectorVersion: runtime.connectorVersion,
            configurationFingerprint: runtime.configurationFingerprint,
            verifiedCapabilities: [...runtime.verifiedCapabilities].sort(),
            verifiedAt: runtime.verifiedAt?.toISOString() ?? null,
            heartbeatObserved: !!runtime.lastHeartbeatAt,
          }
        : null,
      release:
        release && manifest
          ? {
              id: release.id,
              releaseVersion: release.releaseVersion,
              artifactDigest: release.artifactDigest,
              artifactKind: manifest.artifactKind,
              schemaVersion: manifest.schemaVersion,
              standardVersion: manifest.standardVersion,
              integrationProfile: manifest.integrationProfile,
              manifestValidationErrors: manifest.manifestValidationErrors,
              executionContract: manifest.executionContract,
              externalDependencyCount: manifest.externalDependencyCount,
              integrityVerifiedAt:
                release.integrityVerifiedAt?.toISOString() ?? null,
              recoveryVerifiedAt:
                release.recoveryVerifiedAt?.toISOString() ?? null,
            }
          : null,
      conformance: conformance
        ? {
            id: conformance.id,
            outcome: conformance.outcome,
            releaseId: conformance.releaseId,
            suiteVersion: conformance.suiteVersion,
            protocolVersion: conformance.protocolVersion,
            configurationFingerprint: conformance.configurationFingerprint,
            createdAt: conformance.createdAt.toISOString(),
          }
        : null,
    };
  }

  private notFound(message: string): ApiException {
    return new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
}
