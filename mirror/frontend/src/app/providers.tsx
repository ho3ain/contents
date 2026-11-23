import { Fragment, type ReactNode } from 'react';
import { ThemeProvider } from '../theme';
import { I18nProvider, useI18n } from '../i18n';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../components/Toast';

/**
 * Remounts the route subtree when the locale changes, so every page picks
 * up translated strings through the module-level `t()` without each
 * component needing a context subscription. Auth and toast providers sit
 * ABOVE this bridge and keep their state across a language switch.
 */
function LocaleRemount({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return <Fragment key={locale}>{children}</Fragment>;
}

/** Composes all global providers for the app (mirrors the Playbook's app/state layer). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <LocaleRemount>{children}</LocaleRemount>
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
