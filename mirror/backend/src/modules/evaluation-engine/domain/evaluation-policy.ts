import type { EvaluationPolicyDefinition } from './evaluation.types';
import { EVALUATION_CATALOG_VERSION } from './evaluation-domain';

/**
 * Baseline 1.0 policy. The migration persists this exact data as a versioned
 * policy record. It is deliberately conservative: unsupported artifact
 * execution is a mandatory Blocked result rather than an optimistic pass.
 */
export const BASELINE_EVALUATION_POLICY: EvaluationPolicyDefinition = {
  schemaVersion: 1,
  catalogVersion: EVALUATION_CATALOG_VERSION,
  finalStatusAlgorithm: 'mandatory-v1',
  controls: [
    { id: 'P7-IDENTITY-001', version: '1.0.0', requirement: 'Mandatory' },
    { id: 'P7-PROFILE-001', version: '1.0.0', requirement: 'Mandatory' },
    { id: 'P7-DATA-001', version: '1.0.0', requirement: 'Mandatory' },
    { id: 'P7-RELEASE-001', version: '1.0.0', requirement: 'Mandatory' },
    {
      id: 'P7-EXECUTION-CONTRACT-001',
      version: '1.0.0',
      requirement: 'Mandatory',
    },
    {
      id: 'P7-CONFORMANCE-001',
      version: '1.0.0',
      requirement: 'Mandatory',
    },
    {
      id: 'P7-ENTITLEMENT-001',
      version: '1.0.0',
      requirement: 'Mandatory',
    },
    {
      id: 'P7-ARTIFACT-EXECUTION-001',
      version: '1.0.0',
      requirement: 'Mandatory',
    },
    {
      id: 'P7-INDEPENDENT-001',
      version: '1.0.0',
      requirement: 'Mandatory',
    },
    { id: 'P7-EXTERNAL-001', version: '1.0.0', requirement: 'Mandatory' },
    { id: 'P7-HIGH-RISK-001', version: '1.0.0', requirement: 'Conditional' },
    { id: 'P7-MONITORING-001', version: '1.0.0', requirement: 'Optional' },
    { id: 'P7-CAPABILITY-001', version: '1.0.0', requirement: 'Optional' },
  ],
};

export const BASELINE_EVALUATION_POLICY_KEY = 'mesh_product_evaluation';

export function isPolicyDefinition(
  value: unknown,
): value is EvaluationPolicyDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<EvaluationPolicyDefinition>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.catalogVersion === 'string' &&
    candidate.finalStatusAlgorithm === 'mandatory-v1' &&
    Array.isArray(candidate.controls) &&
    candidate.controls.length > 0 &&
    candidate.controls.every(
      (control) =>
        !!control &&
        typeof control.id === 'string' &&
        typeof control.version === 'string' &&
        ['Mandatory', 'Conditional', 'Optional'].includes(control.requirement),
    )
  );
}
