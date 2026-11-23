import type { SqlRunner } from '../discovery/interest-scoring';
import {
  buildSetupBlueprint,
  type BlueprintIntegration,
  type BlueprintRequirement,
} from './setup-blueprint';

/**
 * Sprint 2 §37–§38 — the product contract AS THE CREATOR DECLARED IT, read
 * for the buyer. Source of truth is the version the buyer bought (its
 * immutable snapshot); products that predate snapshots fall back to the
 * live product rows. The buyer never sees a different meaning than the
 * creator wrote: these are the same fields the public product page shows.
 */
export interface BuyerContract {
  source: 'snapshot' | 'live';
  versionId: string | null;
  versionNumber: string | null;
  productType: string | null;
  deliveryModel: string | null;
  executionModel: string | null;
  hostingResponsibility: string | null;
  buildTool: string | null;
  whatBuyerReceives: string[];
  whatBuyerDoesNotReceive: string[];
  additionalCosts: Array<{ label: string; note?: string | null }>;
  supportOwner: string | null;
  supportScope: string | null;
  supportPeriod: string | null;
  infrastructureNeeds: string | null;
  usageGuide: string | null;
  howItWorks: Array<{ title: string; description?: string }>;
  limitations: string[];
  requirements: BlueprintRequirement[];
  integrations: BlueprintIntegration[];
  noRequirements: boolean;
  dataPolicy: {
    storesUserData: boolean;
    sharesWithThirdParties: boolean;
    handlesSensitiveData: boolean;
    retentionDays: number | null;
    thirdParties: string[];
  } | null;
}

interface SnapshotLike {
  productType?: string | null;
  deliveryModel?: string | null;
  executionModel?: string | null;
  hostingResponsibility?: string | null;
  buildTool?: string | null;
  whatBuyerReceives?: string[] | null;
  whatBuyerDoesNotReceive?: string[] | null;
  additionalCosts?: Array<{ label: string; note?: string | null }> | null;
  supportOwner?: string | null;
  supportScope?: string | null;
  supportPeriod?: string | null;
  infrastructureNeeds?: string | null;
  usageGuide?: string | null;
  howItWorks?: Array<{ title: string; description?: string }> | null;
  limitations?: string[] | null;
  requirements?: BlueprintRequirement[] | null;
  integrations?: Array<{ slug: string; purpose: string | null }> | null;
  noRequirements?: boolean | null;
  dataPolicy?: {
    storesUserData?: boolean;
    sharesWithThirdParties?: boolean;
    handlesSensitiveData?: boolean;
    retentionDays?: number | null;
    thirdParties?: string[];
  } | null;
}

const arr = <T>(value: T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : [];

async function integrationNames(
  runner: SqlRunner,
  slugs: string[],
): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const rows = await runner.query<Array<{ slug: string; name: string }>>(
    `SELECT slug, name FROM integrations WHERE slug = ANY($1::text[])`,
    [slugs],
  );
  return new Map(rows.map((row) => [row.slug, row.name]));
}

export async function loadContract(
  runner: SqlRunner,
  agentId: string,
  versionId: string | null,
): Promise<BuyerContract> {
  let version: {
    id: string;
    version_number: string;
    snapshot: SnapshotLike | null;
  } | null = null;
  if (versionId) {
    const rows = await runner.query<
      Array<{
        id: string;
        version_number: string;
        snapshot: SnapshotLike | null;
      }>
    >(
      `SELECT id, version_number, snapshot FROM agent_versions
        WHERE id = $1 AND agent_id = $2`,
      [versionId, agentId],
    );
    version = rows[0] ?? null;
  }

  if (version?.snapshot) {
    const s = version.snapshot;
    const names = await integrationNames(
      runner,
      arr(s.integrations).map((i) => i.slug),
    );
    const policy = s.dataPolicy;
    return {
      source: 'snapshot',
      versionId: version.id,
      versionNumber: version.version_number,
      productType: s.productType ?? null,
      deliveryModel: s.deliveryModel ?? null,
      executionModel: s.executionModel ?? null,
      hostingResponsibility: s.hostingResponsibility ?? null,
      buildTool: s.buildTool ?? null,
      whatBuyerReceives: arr(s.whatBuyerReceives),
      whatBuyerDoesNotReceive: arr(s.whatBuyerDoesNotReceive),
      additionalCosts: arr(s.additionalCosts),
      supportOwner: s.supportOwner ?? null,
      supportScope: s.supportScope ?? null,
      supportPeriod: s.supportPeriod ?? null,
      infrastructureNeeds: s.infrastructureNeeds ?? null,
      usageGuide: s.usageGuide ?? null,
      howItWorks: arr(s.howItWorks),
      limitations: arr(s.limitations),
      requirements: arr(s.requirements),
      integrations: arr(s.integrations).map((i) => ({
        slug: i.slug,
        purpose: i.purpose,
        name: names.get(i.slug) ?? i.slug,
      })),
      noRequirements: Boolean(s.noRequirements),
      dataPolicy: policy
        ? {
            storesUserData: Boolean(policy.storesUserData),
            sharesWithThirdParties: Boolean(policy.sharesWithThirdParties),
            handlesSensitiveData: Boolean(policy.handlesSensitiveData),
            retentionDays: policy.retentionDays ?? null,
            thirdParties: arr(policy.thirdParties),
          }
        : null,
    };
  }

  // Legacy products (no snapshot): the live rows ARE the contract.
  const agentRows = await runner.query<Array<Record<string, unknown>>>(
    `SELECT product_type, delivery_model, execution_model, hosting_responsibility,
            build_tool, what_buyer_receives, what_buyer_does_not_receive,
            additional_costs, support_owner, support_scope, support_period,
            infrastructure_needs, usage_guide, how_it_works, limitations,
            no_requirements
       FROM agents WHERE id = $1`,
    [agentId],
  );
  const a = agentRows[0] ?? {};
  const requirements = await runner.query<
    Array<{
      type: string;
      description: string;
      required: boolean;
      name: string | null;
      reason: string | null;
    }>
  >(
    `SELECT type, description, required, name, reason
       FROM agent_requirements WHERE agent_id = $1 ORDER BY created_at, id`,
    [agentId],
  );
  const integrations = await runner.query<
    Array<{ slug: string; name: string; purpose: string | null }>
  >(
    `SELECT i.slug, i.name, ai.purpose
       FROM agent_integrations ai JOIN integrations i ON i.id = ai.integration_id
      WHERE ai.agent_id = $1 ORDER BY i.name`,
    [agentId],
  );
  const policyRows = await runner.query<
    Array<{
      stores_user_data: boolean;
      shares_with_third_parties: boolean;
      handles_sensitive_data: boolean;
      retention_days: number | null;
      third_parties: string[] | null;
    }>
  >(
    `SELECT stores_user_data, shares_with_third_parties, handles_sensitive_data,
            retention_days, third_parties
       FROM agent_data_policies WHERE agent_id = $1 LIMIT 1`,
    [agentId],
  );
  const p = policyRows[0];
  return {
    source: 'live',
    versionId: version?.id ?? null,
    versionNumber: version?.version_number ?? null,
    productType: (a.product_type as string | null) ?? null,
    deliveryModel: (a.delivery_model as string | null) ?? null,
    executionModel: (a.execution_model as string | null) ?? null,
    hostingResponsibility: (a.hosting_responsibility as string | null) ?? null,
    buildTool: (a.build_tool as string | null) ?? null,
    whatBuyerReceives: arr(a.what_buyer_receives as string[] | null),
    whatBuyerDoesNotReceive: arr(
      a.what_buyer_does_not_receive as string[] | null,
    ),
    additionalCosts: arr(
      a.additional_costs as Array<{
        label: string;
        note?: string | null;
      }> | null,
    ),
    supportOwner: (a.support_owner as string | null) ?? null,
    supportScope: (a.support_scope as string | null) ?? null,
    supportPeriod: (a.support_period as string | null) ?? null,
    infrastructureNeeds: (a.infrastructure_needs as string | null) ?? null,
    usageGuide: (a.usage_guide as string | null) ?? null,
    howItWorks: arr(
      a.how_it_works as Array<{ title: string; description?: string }> | null,
    ),
    limitations: arr(a.limitations as string[] | null),
    requirements,
    integrations,
    noRequirements: Boolean(a.no_requirements),
    dataPolicy: p
      ? {
          storesUserData: p.stores_user_data,
          sharesWithThirdParties: p.shares_with_third_parties,
          handlesSensitiveData: p.handles_sensitive_data,
          retentionDays: p.retention_days,
          thirdParties: arr(p.third_parties),
        }
      : null,
  };
}

/**
 * Idempotently creates the journey row (+ its setup checklist) of ONE
 * entitlement. Safe to call from anywhere and any number of times — a
 * refresh, a retry or a duplicate webhook can never create a second row or
 * a second step. Returns false when the entitlement does not exist.
 */
export async function ensureJourney(
  runner: SqlRunner,
  entitlementId: string,
): Promise<boolean> {
  const inserted = await runner.query<Array<{ entitlement_id: string }>>(
    `INSERT INTO buyer_product_journeys
       (entitlement_id, user_id, agent_id, order_id, purchased_at,
        acknowledged_version_id, last_activity_at)
     SELECT e.id, e.user_id, e.agent_id, e.order_id,
            COALESCE(e.granted_at, e.created_at),
            COALESCE(e.agent_version_id, a.published_version_id),
            COALESCE(e.granted_at, e.created_at)
       FROM entitlements e JOIN agents a ON a.id = e.agent_id
      WHERE e.id = $1
     ON CONFLICT (entitlement_id) DO NOTHING
     RETURNING entitlement_id`,
    [entitlementId],
  );
  const exists =
    inserted.length > 0 ||
    (
      await runner.query<Array<{ one: number }>>(
        `SELECT 1 AS one FROM buyer_product_journeys WHERE entitlement_id = $1`,
        [entitlementId],
      )
    ).length > 0;
  if (!exists) return false;
  await ensureSteps(runner, entitlementId);
  return true;
}

/** Seeds the checklist once (a journey with no steps was never seeded). */
export async function ensureSteps(
  runner: SqlRunner,
  entitlementId: string,
): Promise<void> {
  const have = await runner.query<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM buyer_setup_steps WHERE entitlement_id = $1`,
    [entitlementId],
  );
  if (Number(have[0]?.n ?? 0) > 0) return;
  const rows = await runner.query<
    Array<{
      agent_id: string;
      agent_version_id: string | null;
      published: string | null;
    }>
  >(
    `SELECT e.agent_id, e.agent_version_id, a.published_version_id AS published
       FROM entitlements e JOIN agents a ON a.id = e.agent_id
      WHERE e.id = $1`,
    [entitlementId],
  );
  const row = rows[0];
  if (!row) return;
  const contract = await loadContract(
    runner,
    row.agent_id,
    row.agent_version_id ?? row.published,
  );
  const steps = buildSetupBlueprint(contract);
  for (const step of steps) {
    await runner.query(
      `INSERT INTO buyer_setup_steps
         (entitlement_id, step_key, position, kind, title, description, required)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (entitlement_id, step_key) DO NOTHING`,
      [
        entitlementId,
        step.key,
        step.position,
        step.kind,
        step.title,
        step.description,
        step.required,
      ],
    );
  }
}
