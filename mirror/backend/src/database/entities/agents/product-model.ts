/**
 * AgentHub Product Model — the structured "Product Contract" dimensions
 * (docs/product/agenthub-product-model.md §5–§20, §39 decisions 1–5).
 *
 * IMPORTANT — these fields are a *declaration*, not a capability:
 *  - AgentHub delivers NOTHING (P13): there is no artifact delivery,
 *    hosting, or runtime. The delivery model describes what the CREATOR
 *    says the buyer receives outside the platform.
 *  - AgentHub is deliberately NOT an execution/hosting party
 *    (§39 decision 3): no 'agenthub' value exists in execution or
 *    hosting enums.
 *  - usageModel is DERIVED server-side from isFree/price — it is never
 *    accepted from the client (§39 decisions 9–10 remain OPEN; only
 *    free + one_time exist today).
 *
 * All fields are nullable for backward compatibility with existing
 * listings (legacy listings honestly show "نامشخص" / "Unknown" until
 * their creator ships a new version — §39 decision 21).
 */

/** §39 Decision 1 (core7): officially supported product types. */
export const PRODUCT_TYPES = [
  'automation',
  'ai_workflow',
  'ai_agent',
  'ai_assistant',
  'template',
  'api_service',
  'setup_service',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** §39 Decision 4 (catalog_other): declared build tool metadata. */
export const BUILD_TOOLS = [
  'n8n',
  'dify',
  'custom_code',
  'python',
  'nodejs',
  'other',
] as const;
export type BuildTool = (typeof BUILD_TOOLS)[number];

/**
 * §39 Decision 2 (all6, declaration-only): every delivery model may be
 * DECLARED. AgentHub itself delivers none of them — the buyer-facing UI
 * must always disclose that delivery happens outside AgentHub (P13).
 */
export const DELIVERY_MODELS = [
  'downloadable',
  'hosted',
  'external_hosted',
  'api_access',
  'setup',
  'hybrid',
] as const;
export type DeliveryModel = (typeof DELIVERY_MODELS)[number];

/**
 * §39 Decision 3 (no_ah): AgentHub never executes. The creator declares
 * where the product actually runs.
 */
export const EXECUTION_MODELS = [
  'creator',
  'buyer',
  'third_party',
  'hybrid',
] as const;
export type ExecutionModel = (typeof EXECUTION_MODELS)[number];

/** §39 Decision 3 (no_ah): AgentHub never hosts. */
export const HOSTING_RESPONSIBILITIES = [
  'creator',
  'buyer',
  'third_party',
  'shared',
] as const;
export type HostingResponsibility = (typeof HOSTING_RESPONSIBILITIES)[number];

/**
 * §39 Decisions 9–10 (free + one_time only): the only usage models that
 * exist today. Server-derived from isFree/price — never client input.
 */
export const USAGE_MODELS = ['free', 'one_time'] as const;
export type UsageModel = (typeof USAGE_MODELS)[number];

// ---- Phase 1 commercial profile -----------------------------------------
//
// `usageModel` above remains the historical, server-derived free/one-time
// display field. It is intentionally NOT widened for subscriptions or
// metering: payment, license and runtime commitments are independent facts.
// The nullable `commercialProfile` is the additive Phase 1 source for those
// facts. It is stored on the published listing, travels in version snapshots,
// and is copied (not linked) to a paid order item at purchase time.

export const COMMERCIAL_FAMILIES = ['standalone', 'service', 'hybrid'] as const;
export type CommercialFamily = (typeof COMMERCIAL_FAMILIES)[number];

export const PAYMENT_MODELS = [
  'free',
  'one_time',
  'subscription',
  'usage_based',
  'hybrid',
] as const;
export type PaymentModel = (typeof PAYMENT_MODELS)[number];

/** A cadence is structured so "subscription" can never be an opaque note. */
export const BILLING_INTERVALS = [
  'weekly',
  'monthly',
  'quarterly',
  'annual',
] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const LICENSE_TYPES = [
  'perpetual',
  'term_based',
  'usage_based',
  'hybrid',
] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

/** Who actually provides an externally-operated service. MESH is never one. */
export const SERVICE_PROVIDERS = [
  'creator',
  'third_party',
  'buyer',
  'shared',
] as const;
export type ServiceProvider = (typeof SERVICE_PROVIDERS)[number];

export const CONSUMPTION_COST_MODELS = [
  'included',
  'buyer_pays_provider',
  'metered',
  'included_with_overage',
] as const;
export type ConsumptionCostModel = (typeof CONSUMPTION_COST_MODELS)[number];

/**
 * Phase 1 commercial commitment. Fields intentionally allow incomplete draft
 * content; `commercialProfileIssues()` is the single publish/readiness gate.
 * No field implies runtime enforcement, recurring collection or metering.
 */
export interface CommercialProfile {
  schemaVersion: 1;
  family?: CommercialFamily | null;
  delivery?: {
    /** Compatibility-projected to the existing searchable delivery field. */
    model?: DeliveryModel | null;
    commitment?: string | null;
  } | null;
  payment?: {
    model?: PaymentModel | null;
    billingInterval?: BillingInterval | null;
  } | null;
  license?: {
    type?: LicenseType | null;
    /** Positive whole days for TERM_BASED / HYBRID licenses. */
    termDays?: number | null;
    /** Positive allowance for USAGE_BASED / HYBRID licenses. */
    usageAllowance?: number | null;
    usageUnit?: string | null;
    rights?: string[];
    restrictions?: string[];
  } | null;
  service?: {
    provider?: ServiceProvider | null;
    commitment?: string | null;
    accessTerms?: string | null;
  } | null;
  support?: {
    /** Compatibility-projected to existing support fields. */
    owner?: SupportOwner | null;
    scope?: string | null;
    period?: string | null;
    updates?: string | null;
  } | null;
  dependencies?: string[];
  consumption?: {
    costModel?: ConsumptionCostModel | null;
    terms?: string | null;
  } | null;
  lifecycle?: {
    refundTerms?: string | null;
    stopTerms?: string | null;
  } | null;
  /** Creator-issued commercial terms revision, not a platform legal version. */
  termsVersion?: string | null;
  /** URL, document identifier, or other buyer-visible terms reference. */
  termsReference?: string | null;
}

export interface CommercialProfileIssue {
  field: string;
  message: string;
}

const commercialText = (value: string | null | undefined): string =>
  (value ?? '').trim();
const commercialList = (value: string[] | null | undefined): string[] =>
  (value ?? []).map((item) => item.trim()).filter(Boolean);
const isOneOf = <T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

/**
 * Normalizes only presentation noise. DTO validation remains the boundary for
 * untrusted shapes; this also keeps snapshots canonical and immutable-by-copy.
 */
export function normalizeCommercialProfile(
  profile: CommercialProfile,
): CommercialProfile {
  return {
    schemaVersion: 1,
    family: profile.family ?? null,
    delivery: profile.delivery
      ? {
          model: profile.delivery.model ?? null,
          commitment: commercialText(profile.delivery.commitment) || null,
        }
      : null,
    payment: profile.payment
      ? {
          model: profile.payment.model ?? null,
          billingInterval: profile.payment.billingInterval ?? null,
        }
      : null,
    license: profile.license
      ? {
          type: profile.license.type ?? null,
          termDays: profile.license.termDays ?? null,
          usageAllowance: profile.license.usageAllowance ?? null,
          usageUnit: commercialText(profile.license.usageUnit) || null,
          rights: commercialList(profile.license.rights),
          restrictions: commercialList(profile.license.restrictions),
        }
      : null,
    service: profile.service
      ? {
          provider: profile.service.provider ?? null,
          commitment: commercialText(profile.service.commitment) || null,
          accessTerms: commercialText(profile.service.accessTerms) || null,
        }
      : null,
    support: profile.support
      ? {
          owner: profile.support.owner ?? null,
          scope: commercialText(profile.support.scope) || null,
          period: commercialText(profile.support.period) || null,
          updates: commercialText(profile.support.updates) || null,
        }
      : null,
    dependencies: commercialList(profile.dependencies),
    consumption: profile.consumption
      ? {
          costModel: profile.consumption.costModel ?? null,
          terms: commercialText(profile.consumption.terms) || null,
        }
      : null,
    lifecycle: profile.lifecycle
      ? {
          refundTerms: commercialText(profile.lifecycle.refundTerms) || null,
          stopTerms: commercialText(profile.lifecycle.stopTerms) || null,
        }
      : null,
    termsVersion: commercialText(profile.termsVersion) || null,
    termsReference: commercialText(profile.termsReference) || null,
  };
}

/**
 * Cross-field gate shared by readiness and checkout eligibility. The return
 * value names exact fields so UI/review clients can explain a blocked draft
 * without claiming that an external runtime was technically verified.
 */
export function commercialProfileIssues(
  profile: CommercialProfile | null | undefined,
  pricing?: { isFree: boolean; price: string | number | null | undefined },
): CommercialProfileIssue[] {
  if (!profile)
    return [
      { field: 'commercialProfile', message: 'Commercial profile is required' },
    ];
  const issues: CommercialProfileIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ field, message });
  if (profile.schemaVersion !== 1)
    add('schemaVersion', 'Unsupported commercial profile version');
  if (!isOneOf(COMMERCIAL_FAMILIES, profile.family))
    add('family', 'Choose a product family');
  if (!isOneOf(DELIVERY_MODELS, profile.delivery?.model))
    add('delivery.model', 'Choose a delivery model');
  if (!commercialText(profile.delivery?.commitment))
    add('delivery.commitment', 'Describe the delivery commitment');
  if (!isOneOf(PAYMENT_MODELS, profile.payment?.model))
    add('payment.model', 'Choose a payment model');
  if (!isOneOf(LICENSE_TYPES, profile.license?.type))
    add('license.type', 'Choose a license type');
  if (commercialList(profile.license?.rights).length === 0)
    add('license.rights', 'Declare at least one license right');
  if (!isOneOf(CONSUMPTION_COST_MODELS, profile.consumption?.costModel))
    add('consumption.costModel', 'Choose a consumption cost model');
  if (!commercialText(profile.termsVersion))
    add('termsVersion', 'Declare a commercial terms version');
  if (!commercialText(profile.termsReference))
    add('termsReference', 'Declare a commercial terms reference');

  const licenseType = profile.license?.type;
  const needsTerm = licenseType === 'term_based' || licenseType === 'hybrid';
  const needsUsage = licenseType === 'usage_based' || licenseType === 'hybrid';
  const termDays = profile.license?.termDays ?? 0;
  const usageAllowance = profile.license?.usageAllowance ?? 0;
  if (needsTerm && !(Number.isInteger(termDays) && termDays > 0)) {
    add('license.termDays', 'A positive whole-day term is required');
  }
  if (needsUsage && !(Number.isFinite(usageAllowance) && usageAllowance > 0)) {
    add('license.usageAllowance', 'A positive usage allowance is required');
  }
  if (needsUsage && !commercialText(profile.license?.usageUnit))
    add('license.usageUnit', 'A usage unit is required');

  const paymentModel = profile.payment?.model;
  if (
    (paymentModel === 'subscription' || paymentModel === 'hybrid') &&
    !isOneOf(BILLING_INTERVALS, profile.payment?.billingInterval)
  ) {
    add('payment.billingInterval', 'A structured billing interval is required');
  }
  if (profile.family === 'service' || profile.family === 'hybrid') {
    if (!isOneOf(SERVICE_PROVIDERS, profile.service?.provider))
      add('service.provider', 'Choose the service provider');
    if (!commercialText(profile.service?.commitment))
      add('service.commitment', 'Describe the service commitment');
    if (!commercialText(profile.service?.accessTerms))
      add('service.accessTerms', 'Describe the access terms');
  }
  if (!commercialText(profile.support?.updates))
    add('support.updates', 'Describe the update commitment');
  if (!commercialText(profile.lifecycle?.refundTerms))
    add('lifecycle.refundTerms', 'Describe refund terms');
  if (!commercialText(profile.lifecycle?.stopTerms))
    add('lifecycle.stopTerms', 'Describe stop or end-of-service terms');
  if (
    profile.consumption?.costModel !== 'included' &&
    !commercialText(profile.consumption?.terms)
  ) {
    add('consumption.terms', 'Describe consumption costs');
  }

  if (pricing && isOneOf(PAYMENT_MODELS, paymentModel)) {
    const listedPrice = Number(pricing.price ?? 0);
    const paid = !pricing.isFree && listedPrice > 0;
    if (paymentModel === 'free' && (!pricing.isFree || listedPrice > 0)) {
      add(
        'payment.model',
        'A free payment model requires a zero-price free listing',
      );
    }
    if (paymentModel !== 'free' && !paid)
      add(
        'payment.model',
        'A paid payment model requires a positive listing price',
      );
  }
  return issues;
}

/** Existing checkout can safely create only a one-time order in Phase 1. */
export function supportsCurrentCheckout(
  profile: CommercialProfile | null | undefined,
): boolean {
  return profile?.payment?.model === 'one_time';
}

/** Minimal compatibility projection; the structured profile owns these facts. */
export function commercialProfileProjection(
  profile: CommercialProfile | null | undefined,
): {
  deliveryModel: DeliveryModel | null;
  supportOwner: SupportOwner | null;
  supportScope: string | null;
  supportPeriod: string | null;
} | null {
  if (!profile) return null;
  return {
    deliveryModel: profile.delivery?.model ?? null,
    supportOwner: profile.support?.owner ?? null,
    supportScope: commercialText(profile.support?.scope) || null,
    supportPeriod: commercialText(profile.support?.period) || null,
  };
}

/** §18/§39 Decision 12: declared support owner. */
export const SUPPORT_OWNERS = ['creator', 'agenthub'] as const;
export type SupportOwner = (typeof SUPPORT_OWNERS)[number];

/** §15: structured additional-cost disclosure (TCO transparency). */
export interface AdditionalCost {
  label: string;
  note?: string | null;
}

/**
 * Server-side derivation of the usage model from pricing facts
 * (§39 decisions 9–10: no subscriptions/usage pricing exist).
 */
export function deriveUsageModel(isFree: boolean): UsageModel {
  return isFree ? 'free' : 'one_time';
}

/**
 * The Product-Contract dimensions that count as MATERIAL changes when
 * comparing a pending version's working copy against the published
 * content (§19/§33): everything that changes what the buyer receives,
 * where the product runs, what data is involved, or what it costs.
 * Key names are stable identifiers used for admin UI chips and i18n
 * (admin.materialChange.<key>).
 */
export const CONTRACT_MATERIAL_FIELDS = [
  'productType',
  'buildTool',
  'deliveryModel',
  'executionModel',
  'hostingResponsibility',
  'whatBuyerReceives',
  'whatBuyerDoesNotReceive',
  'additionalCosts',
  'usageModel',
  'supportOwner',
  'supportScope',
  'supportPeriod',
  'commercialProfile',
  'price',
  'isFree',
  'permissions',
  'integrations',
  'dataPolicy',
] as const;
export type ContractMaterialField = (typeof CONTRACT_MATERIAL_FIELDS)[number];

interface ContractComparable {
  productType?: string | null;
  buildTool?: string | null;
  buildToolDetail?: string | null;
  deliveryModel?: string | null;
  executionModel?: string | null;
  hostingResponsibility?: string | null;
  whatBuyerReceives?: string[] | null;
  whatBuyerDoesNotReceive?: string[] | null;
  additionalCosts?: AdditionalCost[] | null;
  usageModel?: string | null;
  supportOwner?: string | null;
  supportScope?: string | null;
  supportPeriod?: string | null;
  commercialProfile?: CommercialProfile | null;
  price?: string | null;
  isFree?: boolean | null;
  permissions?: unknown;
  integrations?: unknown;
  dataPolicy?: unknown;
}

/** Normalizes a value into a stable, JSON-comparable form. */
function normalized(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    // "No declaration" is noise-free: [] ≡ null (a legacy null column
    // and an untouched empty draft list are NOT a material change).
    if (value.length === 0) return null;
    return value.map((item): unknown =>
      item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item as Record<string, unknown>)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, normalized(v)]),
          )
        : item,
    );
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        normalized(v),
      ]),
    );
  }
  return value;
}

/**
 * Builds the comparable contract snapshot of a content object
 * (draft content or version snapshot).
 */
export function contentContractSnapshot(content: ContractComparable) {
  return Object.fromEntries(
    CONTRACT_MATERIAL_FIELDS.map((key) => [
      key,
      normalized((content as Record<string, unknown>)[key]),
    ]),
  );
}

/**
 * Builds the comparable contract snapshot from a raw snake_case agent
 * row (the live/published values) — used for material-change detection
 * without hydrating relations. Relation-backed dimensions
 * (permissions/integrations/dataPolicy) are passed in separately when
 * available, otherwise they are skipped in the comparison.
 */
export function rowContractSnapshot(
  row: {
    product_type?: string | null;
    build_tool?: string | null;
    delivery_model?: string | null;
    execution_model?: string | null;
    hosting_responsibility?: string | null;
    what_buyer_receives?: string[] | null;
    what_buyer_does_not_receive?: string[] | null;
    additional_costs?: AdditionalCost[] | null;
    usage_model?: string | null;
    support_owner?: string | null;
    support_scope?: string | null;
    support_period?: string | null;
    commercial_profile?: CommercialProfile | null;
    price?: string | null;
    is_free?: boolean | null;
  },
  relations?: {
    permissions?: unknown;
    integrations?: unknown;
    dataPolicy?: unknown;
  },
) {
  const source: ContractComparable = {
    productType: row.product_type,
    buildTool: row.build_tool,
    deliveryModel: row.delivery_model,
    executionModel: row.execution_model,
    hostingResponsibility: row.hosting_responsibility,
    whatBuyerReceives: row.what_buyer_receives,
    whatBuyerDoesNotReceive: row.what_buyer_does_not_receive,
    additionalCosts: row.additional_costs,
    usageModel: row.usage_model,
    supportOwner: row.support_owner,
    supportScope: row.support_scope,
    supportPeriod: row.support_period,
    commercialProfile: row.commercial_profile,
    price:
      row.price !== null && row.price !== undefined ? String(row.price) : null,
    isFree: row.is_free,
    permissions: relations?.permissions,
    integrations: relations?.integrations,
    dataPolicy: relations?.dataPolicy,
  };
  return contentContractSnapshot(source);
}

/**
 * Material-change detection (§19/§33): the list of contract dimensions
 * where a pending working copy differs from the published content.
 * Empty array ⇒ content-only / non-material edit.
 */
export function materialChangeKeys(
  published: Record<string, unknown> | null,
  pending: Record<string, unknown> | null,
): ContractMaterialField[] {
  if (!published || !pending) return [];
  return CONTRACT_MATERIAL_FIELDS.filter(
    (key) =>
      JSON.stringify(published[key] ?? null) !==
      JSON.stringify(pending[key] ?? null),
  );
}
