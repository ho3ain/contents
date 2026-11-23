import { createContext } from 'react';
import type { ThemeContextValue, ThemeMode } from './types';

/**
 * Theme context + storage helpers live in this component-free module so that
 * both the provider (ThemeProvider.tsx) and the hooks (useAppTheme.ts) can
 * share them without breaking React Fast Refresh (a module may export either
 * components or non-components, not both).
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const THEME_STORAGE_KEY = 'ah-theme';

/** Resolve the initial theme mode from storage or the OS preference. */
export function readInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}
