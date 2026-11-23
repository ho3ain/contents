import { createHash } from 'crypto';
import { creatorIntegrationProfileFor } from '../../runtime/runtime-domain';
import type { RuntimeExecutionModel } from '../../../database/entities/runtime/runtime-registration.entity';
import type { RuntimeReleaseManifest } from '../../../database/entities/runtime/runtime-release.entity';
import { validateReleaseManifest } from '../../runtime/runtime-domain';
import type {
  ClaimAssessmentInput,
  EvaluatedControl,
  EvaluationContext,
  EvaluationFinalStatus,
  EvaluationInputSnapshot,
  EvaluationProfile,
  SanitizedReleaseInput,
  PlannedControl,
  RiskAssessment,
} from './evaluation.types';

export const EVALUATION_ENGINE_VERSION = '1.0.0';
export const EVALUATION_CATALOG_VERSION = '1.0.0';

/** Stable recursively sorted JSON, used only for non-secret local fingerprints. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function profileFromRuntime(
  executionModel: RuntimeExecutionModel,
): EvaluationProfile {
  return creatorIntegrationProfileFor(executionModel);
}

/**
 * No caller selects a product model. When no Runtime is present, the only
 * available fact is the frozen product declaration; its provenance is carried
 * as `product_declaration` and controls must not treat it as runtime proof.
 */
export function profileFromProductDeclaration(input: {
  deliveryModel: string | null | undefined;
  executionModel: string | null | undefined;
  serviceProvider?: string | null;
}): EvaluationProfile {
  if (
    input.deliveryModel === 'external_hosted' ||
    input.deliveryModel === 'api_access' ||
    input.executionModel === 'creator' ||
    input.executionModel === 'third_party' ||
    input.serviceProvider === 'creator' ||
    input.serviceProvider === 'third_party'
  ) {
    return 'external_unconnected_service';
  }
  return 'independent_deliverable';
}

export function sanitizedManifest(manifest: RuntimeReleaseManifest): {
  artifactKind: string;
  schemaVersion: number | null;
  standardVersion: string | null;
  integrationProfile: string | null;
  manifestValidationErrors: string[];
  executionContract: SanitizedReleaseInput['executionContract'];
  externalDependencyCount: number;
} {
  const v2 = manifest.schemaVersion === 2 ? manifest : null;
  return {
    artifactKind: manifest.artifactKind,
    schemaVersion:
      typeof manifest.schemaVersion === 'number'
        ? manifest.schemaVersion
        : null,
    standardVersion: v2?.standardVersion ?? null,
    integrationProfile: v2?.integrationProfile ?? null,
    manifestValidationErrors: validateReleaseManifest(manifest),
    executionContract: v2
      ? {
          version: v2.executionContract?.version ?? null,
          maxInputBytes: v2.executionContract?.maxInputBytes ?? null,
          maxOutputBytes: v2.executionContract?.maxOutputBytes ?? null,
          downstreamTimeoutMs:
            v2.executionContract?.downstreamTimeoutMs ?? null,
          retryPolicy: v2.executionContract?.retryPolicy ?? null,
          idempotency: v2.executionContract?.idempotency ?? null,
        }
      : null,
    externalDependencyCount: Array.isArray(manifest.externalDependencies)
      ? manifest.externalDependencies.length
      : 0,
  };
}

/** Missing observability only raises risk; it is never converted into a pass. */
export function classifyRisk(
  snapshot: EvaluationInputSnapshot,
): RiskAssessment {
  const factors: RiskAssessment['factors'] = [];
  const add = (code: string, detail: string) =>
    factors.push({ code, impact: 'raises', detail });
  let points = 0;
  if (
    snapshot.profile === 'managed_runtime' ||
    snapshot.profile === 'connected_runtime'
  ) {
    points += 2;
    add(
      'SERVING_RUNTIME',
      'The product has a serving Runtime execution boundary.',
    );
  }
  if (
    snapshot.profile === 'connected_runtime' ||
    snapshot.profile === 'external_unconnected_service'
  ) {
    points += 1;
    add(
      'EXTERNAL_DEPENDENCY',
      'The product depends on an external service or connector boundary.',
    );
  }
  if (snapshot.product.dataPolicy.handlesSensitiveData === true) {
    points += 3;
    add('SENSITIVE_DATA', 'The creator declares sensitive data handling.');
  }
  if (snapshot.product.permissionCount > 0) {
    points += snapshot.product.requiredPermissionCount > 0 ? 2 : 1;
    add(
      'DECLARED_PERMISSIONS',
      'The product declares one or more permissions.',
    );
  }
  if (
    snapshot.product.commercial.dependencyCount > 0 ||
    snapshot.release?.externalDependencyCount
  ) {
    points += 1;
    add(
      'DEPENDENCY_COUNT',
      'The product/release declares external dependencies.',
    );
  }
  if (!snapshot.product.dataPolicy.declared) {
    points += 2;
    add(
      'DATA_POLICY_UNOBSERVABLE',
      'A structured data-policy declaration is absent.',
    );
  }
  if (snapshot.profile === 'connected_runtime' && !snapshot.conformance) {
    points += 2;
    add(
      'CONFORMANCE_UNOBSERVABLE',
      'No recorded configuration-bound conformance result is available.',
    );
  }
  if (snapshot.profileBasis === 'product_declaration') {
    points += 1;
    add(
      'DECLARATION_PROFILE_ONLY',
      'No Runtime registration anchors the selected model.',
    );
  }
  const level = points >= 5 ? 'High' : points >= 2 ? 'Medium' : 'Low';
  return { level, factors, requiresHumanReview: level === 'High' };
}

/**
 * The final reducer is intentionally independent of AI, scores and optional
 * controls. A critical failure cannot be compensated by any positive result.
 */
export function reduceFinalStatus(
  controls: Array<Pick<EvaluatedControl, 'requirement' | 'outcome'>>,
  cancelled = false,
): EvaluationFinalStatus {
  if (cancelled) return 'Cancelled';
  // Conditional controls enter this set only after their profile/risk selector
  // applies. At that point they are gateworthy just like mandatory controls;
  // inapplicable conditional controls are not planned at all.
  const required = controls.filter(
    (control) =>
      control.requirement === 'Mandatory' ||
      control.requirement === 'Conditional',
  );
  if (required.some((control) => control.outcome === 'Failed')) return 'Failed';
  if (
    required.some(
      (control) => !['Passed', 'NotApplicable'].includes(control.outcome),
    )
  ) {
    return 'Blocked';
  }
  return 'Passed';
}

/** A compact, deterministic claim projection. It never promotes declarations to facts. */
export function assessClaims(
  context: EvaluationContext,
): ClaimAssessmentInput[] {
  const { snapshot } = context;
  const claims: ClaimAssessmentInput[] = [
    {
      claimKey: 'product.execution_boundary',
      claimType: 'delivery_execution_declaration',
      declaredValue: {
        deliveryModel: snapshot.product.deliveryModel,
        executionModel: snapshot.product.executionModel,
        hostingResponsibility: snapshot.product.hostingResponsibility,
      },
      observedValue: snapshot.runtime
        ? {
            runtimeExecutionModel: snapshot.runtime.executionModel,
            profile: snapshot.profile,
          }
        : null,
      status: snapshot.runtime ? 'VerifiedWithinScope' : 'NotTested',
      scope: snapshot.runtime
        ? 'Bound only to the Runtime registration model; it does not attest external hosting or artifact behavior.'
        : 'Only a creator product declaration was available; no Runtime was observed.',
      limitation: snapshot.runtime
        ? null
        : 'No Runtime registration was selected or available.',
      controlIds: ['P7-PROFILE-001'],
    },
    {
      claimKey: 'product.data_handling',
      claimType: 'data_policy_declaration',
      declaredValue: {
        declared: snapshot.product.dataPolicy.declared,
        storesUserData: snapshot.product.dataPolicy.storesUserData,
        handlesSensitiveData: snapshot.product.dataPolicy.handlesSensitiveData,
        sharesWithThirdParties:
          snapshot.product.dataPolicy.sharesWithThirdParties,
      },
      observedValue: null,
      status: snapshot.product.dataPolicy.declared
        ? 'NotTested'
        : 'Inconclusive',
      scope:
        'Structured product declaration completeness only; no data-flow capture or artifact execution occurred.',
      limitation:
        'No safe artifact/runtime data-flow inspection adapter is available in this epic.',
      controlIds: ['P7-DATA-001'],
    },
    {
      claimKey: 'product.capabilities',
      claimType: 'capability_declaration',
      declaredValue: { capabilityCount: snapshot.product.capabilityCount },
      observedValue: null,
      status:
        snapshot.product.capabilityCount === 0 ? 'NotApplicable' : 'NotTested',
      scope: 'The engine counted structured capability declarations only.',
      limitation:
        'Capability behavior cannot be inferred from product copy and untrusted artifacts are not executed.',
      controlIds: ['P7-CAPABILITY-001'],
    },
  ];
  if (snapshot.release) {
    claims.push({
      claimKey: 'runtime.release_identity',
      claimType: 'release_digest_record',
      declaredValue: { artifactDigest: snapshot.release.artifactDigest },
      observedValue: {
        releaseId: snapshot.release.id,
        integrityVerifiedAt: snapshot.release.integrityVerifiedAt,
      },
      status: snapshot.release.integrityVerifiedAt
        ? 'VerifiedWithinScope'
        : 'Inconclusive',
      scope: 'The digest is linked to the stored Runtime release record only.',
      limitation: snapshot.release.integrityVerifiedAt
        ? 'No artifact bytes were fetched or executed by this evaluation.'
        : 'The release has no stored integrity-verification timestamp.',
      controlIds: ['P7-RELEASE-001'],
    });
  }
  if (snapshot.runtime) {
    claims.push({
      claimKey: 'runtime.connector_protocol',
      claimType: 'protocol_conformance',
      declaredValue: { protocolVersion: snapshot.runtime.protocolVersion },
      observedValue: snapshot.conformance
        ? {
            outcome: snapshot.conformance.outcome,
            suiteVersion: snapshot.conformance.suiteVersion,
            protocolVersion: snapshot.conformance.protocolVersion,
          }
        : null,
      status:
        snapshot.conformance?.outcome === 'passed'
          ? 'VerifiedWithinScope'
          : snapshot.conformance?.outcome === 'failed'
            ? 'Contradicted'
            : snapshot.conformance
              ? 'Inconclusive'
              : 'NotTested',
      scope:
        'Recorded configuration-bound Runtime conformance result only; no new network probe was issued.',
      limitation: snapshot.conformance
        ? null
        : 'No matching recorded conformance evidence is available.',
      controlIds: ['P7-CONFORMANCE-001'],
    });
  }
  return claims;
}

export function planDigest(plan: PlannedControl[]): string {
  return sha256(
    plan.map(({ id, version, requirement }) => ({ id, version, requirement })),
  );
}
