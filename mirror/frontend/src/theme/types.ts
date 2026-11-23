import type { lightColors } from '../constants/colors';
import type { spacing } from '../constants/spacing';
import type { radius } from '../constants/radius';
import type { shadows } from '../constants/shadows';
import type { typography } from '../constants/typography';
import type { motion } from '../constants/motion';
import type { layout } from '../constants/layout';
import type { accessibility } from '../constants/accessibility';

export type ColorToken = Record<keyof typeof lightColors, string>;
export type ThemeMode = 'light' | 'dark';

/** A fully resolved visual theme consumed by components via `useTheme()`. */
export interface Theme {
  colors: ColorToken;
  spacing: typeof spacing;
  radius: typeof radius;
  shadows: typeof shadows;
  typography: typeof typography;
  motion: typeof motion;
  layout: typeof layout;
  accessibility: typeof accessibility;
}

export interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}
