import type { AgentVersionContent } from '../../../database/entities/agents/agent-version.entity';
import type { RuntimeConformanceRun } from '../../../database/entities/runtime/runtime-conformance-run.entity';
import type { RuntimeRegistration } from '../../../database/entities/runtime/runtime-registration.entity';
import type { RuntimeRelease } from '../../../database/entities/runtime/runtime-release.entity';

/** The one four-profile vocabulary used by Phase 7. */
export const EVALUATION_PROFILES = [
  'managed_runtime',
  'connected_runtime',
  'independent_deliverable',
  'external_unconnected_service',
] as const;
export type EvaluationProfile = (typeof EVALUATION_PROFILES)[number];

export const RISK_LEVELS = ['Low', 'Medium', 'High'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const CONTROL_REQUIREMENTS = [
  'Mandatory',
  'Conditional',
  'Optional',
] as const;
export type ControlRequirement = (typeof CONTROL_REQUIREMENTS)[number];

export const CONTROL_OUTCOMES = [
  'Passed',
  'Failed',
  'Blocked',
  'NotApplicable',
  'Inconclusive',
  'Cancelled',
] as const;
export type ControlOutcome = (typeof CONTROL_OUTCOMES)[number];

export const EVALUATION_FINAL_STATUSES = [
  'Passed',
  'Failed',
  'Blocked',
  'Cancelled',
] as const;
export type EvaluationFinalStatus = (typeof EVALUATION_FINAL_STATUSES)[number];

export const EVALUATION_RUN_STATES = [
  'Queued',
  'Running',
  'Completed',
  'Cancelled',
] as const;
export type EvaluationRunState = (typeof EVALUATION_RUN_STATES)[number];

export const CLAIM_ASSESSMENT_STATUSES = [
  'VerifiedWithinScope',
  'Contradicted',
  'Inconclusive',
  'NotTested',
  'NotApplicable',
] as const;
export type ClaimAssessmentStatus = (typeof CLAIM_ASSESSMENT_STATUSES)[number];

export interface EvaluationPolicyDefinition {
  schemaVersion: 1;
  catalogVersion: string;
  controls: Array<{
    id: string;
    version: string;
    requirement: ControlRequirement;
  }>;
  finalStatusAlgorithm: 'mandatory-v1';
}

export interface SanitizedProductInput {
  contentDigest: string;
  productType: string | null;
  deliveryModel: string | null;
  executionModel: string | null;
  hostingResponsibility: string | null;
  capabilityCount: number;
  permissionCount: number;
  requiredPermissionCount: number;
  integrationCount: number;
  requirementCount: number;
  requiredRequirementCount: number;
  dataPolicy: {
    declared: boolean;
    storesUserData: boolean | null;
    retentionDays: number | null;
    sharesWithThirdParties: boolean | null;
    thirdPartyCount: number;
    handlesSensitiveData: boolean | null;
    sensitiveCategoryCount: number;
  };
  commercial: {
    declared: boolean;
    serviceProvider: string | null;
    dependencyCount: number;
    consumptionModel: string | null;
  };
  buyerReceiveCount: number;
}

export interface SanitizedRuntimeInput {
  id: string;
  executionModel: RuntimeRegistration['executionModel'];
  state: RuntimeRegistration['state'];
  operationalStatus: RuntimeRegistration['operationalStatus'];
  protocolVersion: string;
  connectorVersion: string | null;
  configurationFingerprint: string;
  verifiedCapabilities: string[];
  verifiedAt: string | null;
  heartbeatObserved: boolean;
}

export interface SanitizedReleaseInput {
  id: string;
  releaseVersion: string;
  artifactDigest: string;
  artifactKind: string;
  schemaVersion: number | null;
  standardVersion: string | null;
  integrationProfile: string | null;
  manifestValidationErrors: string[];
  executionContract: {
    version: string | null;
    maxInputBytes: number | null;
    maxOutputBytes: number | null;
    downstreamTimeoutMs: number | null;
    retryPolicy: string | null;
    idempotency: string | null;
  } | null;
  externalDependencyCount: number;
  integrityVerifiedAt: string | null;
  recoveryVerifiedAt: string | null;
}

export interface SanitizedConformanceInput {
  id: string;
  outcome: RuntimeConformanceRun['outcome'];
  releaseId: string | null;
  suiteVersion: string;
  protocolVersion: string;
  configurationFingerprint: string;
  createdAt: string;
}

/**
 * This deliberately contains only controlled, bounded fields. The full creator
 * artifact, free-form text, endpoint URL, credentials and tool logs never enter
 * an evaluation snapshot or an EvidenceRecord.
 */
export interface EvaluationInputSnapshot {
  schemaVersion: 1;
  agentId: string;
  creatorId: string;
  agentVersionId: string;
  agentVersionNumber: string;
  reviewSubmissionId: string | null;
  profile: EvaluationProfile;
  profileBasis: 'runtime_registration' | 'product_declaration';
  product: SanitizedProductInput;
  runtime: SanitizedRuntimeInput | null;
  release: SanitizedReleaseInput | null;
  conformance: SanitizedConformanceInput | null;
}

export interface EvaluationContext {
  snapshot: EvaluationInputSnapshot;
  content: AgentVersionContent;
  runtime: RuntimeRegistration | null;
  release: RuntimeRelease | null;
  conformance: RuntimeConformanceRun | null;
  risk: RiskAssessment;
}

export interface RiskAssessment {
  level: RiskLevel;
  factors: Array<{
    code: string;
    impact: 'raises' | 'neutral';
    detail: string;
  }>;
  requiresHumanReview: boolean;
}

export interface PlannedControl {
  id: string;
  version: string;
  title: string;
  category: string;
  requirement: ControlRequirement;
  rationale: string;
}

export interface SafeEvidenceInput {
  kind: string;
  source:
    | 'product_snapshot'
    | 'runtime_registry'
    | 'runtime_release'
    | 'runtime_conformance'
    | 'evaluation_engine';
  toolName: string;
  toolVersion: string;
  sensitivity: 'safe' | 'restricted';
  value: Record<string, unknown>;
}

export interface ControlExecution {
  outcome: ControlOutcome;
  reasonCode: string;
  reason: string;
  requiresHumanReview: boolean;
  evidence: SafeEvidenceInput[];
}

export interface EvaluatedControl extends PlannedControl, ControlExecution {}

export interface ClaimAssessmentInput {
  claimKey: string;
  claimType: string;
  declaredValue: Record<string, unknown> | null;
  observedValue: Record<string, unknown> | null;
  status: ClaimAssessmentStatus;
  scope: string;
  limitation: string | null;
  controlIds: string[];
}
