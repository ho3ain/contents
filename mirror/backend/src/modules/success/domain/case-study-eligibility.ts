/**
 * Phase C4 — Case Study eligibility (§10).
 *
 * PURE. The thresholds arrive as a parameter rather than living as literals
 * here, because §10 says they must be configurable and not hard-coded. The
 * function's job is to apply a policy; where the policy comes from is the
 * config layer's business, and keeping them apart is what makes "we raised
 * the bar" a config change instead of a release.
 *
 * Why eligibility is a separate concept at all: §10 is explicit that not
 * every creator should get a case study. Inviting everyone makes the
 * invitation meaningless and floods the admin review queue — §39 needs that
 * queue to be a shortlist.
 */

export interface CaseStudyThresholds {
  minSales: number;
  minReviews: number;
  minAverageRating: number;
  /** Days a product must have been live before the story is credible. */
  minProductAgeDays: number;
  /**
   * Reviews that are pending or removed do not count. A creator cannot
   * inflate this by suppressing bad reviews and then asking for the
   * publicity, so the gate reads *published* reviews only.
   */
  requireVerifiedReview: boolean;
}

export const DEFAULT_CASE_STUDY_THRESHOLDS: CaseStudyThresholds = {
  minSales: 3,
  minReviews: 1,
  minAverageRating: 4,
  minProductAgeDays: 7,
  requireVerifiedReview: true,
};

export interface CaseStudyCandidateFacts {
  sales: number;
  publishedReviews: number;
  verifiedReviews: number;
  averageRating: number | null;
  /** Days since the creator's first published product. */
  productAgeDays: number | null;
  hasActiveProduct: boolean;
  /**
   * Open disputes, refunds and reports against this creator. A public case
   * study is a promise about a person, so a creator mid-dispute is not
   * eligible regardless of their numbers.
   */
  openDisputes: number;
  hasPendingCaseStudy: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  /** Per-criterion results, so the creator is told which one is missing. */
  criteria: Array<{
    key: string;
    met: boolean;
    actual: number;
    needed: number;
  }>;
  /** The one criterion standing between this creator and the invitation. */
  blockedBy: string | null;
}

export function evaluateCaseStudyEligibility(
  facts: CaseStudyCandidateFacts,
  thresholds: CaseStudyThresholds = DEFAULT_CASE_STUDY_THRESHOLDS,
): EligibilityResult {
  const criteria: EligibilityResult['criteria'] = [
    {
      key: 'sales',
      met: facts.sales >= thresholds.minSales,
      actual: facts.sales,
      needed: thresholds.minSales,
    },
    {
      key: 'reviews',
      met: facts.publishedReviews >= thresholds.minReviews,
      actual: facts.publishedReviews,
      needed: thresholds.minReviews,
    },
    {
      key: 'rating',
      // A creator with no reviews has no rating. `null` must not satisfy a
      // minimum — treating it as 0 would pass a 0 threshold and as Infinity
      // would pass everything, so it simply fails.
      met:
        facts.averageRating !== null &&
        facts.averageRating >= thresholds.minAverageRating,
      actual: facts.averageRating ?? 0,
      needed: thresholds.minAverageRating,
    },
    {
      key: 'product_age',
      met:
        facts.productAgeDays !== null &&
        facts.productAgeDays >= thresholds.minProductAgeDays,
      actual: facts.productAgeDays ?? 0,
      needed: thresholds.minProductAgeDays,
    },
    {
      key: 'active_product',
      met: facts.hasActiveProduct,
      actual: facts.hasActiveProduct ? 1 : 0,
      needed: 1,
    },
    {
      key: 'no_open_disputes',
      met: facts.openDisputes === 0,
      actual: facts.openDisputes,
      needed: 0,
    },
  ];

  if (thresholds.requireVerifiedReview) {
    criteria.push({
      key: 'verified_review',
      met: facts.verifiedReviews >= 1,
      actual: facts.verifiedReviews,
      needed: 1,
    });
  }

  // A creator who already has one in flight is not "newly eligible" — they
  // are already being worked on, and re-inviting produces a second case
  // study for the same story. This is checked last so the creator still sees
  // which *substantive* criterion they passed.
  const blockedBy = criteria.find((c) => !c.met)?.key ?? null;
  const eligible = blockedBy === null && !facts.hasPendingCaseStudy;

  return {
    eligible,
    criteria,
    blockedBy: facts.hasPendingCaseStudy ? 'pending_case_study' : blockedBy,
  };
}

/** §13 — the editorial lifecycle of a case study. */
export const CASE_STUDY_STATUSES = [
  'draft',
  'submitted',
  'reviewing',
  'changes_requested',
  'approved',
  'published',
  'archived',
] as const;

export type CaseStudyStatus = (typeof CASE_STUDY_STATUSES)[number];

/** Which transitions the system allows, and who may perform them. */
export const CASE_STUDY_TRANSITIONS: Record<
  CaseStudyStatus,
  { to: CaseStudyStatus[]; by: 'creator' | 'admin' }[]
> = {
  draft: [{ to: ['submitted'], by: 'creator' }],
  submitted: [
    { to: ['reviewing', 'approved'], by: 'admin' },
    { to: ['draft'], by: 'admin' },
  ],
  reviewing: [
    { to: ['approved', 'changes_requested'], by: 'admin' },
    { to: ['draft'], by: 'admin' },
  ],
  changes_requested: [
    { to: ['submitted'], by: 'creator' },
    { to: ['draft'], by: 'creator' },
  ],
  approved: [{ to: ['published', 'archived'], by: 'admin' }],
  published: [{ to: ['archived'], by: 'admin' }],
  archived: [{ to: ['draft'], by: 'admin' }],
};

export function canTransition(
  from: CaseStudyStatus,
  to: CaseStudyStatus,
  actor: 'creator' | 'admin',
): boolean {
  return (CASE_STUDY_TRANSITIONS[from] ?? []).some(
    (rule) => rule.to.includes(to) && rule.by === actor,
  );
}

/**
 * A published case study may be edited only by unpublishing it first.
 *
 * This is a real product decision, not a technicality: a case study is
 * public social proof. Letting its author silently rewrite the metrics after
 * approval would make every published number untrustworthy. Changes
 * requested after publication therefore send it back to `changes_requested`,
 * which un-publishes it.
 */
export function canEditContent(
  status: CaseStudyStatus,
  actor: 'creator' | 'admin',
): boolean {
  if (actor === 'admin') return status !== 'published';
  return (
    status === 'draft' ||
    status === 'changes_requested' ||
    status === 'submitted'
  );
}
