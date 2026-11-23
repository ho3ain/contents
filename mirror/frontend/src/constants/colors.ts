/**
 * MESH color tokens — the single source of truth for color in the app.
 * Key names intentionally mirror the CSS custom properties used in
 * `index.css` (e.g. `colors.bg` -> `--bg`) so the class-based UI and the
 * inline-style (useTheme) UI stay in lock-step.
 *
 * Brand system (MESH — NETWORK × INTELLIGENCE × ACTION):
 *   INK #101722 · NIGHT #080C12 · PAPER #FFFFFF · SOFT #F7F8FB · LINE #E7EAF0
 *   MUTED #687180 · ACID #D6FA65 (signature CTA) · VIOLET #7C5CFF (intelligence)
 *   CYAN #54E6FF (network/signal) · dark surfaces #1A2333 / #2E3A4D / #050A12
 *
 * Contrast is WCAG-measured: violet runs at AA shades on paper (#5F3BEE),
 * acid is only ever paired with ink text (15.2:1) and acid-as-text is
 * reserved for dark surfaces (16.5:1 on NIGHT). Cyan is never body text
 * on paper (1.5:1) — it is a signal color for dark/ink surfaces (12.1:1).
 */

export const lightColors = {
  bg: '#ffffff',
  bgSubtle: '#f7f8fb',
  surface: '#ffffff',
  surface2: '#f7f8fb',
  border: '#e7eaf0',
  borderStrong: '#c9cfda',
  text: '#101722',
  text2: '#687180',
  text3: '#566070',
  textInverse: '#ffffff',
  /** Interactive accent — AA-safe violet shade on paper (6.3:1). */
  accent: '#5f3bee',
  accentHover: '#4c2bd9',
  accentSoft: '#efebff',
  accentBorder: '#c9bcff',
  success: '#15803d',
  successSoft: '#eaf7ee',
  warning: '#b45309',
  warningSoft: '#fdf3e3',
  danger: '#b91c1c',
  dangerSoft: '#fdecec',
  info: '#1d4ed8',
  infoSoft: '#eef4fb',
  star: '#f59e0b',

  /** MESH signature CTA — always ink text on acid (15.2:1). */
  cta: '#d6fa65',
  ctaHover: '#c9f242',
  ctaText: '#101722',

  /** Raw brand values for moments that own their contrast context. */
  brandViolet: '#7c5cff',
  brandCyan: '#54e6ff',
  meshInk: '#101722',
  meshNight: '#080c12',

  /** Immersive dark sections rendered inside the light theme. */
  nightSurface: '#1a2333',
  nightLine: '#2e3a4d',
  onNight: '#edf1f7',
  onNightMuted: '#a9b4c2',
} as const;

export const darkColors = {
  bg: '#080c12',
  bgSubtle: '#050a12',
  surface: '#101722',
  surface2: '#1a2333',
  border: '#2e3a4d',
  borderStrong: '#3e4b62',
  text: '#edf1f7',
  text2: '#a9b4c2',
  text3: '#8a94a6',
  textInverse: '#101722',
  /** Lifted violet — AA on NIGHT (5.8:1). */
  accent: '#8f77ff',
  accentHover: '#a08dff',
  accentSoft: '#221b4e',
  accentBorder: '#4a3fa0',
  success: '#22c55e',
  successSoft: '#12291b',
  warning: '#f59e0b',
  warningSoft: '#2a2213',
  danger: '#ef4444',
  dangerSoft: '#33171c',
  // #93c5fd on #14263c ≈ 9.6:1 (badge/alert text); #1d4ed8 was never
  // overridden in dark mode and failed AA on the dark info surface.
  info: '#93c5fd',
  infoSoft: '#14263c',
  star: '#f5b11f',

  /** Acid stays the CTA in dark mode — still ink text. */
  cta: '#d6fa65',
  ctaHover: '#e3ff8a',
  ctaText: '#101722',

  brandViolet: '#7c5cff',
  brandCyan: '#54e6ff',
  meshInk: '#101722',
  meshNight: '#080c12',

  /** Immersive sections deepen toward the base navy in dark mode. */
  nightSurface: '#050a12',
  nightLine: '#2e3a4d',
  onNight: '#edf1f7',
  onNightMuted: '#a9b4c2',
} as const;

/** Structural color token type (any theme provides these keys as strings). */
export type ColorToken = Record<keyof typeof lightColors, string>;
export type ColorName = keyof typeof lightColors;
