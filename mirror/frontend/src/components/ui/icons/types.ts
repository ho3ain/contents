import type { CSSProperties } from 'react';

/**
 * Size tokens (MESH-ICON-SYSTEM.md §B2).
 *  xs 16 — compact inline actions, dense tables, sidebar items
 *  sm 20 — standard controls and header actions (default)
 *  md 24 — prominent navigation, page headers, standalone icons
 *  lg 32 — brand / onboarding / empty-state contexts only
 * A number is an escape hatch for layouts that already fix a pixel size;
 * prefer tokens in new code.
 */
export const ICON_SIZES = { xs: 16, sm: 20, md: 24, lg: 32 } as const;
export type IconSizeToken = keyof typeof ICON_SIZES;
export type IconSize = IconSizeToken | number;

export function iconPx(size: IconSize | undefined): number {
  if (size === undefined) return ICON_SIZES.sm;
  return typeof size === 'number' ? size : ICON_SIZES[size];
}

/** Semantic tones map to the theme's state tokens; never the only signal. */
export type IconTone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'muted';

export interface IconBaseProps {
  size?: IconSize;
  className?: string;
  style?: CSSProperties;
  /**
   * Meaningful icon: renders `role="img"` with this accessible name.
   * Omit for decorative icons (the default) → `aria-hidden="true"`.
   * An icon never replaces the control's own label.
   */
  label?: string;
  tone?: IconTone;
  /** Override the stroke (2 is the system default; 1.75 for 14-px, 2.25 for emphasis). */
  strokeWidth?: number;
  /**
   * Mirroring: `auto` (default) flips only logical/directional names in RTL,
   * `never` keeps the glyph as drawn, `always` forces the flip.
   */
  flip?: 'auto' | 'never' | 'always';
  'data-testid'?: string;
}

export function iconClassName(parts: {
  className?: string;
  tone?: IconTone;
  directional: boolean;
  flip: IconBaseProps['flip'];
  extra?: string;
}): string {
  const cls = ['icon'];
  if (parts.extra) cls.push(parts.extra);
  if (parts.flip === 'always' || (parts.flip !== 'never' && parts.directional)) cls.push('icon--dir');
  if (parts.tone) cls.push(`icon--${parts.tone}`);
  if (parts.className) cls.push(parts.className);
  return cls.join(' ');
}

export function iconA11y(label: string | undefined): { role: 'img'; 'aria-label': string } | { 'aria-hidden': true } {
  return label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
}
