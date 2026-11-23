/**
 * Phase C1 — creator lifecycle events (spec §11 Tracking, §13 Timeline).
 *
 * "Timeline باید Eventهای مهم را از سیستم‌های موجود جمع کند. نباید فقط
 *  Eventهای مصنوعی frontend باشند."
 *
 * So every event name below is emitted by a REAL server-side transition:
 *   - `creator.registered`           ← auth.register()
 *   - `creator.onboarding_completed` ← creator onboarding completion
 *   - `creator.product_started`      ← creator-agents.create()
 *   - `creator.product_submitted`    ← review-workflow.submit()
 *   - `creator.revision_requested`   ← review-workflow.requestChanges()
 *   - `creator.resubmitted`          ← review-workflow.resubmit()
 *   - `creator.product_approved`     ← review-workflow.approve()
 *   - `creator.product_published`    ← admin/creator publish
 *   - `creator.product_shared`       ← analytics share beacon
 *   - `creator.first_sale`           ← a confirmed payment
 *   - `creator.second_product_started`← the creator's 2nd agents row
 *   - `creator.revenue_event`        ← a paid / refunded transaction
 *   - `creator.email_sent`           ← the existing email service
 *   - `creator.login`                ← auth.login()
 *
 * The `crm.*` events are the ones the growth team itself produces (outreach,
 * notes, stage/owner changes) and are always audited as well.
 *
 * The naming is the automation seam of §15: `creator.registered` is exactly
 * what a future "Welcome Sequence" would subscribe to. Nothing in this
 * module triggers marketing; it only guarantees the facts are recorded
 * under stable names.
 */

export const CREATOR_EVENTS = {
  // ---- system-derived (real transitions only) ----
  SIGNUP: 'creator.registered',
  LOGIN: 'creator.login',
  ONBOARDING_COMPLETED: 'creator.onboarding_completed',
  CREATOR_PROFILE_CREATED: 'creator.profile_created',
  PRODUCT_STARTED: 'creator.product_started',
  PRODUCT_UPDATED: 'creator.product_updated',
  PRODUCT_SUBMITTED: 'creator.product_submitted',
  REVISION_REQUESTED: 'creator.revision_requested',
  RESUBMITTED: 'creator.resubmitted',
  PRODUCT_APPROVED: 'creator.product_approved',
  PRODUCT_PUBLISHED: 'creator.product_published',
  PRODUCT_SHARED: 'creator.product_shared',
  FIRST_SALE: 'creator.first_sale',
  SECOND_PRODUCT_STARTED: 'creator.second_product_started',
  REVENUE_EVENT: 'creator.revenue_event',
  EMAIL_SENT: 'creator.email_sent',

  // ---- Phase C4: Creator Success --------------------------------------
  // §29 requires C4's events to match the existing analytics naming, so they
  // live in this ledger under the same `creator.` namespace rather than in a
  // parallel table. `creator.first_sale` above is the C4 §2 signal itself and
  // is deliberately NOT redefined: payments.service.ts already records it
  // exactly once, and a C4-specific twin would double-count the milestone.
  FIRST_SALE_VIEWED: 'creator.first_sale_viewed',
  FIRST_SALE_CTA_CLICKED: 'creator.first_sale_cta_clicked',
  REVIEW_REQUEST_SENT: 'creator.review_request_sent',
  REVIEW_STARTED: 'creator.review_started',
  REVIEW_SUBMITTED: 'creator.review_submitted',
  REVIEW_RESPONSE_ADDED: 'creator.review_response_added',
  OPTIMIZATION_VIEWED: 'creator.optimization_viewed',
  OPTIMIZATION_APPLIED: 'creator.optimization_applied',
  OPTIMIZATION_DISMISSED: 'creator.optimization_dismissed',
  CASE_STUDY_INVITED: 'creator.case_study_invited',
  CASE_STUDY_STARTED: 'creator.case_study_started',
  CASE_STUDY_SUBMITTED: 'creator.case_study_submitted',
  CASE_STUDY_PUBLISHED: 'creator.case_study_published',
  REFERRAL_LINK_CREATED: 'creator.referral_link_created',
  REFERRAL_LINK_SHARED: 'creator.referral_link_shared',
  REFERRAL_REGISTERED: 'creator.referral_registered',
  REFERRAL_PRODUCT_CREATED: 'creator.referral_product_created',
  REFERRAL_FIRST_SALE: 'creator.referral_first_sale',
  SECOND_PRODUCT_PUBLISHED: 'creator.second_product_published',

  // ---- Phase C5: SCALE -----------------------------------------------
  // §40 asks for a standard event list across five subsystems. They live in
  // this shared ledger, not in a C5 table: C5 measures the SAME creator
  // growth that C1–C4 already measure, and a second ledger would make the
  // funnel disagree with itself.
  REFERRAL_LINK_VIEWED: 'creator.referral_link_viewed',
  REFERRAL_BUYER_SIGNUP: 'creator.referral_buyer_signup',
  REFERRAL_ACTIVATION: 'creator.referral_activation',
  REFERRAL_BUYER_CONVERSION: 'creator.referral_conversion',
  REFERRAL_REWARD_CREATED: 'creator.referral_reward_created',
  AMBASSADOR_INVITED: 'creator.ambassador_invited',
  AMBASSADOR_ACCEPTED: 'creator.ambassador_accepted',
  AMBASSADOR_DECLINED: 'creator.ambassador_declined',
  AMBASSADOR_SHARE: 'creator.ambassador_share',
  AFFILIATE_APPLIED: 'creator.affiliate_applied',
  AFFILIATE_APPROVED: 'creator.affiliate_approved',
  AFFILIATE_REJECTED: 'creator.affiliate_rejected',
  AFFILIATE_CONVERSION: 'creator.affiliate_conversion',
  PARTNERSHIP_CREATED: 'creator.partnership_created',
  PARTNERSHIP_CONVERTED: 'creator.partnership_converted',
  COMMUNITY_INVITED: 'creator.community_invited',
  COMMUNITY_JOINED: 'creator.community_joined',
  COMMUNITY_ENGAGED: 'creator.community_engaged',

  // ---- CRM / growth-team events (always audited) ----
  LEAD_CREATED: 'crm.lead_created',
  LEAD_UPDATED: 'crm.lead_updated',
  LEAD_MERGED: 'crm.lead_merged',
  LEAD_RESOLVED: 'crm.lead_resolved',
  OUTREACH: 'crm.outreach',
  // C2 §6 — the two halves of a conversation the system can evidence but
  // cannot infer. They are recorded by a human, and they are what moves a
  // lead from "contacted" to "replied" to "interested".
  REPLIED: 'crm.replied',
  INTERESTED: 'crm.interested',
  LOST: 'crm.lost',
  CONVERSION_INVITE_SENT: 'crm.conversion_invite_sent',
  NOTE_ADDED: 'crm.note_added',
  STAGE_CHANGED: 'crm.stage_changed',
  OWNER_CHANGED: 'crm.owner_changed',
  TAGS_CHANGED: 'crm.tags_changed',
  NEXT_ACTION_CREATED: 'crm.next_action_created',
  NEXT_ACTION_COMPLETED: 'crm.next_action_completed',
  ATTRIBUTION_CAPTURED: 'crm.attribution_captured',
  ATTRIBUTION_LINKED: 'crm.attribution_linked',
} as const;

export type CreatorEventName =
  (typeof CREATOR_EVENTS)[keyof typeof CREATOR_EVENTS];

export const CREATOR_EVENT_NAMES: readonly string[] =
  Object.values(CREATOR_EVENTS);

export function isCreatorEventName(value: unknown): value is CreatorEventName {
  return typeof value === 'string' && CREATOR_EVENT_NAMES.includes(value);
}

/**
 * Which system produced the event — surfaced in the timeline so a reader can
 * tell a real product transition from a note the team typed.
 */
export type CreatorEventSource = 'system' | 'crm' | 'email' | 'attribution';

export function eventSource(name: string): CreatorEventSource {
  if (name.startsWith('crm.')) return 'crm';
  if (name === 'creator.email_sent') return 'email';
  if (name.startsWith('crm.attribution')) return 'attribution';
  return 'system';
}

// ---------------------------------------------------------------------------
// The "kind" the admin UI groups by (spec §2 "Timeline Event Types").
// ---------------------------------------------------------------------------

export const TIMELINE_KINDS = [
  'lead',
  'signup',
  'login',
  'onboarding',
  'activation',
  'product',
  'review',
  'publish',
  'share',
  'sale',
  'revenue',
  'email',
  'outreach',
  'note',
  'stage',
  'owner',
  'action',
  'attribution',
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

/** Every event → the timeline bucket it renders in. */
export const EVENT_KIND: Record<string, TimelineKind> = {
  [CREATOR_EVENTS.LEAD_CREATED]: 'lead',
  [CREATOR_EVENTS.LEAD_UPDATED]: 'lead',
  [CREATOR_EVENTS.LEAD_MERGED]: 'lead',
  [CREATOR_EVENTS.LEAD_RESOLVED]: 'lead',
  [CREATOR_EVENTS.SIGNUP]: 'signup',
  [CREATOR_EVENTS.LOGIN]: 'login',
  [CREATOR_EVENTS.ONBOARDING_COMPLETED]: 'onboarding',
  [CREATOR_EVENTS.CREATOR_PROFILE_CREATED]: 'activation',
  [CREATOR_EVENTS.PRODUCT_STARTED]: 'product',
  [CREATOR_EVENTS.PRODUCT_UPDATED]: 'product',
  [CREATOR_EVENTS.SECOND_PRODUCT_STARTED]: 'product',
  [CREATOR_EVENTS.PRODUCT_SUBMITTED]: 'review',
  [CREATOR_EVENTS.REVISION_REQUESTED]: 'review',
  [CREATOR_EVENTS.RESUBMITTED]: 'review',
  [CREATOR_EVENTS.PRODUCT_APPROVED]: 'review',
  [CREATOR_EVENTS.PRODUCT_PUBLISHED]: 'publish',
  [CREATOR_EVENTS.PRODUCT_SHARED]: 'share',
  [CREATOR_EVENTS.FIRST_SALE]: 'sale',
  [CREATOR_EVENTS.REVENUE_EVENT]: 'revenue',
  [CREATOR_EVENTS.EMAIL_SENT]: 'email',
  [CREATOR_EVENTS.OUTREACH]: 'outreach',
  [CREATOR_EVENTS.REPLIED]: 'outreach',
  [CREATOR_EVENTS.INTERESTED]: 'outreach',
  [CREATOR_EVENTS.LOST]: 'stage',
  [CREATOR_EVENTS.CONVERSION_INVITE_SENT]: 'outreach',
  [CREATOR_EVENTS.NOTE_ADDED]: 'note',
  [CREATOR_EVENTS.STAGE_CHANGED]: 'stage',
  [CREATOR_EVENTS.OWNER_CHANGED]: 'owner',
  [CREATOR_EVENTS.TAGS_CHANGED]: 'action',
  [CREATOR_EVENTS.NEXT_ACTION_CREATED]: 'action',
  [CREATOR_EVENTS.NEXT_ACTION_COMPLETED]: 'action',
  [CREATOR_EVENTS.ATTRIBUTION_CAPTURED]: 'attribution',
  [CREATOR_EVENTS.ATTRIBUTION_LINKED]: 'attribution',
};

export function timelineKind(name: string): TimelineKind {
  return EVENT_KIND[name] ?? 'lead';
}

/**
 * The named automation hooks of §15. Listed explicitly (rather than derived
 * from the event constants) so the readiness report can state, per future
 * automation, exactly which event would trigger it.
 */
export const AUTOMATION_READY_EVENTS: ReadonlyArray<{
  event: CreatorEventName;
  futureAutomation: string;
}> = [
  { event: CREATOR_EVENTS.SIGNUP, futureAutomation: 'welcome_sequence' },
  {
    event: CREATOR_EVENTS.ONBOARDING_COMPLETED,
    futureAutomation: 'onboarding_nudge',
  },
  {
    event: CREATOR_EVENTS.PRODUCT_SUBMITTED,
    futureAutomation: 'submission_confirmation',
  },
  {
    event: CREATOR_EVENTS.REVISION_REQUESTED,
    futureAutomation: 'revision_reminder',
  },
  {
    event: CREATOR_EVENTS.PRODUCT_PUBLISHED,
    futureAutomation: 'launch_sequence',
  },
  {
    event: CREATOR_EVENTS.FIRST_SALE,
    futureAutomation: 'first_sale_celebration',
  },
  { event: CREATOR_EVENTS.REVENUE_EVENT, futureAutomation: 'revenue_digest' },
];
