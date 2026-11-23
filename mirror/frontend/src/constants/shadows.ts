/** Elevation tokens — soft editorial shadows tuned on MESH ink (#1b2335). */
export const shadows = {
  sm: '0 1px 2px rgba(27, 35, 53, 0.05)',
  md: '0 8px 24px rgba(27, 35, 53, 0.07)',
  lg: '0 18px 50px rgba(27, 35, 53, 0.09)',
} as const;

export type ShadowToken = keyof typeof shadows;
