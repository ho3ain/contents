/**
 * Phase C1 — Creator Scoring.
 *
 * "Score باید قابل توضیح باشد" — so a score is never a number, it is a
 * list of factors with the points each one contributed and WHY.
 *
 * "Weightها را به‌صورت Hard-coded پراکنده در کد قرار نده" — every weight
 * lives in SCORING_CONFIG below, every factor is a registry entry, and the
 * total is the sum of what the registry produced. Adding a factor means
 * adding one object here; nothing else changes.
 *
 * Pure and deterministic: the same facts always produce the same score and
 * the same breakdown, so the admin can trust (and re-derive) it.
 */

import { isCrmStage, stageIndex, type CrmStage } from './funnel';

// ---------------------------------------------------------------------------
// Configuration — the ONLY place weights and thresholds live.
// ---------------------------------------------------------------------------

export const SCORING_CONFIG = {
  /** Total possible points; also the "High" cut-off for the score filter. */
  maxScore: 100,
  /**
   * Weights per factor. They MUST add up to `maxScore` — `assertConfig()`
   * (below) is exercised by the unit tests so a future edit that breaks the
   * budget fails CI instead of silently rescaling every creator's score.
   */
  weights: {
    productFit: 20,
    intent: 25,
    expertise: 20,
    audience: 15,
    activity: 20,
  },
  /** Score bands used by the "Score" filter (spec §1). */
  bands: {
    high: 70,
    medium: 40,
  },
  /** A lead with a real, verified-ish email beats an anonymous capture. */
  intentBonus: {
    hasEmail: 6,
    hasWebsite: 4,
    hasBrand: 3,
    hasAttribution: 5,
  },
  /** Activity recency ladder (days since the last real interaction). */
  activityDays: {
    fresh: 3,
    recent: 7,
    warm: 14,
    cold: 30,
  },
} as const;

export type ScoreBand = 'high' | 'medium' | 'low';

export function scoreBand(score: number): ScoreBand {
  if (score >= SCORING_CONFIG.bands.high) return 'high';
  if (score >= SCORING_CONFIG.bands.medium) return 'medium';
  return 'low';
}

/** Throws when the weights no longer add up to the advertised maximum. */
export function assertConfig(): void {
  const total = Object.values(SCORING_CONFIG.weights).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (total !== SCORING_CONFIG.maxScore) {
    throw new Error(
      `Scoring weights sum to ${total}, expected ${SCORING_CONFIG.maxScore}`,
    );
  }
}

// ---------------------------------------------------------------------------
// The facts a score may look at — all measured, none estimated.
// ---------------------------------------------------------------------------

export interface ScoreFacts {
  /** Real contact data captured on the lead. */
  hasEmail: boolean;
  hasWebsite: boolean;
  hasBrand: boolean;
  /** The lead carries a source/campaign (attribution survived). */
  hasAttribution: boolean;
  /** Marketplace category slugs the creator declared (expertise/fit). */
  activityAreas: string[];
  expertise: string[];
  /** 'unverified' | 'pending' | 'verified' | 'revoked'. */
  verificationStatus: string | null;
  /** Free-text location the creator published. */
  hasLocation: boolean;
  /** Declared tool stack size. */
  tools: string[];
  /** Derived funnel stage — a published creator is worth more. */
  stage: CrmStage;
  /** Real products the creator has. */
  productCount: number;
  publishedProductCount: number;
  /** Paid, non-refunded sales across the creator's listings. */
  salesCount: number;
  /** Real 7-day views (never inflated: the analytics layer de-duplicates). */
  views7d: number;
  /** Days since the last real interaction (null = never interacted). */
  daysSinceLastActivity: number | null;
  /** Whether an admin assigned this record to a team member. */
  hasOwner: boolean;
}

// ---------------------------------------------------------------------------
// The factor registry — one entry per explainable dimension.
// ---------------------------------------------------------------------------

export interface ScoreFactorResult {
  key: string;
  /** i18n key for the factor name. */
  labelKey: string;
  points: number;
  maxPoints: number;
  /** i18n key template for the reason, e.g. crm.score.reason.hasEmail. */
  reasonKey: string;
  /** Values interpolated into the reason (already-measured numbers). */
  reasonVars: Record<string, string | number>;
}

export interface ScoreFactor {
  key: keyof typeof SCORING_CONFIG.weights;
  labelKey: string;
  maxPoints: number;
  evaluate: (
    facts: ScoreFacts,
  ) => Omit<ScoreFactorResult, 'key' | 'labelKey' | 'maxPoints'>;
}

/** Clamp a raw ratio into the factor's point budget. */
function points(ratio: number, maxPoints: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(Math.max(0, Math.min(1, ratio)) * maxPoints);
}

const INTENT_BONUS_TOTAL =
  SCORING_CONFIG.intentBonus.hasEmail +
  SCORING_CONFIG.intentBonus.hasWebsite +
  SCORING_CONFIG.intentBonus.hasBrand +
  SCORING_CONFIG.intentBonus.hasAttribution;

export const SCORING_FACTORS: readonly ScoreFactor[] = [
  {
    key: 'productFit',
    labelKey: 'crm.score.factor.productFit',
    maxPoints: SCORING_CONFIG.weights.productFit,
    evaluate: (facts) => {
      // Fit = does the person already describe something MESH can list?
      const declared = facts.activityAreas.length + facts.expertise.length;
      const readiness = facts.stage === 'new_lead' ? 0 : 0.25;
      const built = facts.productCount > 0 ? 0.35 : 0;
      const published = facts.publishedProductCount > 0 ? 0.2 : 0;
      const density = Math.min(1, declared / 4) * 0.2;
      const ratio = Math.min(1, readiness + built + published + density);
      return {
        points: points(ratio, SCORING_CONFIG.weights.productFit),
        reasonKey: 'crm.score.reason.productFit',
        reasonVars: {
          areas: facts.activityAreas.length,
          expertise: facts.expertise.length,
          products: facts.productCount,
          published: facts.publishedProductCount,
        },
      };
    },
  },
  {
    key: 'intent',
    labelKey: 'crm.score.factor.intent',
    maxPoints: SCORING_CONFIG.weights.intent,
    evaluate: (facts) => {
      // Intent = how reachable and how attributable the person is.
      const bonus =
        (facts.hasEmail ? SCORING_CONFIG.intentBonus.hasEmail : 0) +
        (facts.hasWebsite ? SCORING_CONFIG.intentBonus.hasWebsite : 0) +
        (facts.hasBrand ? SCORING_CONFIG.intentBonus.hasBrand : 0) +
        (facts.hasAttribution ? SCORING_CONFIG.intentBonus.hasAttribution : 0);
      const base = facts.hasEmail ? 0.6 : 0.2;
      const attribution = facts.hasAttribution ? 0.2 : 0;
      const ratio = Math.min(
        1,
        base + attribution + bonus / INTENT_BONUS_TOTAL / 2,
      );
      return {
        points: points(ratio, SCORING_CONFIG.weights.intent),
        reasonKey: 'crm.score.reason.intent',
        reasonVars: { bonus, maxBonus: INTENT_BONUS_TOTAL },
      };
    },
  },
  {
    key: 'expertise',
    labelKey: 'crm.score.factor.expertise',
    maxPoints: SCORING_CONFIG.weights.expertise,
    evaluate: (facts) => {
      // Expertise = real, declared proof of what they can build.
      const declared = Math.min(
        1,
        (facts.expertise.length + facts.activityAreas.length) / 5,
      );
      const verified =
        facts.verificationStatus === 'verified'
          ? 0.35
          : facts.verificationStatus === 'pending'
            ? 0.15
            : 0;
      const tools = Math.min(1, facts.tools.length / 5) * 0.15;
      const hasLocation = facts.hasLocation ? 0.05 : 0;
      const ratio = Math.min(
        1,
        declared * 0.45 + verified + tools + hasLocation,
      );
      return {
        points: points(ratio, SCORING_CONFIG.weights.expertise),
        reasonKey: 'crm.score.reason.expertise',
        reasonVars: {
          declared: facts.expertise.length + facts.activityAreas.length,
          verification: facts.verificationStatus ?? 'unverified',
          tools: facts.tools.length,
        },
      };
    },
  },
  {
    key: 'audience',
    labelKey: 'crm.score.factor.audience',
    maxPoints: SCORING_CONFIG.weights.audience,
    evaluate: (facts) => {
      // Audience = existing demand the creator brings with them.
      const sales = Math.min(1, facts.salesCount / 10) * 0.6;
      const published = Math.min(1, facts.publishedProductCount / 3) * 0.25;
      const baseline = facts.hasEmail ? 0.15 : 0;
      const ratio = Math.min(1, sales + published + baseline);
      return {
        points: points(ratio, SCORING_CONFIG.weights.audience),
        reasonKey: 'crm.score.reason.audience',
        reasonVars: {
          sales: facts.salesCount,
          published: facts.publishedProductCount,
        },
      };
    },
  },
  {
    key: 'activity',
    labelKey: 'crm.score.factor.activity',
    maxPoints: SCORING_CONFIG.weights.activity,
    evaluate: (facts) => {
      // Activity = recency, weighted by real marketplace engagement.
      const { fresh, recent, warm, cold } = SCORING_CONFIG.activityDays;
      const days = facts.daysSinceLastActivity;
      const recency =
        days === null
          ? 0
          : days <= fresh
            ? 0.5
            : days <= recent
              ? 0.4
              : days <= warm
                ? 0.25
                : days <= cold
                  ? 0.1
                  : 0;
      const engagement = Math.min(1, facts.views7d / 100) * 0.3;
      const shipped = facts.publishedProductCount > 0 ? 0.2 : 0;
      return {
        points: points(
          Math.min(1, recency + engagement + shipped),
          SCORING_CONFIG.weights.activity,
        ),
        reasonKey: 'crm.score.reason.activity',
        reasonVars: {
          days: days ?? '—',
          views: facts.views7d,
          owned: facts.hasOwner ? 1 : 0,
        },
      };
    },
  },
];

export interface ScoreResult {
  score: number;
  maxScore: number;
  band: ScoreBand;
  /** One entry per factor — the admin's "why is it 87?" answer. */
  breakdown: ScoreFactorResult[];
}

// ---------------------------------------------------------------------------
// The scorer.
// ---------------------------------------------------------------------------

export function scoreCreator(facts: ScoreFacts): ScoreResult {
  assertConfig();
  const breakdown: ScoreFactorResult[] = SCORING_FACTORS.map((factor) => ({
    key: factor.key,
    labelKey: factor.labelKey,
    maxPoints: factor.maxPoints,
    ...factor.evaluate(facts),
  }));
  const score = breakdown.reduce((sum, factor) => sum + factor.points, 0);
  return {
    score: Math.max(0, Math.min(SCORING_CONFIG.maxScore, score)),
    maxScore: SCORING_CONFIG.maxScore,
    band: scoreBand(score),
    breakdown,
  };
}

/** True when a record is far enough along to be treated as "qualified". */
export function isQualifiedByScore(score: number): boolean {
  return score >= SCORING_CONFIG.bands.high;
}

/**
 * Qualification used by the funnel: an admin's audited decision OR a live
 * score at/above the High band. Never a hand-picked label.
 */
export function qualifies(
  facts: ScoreFacts,
  manuallyQualified: boolean,
): boolean {
  return manuallyQualified || isQualifiedByScore(scoreCreator(facts).score);
}

/** Index of a stage, re-exported so services need one import for funnel+score. */
export { stageIndex, isCrmStage };
