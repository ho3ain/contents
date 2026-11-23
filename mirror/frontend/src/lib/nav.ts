/** Dashboard sidebar navigation model + matching. */

import type { IconName } from '../components/ui/AppIcon';

export interface NavItem {
  to: string;
  label: string;
  /** Explicit sidebar icon; when omitted the shell infers one from the path. */
  icon?: IconName;
  end?: boolean;
  /** Extra routes that belong to this item (e.g. a product's review page → «مرکز بررسی»). */
  activeWhen?: RegExp;
  /** Nested routes owned by another item, so exactly one link is current. */
  inactiveWhen?: RegExp;
}

/** Exactly-one-current nav matching (NavLink's prefix rule marks parents too). */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (item.activeWhen?.test(path)) return true;
  if (item.inactiveWhen?.test(path)) return false;
  return path === item.to || (!item.end && path.startsWith(`${item.to}/`));
}

/**
 * Sidebar icon for an item: the explicit `icon` wins; otherwise the path is
 * mapped to a typed name (MESH custom icons for product concepts, Lucide for
 * conventional ones). Most specific patterns first — `support-ops` before
 * `support`, `creator-opportunities` before `creat…`.
 */
export function iconForItem(item: NavItem): IconName {
  if (item.icon) return item.icon;
  const path = item.to.toLowerCase();
  if (path.includes('dashboard') || path.endsWith('/creator') || path.endsWith('/admin') || path === '/library') return 'dashboard';
  if (path.includes('support-ops')) return 'headphones';
  if (path.includes('creator-opportunities') || path.includes('idea')) return 'ideas';
  if (path.includes('/new') || path.includes('create') || path.includes('wizard')) return 'builder';
  if (path.includes('review')) return 'review';
  if (path.includes('portfolio')) return 'portfolio';
  if (path.includes('success')) return 'success';
  if (path.includes('growth') || path.includes('scale') || path.includes('trend')) return 'growth';
  if (path.includes('taxonomy')) return 'tag';
  if (path.includes('blog') || path.includes('article')) return 'bookOpen';
  if (path.includes('agent') || path.includes('product') || path.includes('listing')) return 'agent';
  if (path.includes('analytics') || path.includes('metric')) return 'barChart';
  if (path.includes('refund')) return 'undo';
  if (path.includes('sale') || path.includes('order') || path.includes('commerce') || path.includes('payment') || path.includes('payout') || path.includes('finance'))
    return 'wallet';
  if (path.includes('notification')) return 'bell';
  if (path.includes('favorite')) return 'heart';
  if (path.includes('follow') || path.includes('role')) return 'userCheck';
  if (path.includes('recent') || path.includes('history')) return 'clock';
  if (path.includes('interest')) return 'target';
  if (path.includes('report')) return 'fileText';
  if (path.includes('moderat')) return 'shield';
  if (path.includes('risk') || path.includes('alert')) return 'alertTriangle';
  if (path.includes('audit')) return 'history';
  if (path.includes('promotion') || path.includes('campaign')) return 'megaphone';
  if (path.includes('crm') || path.includes('lead')) return 'briefcase';
  if (path.includes('activation')) return 'activity';
  if (path.includes('buyer-journey') || path.includes('journey')) return 'shoppingBag';
  if (path.includes('control')) return 'sliders';
  if (path.includes('search') || path.includes('export') || path.includes('discover')) return 'search';
  if (path.includes('support') || path.includes('message')) return 'messageSquare';
  if (path.includes('user')) return 'users';
  if (path.includes('setting') || path.includes('profile') || path.includes('platform')) return 'settings';
  return 'folder';
}
