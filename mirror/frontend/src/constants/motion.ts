/**
 * Motion tokens — MESH signature timing is 220ms ease on hovers and
 * transitions; longer durations are reserved for layout-level movement.
 */
export const motion = {
  duration: {
    fast: '120ms',
    base: '220ms',
    slow: '320ms',
  },
  easing: {
    standard: 'ease',
    emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
  },
} as const;
