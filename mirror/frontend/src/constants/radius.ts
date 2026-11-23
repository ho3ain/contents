/** Corner radius tokens — MESH geometry (reference cards run 18px). */
export const radius = {
  sm: '8px',
  md: '12px',
  lg: '18px',
} as const;

export type RadiusToken = keyof typeof radius;
