/**
 * Panel storage — the persistence layer for the two-workspace model.
 *
 * A signed-in creator lives in TWO panels (buyer + creator; admins get a
 * third). The active panel is a *workspace context*, not a URL prefix: pages
 * like /me/notifications or /orders belong to the account, and must keep the
 * sidebar of whichever panel the user is currently in — otherwise the whole
 * chrome flips and the user loses their bearings.
 *
 * The remembered panel is stored per user (id, email as fallback) so it
 * survives reloads, and is read by the login destination too, so coming back
 * to the app lands you where you left off.
 */
import type { IconName } from '../components/ui/AppIcon';

export type PanelId = 'buyer' | 'creator' | 'admin';

/** Landing route for each panel. */
export const PANEL_HOME: Record<PanelId, string> = {
  buyer: '/library',
  creator: '/creator',
  admin: '/admin',
};

/** Display metadata for the switcher UI (pure data — no React here). */
export interface PanelMeta {
  id: PanelId;
  /** i18n key of the panel's display name. */
  labelKey: string;
  icon: IconName;
  home: string;
}

export const PANELS: Record<PanelId, PanelMeta> = {
  buyer: { id: 'buyer', labelKey: 'panel.buyer', icon: 'shoppingBag', home: PANEL_HOME.buyer },
  creator: { id: 'creator', labelKey: 'panel.creator', icon: 'builder', home: PANEL_HOME.creator },
  admin: { id: 'admin', labelKey: 'panel.admin', icon: 'shield', home: PANEL_HOME.admin },
};

/** The panel a URL unambiguously belongs to (null = account/shared pages). */
export function panelOfPath(pathname: string): PanelId | null {
  if (pathname === '/creator' || pathname.startsWith('/creator/')) return 'creator';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  return null;
}

const PREFIX = 'mesh:panel:';

function storageKey(userKey: string): string {
  return `${PREFIX}${userKey}`;
}

function isValidPanel(value: string | null): value is PanelId {
  return value === 'buyer' || value === 'creator' || value === 'admin';
}

/** The panel a user was last in, or null when nothing (valid) is stored. */
export function readStoredPanel(userKey: string): PanelId | null {
  try {
    const value = window.localStorage.getItem(storageKey(userKey));
    return isValidPanel(value) ? value : null;
  } catch {
    return null; // private mode / storage disabled
  }
}

export function writeStoredPanel(userKey: string, panel: PanelId): void {
  try {
    window.localStorage.setItem(storageKey(userKey), panel);
  } catch {
    // best-effort — the in-memory context still works without persistence
  }
}

export function clearStoredPanel(userKey: string): void {
  try {
    window.localStorage.removeItem(storageKey(userKey));
  } catch {
    // ignore
  }
}

/**
 * The panel a user may land in by default, given their role — matches the
 * historical role-home behavior (admin → admin console, creator → studio).
 */
export function defaultPanel(role: 'buyer' | 'creator' | 'admin' | undefined): PanelId {
  if (role === 'admin') return 'admin';
  if (role === 'creator') return 'creator';
  return 'buyer';
}

/** Whether a panel is available for a role (server-authoritative). */
export function panelAvailable(panel: PanelId, role: 'buyer' | 'creator' | 'admin' | undefined): boolean {
  if (panel === 'creator') return role === 'creator' || role === 'admin';
  if (panel === 'admin') return role === 'admin';
  return true;
}
