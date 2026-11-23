/**
 * Phase C1 — Creator Growth Infrastructure: the funnel state machine.
 *
 * PURE, deterministic, dependency-free. Every rule here is a function of
 * facts the system measured, never of a hand-picked label:
 *
 *   "اگر Creator هنوز Product منتشر نکرده، نباید صرفاً با تغییر Stage به
 *    Published، سیستم او را Published نشان دهد."
 *
 * So a CRM record carries TWO stages:
 *   - `derivedStage` — computed from real events/rows on every read
 *   - `manualStage`  — an admin LOWERING the record for campaign purposes
 *                       (audited), which may never EXCEED the derived one.
 *
 * The admin UI therefore always renders the derived stage as the truth and
 * labels an override explicitly; `resolveStage()` is the single place the
 * two combine.
 */

// ---------------------------------------------------------------------------
// The acquisition stages (C1 §8, extended by C2 §6).
//
// Order is meaningful twice over: it is the funnel order AND the ceiling a
// manual override may reach. `lost` is deliberately NOT in this list — it is
// a terminal OUTCOME, not a rung on the ladder, so a lost record keeps the
// furthest stage it actually reached instead of collapsing to "lost".
// ---------------------------------------------------------------------------

export const CRM_STAGES = [
  'new_lead',
  'contacted',
  'replied',
  'interested',
  'qualified',
  'registered',
  'creator_activated',
  'product_started',
  'product_submitted',
  'approved',
  'published',
  'first_sale',
  'growing',
] as const;

export type CrmStage = (typeof CRM_STAGES)[number];

/**
 * C2 §6 "Lost" is a separate observable state, not a funnel position. It is
 * stored alongside the stage so "how many did we lose, and from where" is a
 * measurable question rather than an anecdote.
 */
export const CRM_TERMINAL_OUTCOMES = ['lost'] as const;
export type CrmOutcome = (typeof CRM_TERMINAL_OUTCOMES)[number] | 'active';

export const CRM_OUTCOMES = ['active', ...CRM_TERMINAL_OUTCOMES] as const;

export function isCrmOutcome(value: unknown): value is CrmOutcome {
  return (
    typeof value === 'string' &&
    (CRM_OUTCOMES as readonly string[]).includes(value)
  );
}

/** Zero-based position in the funnel; -1 for an unknown value. */
export const STAGE_ORDER: Record<CrmStage, number> = CRM_STAGES.reduce(
  (acc, stage, index) => {
    acc[stage] = index;
    return acc;
  },
  {} as Record<CrmStage, number>,
);

export function stageIndex(stage: string | null | undefined): number {
  if (!stage) return -1;
  return STAGE_ORDER[stage as CrmStage] ?? -1;
}

export function isCrmStage(value: unknown): value is CrmStage {
  return (
    typeof value === 'string' &&
    (CRM_STAGES as readonly string[]).includes(value)
  );
}

export function maxStage(a: string, b: string): CrmStage {
  return stageIndex(a) >= stageIndex(b) ? (a as CrmStage) : (b as CrmStage);
}

// ---------------------------------------------------------------------------
// Stage rules (spec §8: every stage has a definition, an entry condition and
// an exit condition). `evaluate` receives ONLY real, measured facts and
// returns true when the stage has been genuinely reached.
// ---------------------------------------------------------------------------

/** The measured facts a stage decision is allowed to look at. */
export interface StageFacts {
  /** A lead record exists (or the person is already a user/creator). */
  hasLead: boolean;
  /** An outreach was logged — the team actually reached out. (C2 §19) */
  wasContacted: boolean;
  /** The person actually replied. (C2 §19 `lead.replied`) */
  didReply: boolean;
  /** The person explicitly said they are interested. (C2 §19) */
  showedInterest: boolean;
  /**
   * C1's catch-all engagement. Retained because a NOTE, a login or a capture
   * is a real interaction that is none of the three steps above; without it a
   * lead who engaged in some other way would look untouched.
   */
  hasEngagement: boolean;
  /** An admin qualified the lead (audited) OR the live score clears the bar. */
  isQualified: boolean;
  /** The person has a users row linked to this CRM record. */
  isRegistered: boolean;
  /** A creator profile exists AND its guided onboarding completed. */
  isCreatorActivated: boolean;
  /** The creator created their first product (a draft agents row exists). */
  hasProductStarted: boolean;
  /** A real review submission exists (or the listing reached the queue). */
  hasProductSubmitted: boolean;
  /** A listing was approved / is ready to publish. */
  isApproved: boolean;
  /** A listing is live (published). */
  isPublished: boolean;
  /** At least one PAID and not-refunded order for this creator's products. */
  hasFirstSale: boolean;
  /** The A5 "growing" rule holds: real view growth over a real period. */
  isGrowing: boolean;
}

export interface StageDefinition {
  stage: CrmStage;
  /** Persian/English-agnostic i18n key suffix — the UI localizes it. */
  definitionKey: string;
  entryConditionKey: string;
  exitConditionKey: string;
  evaluate: (facts: StageFacts) => boolean;
}

/**
 * The funnel in order. `evaluate` is a PURE predicate over measured facts —
 * this is what makes "stage" a derived fact instead of an editable label.
 */
export const STAGE_DEFINITIONS: readonly StageDefinition[] = [
  {
    stage: 'new_lead',
    definitionKey: 'crm.stage.new_lead.definition',
    entryConditionKey: 'crm.stage.new_lead.entry',
    exitConditionKey: 'crm.stage.new_lead.exit',
    evaluate: (f) => f.hasLead,
  },
  {
    stage: 'contacted',
    definitionKey: 'crm.stage.contacted.definition',
    entryConditionKey: 'crm.stage.contacted.entry',
    exitConditionKey: 'crm.stage.contacted.exit',
    // Reached by a real outreach OR by any other genuine interaction: a lead
    // who signed up before we emailed them is not "un-contacted".
    evaluate: (f) => f.wasContacted || f.didReply || f.hasEngagement,
  },
  {
    stage: 'replied',
    definitionKey: 'crm.stage.replied.definition',
    entryConditionKey: 'crm.stage.replied.entry',
    exitConditionKey: 'crm.stage.replied.exit',
    // A reply is itself PROOF of contact, so it satisfies the contacted rung
    // whether or not the outreach row survived. The walk stops at the first
    // unsatisfied stage, so without this a lead who replied to an email would
    // be stuck at new_lead — the ordered walk has to be self-consistent.
    evaluate: (f) => f.didReply,
  },
  {
    stage: 'interested',
    definitionKey: 'crm.stage.interested.definition',
    entryConditionKey: 'crm.stage.interested.entry',
    exitConditionKey: 'crm.stage.interested.exit',
    // Interest is strictly stronger than a reply, so it must also satisfy
    // the reply predicate — otherwise the ordered walk stops at "replied" and
    // a clearly-interested lead would be under-reported.
    evaluate: (f) => f.showedInterest && f.didReply,
  },
  {
    stage: 'qualified',
    definitionKey: 'crm.stage.qualified.definition',
    entryConditionKey: 'crm.stage.qualified.entry',
    exitConditionKey: 'crm.stage.qualified.exit',
    evaluate: (f) => f.isQualified,
  },
  {
    stage: 'registered',
    definitionKey: 'crm.stage.registered.definition',
    entryConditionKey: 'crm.stage.registered.entry',
    exitConditionKey: 'crm.stage.registered.exit',
    evaluate: (f) => f.isRegistered,
  },
  {
    stage: 'creator_activated',
    definitionKey: 'crm.stage.creator_activated.definition',
    entryConditionKey: 'crm.stage.creator_activated.entry',
    exitConditionKey: 'crm.stage.creator_activated.exit',
    evaluate: (f) => f.isCreatorActivated,
  },
  {
    stage: 'product_started',
    definitionKey: 'crm.stage.product_started.definition',
    entryConditionKey: 'crm.stage.product_started.entry',
    exitConditionKey: 'crm.stage.product_started.exit',
    evaluate: (f) => f.hasProductStarted,
  },
  {
    stage: 'product_submitted',
    definitionKey: 'crm.stage.product_submitted.definition',
    entryConditionKey: 'crm.stage.product_submitted.entry',
    exitConditionKey: 'crm.stage.product_submitted.exit',
    evaluate: (f) => f.hasProductSubmitted,
  },
  {
    stage: 'approved',
    definitionKey: 'crm.stage.approved.definition',
    entryConditionKey: 'crm.stage.approved.entry',
    exitConditionKey: 'crm.stage.approved.exit',
    evaluate: (f) => f.isApproved,
  },
  {
    stage: 'published',
    definitionKey: 'crm.stage.published.definition',
    entryConditionKey: 'crm.stage.published.entry',
    exitConditionKey: 'crm.stage.published.exit',
    evaluate: (f) => f.isPublished,
  },
  {
    stage: 'first_sale',
    definitionKey: 'crm.stage.first_sale.definition',
    entryConditionKey: 'crm.stage.first_sale.entry',
    exitConditionKey: 'crm.stage.first_sale.exit',
    evaluate: (f) => f.hasFirstSale,
  },
  {
    stage: 'growing',
    definitionKey: 'crm.stage.growing.definition',
    entryConditionKey: 'crm.stage.growing.entry',
    exitConditionKey: 'crm.stage.growing.exit',
    evaluate: (f) => f.isGrowing,
  },
];

/**
 * The furthest stage the facts support. Returns `new_lead` for a record
 * with no lead and no identity — every CRM row satisfies at least the
 * first stage by construction, so the result is never null.
 */
export function deriveStage(facts: StageFacts): CrmStage {
  // Walk the funnel in order and take the LAST satisfied stage: a creator
  // who published a product also satisfies every earlier predicate, so the
  // loop stops at the first gap and reports the deepest real milestone.
  let reached: CrmStage = 'new_lead';
  for (const definition of STAGE_DEFINITIONS) {
    if (definition.evaluate(facts)) reached = definition.stage;
    else break;
  }
  return reached;
}

export interface ResolvedStage {
  /** What the system measures — the truth, always shown. */
  derived: CrmStage;
  /** The admin override, when one is set and still valid. */
  manual: CrmStage | null;
  /** The stage every funnel query, filter and KPI counts by. */
  effective: CrmStage;
  /** True when `manual` is actually lowering the record. */
  isOverridden: boolean;
}

/**
 * Combines the derived stage with an audited manual override.
 *
 * THE ANTI-FAKE RULE (spec §8): a manual stage may never exceed what the
 * system measured. An admin can park a record in an earlier stage (e.g.
 * "qualified" for a campaign that has not converted yet), but can never
 * promote an unpublished creator to "published".
 */
export function resolveStage(
  derived: CrmStage,
  manual: string | null | undefined,
): ResolvedStage {
  if (!isCrmStage(manual)) {
    return { derived, manual: null, effective: derived, isOverridden: false };
  }
  if (stageIndex(manual) >= stageIndex(derived)) {
    // Equal is a no-op; higher would be a lie — both are ignored here and
    // rejected at the write path by `assertManualStageAllowed`.
    return { derived, manual: null, effective: derived, isOverridden: false };
  }
  return {
    derived,
    manual,
    effective: manual,
    isOverridden: true,
  };
}

export interface ManualStageRejection {
  allowed: boolean;
  reason?: 'above_derived' | 'unknown_stage';
}

/**
 * The write-path guard. Returns the verdict the API turns into a 422 so the
 * UI can explain the rule instead of silently swallowing the request.
 */
export function assertManualStageAllowed(
  manual: string,
  derived: CrmStage,
): ManualStageRejection {
  if (!isCrmStage(manual)) return { allowed: false, reason: 'unknown_stage' };
  if (stageIndex(manual) >= stageIndex(derived)) {
    return { allowed: false, reason: 'above_derived' };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Funnel metrics (spec §12) — pure math over per-stage counts.
// ---------------------------------------------------------------------------

export interface FunnelStageMetrics {
  stage: CrmStage;
  count: number;
  /** count / previous count, 0..1. null when the previous stage is empty. */
  conversionFromPrevious: number | null;
  /** previous - count, 0..1. null when there is no previous stage. */
  dropOffFromPrevious: number | null;
  /** Average days spent in this stage before moving on (null without data). */
  averageDaysToNext: number | null;
}

/**
 * Funnel math. The FIRST stage has no previous step, so its conversion and
 * drop-off are honestly `null` instead of a fabricated 100% / 0%.
 */
export function buildFunnelMetrics(
  counts: Record<string, number>,
  daysToNext: Record<string, number | null>,
): FunnelStageMetrics[] {
  return STAGE_DEFINITIONS.map((definition, index) => {
    const previous = STAGE_DEFINITIONS[index - 1];
    const count = counts[definition.stage] ?? 0;
    if (!previous) {
      return {
        stage: definition.stage,
        count,
        conversionFromPrevious: null,
        dropOffFromPrevious: null,
        averageDaysToNext: daysToNext[definition.stage] ?? null,
      };
    }
    const previousCount = counts[previous.stage] ?? 0;
    const conversion =
      previousCount > 0
        ? Math.max(0, Math.min(1, count / previousCount))
        : null;
    return {
      stage: definition.stage,
      count,
      conversionFromPrevious: conversion,
      dropOffFromPrevious:
        conversion === null ? null : Math.max(0, Math.min(1, 1 - conversion)),
      averageDaysToNext: daysToNext[definition.stage] ?? null,
    };
  });
}

/** The transition labels the dashboard renders between two stages. */
/**
 * Every adjacent step of the funnel, in order. This is the transition list the
 * dashboard shows and the "what could happen next" hint reads, so it must
 * cover ALL adjacent pairs — a missing pair would tell the growth team a
 * creator cannot move from one stage to the one right after it.
 */
export const STAGE_TRANSITION_KEYS: Array<[CrmStage, CrmStage]> = [
  ['new_lead', 'contacted'],
  ['contacted', 'replied'],
  ['replied', 'interested'],
  ['interested', 'qualified'],
  ['qualified', 'registered'],
  ['registered', 'creator_activated'],
  ['creator_activated', 'product_started'],
  ['product_started', 'product_submitted'],
  ['product_submitted', 'approved'],
  ['approved', 'published'],
  ['published', 'first_sale'],
  ['first_sale', 'growing'],
];
