/**
 * M12 — the catalogue of buyer behaviour events (recommendation foundation).
 *
 * Events are facts ("this buyer/visitor did X to Y"), never conclusions.
 * A future recommender reads: User + Behaviour (buyer_events) + Interests
 * (buyer_interest_scores) + Product metadata (agents) + Quality (reviews).
 */
export const BUYER_EVENT_TYPES = [
  'marketplace_view',
  'search',
  'search_result_click',
  'filter_used',
  'sort_used',
  'category_view',
  'use_case_view',
  'product_view',
  'product_media_view',
  'creator_view',
  'product_saved',
  'product_unsaved',
  'creator_followed',
  'creator_unfollowed',
  'category_followed',
  'category_unfollowed',
  'agent_followed',
  'agent_unfollowed',
  'checkout_started',
  'purchase_completed',
  // Sprint 2 — the post-purchase activation journey. Every one of these is
  // written by the SERVER from the state change itself (except the three
  // UI-only interactions listed in CLIENT_EVENT_TYPES).
  'buyer_dashboard_viewed',
  'product_delivery_viewed',
  'delivery_confirmed',
  'setup_started',
  'setup_step_completed',
  'setup_completed',
  'first_run',
  'first_value',
  'review_requested',
  'review_submitted',
  'support_started',
  'refund_requested',
  'product_updated_viewed',
  'notification_opened',
  'recommendation_clicked',
  // Phase 10 — public comparison opened; a UI fact, not purchase intent.
  'product_comparison_viewed',
] as const;
export type BuyerEventType = (typeof BUYER_EVENT_TYPES)[number];

/**
 * Events the browser may report. The rest are written ONLY by the server
 * from the action itself (save, follow, checkout, purchase, product view),
 * so a client can never forge a purchase or a follow.
 */
export const CLIENT_EVENT_TYPES = [
  'marketplace_view',
  'search',
  'search_result_click',
  'filter_used',
  'sort_used',
  'category_view',
  'use_case_view',
  'product_media_view',
  'creator_view',
  // Sprint 2 — pure UI interactions (no state change to forge).
  'buyer_dashboard_viewed',
  'notification_opened',
  'recommendation_clicked',
  'product_comparison_viewed',
] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export interface BuyerEventInput {
  type: BuyerEventType;
  userId?: string | null;
  visitorKey?: string | null;
  agentId?: string | null;
  categoryId?: string | null;
  creatorId?: string | null;
  query?: string | null;
  resultCount?: number | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
  /** Same logical event ⇒ same key. Omit for state changes (save/follow). */
  dedupKey?: string | null;
  occurredAt?: Date;
}
