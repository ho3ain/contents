/**
 * Canonical 4px-based spacing scale, mirrored by `--sp-*` in index.css.
 * Use these tokens instead of inventing per-component margin/padding values.
 */
export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  32: '8rem',
} as const;

export type SpacingToken = keyof typeof spacing;

/** Resolve a spacing token to its CSS value. */
export const space = (token: SpacingToken): string => spacing[token];

/** Responsive layout rhythm mirrored by the semantic CSS variables. */
export const layoutSpacing = {
  gutter: 'clamp(1rem, 4vw, 2rem)',
  content: 'clamp(1rem, 2vw, 1.5rem)',
  pageStart: 'clamp(1.25rem, 3vw, 2rem)',
  pageEnd: 'clamp(3rem, 5vw, 4rem)',
  sectionGap: 'clamp(1.5rem, 4vw, 2.5rem)',
  card: 'clamp(1rem, 2vw, 1.5rem)',
} as const;

export type LayoutSpacingToken = keyof typeof layoutSpacing;
