/**
 * Marketplace ranking configuration (M4). Everything that decides order is a
 * NUMBER in this file (or an env override) — never a constant buried in SQL.
 *
 * `recommended` = rule-based blend of normalized (0..1) signals:
 *    quality      Bayesian-average rating (+ review volume confidence)
 *    popularity   real adopters (distinct entitled buyers) + product views
 *    freshness    exponential decay of the last publish/update date
 *    verification MESH listing review + verified creator
 *    personal     affinity with the signed-in buyer's OWN interest profile
 *                 (0 for visitors → the sort is fully usable without login)
 *
 * Deliberately NOT a signal: how many buyers SAVED a product. Saves are a
 * private creator metric (product rule); ranking never reads them.
 *
 * Future ML/embedding scores plug in as one more signal here.
 */
export interface RankingWeights {
  quality: number;
  popularity: number;
  freshness: number;
  verification: number;
  personal: number;
}

export interface RelevanceWeights {
  /** share of the score from how many query groups matched */
  coverage: number;
  /** share from the full-text rank (field-weighted A>B>C>D) */
  text: number;
  /** share from the name match (exact / prefix / trigram) */
  name: number;
  /** how much the general recommended score breaks ties between equal matches */
  tieBreak: number;
}

export interface RankingConfig {
  recommended: RankingWeights;
  relevance: RelevanceWeights;
  /** Bayesian prior: mean rating and equivalent number of prior reviews. */
  priorMean: number;
  priorWeight: number;
  /** Days for freshness to halve. */
  freshnessHalfLifeDays: number;
  /** adopters weigh this much more than one product view. */
  adopterWeight: number;
  viewWeight: number;
  /** popularity_norm threshold for the "Popular" filter. */
  popularThreshold: number;
  /** Extra weight of a synonym match vs a literal match in a group (0..1). */
  synonymFactor: number;
  fuzzyFactor: number;
}

export const DEFAULT_RANKING: RankingConfig = {
  recommended: {
    quality: 0.3,
    popularity: 0.22,
    freshness: 0.14,
    verification: 0.2,
    personal: 0.14,
  },
  relevance: { coverage: 0.4, text: 0.4, name: 0.2, tieBreak: 0.06 },
  priorMean: 4.0,
  priorWeight: 3,
  freshnessHalfLifeDays: 60,
  adopterWeight: 5,
  viewWeight: 0.2,
  popularThreshold: 0.35,
  synonymFactor: 0.75,
  fuzzyFactor: 0.6,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function mergeNumbers<T extends object>(base: T, patch: unknown): T {
  if (!isRecord(patch)) return base;
  const next = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    const incoming = patch[key];
    const current = next[key];
    if (isRecord(current)) {
      next[key] = mergeNumbers(current, incoming);
    } else if (finiteNonNegative(incoming)) {
      next[key] = incoming;
    }
  }
  return next as T;
}

/**
 * Optional override from env `MARKETPLACE_RANKING_CONFIG` (JSON). Unknown
 * keys and invalid values are ignored, so a bad override can never break
 * search — it silently falls back to the defaults.
 */
export function resolveRankingConfig(raw?: string | null): RankingConfig {
  if (!raw) return DEFAULT_RANKING;
  try {
    const parsed: unknown = JSON.parse(raw);
    const merged = mergeNumbers(DEFAULT_RANKING, parsed);
    return merged.recommended && sumOf(merged.recommended) > 0
      ? merged
      : DEFAULT_RANKING;
  } catch {
    return DEFAULT_RANKING;
  }
}

const sumOf = (weights: object) =>
  Object.values(weights as Record<string, number>).reduce((a, b) => a + b, 0);

/** Weights rescaled so the personal term drops out cleanly for visitors. */
export function effectiveRecommended(
  config: RankingConfig,
  personalized: boolean,
): RankingWeights {
  const weights = { ...config.recommended };
  if (!personalized) weights.personal = 0;
  const total = sumOf(weights);
  if (total <= 0) return DEFAULT_RANKING.recommended;
  return {
    quality: weights.quality / total,
    popularity: weights.popularity / total,
    freshness: weights.freshness / total,
    verification: weights.verification / total,
    personal: weights.personal / total,
  };
}

/* ------------------------------------------------------------------ *
 * Reference (TypeScript) implementation of each normalized signal.
 * The SQL in AgentSearchService uses the same formulas; these pure
 * functions document them and are unit-tested so a change to one side
 * is caught by the other.
 * ------------------------------------------------------------------ */

export function bayesianRating(
  average: number | null,
  count: number,
  config: RankingConfig = DEFAULT_RANKING,
): number {
  const n = Math.max(0, count);
  const avg = average ?? config.priorMean;
  return (
    (config.priorWeight * config.priorMean + n * avg) / (config.priorWeight + n)
  );
}

export function qualityScore(
  average: number | null,
  count: number,
  config: RankingConfig = DEFAULT_RANKING,
): number {
  const bayes = (bayesianRating(average, count, config) - 1) / 4;
  const volume = Math.min(1, Math.log(1 + Math.max(0, count)) / Math.log(21));
  return clamp01(0.7 * bayes + 0.3 * volume);
}

export function popularityScore(
  adopters: number,
  views: number,
  config: RankingConfig = DEFAULT_RANKING,
): number {
  const raw = 1 + config.adopterWeight * adopters + config.viewWeight * views;
  return clamp01(Math.log(raw) / Math.log(501));
}

export function freshnessScore(
  ageDays: number,
  config: RankingConfig = DEFAULT_RANKING,
): number {
  return Math.exp(
    (-Math.LN2 * Math.max(0, ageDays)) / config.freshnessHalfLifeDays,
  );
}

export function verificationScore(
  listingReviewed: boolean,
  creatorVerified: boolean,
) {
  return (listingReviewed ? 0.6 : 0) + (creatorVerified ? 0.4 : 0);
}

export function recommendedScore(
  signals: {
    quality: number;
    popularity: number;
    freshness: number;
    verification: number;
    personal?: number;
  },
  config: RankingConfig = DEFAULT_RANKING,
  personalized = false,
): number {
  const w = effectiveRecommended(config, personalized);
  return (
    w.quality * signals.quality +
    w.popularity * signals.popularity +
    w.freshness * signals.freshness +
    w.verification * signals.verification +
    w.personal * (signals.personal ?? 0)
  );
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
