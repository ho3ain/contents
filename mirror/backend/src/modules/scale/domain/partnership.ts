/**
 * Phase C5 §16 — the partnership pipeline.
 *
 * This is deliberately NOT the C2 `CRM_STAGES` funnel. That pipeline describes
 * a single person's journey from unknown lead to published creator; a
 * partnership is an organisation relationship with a contract attached, and it
 * has states the creator funnel has no meaning for (`negotiating`, `paused`).
 * Folding it into the 13 CRM stages would have made every partnership report
 * a translation exercise.
 *
 * The pipeline is also the thing most likely to be edited later by whoever
 * runs growth, so the allowed edges are a table rather than a comparison on
 * the enum, and `rank` is explicit — the admin list sorts by it.
 */

export const PARTNERSHIP_STAGES = [
  'prospect',
  'contacted',
  'interested',
  'negotiating',
  'active',
  'paused',
  'completed',
] as const;

export type PartnershipStage = (typeof PARTNERSHIP_STAGES)[number];

export const PARTNERSHIP_STAGE_RANK: Record<PartnershipStage, number> =
  PARTNERSHIP_STAGES.reduce(
    (rank, stage, index) => {
      rank[stage] = index;
      return rank;
    },
    {} as Record<PartnershipStage, number>,
  );

/** §15 — what kind of partner this is. */
export const PARTNERSHIP_TYPES = [
  'automation_expert',
  'agency',
  'consultant',
  'ai_educator',
  'community',
  'tool_ecosystem',
  'service_provider',
  'other',
] as const;

export type PartnershipType = (typeof PARTNERSHIP_TYPES)[number];

/** §15/§49 — how a partner's referrals are credited. */
export const ATTRIBUTION_METHODS = [
  'referral_link',
  'referral_code',
  'campaign',
  'manual',
] as const;

export type AttributionMethod = (typeof ATTRIBUTION_METHODS)[number];

const PARTNERSHIP_TRANSITIONS: Record<
  PartnershipStage,
  readonly PartnershipStage[]
> = {
  prospect: ['contacted'],
  contacted: ['interested', 'prospect'],
  // `interested` can fall back to `contacted`: a partner who goes quiet for a
  // month is not the same as a partner who said no, and collapsing the two
  // would lose that distinction in the pipeline report.
  interested: ['negotiating', 'contacted'],
  negotiating: ['active', 'interested'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed'],
  completed: [],
};

export function canTransitionPartnership(
  from: PartnershipStage,
  to: PartnershipStage,
): boolean {
  return PARTNERSHIP_TRANSITIONS[from].includes(to);
}

export function nextPartnershipStage(
  from: PartnershipStage,
  to: PartnershipStage,
): PartnershipStage | null {
  if (from === to) return from;
  return canTransitionPartnership(from, to) ? to : null;
}

/** §15 — the agreement is tracked separately from the pipeline stage. */
export const AGREEMENT_STATUSES = [
  'none',
  'draft',
  'sent',
  'signed',
  'expired',
  'terminated',
] as const;

export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

/**
 * A partnership that has `active` stage but a `terminated` agreement is a
 * contradiction an admin needs to see, so it is named rather than normalised
 * away. Returns a warning string, or null.
 */
export function partnershipWarning(
  stage: PartnershipStage,
  agreement: AgreementStatus,
  endDate: Date | null,
  now: Date,
): string | null {
  if (
    stage === 'active' &&
    (agreement === 'terminated' || agreement === 'expired')
  ) {
    return 'partnership_active_but_agreement_not_valid';
  }
  if (
    stage === 'active' &&
    endDate !== null &&
    endDate.getTime() < now.getTime()
  ) {
    return 'partnership_active_but_past_end_date';
  }
  if (
    agreement === 'signed' &&
    endDate !== null &&
    endDate.getTime() < now.getTime()
  ) {
    return 'agreement_expired';
  }
  return null;
}

/**
 * §18 — a partner's conversion rate.
 *
 * `null` rather than `0` when there was no traffic at all: "nobody clicked
 * this partner's link" and "everyone who clicked declined" are different
 * facts, and a dashboard that renders the first as the second will have a
 * partner removed for a problem they do not have.
 */
export function partnerConversion(
  clicks: number,
  conversions: number,
): number | null {
  if (clicks <= 0) return null;
  return conversions / clicks;
}
