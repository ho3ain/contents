/**
 * Sprint 2 — presentation helpers for the buyer journey.
 *
 * The SERVER decides every status, stage, progress figure and next action
 * (backend `buyer-journey/journey-state.ts`). This module only maps those
 * facts to localized copy, semantic colors and routes — it never derives,
 * guesses or "improves" a state.
 */
import type {
  BuyerContract,
  JourneyStatus,
  NextActionCode,
  ProductJourneyView,
  RecommendationReasonCode,
  SetupState,
  SetupStepKind,
  SetupStepStatus,
  SetupStepView,
} from '../api/types';
import type { BadgeDot, BadgeTone } from '../components/ui/Badge';
import { t, tHas } from '../i18n';
import { formatCount } from './format';

// ------------------------------------------------------------------ status

/** One consistent semantic color per status, everywhere it is shown. */
const STATUS_TONE: Record<JourneyStatus, { tone: BadgeTone; dot?: BadgeDot }> = {
  purchased: { tone: 'info' },
  delivery_pending: { tone: 'warning' },
  ready: { tone: 'accent' },
  setup_in_progress: { tone: 'accent', dot: 'warning' },
  active: { tone: 'success' },
  first_value: { tone: 'success', dot: 'success' },
  needs_attention: { tone: 'danger', dot: 'danger' },
  updated: { tone: 'info', dot: 'success' },
  suspended: { tone: 'neutral', dot: 'danger' },
  refunded: { tone: 'neutral' },
};

export function statusTone(status: JourneyStatus): { tone: BadgeTone; dot?: BadgeDot } {
  return STATUS_TONE[status] ?? { tone: 'neutral' };
}

export function statusLabel(status: JourneyStatus): string {
  return tHas(`jrn.status.${status}`) ? t(`jrn.status.${status}`) : status;
}

/** One sentence: what this status means for the buyer (truthful wording). */
export function statusMeaning(status: JourneyStatus): string {
  return tHas(`jrn.statusHint.${status}`) ? t(`jrn.statusHint.${status}`) : '';
}

// ------------------------------------------------------------- next action

export type WorkspaceTab = 'overview' | 'setup' | 'docs' | 'delivery' | 'updates' | 'support' | 'reviews';

export const WORKSPACE_TABS: WorkspaceTab[] = ['overview', 'setup', 'docs', 'delivery', 'updates', 'support', 'reviews'];

export function isWorkspaceTab(value: string | undefined): value is WorkspaceTab {
  return Boolean(value) && (WORKSPACE_TABS as string[]).includes(value as string);
}

export function workspacePath(id: string, tab?: WorkspaceTab): string {
  return tab && tab !== 'overview' ? `/buyer/products/${id}/${tab}` : `/buyer/products/${id}`;
}

/** Which workspace tab a next action lives in. */
export function nextActionTab(code: NextActionCode): WorkspaceTab {
  switch (code) {
    case 'confirm_delivery':
      return 'delivery';
    case 'start_setup':
    case 'continue_setup':
    case 'complete_setup':
    case 'resolve_attention':
      return 'setup';
    case 'review_update':
      return 'updates';
    case 'write_review':
      return 'reviews';
    default:
      return 'overview';
  }
}

export function nextActionLabel(code: NextActionCode): string {
  return t(`jrn.next.${code}.cta`);
}

export function nextActionTitle(code: NextActionCode): string {
  return t(`jrn.next.${code}.title`);
}

export function nextActionHint(code: NextActionCode): string {
  return t(`jrn.next.${code}.hint`);
}

/** Card CTA route: straight to the tab where the next action happens. */
export function productCtaPath(view: Pick<ProductJourneyView, 'id' | 'nextAction'>): string {
  return workspacePath(view.id, nextActionTab(view.nextAction.code));
}

// ----------------------------------------------------------- buyer library

/**
 * Next actions that BLOCK the buyer's progress (something is waiting on
 * them). `report_first_value`, `write_review` and `open_product` are soft
 * nudges — they never earn the «continue from here» panel on their own.
 */
const PENDING_ACTIONS: ReadonlySet<NextActionCode> = new Set<NextActionCode>([
  'confirm_delivery',
  'start_setup',
  'continue_setup',
  'complete_setup',
  'resolve_attention',
  'review_update',
]);

export function isPendingAction(code: NextActionCode): boolean {
  return PENDING_ACTIONS.has(code);
}

/**
 * Whether the Library's focus panel should be shown for the server-chosen
 * «continue» item: only while a real action is open. The server already
 * excludes refunded / suspended / fully-done products.
 */
export function deservesFocus(view: Pick<ProductJourneyView, 'nextAction' | 'status'> | null): view is ProductJourneyView {
  if (!view) return false;
  if (view.status === 'refunded' || view.status === 'suspended') return false;
  return view.nextAction.code !== 'none' && view.nextAction.code !== 'open_product';
}

export interface ProductRowAction {
  label: string;
  /** Visual weight: pending actions are primary, the rest are quiet. */
  primary: boolean;
  /** `link` navigates; `confirm` opens the delivery-confirmation dialog in place. */
  kind: 'link' | 'confirm';
  /** Destination for `link` actions (also the fallback for `confirm`). */
  to: string;
}

export interface ProductRowActionOptions {
  /**
   * How a row exposes `confirm_delivery`:
   * - `track`   — navigate to the delivery tab («پیگیری دریافت»). Used where
   *               another element already owns the confirm CTA (Library focus panel).
   * - `confirm` — open the confirmation dialog in place («تأیید دریافت»). Used by
   *               the management list (/buyer/products) where the row is the only CTA.
   */
  delivery: 'track' | 'confirm';
}

/**
 * The ONE action a Product Row offers for a journey view, decided from the
 * server's `nextAction` (single source of truth, same as the workspace).
 * Labels: «تأیید دریافت / پیگیری دریافت / شروع|ادامه|نهایی‌کردن راه‌اندازی /
 * بررسی مشکل / دیدن تغییرات / بازکردن محصول / ثبت نظر / مشاهده جزئیات».
 * Refunded/suspended rows only ever offer details — there is no access to open.
 */
export function productRowAction(
  view: Pick<ProductJourneyView, 'id' | 'nextAction' | 'status'>,
  options: ProductRowActionOptions = { delivery: 'track' },
): ProductRowAction {
  const { code } = view.nextAction;
  if (view.status === 'refunded' || view.status === 'suspended') {
    return { label: t('jrn.lib.row.details'), to: workspacePath(view.id), primary: false, kind: 'link' };
  }
  switch (code) {
    case 'confirm_delivery':
      return options.delivery === 'confirm'
        ? { label: t('jrn.lib.confirm.cta'), to: workspacePath(view.id, 'delivery'), primary: true, kind: 'confirm' }
        : { label: t('jrn.lib.row.track'), to: workspacePath(view.id, 'delivery'), primary: true, kind: 'link' };
    case 'start_setup':
    case 'continue_setup':
    case 'complete_setup':
    case 'resolve_attention':
    case 'review_update':
      return { label: nextActionLabel(code), to: productCtaPath(view), primary: true, kind: 'link' };
    case 'write_review':
      return { label: t('jrn.lib.row.review'), to: workspacePath(view.id, 'reviews'), primary: false, kind: 'link' };
    case 'report_first_value':
    case 'open_product':
      return { label: t('jrn.lib.row.open'), to: workspacePath(view.id), primary: false, kind: 'link' };
    case 'none':
    default:
      return { label: t('jrn.lib.row.details'), to: workspacePath(view.id), primary: false, kind: 'link' };
  }
}

/** @deprecated alias kept for the Library; prefer `productRowAction`. */
export const libraryRowAction = (view: Pick<ProductJourneyView, 'id' | 'nextAction' | 'status'>): ProductRowAction =>
  productRowAction(view, { delivery: 'track' });

/**
 * Delivery confirmation is only meaningful before the buyer has attested
 * receipt, on a live entitlement. Mirrors the server guard
 * (`confirmDelivery`: active entitlement + `delivery_confirmed_at IS NULL`).
 */
export function canConfirmDelivery(view: Pick<ProductJourneyView, 'status' | 'milestones' | 'nextAction'>): boolean {
  return (
    view.nextAction.code === 'confirm_delivery' &&
    !view.milestones.deliveryConfirmedAt &&
    view.status !== 'refunded' &&
    view.status !== 'suspended'
  );
}

/** Setup progress is only worth showing while the buyer is inside setup. */
export function showsSetupProgress(view: Pick<ProductJourneyView, 'setup' | 'status'>): boolean {
  return (
    view.setup.progress.total > 0 &&
    view.setup.state !== 'completed' &&
    ['ready', 'setup_in_progress', 'needs_attention', 'updated'].includes(view.status)
  );
}

// ------------------------------------------------------------------- setup

export function setupStateLabel(state: SetupState): string {
  return t(`jrn.setupState.${state}`);
}

export function stepStatusLabel(status: SetupStepStatus): string {
  return t(`jrn.stepStatus.${status}`);
}

export function stepKindLabel(kind: SetupStepKind): string {
  return t(`jrn.stepKind.${kind}`);
}

/** Creator-written text wins; generic steps (`configure`, `test`) are localized. */
export function stepTitle(step: Pick<SetupStepView, 'key' | 'title'>): string {
  if (step.title) return step.title;
  return tHas(`jrn.step.${step.key}.title`) ? t(`jrn.step.${step.key}.title`) : step.key;
}

export function stepDescription(step: Pick<SetupStepView, 'key' | 'description'>): string | null {
  if (step.description) return step.description;
  return tHas(`jrn.step.${step.key}.desc`) ? t(`jrn.step.${step.key}.desc`) : null;
}

export const STEP_TONE: Record<SetupStepStatus, BadgeTone> = {
  pending: 'neutral',
  in_progress: 'accent',
  completed: 'success',
  skipped: 'neutral',
  blocked: 'danger',
};

/** Moves offered per status — the server re-validates every one of them. */
export const STEP_MOVES: Record<SetupStepStatus, SetupStepStatus[]> = {
  pending: ['in_progress', 'completed', 'skipped', 'blocked'],
  in_progress: ['completed', 'skipped', 'blocked', 'pending'],
  blocked: ['in_progress', 'completed', 'skipped', 'pending'],
  completed: ['in_progress', 'pending'],
  skipped: ['in_progress', 'completed', 'pending'],
};

// --------------------------------------------------------------- durations

/** «۳ ساعت» / «۲ روز» — one, human-sized unit. `null` ⇒ no figure (never «0»). */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return t('jrn.duration.lessThanMinute');
  const minutes = Math.round(s / 60);
  if (minutes < 60) return t('jrn.duration.minutes', { n: formatCount(minutes) });
  const hours = Math.round(s / 3600);
  if (hours < 48) return t('jrn.duration.hours', { n: formatCount(hours) });
  return t('jrn.duration.days', { n: formatCount(Math.round(s / 86400)) });
}

// --------------------------------------------------------------- contract

/** Localized label of a declared product-model option (type, delivery …). */
export function contractOption(group: 'type' | 'delivery' | 'execution' | 'hosting' | 'supportOwner', value: string | null): string | null {
  if (!value) return null;
  const key = `product.${group}.${value}`;
  return tHas(key) ? t(key) : value;
}

/** Declared facts worth showing in the workspace; empty ones are dropped. */
export function contractFacts(contract: BuyerContract): Array<{ key: string; label: string; value: string }> {
  const rows: Array<{ key: string; label: string; value: string | null }> = [
    { key: 'type', label: t('product.typeLabel'), value: contractOption('type', contract.productType) },
    { key: 'delivery', label: t('product.deliveryLabel'), value: contractOption('delivery', contract.deliveryModel) },
    { key: 'execution', label: t('product.executionLabel'), value: contractOption('execution', contract.executionModel) },
    { key: 'hosting', label: t('product.hostingLabel'), value: contractOption('hosting', contract.hostingResponsibility) },
    { key: 'infra', label: t('jrn.contract.infrastructure'), value: contract.infrastructureNeeds },
    { key: 'supportOwner', label: t('product.supportOwnerLabel'), value: contractOption('supportOwner', contract.supportOwner) },
    { key: 'supportScope', label: t('product.supportScopeLabel'), value: contract.supportScope },
    { key: 'supportPeriod', label: t('jrn.contract.supportPeriod'), value: contract.supportPeriod },
  ];
  return rows.filter((row): row is { key: string; label: string; value: string } => Boolean(row.value));
}

// --------------------------------------------------------- recommendations

/** «چون Onboardflow را خریدید…» — the explanation is part of the contract. */
export function recommendationReason(reason: { code: RecommendationReasonCode; name: string | null }): string {
  const key = reason.code === 'goal' && !reason.name ? 'jrn.reco.goalWork' : `jrn.reco.${reason.code}`;
  const name = reason.name ?? '';
  if (!tHas(key)) return t('jrn.reco.generic');
  return t(key, { name });
}

// ---------------------------------------------------------- notifications

/** Buyer-journey deep links that have their own CTA label. */
export function journeyLinkLabel(link: string | null): string | null {
  if (!link) return null;
  if (/^\/buyer\/products\/[^/]+\/setup/.test(link)) return t('jrn.cta.setup');
  if (/^\/buyer\/products\/[^/]+\/reviews/.test(link)) return t('jrn.cta.review');
  if (/^\/buyer\/products\/[^/]+\/updates/.test(link)) return t('jrn.cta.updates');
  if (/^\/buyer\/products\/[^/]+\/support/.test(link)) return t('jrn.cta.support');
  if (/^\/buyer\/products\/[^/]+/.test(link)) return t('jrn.cta.workspace');
  if (link.startsWith('/buyer/products')) return t('jrn.cta.products');
  return null;
}

/** «Order», «Product»… — the record a notification is about (server-provided). */
export function relatedLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return tHas(`jrn.related.${type}`) ? t(`jrn.related.${type}`) : null;
}

/** Human name of a notification type for the type filter. */
export function notificationTypeLabel(type: string): string {
  return tHas(`jrn.notifType.${type}`) ? t(`jrn.notifType.${type}`) : t('jrn.notifType.other');
}
