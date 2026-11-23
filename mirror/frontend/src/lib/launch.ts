/**
 * Phase A4 — Launch & Growth presentation helpers (pure, unit-tested).
 *
 * Everything here derives from REAL server data: share links point at the
 * real public product page / share endpoint, quick-share targets are the
 * networks' public share URLs (no fake integrations, A4 §10), and labels
 * map server enums through i18n — never raw enum text.
 */
import type {
  AnalyticsMetrics,
  LaunchStepKey,
  PromotionStatus,
  PromotionType,
  PublishCheckItem,
  PublishCheckStatus,
  Recommendation,
  ShareChannel,
} from '../api/types';
import { env } from '../config/env';
import { apiOrigin } from '../api/client';
import { intlLocale, t, tHas } from '../i18n';
import { storage } from './storage';
import { formatCount, formatRating } from './format';
import type { IconName } from '../components/ui/AppIcon';

// ---- Links ------------------------------------------------------------------

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Canonical public product page (what buyers open). */
export function publicProductUrl(slug: string, src?: string): string {
  const base = `${trimSlash(env.publicSiteUrl)}/agents/${encodeURIComponent(slug)}`;
  return src ? `${base}?src=${encodeURIComponent(src)}` : base;
}

/**
 * Share link with a rich social preview: crawlers get the product's own
 * OG card from the API (`/api/v1/share/agents/:slug`), people are
 * redirected to the product page with `?src=<channel>` attribution.
 */
export function shareLinkUrl(slug: string, src: string): string {
  const origin = trimSlash(apiOrigin() || env.appUrl);
  return `${origin}/api/v1/share/agents/${encodeURIComponent(slug)}?src=${encodeURIComponent(src)}`;
}

export type QuickShareChannel = Extract<ShareChannel, 'linkedin' | 'x' | 'telegram' | 'whatsapp' | 'email'>;
export const QUICK_SHARE_CHANNELS: QuickShareChannel[] = ['telegram', 'whatsapp', 'linkedin', 'x', 'email'];

/**
 * Public share-intent URLs of each network (real, documented endpoints —
 * no API keys, no fake posting). The link embedded is the per-channel
 * share link so visits are attributed to the channel.
 */
export function quickShareHref(
  channel: QuickShareChannel,
  input: { slug: string; title: string; text: string },
): string {
  const url = shareLinkUrl(input.slug, channel);
  const enc = encodeURIComponent;
  switch (channel) {
    case 'telegram':
      return `https://t.me/share/url?url=${enc(url)}&text=${enc(input.text)}`;
    case 'whatsapp':
      return `https://wa.me/?text=${enc(`${input.text}\n${url}`)}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`;
    case 'x':
      return `https://x.com/intent/post?text=${enc(input.text)}&url=${enc(url)}`;
    case 'email':
      return `mailto:?subject=${enc(input.title)}&body=${enc(`${input.text}\n\n${url}`)}`;
  }
}

// ---- Suggested copy (A4 §11) -------------------------------------------------

export type CopyVariant = 'short' | 'launch' | 'professional';
export const COPY_VARIANTS: CopyVariant[] = ['launch', 'short', 'professional'];

/** Natural, short, ready-to-paste post text in the UI language. */
export function suggestedCopy(
  variant: CopyVariant,
  input: { name: string; shortDescription?: string | null; category?: string | null; url: string },
): string {
  const description = (input.shortDescription ?? '').trim();
  const vars = {
    name: input.name,
    description: description || t('launch.copy.noDescription'),
    category: input.category?.trim() || t('launch.copy.noCategory'),
    url: input.url,
  };
  return t(`launch.copy.${variant}`, vars).trim();
}

/** Milestone post (first sale) — optional, never automatic (A4 §24). */
export function milestoneCopy(input: { name: string; url: string }): string {
  return t('launch.copy.milestone', { name: input.name, url: input.url });
}

// ---- Publish checklist (A4 §3) -----------------------------------------------

export function checkStatusLabel(status: PublishCheckStatus): string {
  return t(`publish.status.${status}`);
}

export function checkStatusTone(status: PublishCheckStatus): 'success' | 'warning' | 'danger' {
  return status === 'complete' ? 'success' : status === 'needs_attention' ? 'warning' : 'danger';
}

export function checkStatusIcon(status: PublishCheckStatus): IconName {
  // Rendered inside the filled `.publish-check__icon` disc, so the glyphs are the bare marks.
  return status === 'complete' ? 'check' : status === 'needs_attention' ? 'alertTriangle' : 'close';
}

/**
 * Precise, actionable sentence for a check («برای انتشار، مدل تحویل محصول
 * را مشخص کنید.») — never "Something is wrong".
 */
export function checkMessage(item: PublishCheckItem): string {
  if (item.status === 'complete') return t(`publish.check.${item.key}.ok`);
  const specific = `publish.check.${item.key}.${item.status}`;
  return tHas(specific) ? t(specific) : t(`publish.check.${item.key}.required`);
}

/** «Fix this →» destination: the exact wizard step (and field) to correct. */
export function checkFixHref(agentId: string, item: PublishCheckItem): string | null {
  if (item.status === 'complete') return null;
  if (item.key === 'approval') return `/creator/agents/${agentId}/review`;
  if (item.key === 'creator_account') return '/creator/profile';
  if (!item.fix) return `/creator/agents/${agentId}/edit`;
  const field = item.fix.field ? `&field=${encodeURIComponent(item.fix.field)}` : '';
  return `/creator/agents/${agentId}/edit?step=${item.fix.section}${field}`;
}

// ---- Launch progress / campaign / recommendations ------------------------------

export function launchStepLabel(key: LaunchStepKey): string {
  return t(`launch.step.${key}`);
}

export function recommendationText(rec: Recommendation): { title: string; body: string; cta: string } {
  const vars: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(rec.evidence)) {
    // Locale digits inside the sentence («۲ مورد», not «2 مورد»).
    vars[name] = name === 'rating' ? formatRating(value) : formatCount(value);
  }
  return {
    title: t(`launch.rec.${rec.key}.title`, vars),
    body: t(`launch.rec.${rec.key}.body`, vars),
    cta: t(`launch.rec.cta.${rec.cta}`),
  };
}

/**
 * Where a recommendation's CTA leads. «Improve» on a live product goes to
 * the product page in the studio, where a reviewed next version starts
 * (A4 §27: published edits never go live without review).
 */
export function recommendationHref(agentId: string, rec: Recommendation): string {
  switch (rec.cta) {
    case 'share':
      return `/creator/agents/${agentId}/launch#share`;
    case 'promote':
      return `/creator/agents/${agentId}/launch#promotion`;
    case 'republish':
      return `/creator/agents/${agentId}/launch`;
    case 'buyers':
      return '/creator/sales';
    case 'improve':
    case 'improve_media':
      return `/creator/agents/${agentId}#improve`;
  }
}

// ---- Analytics (A4 §15–§18) ------------------------------------------------------

export const ANALYTICS_RANGES = ['7d', '30d', 'all'] as const;

/** A percentage with at most one decimal, in the active locale (5.0 → «۵٪», 2.5 → «۲٫۵٪»). */
export function formatRate(percent: number): string {
  const value = Number.isFinite(percent) ? percent : 0;
  return new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);
}

/** Conversion is shown only when it means something (sample + visitors). */
export function conversionDisplay(metrics: Pick<AnalyticsMetrics, 'conversionRate' | 'lowSample' | 'paidFunnelApplicable'>): {
  value: string;
  hint: string | null;
} {
  if (!metrics.paidFunnelApplicable) return { value: '—', hint: t('creatorAnalytics.conversion.freeProduct') };
  if (metrics.lowSample) return { value: '—', hint: t('analytics.conversion.lowSample') };
  if (metrics.conversionRate === null) return { value: '—', hint: t('analytics.conversion.none') };
  return { value: formatRate(metrics.conversionRate), hint: null };
}

export function sourceLabel(source: string): string {
  return tHas(`analytics.source.${source}`) ? t(`analytics.source.${source}`) : t('analytics.source.other');
}

// ---- Promotions (A4 §14, §21–§23) -------------------------------------------------

export const PROMOTION_TYPES: PromotionType[] = ['boost', 'featured', 'mesh_social'];
export const OPEN_PROMOTION_STATUSES: PromotionStatus[] = ['pending', 'under_review', 'approved', 'scheduled', 'active'];

export function promotionStatusTone(
  status: PromotionStatus,
): 'success' | 'warning' | 'danger' | 'neutral' | 'accent' | 'info' {
  switch (status) {
    case 'pending':
      return 'info';
    case 'under_review':
      return 'accent';
    case 'approved':
    case 'scheduled':
      return 'warning';
    case 'active':
    case 'completed':
      return 'success';
    case 'rejected':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Status label; MESH Social «completed» reads «Published» (A4 §14). */
export function promotionStatusLabel(status: PromotionStatus, type?: PromotionType): string {
  if (type === 'mesh_social' && status === 'completed') return t('promo.status.published');
  return t(`promo.status.${status}`);
}

/**
 * Journey shown to the creator. MESH Social: Submitted → Under review →
 * Scheduled → Published; on-site placements: … → Scheduled → Active →
 * Completed. Returns the steps with the current one marked.
 */
export function promotionJourney(
  type: PromotionType,
  status: PromotionStatus,
): Array<{ key: string; label: string; state: 'done' | 'current' | 'todo' }> {
  const keys =
    type === 'mesh_social'
      ? ['pending', 'under_review', 'scheduled', 'published']
      : ['pending', 'under_review', 'scheduled', 'active', 'completed'];
  const position: Record<string, number> =
    type === 'mesh_social'
      ? { pending: 0, under_review: 1, approved: 2, scheduled: 2, completed: 3 }
      : { pending: 0, under_review: 1, approved: 2, scheduled: 2, active: 3, completed: 4 };
  const current = position[status] ?? -1;
  const finished = status === 'completed';
  return keys.map((key, index) => ({
    key,
    label: t(`promo.status.${key}`),
    state: finished || index < current ? 'done' : index === current ? 'current' : 'todo',
  }));
}

// ---- Visitor id + view source (beacon) ---------------------------------------------

const VISITOR_KEY = 'mesh.vid';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Anonymous, first-party visitor id (random UUID; the server salts + hashes it). */
export function visitorId(): string {
  const existing = storage.get(VISITOR_KEY);
  if (existing && UUID_RE.test(existing)) return existing;
  const fresh = randomUuid();
  storage.set(VISITOR_KEY, fresh);
  return fresh;
}

const VIEW_SOURCES = new Set([
  'direct',
  'copy_link',
  'native',
  'telegram',
  'whatsapp',
  'linkedin',
  'x',
  'email',
  'qr',
  'marketplace',
  'promoted',
  'other',
]);

/**
 * Normalizes the attribution of a product view: explicit `?src=` wins
 * (share links/QR set it); otherwise an in-app navigation counts as
 * «marketplace» and anything else as «direct».
 */
export function viewSource(search: string, referrer: string, origin: string): string {
  const src = new URLSearchParams(search).get('src')?.trim().toLowerCase();
  if (src) {
    if (src === 'qr_download') return 'qr';
    if (src === 'copy_text') return 'copy_link';
    return VIEW_SOURCES.has(src) ? src : 'other';
  }
  if (referrer && origin && referrer.startsWith(origin)) return 'marketplace';
  return 'direct';
}
