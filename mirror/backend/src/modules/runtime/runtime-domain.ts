import { createHash, timingSafeEqual } from 'crypto';
import {
  RUNTIME_CONTROL_CAPABILITIES,
  RUNTIME_EXECUTION_MODELS,
  RUNTIME_STATES,
  type RuntimeControlCapability,
  type RuntimeExecutionModel,
  type RuntimeState,
} from '../../database/entities/runtime/runtime-registration.entity';
import type {
  RuntimeReleaseManifest,
  RuntimeReleaseManifestV2,
} from '../../database/entities/runtime/runtime-release.entity';

export const MESH_CONNECTOR_PROTOCOL_VERSION = '1.0';
export const RUNTIME_CONFORMANCE_SUITE_VERSION = '1.0.0';

/** Creator Technical Integration Standard version supported by this build. */
export const CREATOR_TECHNICAL_STANDARD_VERSION: string = '1.0';
export const RUNTIME_GATEWAY_MAX_INPUT_BYTES = 64_000;
export const RUNTIME_GATEWAY_MAX_OUTPUT_BYTES = 64_000;

/** The four profiles are a presentation/contract mapping over the canonical
 * Runtime execution model. They never create a second Runtime registry. */
export const CREATOR_INTEGRATION_PROFILES = {
  mesh_managed: 'managed_runtime',
  mesh_connected: 'connected_runtime',
  independent_deliverable: 'independent_deliverable',
  external_unconnected: 'external_unconnected_service',
} as const;
export type CreatorIntegrationProfile =
  (typeof CREATOR_INTEGRATION_PROFILES)[RuntimeExecutionModel];

export function creatorIntegrationProfileFor(
  executionModel: RuntimeExecutionModel,
): CreatorIntegrationProfile {
  return CREATOR_INTEGRATION_PROFILES[executionModel];
}

/** This fixed artifact is the only workload accepted by the initial local provider. */
export const MANAGED_REFERENCE_WORKLOAD_SOURCE =
  'mesh-managed-reference-echo-v1\nstdin=json\nstdout=ack\nno-user-code\n';
export const MANAGED_REFERENCE_ARTIFACT_DIGEST = createHash('sha256')
  .update(MANAGED_REFERENCE_WORKLOAD_SOURCE, 'utf8')
  .digest('hex');

export const RUNTIME_TRANSITIONS: Readonly<
  Record<RuntimeState, readonly RuntimeState[]>
> = {
  registered: ['configured', 'suspended', 'revoked', 'retired'],
  configured: ['verifying', 'suspended', 'revoked', 'retired'],
  verifying: ['verified', 'degraded', 'suspended', 'revoked', 'retired'],
  verified: ['active', 'configured', 'suspended', 'revoked', 'retired'],
  active: ['degraded', 'suspended', 'revoked', 'retired'],
  degraded: ['configured', 'verifying', 'suspended', 'revoked', 'retired'],
  suspended: ['configured', 'verified', 'revoked', 'retired'],
  revoked: ['retired'],
  retired: [],
};

export const RUNTIME_CREDENTIAL_HEADER_PREFIX = 'Runtime ';

/** Stable, non-secret fingerprint; omitted fields cannot silently change evidence applicability. */
export function runtimeConfigurationFingerprint(input: {
  executionModel: RuntimeExecutionModel;
  hostingProvider: string;
  environment: string;
  endpointUrl: string | null;
  protocolVersion: string;
  connectorVersion: string | null;
  declaredCapabilities: string[];
}): string {
  const canonical = JSON.stringify({
    executionModel: input.executionModel,
    hostingProvider: input.hostingProvider.trim().toLowerCase(),
    environment: input.environment.trim().toLowerCase(),
    endpointUrl: input.endpointUrl?.trim() ?? null,
    protocolVersion: input.protocolVersion,
    connectorVersion: input.connectorVersion?.trim() ?? null,
    declaredCapabilities: [...input.declaredCapabilities].sort(),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function isRuntimeExecutionModel(
  value: unknown,
): value is RuntimeExecutionModel {
  return (
    typeof value === 'string' &&
    (RUNTIME_EXECUTION_MODELS as readonly string[]).includes(value)
  );
}

export function isRuntimeState(value: unknown): value is RuntimeState {
  return (
    typeof value === 'string' &&
    (RUNTIME_STATES as readonly string[]).includes(value)
  );
}

export function assertRuntimeTransition(
  from: RuntimeState,
  to: RuntimeState,
): boolean {
  return RUNTIME_TRANSITIONS[from].includes(to);
}

export function isServingModel(model: RuntimeExecutionModel): boolean {
  return model === 'mesh_managed' || model === 'mesh_connected';
}

export function verifiedCapabilitiesFor(input: {
  model: RuntimeExecutionModel;
  integrity: boolean;
  recovery: boolean;
  managedIsolation: boolean;
}): RuntimeControlCapability[] {
  if (!isServingModel(input.model)) return [];
  const capabilities: RuntimeControlCapability[] = [
    'runtime_identity',
    'gateway_enforced_execution',
  ];
  if (input.integrity) capabilities.push('release_integrity');
  if (input.model === 'mesh_managed' && input.managedIsolation) {
    capabilities.push('managed_network_isolation', 'managed_process_limits');
  }
  if (input.recovery) capabilities.push('recovery_tested');
  return capabilities.filter((item) =>
    (RUNTIME_CONTROL_CAPABILITIES as readonly string[]).includes(item),
  );
}

/** Reject secrets from a persisted release manifest, including nested configuration. */
export function hasSecretLikeManifestField(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || value === undefined) return false;
  if (Array.isArray(value))
    return value.some((item) => hasSecretLikeManifestField(item, depth + 1));
  if (typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      /(secret|token|password|credential|private.?key|authorization|cookie|api.?key)/i.test(
        key,
      ) || hasSecretLikeManifestField(child, depth + 1),
  );
}

function hasStringArray(value: unknown, maximum: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((item) => typeof item === 'string' && item.length <= 500)
  );
}

function hasStringRecord(value: unknown, maximum: number): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value as Record<string, unknown>).length <= maximum &&
    Object.entries(value as Record<string, unknown>).every(
      ([key, item]) =>
        /^[A-Za-z0-9_.@/-]{1,120}$/.test(key) &&
        typeof item === 'string' &&
        item.length <= 120,
    )
  );
}

function hasOnlyKeys(value: unknown, allowed: readonly string[]): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).every((key) =>
      allowed.includes(key),
    )
  );
}

function isV2Manifest(
  manifest: RuntimeReleaseManifest,
): manifest is RuntimeReleaseManifestV2 {
  return manifest?.schemaVersion === 2;
}

/**
 * Validate a persisted Runtime release manifest without inspecting its content
 * as an executable artifact. V1 remains accepted. V2 codifies the supportable
 * Creator Technical Integration Standard surface; it does not attest a
 * creator-hosted artifact or grant a Runtime state transition by itself.
 */
export function validateReleaseManifest(
  manifest: RuntimeReleaseManifest,
): string[] {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest must be an object'];
  }
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) {
    errors.push('schemaVersion must be 1 or 2');
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(manifest?.artifactDigest ?? '')) {
    errors.push('artifactDigest must be sha256:<64 lowercase hex characters>');
  }
  if (
    typeof manifest?.releaseVersion !== 'string' ||
    !manifest.releaseVersion.trim() ||
    manifest.releaseVersion.length > 80
  ) {
    errors.push('releaseVersion is required');
  }
  if (
    !['mesh_reference_echo_v1', 'connected_reference'].includes(
      manifest?.artifactKind,
    )
  ) {
    errors.push('artifactKind is unsupported');
  }
  if (
    !hasStringArray(manifest?.protocolVersions, 8) ||
    !manifest.protocolVersions.includes(MESH_CONNECTOR_PROTOCOL_VERSION)
  ) {
    errors.push(
      `protocolVersions must include ${MESH_CONNECTOR_PROTOCOL_VERSION}`,
    );
  }
  if (
    !manifest?.healthCheck ||
    !/^\/[a-zA-Z0-9/_-]{0,180}$/.test(manifest.healthCheck.path) ||
    !Number.isInteger(manifest.healthCheck.timeoutMs) ||
    manifest.healthCheck.timeoutMs < 100 ||
    manifest.healthCheck.timeoutMs > 10_000
  ) {
    errors.push('healthCheck is invalid');
  }
  if (
    !manifest?.continuity ||
    typeof manifest.continuity.eligible !== 'boolean' ||
    !hasStringArray(manifest.continuity.prerequisites, 30) ||
    !hasStringArray(manifest.continuity.limitations, 30)
  ) {
    errors.push('continuity is invalid');
  }
  if (isV2Manifest(manifest)) {
    if (
      !hasOnlyKeys(manifest, [
        'schemaVersion',
        'standardVersion',
        'integrationProfile',
        'releaseVersion',
        'artifactDigest',
        'artifactKind',
        'protocolVersions',
        'dependencyVersions',
        'configurationRequirements',
        'healthCheck',
        'externalDependencies',
        'continuity',
        'executionContract',
      ]) ||
      !hasOnlyKeys(manifest.healthCheck, ['path', 'timeoutMs']) ||
      !hasOnlyKeys(manifest.continuity, [
        'eligible',
        'prerequisites',
        'limitations',
      ]) ||
      !hasOnlyKeys(manifest.executionContract, [
        'version',
        'inputType',
        'outputType',
        'maxInputBytes',
        'maxOutputBytes',
        'downstreamTimeoutMs',
        'retryPolicy',
        'idempotency',
      ])
    ) {
      errors.push('v2 manifest contains unsupported fields');
    }
    if (
      Array.isArray(manifest.protocolVersions) &&
      new Set(manifest.protocolVersions).size !==
        manifest.protocolVersions.length
    ) {
      errors.push('protocolVersions must not contain duplicates');
    }
    if (manifest.standardVersion !== CREATOR_TECHNICAL_STANDARD_VERSION) {
      errors.push(
        `standardVersion must be ${CREATOR_TECHNICAL_STANDARD_VERSION}`,
      );
    }
    if (
      manifest.integrationProfile !== 'managed_runtime' &&
      manifest.integrationProfile !== 'connected_runtime'
    ) {
      errors.push('integrationProfile is unsupported for a Runtime release');
    }
    const contract = manifest.executionContract;
    if (
      !contract ||
      contract.version !== CREATOR_TECHNICAL_STANDARD_VERSION ||
      contract.inputType !== 'object' ||
      contract.outputType !== 'object' ||
      contract.maxInputBytes !== RUNTIME_GATEWAY_MAX_INPUT_BYTES ||
      contract.maxOutputBytes !== RUNTIME_GATEWAY_MAX_OUTPUT_BYTES ||
      (contract.downstreamTimeoutMs !== 1_500 &&
        contract.downstreamTimeoutMs !== 5_000) ||
      contract.retryPolicy !== 'no_automatic_retry' ||
      contract.idempotency !== 'not_supported'
    ) {
      errors.push(
        'executionContract does not match Creator Technical Standard 1.0',
      );
    } else if (
      (manifest.integrationProfile === 'managed_runtime' &&
        (manifest.artifactKind !== 'mesh_reference_echo_v1' ||
          contract.downstreamTimeoutMs !== 1_500)) ||
      (manifest.integrationProfile === 'connected_runtime' &&
        (manifest.artifactKind !== 'connected_reference' ||
          contract.downstreamTimeoutMs !== 5_000))
    ) {
      errors.push('executionContract does not match integrationProfile');
    }
    if (
      !hasStringRecord(manifest.dependencyVersions, 50) ||
      !hasStringArray(manifest.configurationRequirements, 50) ||
      !hasStringArray(manifest.externalDependencies, 50)
    ) {
      errors.push('v2 manifest metadata is invalid');
    }
  }
  if (hasSecretLikeManifestField(manifest))
    errors.push('release manifests must not contain secrets');
  return errors;
}

/** V2 profile must bind to the registered Runtime model, not a creator claim. */
export function validateManifestRuntimeCompatibility(
  executionModel: RuntimeExecutionModel,
  manifest: RuntimeReleaseManifest,
): string[] {
  if (!isV2Manifest(manifest)) return [];
  const expectedProfile = creatorIntegrationProfileFor(executionModel);
  if (
    expectedProfile !== 'managed_runtime' &&
    expectedProfile !== 'connected_runtime'
  ) {
    return ['this execution model does not accept a Runtime release'];
  }
  const errors: string[] = [];
  if (manifest.integrationProfile !== expectedProfile) {
    errors.push(
      'integrationProfile does not match the registered Runtime model',
    );
  }
  const expectedTimeout = executionModel === 'mesh_managed' ? 1_500 : 5_000;
  if (manifest.executionContract.downstreamTimeoutMs !== expectedTimeout) {
    errors.push(
      'executionContract timeout does not match the registered Runtime model',
    );
  }
  return errors;
}

export function manifestDigestValue(digest: string): string {
  return digest.startsWith('sha256:') ? digest.slice('sha256:'.length) : digest;
}

/** Constant-time comparison of a supplied opaque credential component. */
export function opaqueSecretMatches(
  expected: Buffer,
  supplied: string,
): boolean {
  const candidate = Buffer.from(supplied, 'utf8');
  return (
    candidate.length === expected.length && timingSafeEqual(expected, candidate)
  );
}
