/**
 * Typography tokens — Vazirmatn Variable is the MESH voice for both
 * Persian and Latin, falling back to system stacks when not loaded.
 */
export const typography = {
  fontSans:
    "'Vazirmatn Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontMono: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: {
    xs: '0.75rem',
    sm: '0.8125rem',
    base: '0.875rem',
    md: '0.9375rem',
    lg: '1rem',
    xl: '1.125rem',
    '2xl': '1.375rem',
    '3xl': '1.75rem',
  } as const,
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 550,
    bold: 600,
    extrabold: 700,
    black: 800,
  } as const,
  lineHeight: {
    tight: 1.25,
    base: 1.55,
  },
  letterSpacing: {
    tight: '-0.01em',
    wide: '0.02em',
    wider: '0.05em',
  },
} as const;
