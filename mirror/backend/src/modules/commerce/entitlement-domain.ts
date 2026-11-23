import type { CommercialProfile } from '../../database/entities/agents/product-model';
import type { EntitlementLifecycleState } from '../../database/entities/commerce/entitlement.entity';

/** Security scopes issued by MESH, not arbitrary creator-declared `rights`. */
export const ENTITLEMENT_CAPABILITIES = [
  'product_access',
  'download',
  'runtime',
  'api',
] as const;
export type EntitlementCapability = (typeof ENTITLEMENT_CAPABILITIES)[number];

export const ACCESS_DENIAL_REASONS = [
  'ALLOWED',
  'ALLOWED_GRACE',
  'ENTITLEMENT_NOT_FOUND',
  'ENTITLEMENT_PENDING_ACTIVATION',
  'ENTITLEMENT_REVOKED',
  'ENTITLEMENT_SUSPENDED',
  'ENTITLEMENT_EXPIRED',
  'USAGE_LIMIT_REACHED',
  'CAPABILITY_NOT_GRANTED',
] as const;
export type AccessDecisionReason = (typeof ACCESS_DENIAL_REASONS)[number];

export interface EntitlementTerms {
  capabilities: EntitlementCapability[];
  validUntil: Date | null;
  usageLimit: string | null;
}

const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The snapshot must never retain an ORM object/reference that can subsequently mutate. */
export function immutableTermsSnapshot(
  profile: CommercialProfile | null | undefined,
): CommercialProfile | null {
  return profile ? jsonClone(profile) : null;
}

/**
 * Maps only MESH-owned platform boundaries. Human-readable licence `rights`
 * stay disclosed contractual terms and never become privileged API scopes.
 */
export function capabilitiesFor(
  profile: CommercialProfile | null | undefined,
): EntitlementCapability[] {
  if (!profile) return ['product_access']; // legacy access, without invented runtime rights
  const capabilities: EntitlementCapability[] = ['product_access'];
  const delivery = profile.delivery?.model;
  if (delivery === 'downloadable' || delivery === 'hybrid')
    capabilities.push('download');
  if (
    delivery === 'hosted' ||
    delivery === 'external_hosted' ||
    delivery === 'hybrid' ||
    profile.family === 'service' ||
    profile.family === 'hybrid'
  ) {
    capabilities.push('runtime');
  }
  if (delivery === 'api_access' || delivery === 'hybrid')
    capabilities.push('api');
  return [...new Set(capabilities)];
}

/** License form controls duration/usage; payment cadence intentionally does not. */
export function termsForGrant(
  profile: CommercialProfile | null | undefined,
  grantedAt: Date,
): EntitlementTerms {
  const license = profile?.license;
  const hasTerm = license?.type === 'term_based' || license?.type === 'hybrid';
  const hasUsage =
    license?.type === 'usage_based' || license?.type === 'hybrid';
  const termDays = hasTerm ? (license?.termDays ?? null) : null;
  const validUntil =
    termDays && Number.isInteger(termDays) && termDays > 0
      ? new Date(grantedAt.getTime() + termDays * 24 * 60 * 60 * 1000)
      : null;
  const allowance = hasUsage ? (license?.usageAllowance ?? null) : null;
  return {
    capabilities: capabilitiesFor(profile),
    validUntil,
    usageLimit:
      allowance !== null && Number.isFinite(allowance) && allowance > 0
        ? String(allowance)
        : null,
  };
}

export function legacyState(
  status: 'granted' | 'revoked',
): EntitlementLifecycleState {
  return status === 'granted' ? 'active' : 'revoked';
}

export function legacyStatusFor(
  state: EntitlementLifecycleState,
): 'granted' | 'revoked' {
  return state === 'active' || state === 'grace' ? 'granted' : 'revoked';
}

export function isKnownCapability(
  value: string,
): value is EntitlementCapability {
  return (ENTITLEMENT_CAPABILITIES as readonly string[]).includes(value);
}
