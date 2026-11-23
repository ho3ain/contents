/**
 * BUY experience shared logic (BUY upgrade): marketplace filter state,
 * active-filter chips, sort options, trust signals and notification
 * presentation — one source of truth for the Explore page, cards and the
 * notifications list. Everything maps to REAL backend data; no fake signal
 * is constructible from this module.
 */
import type { AgentRiskLevel, AgentSort } from '../api/types';
import { t } from '../i18n';
import type { IconName } from '../components/ui/AppIcon';
import { journeyLinkLabel } from './journey';

// ---- Marketplace filters ----

export interface MarketplaceFilters {
  q: string;
  category: string;
  free: boolean;
  minPrice: string;
  maxPrice: string;
  ratingMin: string;
  securityReviewed: boolean;
  verifiedCreator: boolean;
  clearDataPolicy: boolean;
  noSensitiveData: boolean;
  sort: AgentSort;
  page: number;
}

export const RATING_OPTIONS = ['4.5', '4.0', '3.0'] as const;

export const TRUST_FILTERS = [
  'securityReviewed',
  'verifiedCreator',
  'clearDataPolicy',
  'noSensitiveData',
] as const;
export type TrustFilter = (typeof TRUST_FILTERS)[number];

export const MARKETPLACE_SORTS: Array<{ value: AgentSort; labelKey: string }> = [
  { value: 'relevance', labelKey: 'explore.sort.relevant' },
  { value: 'rating', labelKey: 'explore.sort.topRated' },
  { value: 'reviews', labelKey: 'explore.sort.mostReviewed' },
  { value: 'newest', labelKey: 'explore.sort.newest' },
  { value: 'price_asc', labelKey: 'explore.sort.priceAsc' },
  { value: 'price_desc', labelKey: 'explore.sort.priceDesc' },
];

/** Reads the canonical filter state from a URLSearchParams instance. */
export function filtersFromParams(params: URLSearchParams): MarketplaceFilters {
  const q = params.get('q') ?? '';
  return {
    q,
    category: params.get('category') ?? '',
    free: params.get('free') === 'true',
    minPrice: params.get('minPrice') ?? '',
    maxPrice: params.get('maxPrice') ?? '',
    ratingMin: params.get('ratingMin') ?? '',
    securityReviewed:
      params.get('securityReviewed') === 'true' ||
      // legacy URL shape
      params.get('verified') === 'true',
    verifiedCreator: params.get('verifiedCreator') === 'true',
    clearDataPolicy: params.get('clearDataPolicy') === 'true',
    noSensitiveData: params.get('noSensitiveData') === 'true',
    sort: (params.get('sort') as AgentSort | null) ?? (q ? 'relevance' : 'newest'),
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };
}

/** True when no filter (other than sort/page) is active. */
export function hasNoFilters(filters: MarketplaceFilters): boolean {
  return (
    !filters.q &&
    !filters.category &&
    !filters.free &&
    !filters.minPrice &&
    !filters.maxPrice &&
    !filters.ratingMin &&
    !filters.securityReviewed &&
    !filters.verifiedCreator &&
    !filters.clearDataPolicy &&
    !filters.noSensitiveData
  );
}

export interface ActiveFilterChip {
  key: string;
  label: string;
  /** The exact query-param patch that removes this single filter. */
  clear: Record<string, string | undefined>;
}

/**
 * Derives the removable active-filter chips (§12). Each chip clears exactly
 * one filter — including both price bounds as one "price" chip and every
 * trust signal separately.
 */
export function activeFilterChips(
  filters: MarketplaceFilters,
  categories: Array<{ slug: string; name: string }>,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.category) {
    const category = categories.find((item) => item.slug === filters.category);
    chips.push({
      key: 'category',
      label: t('explore.chip.category', {
        category: category?.name ?? filters.category,
      }),
      clear: { category: undefined },
    });
  }
  if (filters.free) {
    chips.push({
      key: 'free',
      label: t('agent.free'),
      clear: { free: undefined },
    });
  }
  if (filters.minPrice || filters.maxPrice) {
    chips.push({
      key: 'price',
      label: t('explore.chip.price', {
        min: filters.minPrice || '0',
        max: filters.maxPrice || '∞',
      }),
      clear: { minPrice: undefined, maxPrice: undefined },
    });
  }
  if (filters.ratingMin) {
    chips.push({
      key: 'rating',
      label: t('explore.chip.rating', { rating: filters.ratingMin }),
      clear: { ratingMin: undefined },
    });
  }
  const trustLabels: Record<TrustFilter, string> = {
    securityReviewed: t('trust.securityReviewed'),
    verifiedCreator: t('trust.verifiedCreator'),
    clearDataPolicy: t('trust.clearDataPolicy'),
    noSensitiveData: t('trust.noSensitiveData'),
  };
  for (const trust of TRUST_FILTERS) {
    if (filters[trust]) {
      chips.push({
        key: trust,
        label: trustLabels[trust],
        clear: { [trust]: undefined, ...(trust === 'securityReviewed' ? { verified: undefined } : {}) },
      });
    }
  }
  return chips;
}

/** The params patch that resets every filter (keeps nothing). */
export function clearAllFiltersPatch(): Record<string, string | undefined> {
  return {
    q: undefined,
    category: undefined,
    free: undefined,
    minPrice: undefined,
    maxPrice: undefined,
    ratingMin: undefined,
    securityReviewed: undefined,
    verified: undefined,
    verifiedCreator: undefined,
    clearDataPolicy: undefined,
    noSensitiveData: undefined,
    page: undefined,
  };
}

// ---- Risk presentation (§24: semantic, never raw enum text) ----

export function riskLabel(level: AgentRiskLevel): string {
  return t(`risk.level.${level}`);
}

export function riskTone(
  level: AgentRiskLevel,
): 'success' | 'warning' | 'danger' {
  if (level === 'high') return 'danger';
  if (level === 'medium') return 'warning';
  return 'success';
}

// ---- Notification presentation (§30) ----

export interface NotificationVisual {
  icon: IconName;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
}

/** Icon + semantic tone per notification TYPE (business event, not locale). Typed icon names — rendered with `<AppIcon>`. */
export function notificationVisual(type: string): NotificationVisual {
  switch (type) {
    case 'purchase_success':
      return { icon: 'checkCircle', tone: 'success' };
    case 'new_sale':
      return { icon: 'trendingUp', tone: 'success' };
    case 'first_sale':
      return { icon: 'success', tone: 'success' };
    case 'promotion_update':
    case 'promotion_requested':
      return { icon: 'megaphone', tone: 'accent' };
    case 'payment_failed':
      return { icon: 'xCircle', tone: 'danger' };
    case 'refund_requested':
    case 'refund_processed':
      return { icon: 'undo', tone: 'warning' };
    case 'review_submitted':
    case 'review_replied':
      return { icon: 'star', tone: 'accent' };
    case 'blog_comment_new':
      return { icon: 'messageCircle', tone: 'accent' };
    case 'blog_comment_reply':
      return { icon: 'reply', tone: 'accent' };
    case 'blog_comment_removed':
      return { icon: 'messageCircle', tone: 'warning' };
    case 'report_status':
      return { icon: 'flag', tone: 'neutral' };
    case 'support_request':
    case 'support_reply':
    case 'support_status':
      return { icon: 'mail', tone: 'accent' };
    case 'account_status':
    case 'password_changed':
      return { icon: 'lock', tone: 'neutral' };
    case 'agent_published':
      return { icon: 'publish', tone: 'success' };
    case 'first_product_created':
      return { icon: 'agent', tone: 'accent' };
    case 'product_updated':
      return { icon: 'version', tone: 'accent' };
    case 'first_favorite':
      return { icon: 'heart', tone: 'success' };
    // Buyer Discovery (M10) — something I follow published or updated a product.
    case 'followed_new_product':
      return { icon: 'userCheck', tone: 'accent' };
    // Sprint 2 — the buyer journey.
    case 'product_ready':
      return { icon: 'play', tone: 'accent' };
    case 'setup_reminder':
      return { icon: 'clock', tone: 'warning' };
    case 'review_request':
      return { icon: 'star', tone: 'accent' };
    case 'agent_review_result':
      return { icon: 'review', tone: 'accent' };
    case 'verification_update':
      return { icon: 'verified', tone: 'accent' };
    default:
      return { icon: 'bell', tone: 'neutral' };
  }
}

/** Human label for a notification's deep link (the CTA text). */
export function notificationCtaLabel(link: string | null): string | null {
  if (!link) return null;
  const journey = journeyLinkLabel(link);
  if (journey) return journey;
  if (link.startsWith('/me/notifications/reports')) return t('acct.notif.cta.reports');
  if (link.startsWith('/library')) return t('notifications.cta.library');
  if (link.startsWith('/orders')) return t('notifications.cta.order');
  if (link.startsWith('/agents')) return t('notifications.cta.agent');
  if (/^\/blog\/[^/?#]+#comment-/.test(link)) return t('notifications.cta.blogComment');
  if (link.startsWith('/blog/')) return t('notifications.cta.blogPost');
  if (link.startsWith('/creator/sales/')) return t('notifications.cta.sale');
  if (/^\/creator\/agents\/[^/]+\/publish/.test(link)) return t('notifications.cta.publish');
  if (/^\/creator\/agents\/[^/]+\/launch#promotion/.test(link)) return t('notifications.cta.promotion');
  if (/^\/creator\/agents\/[^/]+\/launch/.test(link)) return t('notifications.cta.launch');
  if (link.startsWith('/admin/promotions')) return t('notifications.cta.reviewPromotion');
  return t('notifications.cta.view');
}
