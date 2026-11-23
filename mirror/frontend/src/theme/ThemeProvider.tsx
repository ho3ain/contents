// Only the provider component is exported from this module; the context,
// storage helpers and hooks live in ThemeContext.ts / useAppTheme.ts so React
// Fast Refresh keeps working (no mixed component/non-component exports).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { lightTheme } from './light';
import { darkTheme } from './dark';
import { ThemeContext, THEME_STORAGE_KEY, readInitialMode } from './ThemeContext';
import type { Theme, ThemeContextValue, ThemeMode } from './types';

/** Flatten a theme into CSS custom properties and write them to :root. */
function applyThemeVars(theme: Theme): void {
  const root = document.documentElement;
  const c = theme.colors;
  const set = (name: string, value: string) => root.style.setProperty(name, value);

  set('--bg', c.bg);
  set('--bg-subtle', c.bgSubtle);
  set('--surface', c.surface);
  set('--surface-2', c.surface2);
  set('--border', c.border);
  set('--border-strong', c.borderStrong);
  set('--text', c.text);
  set('--text-2', c.text2);
  set('--text-3', c.text3);
  set('--text-inverse', c.textInverse);
  set('--accent', c.accent);
  set('--accent-hover', c.accentHover);
  set('--accent-soft', c.accentSoft);
  set('--accent-border', c.accentBorder);
  set('--success', c.success);
  set('--success-soft', c.successSoft);
  set('--warning', c.warning);
  set('--warning-soft', c.warningSoft);
  set('--danger', c.danger);
  set('--danger-soft', c.dangerSoft);
  set('--info', c.info);
  set('--info-soft', c.infoSoft);
  set('--star', c.star);

  // MESH brand system
  set('--cta', c.cta);
  set('--cta-hover', c.ctaHover);
  set('--cta-text', c.ctaText);
  set('--brand-violet', c.brandViolet);
  set('--brand-cyan', c.brandCyan);
  set('--mesh-ink', c.meshInk);
  set('--mesh-night', c.meshNight);
  set('--night-surface', c.nightSurface);
  set('--night-line', c.nightLine);
  set('--on-night', c.onNight);
  set('--on-night-muted', c.onNightMuted);

  set('--radius-sm', theme.radius.sm);
  set('--radius-md', theme.radius.md);
  set('--radius-lg', theme.radius.lg);
  set('--shadow-sm', theme.shadows.sm);
  set('--shadow-md', theme.shadows.md);
  set('--shadow-lg', theme.shadows.lg);
  set('--focus-ring', theme.accessibility.focusRing);
  set('--header-h', theme.layout.headerHeight);
  set('--container', theme.layout.containerMaxWidth);
  set('--container-narrow', theme.layout.containerNarrowMaxWidth);
  set('--font-sans', theme.typography.fontSans);
  set('--font-mono', theme.typography.fontMono);

  for (const [key, value] of Object.entries(theme.spacing)) {
    set(`--sp-${key}`, value);
  }
}

/**
 * Circular reveal transition: animates from the toggle button's position
 * using View Transitions API (when available) or CSS clip-path fallback.
 */
function applyThemeWithReveal(toggleEl: HTMLElement, nextMode: ThemeMode): Promise<void> {
  // SSR safety
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    applyThemeVars(nextMode === 'dark' ? darkTheme : lightTheme);
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const rect = toggleEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.hypot(
      Math.max(cx, window.innerWidth - cx),
      Math.max(cy, window.innerHeight - cy),
    );

    // Reduced motion: skip animation
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.dataset.theme = nextMode;
      applyThemeVars(nextMode === 'dark' ? darkTheme : lightTheme);
      resolve();
      return;
    }

    // Try View Transitions API first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = document as any;
    if ('startViewTransition' in doc) {
      const transition = doc.startViewTransition(() => {
        doc.documentElement.dataset.theme = nextMode;
        applyThemeVars(nextMode === 'dark' ? darkTheme : lightTheme);
      });
      transition.ready.then(() => {
        doc.documentElement.animate(
          [
            { clipPath: `circle(0px at ${cx}px ${cy}px)` },
            { clipPath: `circle(${maxR}px at ${cx}px ${cy}px)` },
          ],
          { duration: 400, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      });
      transition.finished.then(() => resolve());
      return;
    }

    // Fallback: CSS clip-path on a fixed overlay
    const overlay = doc.createElement('div');
    overlay.className = 'theme-reveal-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      pointer-events: none;
      background: ${nextMode === 'dark' ? '#0f1117' : '#ffffff'};
      clip-path: circle(0px at ${cx}px ${cy}px);
      animation: theme-reveal-expand 400ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
    `;
    doc.body.appendChild(overlay);

    doc.documentElement.dataset.theme = nextMode;
    applyThemeVars(nextMode === 'dark' ? darkTheme : lightTheme);

    overlay.addEventListener('animationend', () => {
      overlay.remove();
      resolve();
    });
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readInitialMode);
  const toggleRef = useRef<HTMLElement | null>(null);

  // Apply theme on initial load (before first paint)
  useEffect(() => {
    const theme = mode === 'dark' ? darkTheme : lightTheme;
    document.documentElement.dataset.theme = mode;
    applyThemeVars(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }, [mode]);

  const toggleMode = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      const nextMode: ThemeMode = mode === 'dark' ? 'light' : 'dark';
      const toggleEl = event?.currentTarget ?? toggleRef.current;

      if (toggleEl) {
        void applyThemeWithReveal(toggleEl, nextMode).then(() => {
          setMode(nextMode);
        });
      } else {
        setMode(nextMode);
      }
    },
    [mode],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: mode === 'dark' ? darkTheme : lightTheme,
      mode,
      setMode,
      toggleMode: () => toggleMode(),
    }),
    [mode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

