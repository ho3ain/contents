import type {
  AgentStatus,
  FeedbackCategory,
  FeedbackSection,
  FeedbackSeverity,
  FeedbackStatus,
  ReadinessView,
  ReviewFeedback,
  ReviewState,
  ReviewSubmission,
  ReviewTimelineEvent,
  RevisionChange,
} from '../api/types';
import type { IconName } from '../components/ui/AppIcon';
import { t, tHas } from '../i18n';

/**
 * Phase A3 — the review workflow's presentation rules, in ONE place.
 *
 * Every screen (wizard, success page, Review Center, dashboard card, admin
 * queue/workspace) reads labels, tones, icons and "what happens next" from
 * here, so a state can never look different in two places (§11, §40).
 * The server is the source of truth for the state itself; this module only
 * decides how to present it.
 */

// ---- States (§3, §4, §11) ------------------------------------------------------

export type ReviewTone = 'neutral' | 'info' | 'accent' | 'warning' | 'success' | 'danger';

export const REVIEW_STATES: ReviewState[] = [
  'submitted',
  'under_review',
  'action_required',
  'resubmitted',
  'approved',
  'ready_to_publish',
  'published',
  'rejected',
];

/** Semantic tone per state — colour is never the only signal (icon + text too). */
const STATE_TONE: Record<ReviewState | 'draft', ReviewTone> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'accent',
  action_required: 'warning',
  resubmitted: 'info',
  approved: 'success',
  ready_to_publish: 'success',
  published: 'success',
  rejected: 'danger',
};

/** Typed icon per state — decorative; the label carries the meaning. */
const STATE_ICON: Record<ReviewState | 'draft', IconName> = {
  draft: 'edit',
  submitted: 'send',
  under_review: 'review',
  action_required: 'alertCircle',
  resubmitted: 'refreshCw',
  approved: 'checkCircle',
  ready_to_publish: 'checkCircle',
  published: 'publish',
  rejected: 'xCircle',
};

export interface ReviewStateInfo {
  state: ReviewState | 'draft';
  label: string;
  tone: ReviewTone;
  icon: IconName;
  /** §2 Q1/Q2 — where the product is and what is being reviewed. */
  explanation: string;
  /** §2 Q3 — is something required from the creator? */
  actionRequired: boolean;
  /** §2 Q5 — what happens next. */
  next: string;
}

export function isReviewState(value: unknown): value is ReviewState {
  return typeof value === 'string' && (REVIEW_STATES as string[]).includes(value);
}

export function reviewStateInfo(state: ReviewState | 'draft'): ReviewStateInfo {
  return {
    state,
    label: t(`rv.state.${state}`),
    tone: STATE_TONE[state] ?? 'neutral',
    icon: STATE_ICON[state] ?? 'circle',
    explanation: t(`rv.state.${state}.explain`),
    actionRequired: state === 'action_required' || state === 'draft',
    next: t(`rv.state.${state}.next`),
  };
}

/**
 * The review state implied by a listing status (for lists that only know
 * the agent row). `changes_requested` IS action_required (A3 decision 3).
 */
export function reviewStateFromAgent(status: AgentStatus | string): ReviewState | 'draft' | null {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'changes_requested':
      return 'action_required';
    case 'submitted':
    case 'under_review':
    case 'resubmitted':
    case 'approved':
    case 'ready_to_publish':
    case 'published':
    case 'rejected':
      return status;
    default:
      return null;
  }
}

/** States in which the reviewer is working and the creator just waits. */
export const AWAITING_STATES: ReviewState[] = ['submitted', 'under_review', 'resubmitted'];

// ---- Feedback (§13–§17, §22) -------------------------------------------------

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  'product_information',
  'product_type',
  'delivery_model',
  'runtime_model',
  'security',
  'permissions',
  'data_policy',
  'integrations',
  'requirements',
  'pricing',
  'marketplace_quality',
  'content_claims',
  'technical',
  'other',
];

export const FEEDBACK_SEVERITIES: FeedbackSeverity[] = ['required', 'important', 'suggestion'];

export const FEEDBACK_SECTIONS: FeedbackSection[] = [
  'basics',
  'audience',
  'how',
  'capabilities',
  'requirements',
  'delivery',
  'data',
  'pricing',
  'media',
];

/** Mirrors the backend DEFAULT_SECTION — where a category is fixed in the wizard. */
export const CATEGORY_SECTION: Record<FeedbackCategory, FeedbackSection> = {
  product_information: 'basics',
  product_type: 'basics',
  delivery_model: 'delivery',
  runtime_model: 'delivery',
  security: 'data',
  permissions: 'data',
  data_policy: 'data',
  integrations: 'requirements',
  requirements: 'requirements',
  pricing: 'pricing',
  marketplace_quality: 'media',
  content_claims: 'basics',
  technical: 'how',
  other: 'basics',
};

export const SEVERITY_TONE: Record<FeedbackSeverity, ReviewTone> = {
  required: 'danger',
  important: 'warning',
  suggestion: 'neutral',
};

export const FEEDBACK_STATUS_TONE: Record<FeedbackStatus, ReviewTone> = {
  open: 'warning',
  resolved_by_creator: 'info',
  accepted: 'success',
  needs_more_changes: 'danger',
};

export function categoryLabel(category: string): string {
  return tHas(`rv.cat.${category}`) ? t(`rv.cat.${category}`) : category;
}

export function severityLabel(severity: FeedbackSeverity): string {
  return t(`rv.sev.${severity}`);
}

/** Creator-facing: باز / اصلاح‌شده / تأییدشده (§16) + «نیاز به اصلاح بیشتر». */
export function feedbackStatusLabel(status: FeedbackStatus): string {
  return t(`rv.fstatus.${status}`);
}

/** §17 contextual CTA — «اصلاح سیاست داده», «اصلاح مدل اجرا», … */
export function feedbackCtaLabel(item: Pick<ReviewFeedback, 'category'>): string {
  return t(`rv.cta.${item.category}`);
}

/** Deep link to the exact wizard step (and the item, so it is highlighted). */
export function feedbackFixHref(agentId: string, item: Pick<ReviewFeedback, 'id' | 'affectedSection'>): string {
  return `/creator/agents/${agentId}/edit?step=${item.affectedSection}&feedback=${item.id}`;
}

/** Items the creator still has to act on. */
export function isOpenForCreator(status: FeedbackStatus): boolean {
  return status === 'open' || status === 'needs_more_changes';
}

/** Mirrors backend blocksResubmission — required items not yet answered. */
export function blocksResubmission(item: Pick<ReviewFeedback, 'severity' | 'status'>): boolean {
  return item.severity === 'required' && isOpenForCreator(item.status);
}

/** Mirrors backend blocksApproval — only the reviewer's «accepted» unlocks. */
export function blocksApproval(item: Pick<ReviewFeedback, 'severity' | 'status'>): boolean {
  return item.severity === 'required' && item.status !== 'accepted';
}

const SEVERITY_ORDER: Record<FeedbackSeverity, number> = { required: 0, important: 1, suggestion: 2 };
const STATUS_ORDER: Record<FeedbackStatus, number> = {
  needs_more_changes: 0,
  open: 1,
  resolved_by_creator: 2,
  accepted: 3,
};

/** Most urgent first: needs-more-changes/open, then severity, then age. */
export function sortFeedback<T extends Pick<ReviewFeedback, 'severity' | 'status' | 'createdAt'>>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

// ---- Versions / revisions (§18–§20) ----------------------------------------

/** «نسخه 0.1.0 · بازبینی 2» */
export function revisionLabel(submission: Pick<ReviewSubmission, 'versionLabel' | 'revisionNumber'>): string {
  return t('rv.revisionLabel', { version: submission.versionLabel, revision: submission.revisionNumber });
}

export function fieldLabel(field: string): string {
  return tHas(`rv.field.${field}`) ? t(`rv.field.${field}`) : field;
}

/** «توضیح کامل به‌روزرسانی شد» — the structured change summary (§20). */
export function changeLabel(change: RevisionChange): string {
  return t(`rv.change.${change.kind}`, { field: fieldLabel(change.field) });
}

/** Changes grouped by wizard section, in wizard order. */
export function groupChanges(changes: RevisionChange[]): Array<{ section: FeedbackSection; changes: RevisionChange[] }> {
  return FEEDBACK_SECTIONS.map((section) => ({
    section,
    changes: changes.filter((change) => change.section === section),
  })).filter((group) => group.changes.length > 0);
}

// ---- Journey (§9 success-page timeline, §19 history) ------------------------

export type JourneyStepState = 'done' | 'current' | 'todo' | 'skipped' | 'failed';
export interface JourneyStep {
  key: 'prepare' | 'submit' | 'review' | 'fixes' | 'approve' | 'publish';
  state: JourneyStepState;
}

/**
 * The six-step journey of §9 («آماده‌سازی محصول ✓ ارسال برای بررسی ✓ ●
 * بررسی Mesh ○ اصلاحات احتمالی ○ تأیید ○ انتشار»), derived from the REAL
 * current state (plus whether a change round ever happened).
 */
export function journeySteps(state: ReviewState | 'draft', hadChangeRound: boolean): JourneyStep[] {
  const fixes: JourneyStepState = hadChangeRound ? 'done' : 'skipped';
  const make = (
    prepare: JourneyStepState,
    submit: JourneyStepState,
    review: JourneyStepState,
    fix: JourneyStepState,
    approve: JourneyStepState,
    publish: JourneyStepState,
  ): JourneyStep[] => [
    { key: 'prepare', state: prepare },
    { key: 'submit', state: submit },
    { key: 'review', state: review },
    { key: 'fixes', state: fix },
    { key: 'approve', state: approve },
    { key: 'publish', state: publish },
  ];
  switch (state) {
    case 'draft':
      return make('current', 'todo', 'todo', 'todo', 'todo', 'todo');
    case 'submitted':
    case 'under_review':
      return make('done', 'done', 'current', hadChangeRound ? 'done' : 'todo', 'todo', 'todo');
    case 'resubmitted':
      return make('done', 'done', 'current', 'done', 'todo', 'todo');
    case 'action_required':
      return make('done', 'done', 'done', 'current', 'todo', 'todo');
    case 'approved':
    case 'ready_to_publish':
      return make('done', 'done', 'done', fixes, 'done', 'current');
    case 'published':
      return make('done', 'done', 'done', fixes, 'done', 'done');
    case 'rejected':
      return make('done', 'done', 'done', fixes, 'failed', 'todo');
    default:
      return make('done', 'done', 'current', 'todo', 'todo', 'todo');
  }
}

/** Timeline events the creator is shown, newest last, with Persian labels. */
export function timelineLabel(event: ReviewTimelineEvent): string {
  return tHas(`rv.event.${event.event}`) ? t(`rv.event.${event.event}`) : event.event;
}

// ---- Submission readiness gate (§6) ------------------------------------------

export type GateArea =
  | 'basics'
  | 'product_type'
  | 'delivery'
  | 'runtime'
  | 'capabilities'
  | 'limitations'
  | 'pricing'
  | 'security'
  | 'data_policy'
  | 'creator'
  | 'preview';

export const GATE_AREAS: GateArea[] = [
  'basics',
  'product_type',
  'delivery',
  'runtime',
  'capabilities',
  'limitations',
  'pricing',
  'security',
  'data_policy',
  'creator',
  'preview',
];

/** Readiness item → §6 area. Unknown keys fall back by wizard section. */
const ITEM_AREA: Record<string, GateArea> = {
  name: 'basics',
  description: 'basics',
  category: 'basics',
  inputs: 'basics',
  outputs: 'basics',
  example_output: 'basics',
  product_type: 'product_type',
  build_tool: 'delivery',
  delivery_model: 'delivery',
  buyer_receives: 'delivery',
  execution_model: 'runtime',
  hosting_responsibility: 'runtime',
  capabilities: 'capabilities',
  limitations: 'limitations',
  pricing: 'pricing',
  permissions: 'security',
  integrations: 'security',
  data_policy: 'data_policy',
  data_retention: 'data_policy',
  data_stored_what: 'data_policy',
  data_third_parties: 'data_policy',
  data_sensitive_categories: 'data_policy',
};

const SECTION_AREA: Record<string, GateArea> = {
  basics: 'basics',
  audience: 'basics',
  how: 'basics',
  capabilities: 'capabilities',
  requirements: 'security',
  delivery: 'delivery',
  data: 'data_policy',
  pricing: 'pricing',
  media: 'basics',
};

export interface GateRow {
  area: GateArea;
  passed: boolean;
  /** Blocking rows stop the submit; `preview` is advisory. */
  blocking: boolean;
  /** Failed readiness keys in this area (first one is the CTA target). */
  failedKeys: string[];
  /** Wizard section to jump to (null for creator / preview). */
  section: FeedbackSection | null;
}

/**
 * §6 «آمادگی برای ارسال» — the server readiness engine's REQUIRED items
 * grouped into the spec's 11 areas, plus the creator profile and preview.
 */
export function readinessGate(
  readiness: ReadinessView | null,
  options: { creatorApproved: boolean | null; previewSeen: boolean },
): GateRow[] {
  const required = (readiness?.items ?? []).filter((item) => item.level === 'required');
  return GATE_AREAS.map((area) => {
    if (area === 'creator') {
      return {
        area,
        passed: options.creatorApproved !== false,
        blocking: true,
        failedKeys: options.creatorApproved === false ? ['creator_profile'] : [],
        section: null,
      };
    }
    if (area === 'preview') {
      return { area, passed: options.previewSeen, blocking: false, failedKeys: [], section: null };
    }
    const inArea = required.filter((item) => (ITEM_AREA[item.key] ?? SECTION_AREA[item.section]) === area);
    const failed = inArea.filter((item) => !item.passed);
    return {
      area,
      passed: failed.length === 0,
      blocking: true,
      failedKeys: failed.map((item) => item.key),
      section: (failed[0]?.section ?? inArea[0]?.section ?? null) as FeedbackSection | null,
    };
  });
}

const PREVIEW_KEY = 'mesh.previewSeen.';

/** The creator opened «Preview as buyer» for this product (per device). */
export function markPreviewSeen(agentId: string): void {
  try {
    window.localStorage.setItem(`${PREVIEW_KEY}${agentId}`, new Date().toISOString());
  } catch {
    /* storage unavailable — advisory only */
  }
}

export function wasPreviewSeen(agentId: string | null): boolean {
  if (!agentId) return false;
  try {
    return Boolean(window.localStorage.getItem(`${PREVIEW_KEY}${agentId}`));
  } catch {
    return false;
  }
}
