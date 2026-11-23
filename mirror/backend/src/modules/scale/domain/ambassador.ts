/**
 * Phase C5 §9, §12 — ambassador eligibility.
 *
 * A creator is *eligible* when they meet the rules; they are an *ambassador*
 * only after an admin approves the invitation (§55, owner decision). Keeping
 * those two states separate is the difference between "the system decided"
 * and "a person decided", and the UI says which one happened.
 *
 * Every threshold is a parameter rather than a constant so §9's "rules must
 * be controllable in the backend" holds, and so a test can assert a boundary
 * instead of a magic number.
 */

export const AMBASSADOR_STATUSES = [
  'invited',
  'active',
  'declined',
  'suspended',
  'completed',
] as const;

export type AmbassadorStatus = (typeof AMBASSADOR_STATUSES)[number];

const AMBASSADOR_TRANSITIONS: Record<
  AmbassadorStatus,
  readonly AmbassadorStatus[]
> = {
  // An invitation is a question, and the creator answers it. A declined
  // invitation can be re-sent later — people change their minds and a
  // creator's numbers improve — so `invited` is reachable again.
  invited: ['active', 'declined'],
  active: ['suspended', 'completed'],
  // A suspension is lifted by reactivating; a declined invitation may be
  // answered later, because eligibility is recomputed over time.
  suspended: ['active', 'completed'],
  declined: ['invited'],
  completed: [],
};

export function canTransitionAmbassador(
  from: AmbassadorStatus,
  to: AmbassadorStatus,
): boolean {
  return AMBASSADOR_TRANSITIONS[from].includes(to);
}

export interface AmbassadorFacts {
  sales: number;
  publishedProducts: number;
  averageRating: number | null;
  reviewCount: number;
  /** Days since the creator's last meaningful activity. */
  daysSinceActivity: number | null;
  /** C4's referral funnel, converted. */
  referralConversions: number;
  /** True when the creator has a violation on record (A-phase trust). */
  hasViolation: boolean;
}

export interface AmbassadorThresholds {
  minSales: number;
  minPublishedProducts: number;
  minAverageRating: number;
  minReviews: number;
  minReferralConversions: number;
  /** A creator idle longer than this is not invited. */
  maxDaysSinceActivity: number;
}

export interface EligibilityCriterion {
  key: string;
  label: string;
  met: boolean;
  /** What the creator has, so the UI can show progress toward the bar. */
  current: number | null;
  required: number;
}

export interface EligibilityResult {
  eligible: boolean;
  criteria: EligibilityCriterion[];
  /** The first unmet criterion, for the "one clear reason" empty state. */
  blockingKey: string | null;
}

/**
 * §9/§10 — the eligibility check, plus every criterion's value.
 *
 * Returning the full criteria list (not just a boolean) is what lets the
 * invitation page say "you are 1 sale away" instead of "you are not eligible",
 * which is the difference between a program a creator joins and a program
 * they give up on.
 */
export function evaluateAmbassadorEligibility(
  facts: AmbassadorFacts,
  thresholds: AmbassadorThresholds,
): EligibilityResult {
  const criteria: EligibilityCriterion[] = [
    {
      key: 'sales',
      label: 'فروش',
      met: facts.sales >= thresholds.minSales,
      current: facts.sales,
      required: thresholds.minSales,
    },
    {
      key: 'published_products',
      label: 'محصول منتشرشده',
      met: facts.publishedProducts >= thresholds.minPublishedProducts,
      current: facts.publishedProducts,
      required: thresholds.minPublishedProducts,
    },
    {
      key: 'rating',
      // No reviews means no rating, which is not the same as a bad rating. A
      // creator with 0 reviews fails the *review count* criterion; failing
      // the rating criterion too would report the same problem twice and
      // imply they have poor reviews when they have none.
      label: 'میانگین امتیاز',
      met:
        facts.averageRating === null ||
        facts.averageRating >= thresholds.minAverageRating,
      current: facts.averageRating,
      required: thresholds.minAverageRating,
    },
    {
      key: 'reviews',
      label: 'تعداد نظر',
      met: facts.reviewCount >= thresholds.minReviews,
      current: facts.reviewCount,
      required: thresholds.minReviews,
    },
    {
      key: 'referral_conversions',
      label: 'تبدیل دعوت',
      met: facts.referralConversions >= thresholds.minReferralConversions,
      current: facts.referralConversions,
      required: thresholds.minReferralConversions,
    },
    {
      key: 'activity',
      label: 'فعالیت اخیر',
      met:
        facts.daysSinceActivity !== null &&
        facts.daysSinceActivity <= thresholds.maxDaysSinceActivity,
      current: facts.daysSinceActivity,
      required: thresholds.maxDaysSinceActivity,
    },
    {
      // A violation is a hard block regardless of every other number. It is
      // listed LAST so the admin-facing "closest to eligible" view still
      // surfaces the productive criteria a creator could work on — but it is
      // a veto, and no amount of sales overrides it.
      key: 'trust',
      label: 'سابقه سالم',
      met: !facts.hasViolation,
      current: facts.hasViolation ? 0 : 1,
      required: 1,
    },
  ];

  const unmet = criteria.filter((criterion) => !criterion.met);
  return {
    eligible: unmet.length === 0,
    criteria,
    blockingKey: unmet[0]?.key ?? null,
  };
}

/**
 * §12 — which configured level a set of facts earns.
 *
 * Levels are CONFIG (§55 / §12: do not hard-code tiers), so this takes the
 * level list as an argument and returns the highest match. `levelId: null`
 * means "no level configured yet", which the UI must render as "not yet
 * configured" rather than as Ambassador level zero.
 */
export interface AmbassadorLevelRule {
  id: string;
  name: string;
  rank: number;
  minSales: number;
  minReferralConversions: number;
}

export function resolveLevel(
  facts: AmbassadorFacts,
  levels: AmbassadorLevelRule[],
): AmbassadorLevelRule | null {
  const eligible = levels
    .filter(
      (level) =>
        facts.sales >= level.minSales &&
        facts.referralConversions >= level.minReferralConversions,
    )
    .sort((a, b) => b.rank - a.rank);
  return eligible[0] ?? null;
}
