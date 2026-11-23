/**
 * Phase C4 — Referral stages and attribution rules (§16, §32).
 *
 * PURE. The stage vocabulary and the rules about who may be attributed are
 * separated from storage, so both are testable without a database and
 * neither can drift from the other.
 *
 * §16's eleven stages are a *strict* progression. A referral advances
 * forward and never backward, because each stage is a fact about the world
 * (they registered, they built something) that cannot become untrue. This
 * monotonicity is also the anti-abuse backbone: a referrer cannot lose
 * credit by the system re-evaluating, and cannot skip a stage to claim a
 * reward early.
 */

/** §16 — the exact stage list, in order. */
export const REFERRAL_STAGES = [
  'invited',
  'visited',
  'registered',
  'creator_started',
  'product_created',
  'product_submitted',
  'approved',
  'published',
  'first_sale',
  'reward_eligible',
  'rewarded',
] as const;

export type ReferralStage = (typeof REFERRAL_STAGES)[number];

export const REFERRAL_STAGE_ORDER: Record<ReferralStage, number> =
  REFERRAL_STAGES.reduce(
    (order, stage, index) => {
      order[stage] = index;
      return order;
    },
    {} as Record<ReferralStage, number>,
  );

/**
 * Can a referral move from `from` to `to`?
 *
 * Forward-only and no skipping. Skipping is rejected because each stage
 * carries the evidence of the one before it — `published` implies
 * `approved` implies `product_submitted` — and allowing a jump would let a
 * partial journey be reported as a complete one.
 */
export function canAdvanceReferral(
  from: ReferralStage | null,
  to: ReferralStage,
): boolean {
  if (from === null) return to === 'invited' || to === 'visited';
  return REFERRAL_STAGE_ORDER[to] === REFERRAL_STAGE_ORDER[from] + 1;
}

export function highestStage(stages: ReferralStage[]): ReferralStage | null {
  let best: ReferralStage | null = null;
  for (const stage of stages) {
    if (
      best === null ||
      REFERRAL_STAGE_ORDER[stage] > REFERRAL_STAGE_ORDER[best]
    ) {
      best = stage;
    }
  }
  return best;
}

export interface AttributionDecision {
  allowed: boolean;
  reason?: 'self_referral' | 'cycle' | 'already_attributed' | 'code_invalid';
}

/**
 * Whether a referral code may be attributed to a specific user.
 *
 * §32 lists self-referral and suspicious patterns as abuse vectors, and the
 * two defences here are structural rather than heuristic:
 *
 *  - A user can never be attributed to their own code, nor to a code that
 *    their own account already owns. That closes the "make a second account
 *    and invite yourself" loop, which is the only realistic way to farm a
 *    reward here.
 *  - A referral cannot form a cycle. This is inherited from C2's proven
 *    `wouldCreateCycle` check — duplicating that logic would be two
 *    implementations of one rule, and they would eventually disagree.
 */
export function canAttribute(
  input: {
    codeOwnerUserId: string;
    visitorUserId: string;
    /** The visitor's account, if it already carries a referrer. */
    existingReferrerUserId: string | null;
  },
  isCycle: boolean,
): AttributionDecision {
  if (!input.codeOwnerUserId || !input.visitorUserId) {
    return { allowed: false, reason: 'code_invalid' };
  }
  if (input.codeOwnerUserId === input.visitorUserId) {
    return { allowed: false, reason: 'self_referral' };
  }
  if (input.existingReferrerUserId === input.codeOwnerUserId) {
    return { allowed: false, reason: 'already_attributed' };
  }
  if (isCycle) {
    return { allowed: false, reason: 'cycle' };
  }
  return { allowed: true };
}

/** §17 — the counters the referral dashboard shows. */
export interface ReferralStats {
  invited: number;
  registered: number;
  productCreated: number;
  published: number;
  firstSale: number;
  /**
   * §17's honest middle ground: counts, not money. `pendingReward` is a
   * count of referrals an admin has not yet reviewed, and there is
   * deliberately no currency field anywhere in this type — the project has
   * no wallet, and §44 forbids implying money moved when it did not.
   */
  pendingReward: number;
  approvedReward: number;
}

export function referralStats(
  referrals: Array<{ stage: ReferralStage; rewardReviewed: boolean }>,
): ReferralStats {
  const atLeast = (stage: ReferralStage) =>
    referrals.filter(
      (r) => REFERRAL_STAGE_ORDER[r.stage] >= REFERRAL_STAGE_ORDER[stage],
    ).length;
  return {
    invited: referrals.length,
    registered: atLeast('registered'),
    productCreated: atLeast('product_created'),
    published: atLeast('published'),
    firstSale: atLeast('first_sale'),
    pendingReward: referrals.filter(
      (r) => r.stage === 'reward_eligible' && !r.rewardReviewed,
    ).length,
    approvedReward: referrals.filter(
      (r) => r.stage === 'rewarded' && r.rewardReviewed,
    ).length,
  };
}
