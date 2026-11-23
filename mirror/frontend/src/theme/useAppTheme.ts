import { useContext } from 'react';
import { ThemeContext } from './ThemeContext';
import type { Theme, ThemeContextValue } from './types';

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx.theme;
}

/** Alias kept for parity with the reference React Native design system. */
export function useAppTheme(): Theme {
  return useTheme();
}

export function useThemeMode(): Pick<ThemeContextValue, 'mode' | 'setMode' | 'toggleMode'> {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeProvider');
  return { mode: ctx.mode, setMode: ctx.setMode, toggleMode: ctx.toggleMode };
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('Theme hooks must be used within ThemeProvider');
  return ctx;
}
