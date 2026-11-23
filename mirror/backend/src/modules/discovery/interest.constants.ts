/**
 * Buyer interest profile (M11) — the ONLY place the weights live.
 *
 * Score per category = Σ signal weight, where every stored score decays
 * exponentially with `INTEREST_HALF_LIFE_DAYS` (applied on write and on
 * read), so old browsing fades and recent behaviour dominates. The profile
 * is a transparent, structured table — no model, no hidden state.
 */
export const INTEREST_HALF_LIFE_DAYS = 45;

/** A score at or above this counts as "full strength" for personalization. */
export const INTEREST_SATURATION = 10;

export const INTEREST_SIGNAL_WEIGHTS: Record<string, number> = {
  category_view: 2,
  use_case_view: 1.5,
  search_result_click: 1.5,
  product_view: 1,
  product_media_view: 0.5,
  creator_view: 0.5,
  product_saved: 4,
  product_unsaved: -3,
  category_followed: 5,
  category_unfollowed: -4,
  creator_followed: 2,
  creator_unfollowed: -1.5,
  agent_followed: 3,
  agent_unfollowed: -2,
  checkout_started: 4,
  purchase_completed: 8,
  search: 1,
  // Sprint 2 — real post-purchase outcomes are the strongest interest signal.
  first_value: 3,
  review_submitted: 1,
};

/** Domains shown to the buyer are the catalog categories themselves. */
export const INTEREST_TOP_N = 6;
