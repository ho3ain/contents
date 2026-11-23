import { MANAGED_REFERENCE_ARTIFACT_DIGEST } from '../../runtime/runtime-domain';
import type {
  ControlExecution,
  ControlRequirement,
  EvaluationContext,
  PlannedControl,
} from './evaluation.types';
import { EVALUATION_CATALOG_VERSION } from './evaluation-domain';

interface CatalogControl {
  id: string;
  version: string;
  title: string;
  category: string;
  defaultRequirement: ControlRequirement;
  applies(context: EvaluationContext): boolean;
  rationale(context: EvaluationContext): string;
  execute(context: EvaluationContext): ControlExecution;
}

const evidence = (
  kind: string,
  source: Parameters<ControlExecution['evidence']['push']>[0]['source'],
  value: Record<string, unknown>,
): ControlExecution['evidence'] => [
  {
    kind,
    source,
    toolName: 'mesh-evaluation-engine',
    toolVersion: EVALUATION_CATALOG_VERSION,
    sensitivity: 'safe',
    value,
  },
];

const result = (
  outcome: ControlExecution['outcome'],
  reasonCode: string,
  reason: string,
  source: Parameters<ControlExecution['evidence']['push']>[0]['source'],
  value: Record<string, unknown>,
  requiresHumanReview = outcome !== 'Passed' && outcome !== 'NotApplicable',
): ControlExecution => ({
  outcome,
  reasonCode,
  reason,
  requiresHumanReview,
  evidence: evidence(reasonCode, source, value),
});

const isServing = (context: EvaluationContext) =>
  context.snapshot.profile === 'managed_runtime' ||
  context.snapshot.profile === 'connected_runtime';

const hasAnyArtifactExecutionBoundary = (context: EvaluationContext) => {
  if (context.snapshot.profile === 'independent_deliverable') return true;
  if (context.snapshot.profile === 'connected_runtime') return true;
  return (
    context.snapshot.profile === 'managed_runtime' &&
    context.snapshot.release?.artifactKind !== 'mesh_reference_echo_v1'
  );
};

/**
 * Catalog entries are safe metadata/record checks. No control invokes a
 * creator endpoint, downloads a URL, installs a dependency, runs shell/code,
 * or asks an AI provider. New executable adapters must be registered here
 * with an explicit isolation contract rather than extending this process.
 */
export const EVALUATION_CONTROL_CATALOG: readonly CatalogControl[] = [
  {
    id: 'P7-IDENTITY-001',
    version: '1.0.0',
    title: 'Exact product-version input identity',
    category: 'identity',
    defaultRequirement: 'Mandatory',
    applies: () => true,
    rationale: () =>
      'Every evaluation must have a frozen product/version snapshot.',
    execute: (context) =>
      result(
        context.snapshot.agentVersionId &&
          context.snapshot.product.contentDigest
          ? 'Passed'
          : 'Failed',
        'VERSION_SNAPSHOT_BOUND',
        context.snapshot.agentVersionId &&
          context.snapshot.product.contentDigest
          ? 'The run is bound to an exact product version and content digest.'
          : 'The run is missing an exact version or content digest.',
        'product_snapshot',
        {
          agentId: context.snapshot.agentId,
          agentVersionId: context.snapshot.agentVersionId,
          reviewSubmissionId: context.snapshot.reviewSubmissionId,
          contentDigest: context.snapshot.product.contentDigest,
        },
      ),
  },
  {
    id: 'P7-PROFILE-001',
    version: '1.0.0',
    title: 'Product profile and declaration consistency',
    category: 'profile',
    defaultRequirement: 'Mandatory',
    applies: () => true,
    rationale: (context) =>
      `The ${context.snapshot.profile} profile requires an explicit product declaration.`,
    execute: (context) => {
      const product = context.snapshot.product;
      const complete = !!(
        product.deliveryModel &&
        product.executionModel &&
        product.hostingResponsibility
      );
      if (!complete) {
        return result(
          'Inconclusive',
          'PRODUCT_DECLARATION_INCOMPLETE',
          'Delivery, execution or hosting declaration is missing; the profile cannot be fully compared.',
          'product_snapshot',
          {
            profile: context.snapshot.profile,
            profileBasis: context.snapshot.profileBasis,
            deliveryModel: product.deliveryModel,
            executionModel: product.executionModel,
            hostingResponsibility: product.hostingResponsibility,
          },
        );
      }
      return result(
        'Passed',
        'PROFILE_DECLARATION_PRESENT',
        context.snapshot.profileBasis === 'runtime_registration'
          ? 'Product declaration is present and the profile is anchored to a Runtime registration.'
          : 'Product declaration is present; no Runtime registration was available, so this remains declaration-scoped.',
        'product_snapshot',
        {
          profile: context.snapshot.profile,
          profileBasis: context.snapshot.profileBasis,
          deliveryModel: product.deliveryModel,
          executionModel: product.executionModel,
          hostingResponsibility: product.hostingResponsibility,
        },
        context.snapshot.profileBasis === 'product_declaration',
      );
    },
  },
  {
    id: 'P7-DATA-001',
    version: '1.0.0',
    title: 'Structured data-handling declaration',
    category: 'data',
    defaultRequirement: 'Mandatory',
    applies: () => true,
    rationale: () =>
      'Data/permission risk cannot be assessed without a structured declaration.',
    execute: (context) => {
      const data = context.snapshot.product.dataPolicy;
      if (!data.declared) {
        return result(
          'Inconclusive',
          'DATA_POLICY_ABSENT',
          'No structured data policy is available. Missing evidence is not treated as no data handling.',
          'product_snapshot',
          data,
        );
      }
      if (
        (data.storesUserData && data.retentionDays === null) ||
        (data.sharesWithThirdParties && data.thirdPartyCount === 0) ||
        (data.handlesSensitiveData && data.sensitiveCategoryCount === 0)
      ) {
        return result(
          'Failed',
          'DATA_POLICY_CONTRADICTION',
          'The structured data declaration has a required dependent field missing.',
          'product_snapshot',
          data,
        );
      }
      return result(
        'Passed',
        'DATA_POLICY_DECLARED',
        'The structured data declaration is internally complete within the available product snapshot.',
        'product_snapshot',
        data,
      );
    },
  },
  {
    id: 'P7-RELEASE-001',
    version: '1.0.0',
    title: 'Runtime release and artifact identity',
    category: 'artifact_identity',
    defaultRequirement: 'Mandatory',
    applies: isServing,
    rationale: () => 'Serving profiles need an exact Runtime release identity.',
    execute: (context) => {
      const release = context.snapshot.release;
      if (!release) {
        return result(
          'Failed',
          'RELEASE_MISSING',
          'No Runtime release is linked to this serving evaluation.',
          'evaluation_engine',
          { releasePresent: false },
        );
      }
      if (release.manifestValidationErrors.length > 0) {
        return result(
          'Failed',
          'RELEASE_MANIFEST_INVALID',
          'The stored Runtime manifest is structurally incompatible with its declared schema.',
          'runtime_release',
          {
            releaseId: release.id,
            artifactDigest: release.artifactDigest,
            errorCount: release.manifestValidationErrors.length,
          },
        );
      }
      return result(
        'Passed',
        'RELEASE_IDENTITY_BOUND',
        'The evaluation is linked to a release record, digest and structurally valid secret-free manifest.',
        'runtime_release',
        {
          releaseId: release.id,
          releaseVersion: release.releaseVersion,
          artifactDigest: release.artifactDigest,
          schemaVersion: release.schemaVersion,
          integrityVerifiedAt: release.integrityVerifiedAt,
        },
      );
    },
  },
  {
    id: 'P7-EXECUTION-CONTRACT-001',
    version: '1.0.0',
    title: 'Serving execution contract',
    category: 'execution_contract',
    defaultRequirement: 'Mandatory',
    applies: isServing,
    rationale: () =>
      'Serving profiles must expose bounded protocol/timeout evidence.',
    execute: (context) => {
      const release = context.snapshot.release;
      if (!release) {
        return result(
          'Blocked',
          'EXECUTION_CONTRACT_UNAVAILABLE',
          'No release manifest is available to inspect the serving execution contract.',
          'evaluation_engine',
          { releasePresent: false },
        );
      }
      if (release.schemaVersion !== 2 || !release.executionContract) {
        return result(
          'Blocked',
          'EXECUTION_CONTRACT_LEGACY',
          'A v1 release manifest does not expose the versioned Standard execution contract required by this control.',
          'runtime_release',
          { releaseId: release.id, schemaVersion: release.schemaVersion },
        );
      }
      if (release.integrationProfile !== context.snapshot.profile) {
        return result(
          'Failed',
          'EXECUTION_PROFILE_MISMATCH',
          'The Runtime release integration profile does not match the Runtime registration model.',
          'runtime_release',
          {
            releaseId: release.id,
            integrationProfile: release.integrationProfile,
            runtimeProfile: context.snapshot.profile,
          },
        );
      }
      return result(
        'Passed',
        'EXECUTION_CONTRACT_BOUND',
        'The v2 release manifest carries the supported bounded execution contract.',
        'runtime_release',
        { releaseId: release.id, ...release.executionContract },
      );
    },
  },
  {
    id: 'P7-CONFORMANCE-001',
    version: '1.0.0',
    title: 'Recorded Runtime conformance',
    category: 'runtime_conformance',
    defaultRequirement: 'Mandatory',
    applies: isServing,
    rationale: () =>
      'Existing conformance evidence is required; the evaluator does not issue a new network probe.',
    execute: (context) => {
      const conformance = context.snapshot.conformance;
      const runtime = context.snapshot.runtime;
      if (!runtime || !conformance) {
        return result(
          'Blocked',
          'CONFORMANCE_EVIDENCE_MISSING',
          'No matching recorded conformance result is available.',
          'evaluation_engine',
          { runtimePresent: !!runtime, conformancePresent: !!conformance },
        );
      }
      if (
        context.snapshot.release &&
        conformance.releaseId !== context.snapshot.release.id
      ) {
        return result(
          'Blocked',
          'CONFORMANCE_RELEASE_STALE',
          'The recorded conformance result is not bound to the selected Runtime release.',
          'runtime_conformance',
          {
            conformanceId: conformance.id,
            conformanceReleaseId: conformance.releaseId,
            selectedReleaseId: context.snapshot.release.id,
          },
        );
      }
      if (
        conformance.configurationFingerprint !==
        runtime.configurationFingerprint
      ) {
        return result(
          'Blocked',
          'CONFORMANCE_CONFIGURATION_STALE',
          'The recorded conformance result was produced for a different Runtime configuration.',
          'runtime_conformance',
          {
            conformanceId: conformance.id,
            configurationMatches: false,
            outcome: conformance.outcome,
          },
        );
      }
      const mapped =
        conformance.outcome === 'passed'
          ? 'Passed'
          : conformance.outcome === 'failed'
            ? 'Failed'
            : 'Blocked';
      return result(
        mapped,
        `CONFORMANCE_${conformance.outcome.toUpperCase()}`,
        `The latest matching recorded conformance result is ${conformance.outcome}.`,
        'runtime_conformance',
        {
          conformanceId: conformance.id,
          releaseId: conformance.releaseId,
          outcome: conformance.outcome,
          suiteVersion: conformance.suiteVersion,
          protocolVersion: conformance.protocolVersion,
        },
      );
    },
  },
  {
    id: 'P7-ENTITLEMENT-001',
    version: '1.0.0',
    title: 'Serving entitlement boundary evidence',
    category: 'entitlement_boundary',
    defaultRequirement: 'Mandatory',
    applies: isServing,
    rationale: () =>
      'Serving access must reuse the existing gateway/entitlement authority.',
    execute: (context) => {
      const runtime = context.snapshot.runtime;
      const capabilities = runtime?.verifiedCapabilities ?? [];
      const complete =
        runtime?.state === 'active' &&
        capabilities.includes('runtime_identity') &&
        capabilities.includes('gateway_enforced_execution');
      return result(
        complete ? 'Passed' : 'Blocked',
        complete ? 'GATEWAY_BOUNDARY_VERIFIED' : 'GATEWAY_BOUNDARY_UNVERIFIED',
        complete
          ? 'Runtime state and verified capabilities show the existing gateway enforcement boundary.'
          : 'No active, gateway-enforced Runtime evidence is available; creator declarations do not satisfy this control.',
        'runtime_registry',
        {
          runtimeState: runtime?.state ?? null,
          verifiedCapabilities: capabilities,
        },
      );
    },
  },
  {
    id: 'P7-ARTIFACT-EXECUTION-001',
    version: '1.0.0',
    title: 'Untrusted artifact execution isolation',
    category: 'artifact_security',
    defaultRequirement: 'Mandatory',
    applies: hasAnyArtifactExecutionBoundary,
    rationale: () =>
      'Creator artifact execution requires a demonstrably isolated sandbox.',
    execute: (context) => {
      const release = context.snapshot.release;
      // The one fixed MESH reference workload is not a creator-supplied
      // artifact. It is intentionally excluded by `applies`; no general
      // container/sandbox claim is made here.
      return result(
        'Blocked',
        'SAFE_SANDBOX_UNAVAILABLE',
        'This environment has no demonstrated safe sandbox for creator-supplied code or packages. The artifact was not fetched, installed or executed.',
        'evaluation_engine',
        {
          profile: context.snapshot.profile,
          releaseId: release?.id ?? null,
          artifactDigest: release?.artifactDigest ?? null,
          referenceDigestMatches:
            release?.artifactDigest === MANAGED_REFERENCE_ARTIFACT_DIGEST,
        },
      );
    },
  },
  {
    id: 'P7-INDEPENDENT-001',
    version: '1.0.0',
    title: 'Independent delivery declaration',
    category: 'independent_delivery',
    defaultRequirement: 'Mandatory',
    applies: (context) =>
      context.snapshot.profile === 'independent_deliverable',
    rationale: () =>
      'Independent deliverables need a bounded buyer-delivery declaration.',
    execute: (context) => {
      const product = context.snapshot.product;
      const compatible = ['downloadable', 'setup', 'hybrid'].includes(
        product.deliveryModel ?? '',
      );
      return result(
        compatible && product.buyerReceiveCount > 0 ? 'Passed' : 'Inconclusive',
        compatible && product.buyerReceiveCount > 0
          ? 'INDEPENDENT_DELIVERY_DECLARED'
          : 'INDEPENDENT_DELIVERY_UNCLEAR',
        compatible && product.buyerReceiveCount > 0
          ? 'The product describes an independent delivery form and buyer receipt.'
          : 'The independent delivery/receipt declaration is incomplete.',
        'product_snapshot',
        {
          deliveryModel: product.deliveryModel,
          buyerReceiveCount: product.buyerReceiveCount,
        },
      );
    },
  },
  {
    id: 'P7-EXTERNAL-001',
    version: '1.0.0',
    title: 'External-service boundary declaration',
    category: 'external_boundary',
    defaultRequirement: 'Mandatory',
    applies: (context) =>
      context.snapshot.profile === 'external_unconnected_service',
    rationale: () =>
      'External unconnected services must not be represented as MESH-controlled Runtime execution.',
    execute: (context) => {
      const product = context.snapshot.product;
      const externallyScoped =
        ['external_hosted', 'api_access'].includes(
          product.deliveryModel ?? '',
        ) || ['creator', 'third_party'].includes(product.executionModel ?? '');
      return result(
        externallyScoped ? 'Passed' : 'Inconclusive',
        externallyScoped
          ? 'EXTERNAL_BOUNDARY_DECLARED'
          : 'EXTERNAL_BOUNDARY_UNCLEAR',
        externallyScoped
          ? 'The product declaration places service execution outside the MESH Runtime boundary.'
          : 'The product does not clearly declare its external service boundary.',
        'product_snapshot',
        {
          deliveryModel: product.deliveryModel,
          executionModel: product.executionModel,
          hostingResponsibility: product.hostingResponsibility,
        },
      );
    },
  },
  {
    id: 'P7-HIGH-RISK-001',
    version: '1.0.0',
    title: 'High-risk human-review escalation',
    category: 'risk_escalation',
    defaultRequirement: 'Conditional',
    applies: (context) => context.risk.level === 'High',
    rationale: () =>
      'High-risk selection requires an explicit human decision; automated evidence cannot clear it.',
    execute: (context) =>
      result(
        'Blocked',
        'HIGH_RISK_HUMAN_REVIEW_REQUIRED',
        'The deterministic risk classifier selected High risk. Human review is required; no AI or score can clear this gate.',
        'evaluation_engine',
        {
          riskLevel: context.risk.level,
          factorCodes: context.risk.factors.map((factor) => factor.code),
        },
      ),
  },
  {
    id: 'P7-MONITORING-001',
    version: '1.0.0',
    title: 'Recorded operational observability',
    category: 'monitoring',
    defaultRequirement: 'Optional',
    applies: isServing,
    rationale: () =>
      'This reports available Runtime registry observations and does not create a monitoring authority.',
    execute: (context) => {
      const runtime = context.snapshot.runtime;
      const observed =
        runtime?.heartbeatObserved && runtime.operationalStatus === 'ready';
      return result(
        observed ? 'Passed' : 'Inconclusive',
        observed
          ? 'RUNTIME_OBSERVATION_AVAILABLE'
          : 'RUNTIME_OBSERVATION_LIMITED',
        observed
          ? 'A Runtime registry heartbeat and ready status are recorded.'
          : 'No current ready/heartbeat observation is available. This optional control does not synthesize an operational result.',
        'runtime_registry',
        {
          heartbeatObserved: runtime?.heartbeatObserved ?? false,
          operationalStatus: runtime?.operationalStatus ?? null,
        },
        !observed,
      );
    },
  },
  {
    id: 'P7-CAPABILITY-001',
    version: '1.0.0',
    title: 'Capability claim testability',
    category: 'claims',
    defaultRequirement: 'Optional',
    applies: () => true,
    rationale: () =>
      'Free-form capability declarations are never treated as executed proof.',
    execute: (context) =>
      result(
        context.snapshot.product.capabilityCount === 0
          ? 'NotApplicable'
          : 'Inconclusive',
        context.snapshot.product.capabilityCount === 0
          ? 'NO_CAPABILITY_CLAIMS'
          : 'CAPABILITIES_NOT_EXECUTED',
        context.snapshot.product.capabilityCount === 0
          ? 'No structured capability claims were supplied.'
          : 'Capability claims were not exercised because no safe artifact/runtime execution adapter is available.',
        'product_snapshot',
        { capabilityCount: context.snapshot.product.capabilityCount },
        context.snapshot.product.capabilityCount > 0,
      ),
  },
];

const byKey = new Map(
  EVALUATION_CONTROL_CATALOG.map((control) => [
    `${control.id}:${control.version}`,
    control,
  ]),
);

export function selectControls(
  policy: {
    controls: Array<{
      id: string;
      version: string;
      requirement: ControlRequirement;
    }>;
  },
  context: EvaluationContext,
): PlannedControl[] {
  const plan: PlannedControl[] = [];
  for (const selected of policy.controls) {
    const control = byKey.get(`${selected.id}:${selected.version}`);
    if (!control) {
      throw new Error(
        `Unsupported evaluation control ${selected.id}@${selected.version}`,
      );
    }
    if (!control.applies(context)) continue;
    plan.push({
      id: control.id,
      version: control.version,
      title: control.title,
      category: control.category,
      requirement: selected.requirement,
      rationale: control.rationale(context),
    });
  }
  return plan;
}

export function executeControl(
  plan: PlannedControl,
  context: EvaluationContext,
): ControlExecution {
  const control = byKey.get(`${plan.id}:${plan.version}`);
  if (!control) {
    // Policy evolution must fail closed. An old run preserves its plan but a
    // current engine cannot fabricate a result for a code version it lacks.
    return result(
      'Blocked',
      'CONTROL_IMPLEMENTATION_UNAVAILABLE',
      'The selected policy references a control implementation unavailable in this evaluator build.',
      'evaluation_engine',
      { controlId: plan.id, controlVersion: plan.version },
    );
  }
  return control.execute(context);
}
