/**
 * Sprint 2 — the setup checklist of a purchased product (PURE).
 *
 * Steps are DERIVED from the product contract the creator declared
 * (requirements + integrations) plus two honest generic steps, then
 * snapshotted per buyer. Nothing here implies that Mesh runs, hosts or
 * connects anything: every step is something the BUYER does outside Mesh,
 * following the creator's guide, and ticks off here.
 *
 * Step TEXT that comes from the creator (names, descriptions) is stored
 * verbatim; step text that is generic is NOT stored — `title` stays null
 * and the UI renders the localized string for the step `key`.
 */

export const SETUP_STEP_KINDS = [
  'api_key',
  'external_account',
  'integration',
  'configuration',
  'file',
  'credential',
  'manual',
  'test',
] as const;
export type SetupStepKind = (typeof SETUP_STEP_KINDS)[number];

export interface BlueprintStep {
  key: string;
  position: number;
  kind: SetupStepKind;
  title: string | null;
  description: string | null;
  required: boolean;
}

export interface BlueprintRequirement {
  type: string;
  description: string;
  required: boolean;
  name?: string | null;
  reason?: string | null;
}

export interface BlueprintIntegration {
  slug: string;
  name?: string | null;
  purpose: string | null;
}

export interface BlueprintInput {
  requirements?: BlueprintRequirement[] | null;
  integrations?: BlueprintIntegration[] | null;
  noRequirements?: boolean | null;
}

const KIND_BY_REQUIREMENT: Record<string, SetupStepKind> = {
  api_key: 'api_key',
  external_service: 'external_account',
  infrastructure: 'configuration',
  model_access: 'credential',
  license: 'manual',
  other: 'manual',
};

const clip = (value: string | null | undefined, max: number): string | null => {
  const text = (value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : null;
};

export function buildSetupBlueprint(input: BlueprintInput): BlueprintStep[] {
  const steps: Omit<BlueprintStep, 'position'>[] = [];

  (input.requirements ?? []).forEach((requirement, index) => {
    const title =
      clip(requirement.name, 200) ?? clip(requirement.description, 200);
    if (!title) return;
    steps.push({
      key: `req-${index + 1}`,
      kind: KIND_BY_REQUIREMENT[requirement.type] ?? 'manual',
      title,
      description: requirement.name
        ? clip(requirement.description, 600)
        : clip(requirement.reason, 600),
      required: requirement.required !== false,
    });
  });

  (input.integrations ?? []).forEach((integration) => {
    const title = clip(integration.name, 200) ?? clip(integration.slug, 80);
    if (!title) return;
    steps.push({
      key: `int-${integration.slug}`.slice(0, 64),
      kind: 'integration',
      title,
      description: clip(integration.purpose, 600),
      // A declared integration is part of how the product works.
      required: true,
    });
  });

  // Generic, always-honest closing steps (UI renders them from the key).
  steps.push({
    key: 'configure',
    kind: 'configuration',
    title: null,
    description: null,
    required: true,
  });
  steps.push({
    key: 'test',
    kind: 'test',
    title: null,
    description: null,
    required: true,
  });

  // De-duplicate keys defensively (two integrations with one slug).
  const seen = new Set<string>();
  const unique = steps.filter((step) => {
    if (seen.has(step.key)) return false;
    seen.add(step.key);
    return true;
  });
  return unique.map((step, index) => ({ ...step, position: index + 1 }));
}
