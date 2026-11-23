/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fa } from './messages/fa';
import { en } from './messages/en';
import { scaleFa } from './scale.fa';
import { scaleEn } from './scale.en';
import { discoveryFa } from './discovery.fa';
import { discoveryEn } from './discovery.en';
import { journeyFa } from './journey.fa';
import { journeyEn } from './journey.en';
import { runtimeFa } from './runtime.fa';
import { runtimeEn } from './runtime.en';
import { controlFa } from './control.fa';
import { controlEn } from './control.en';
import { blogFa } from './blog.fa';
import { blogEn } from './blog.en';
import { accountFa } from './account.fa';
import { accountEn } from './account.en';
import { financeFa } from './finance.fa';
import { financeEn } from './finance.en';
import { trustFa } from './trust.fa';
import { trustEn } from './trust.en';
import { homeFa } from './home.fa';
import { homeEn } from './home.en';
import { monitoringFa } from './monitoring.fa';
import { monitoringEn } from './monitoring.en';
import { comparisonFa } from './comparison.fa';
import { comparisonEn } from './comparison.en';
import { creatorLandingFa } from './creatorLanding.fa';
import { creatorLandingEn } from './creatorLanding.en';
import { setDocumentDirection, type TextDirection } from '../lib/rtl';

export type Locale = 'fa' | 'en';

/**
 * The C5 dictionaries are merged on top of the base ones rather than pasted
 * into the 4,400-line files. The merge order matters only in that a C5 key
 * must not silently shadow an existing product key: `__tests__/i18n.test.tsx`
 * fails on a duplicate so that stays a deliberate act.
 */
const dictionaries: Record<Locale, Record<string, string>> = {
  fa: { ...fa, ...scaleFa, ...discoveryFa, ...journeyFa, ...runtimeFa, ...controlFa, ...blogFa, ...accountFa, ...financeFa, ...trustFa, ...homeFa, ...monitoringFa, ...comparisonFa, ...creatorLandingFa },
  en: { ...en, ...scaleEn, ...discoveryEn, ...journeyEn, ...runtimeEn, ...controlEn, ...blogEn, ...accountEn, ...financeEn, ...trustEn, ...homeEn, ...monitoringEn, ...comparisonEn, ...creatorLandingEn },
};

const STORAGE_KEY = 'ah-locale';
export const LOCALES: Locale[] = ['fa', 'en'];

export const LOCALE_META: Record<Locale, { label: string; dir: TextDirection; htmlLang: string; intlTag: string }> = {
  fa: { label: 'فارسی', dir: 'rtl', htmlLang: 'fa', intlTag: 'fa-IR' },
  en: { label: 'English', dir: 'ltr', htmlLang: 'en', intlTag: 'en-US' },
};

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'fa';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'fa' || stored === 'en' ? stored : 'fa';
}

/** Module-level locale so non-React modules (formatters, label helpers)
 *  translate with the active language without prop-drilling. */
let currentLocale: Locale = readInitialLocale();

export function getLocale(): Locale {
  return currentLocale;
}

/** Set the locale outside React (module consumers, tests). React
 *  consumers should prefer useI18n().setLocale so they re-render. */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
  applyLocaleToDocument(locale);
}

/** Active BCP-47 tag for Intl formatting (fa-IR / en-US). */
export function intlLocale(): string {
  return LOCALE_META[currentLocale].intlTag;
}

export function isRtlLocale(): boolean {
  return LOCALE_META[currentLocale].dir === 'rtl';
}

/** Translate a key with optional {var} interpolation. Falls back to fa,
 *  then to the key itself (visible in development, never crashes). */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? fa;
  let value = dict[key] ?? fa[key] ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
    }
  }
  return value;
}

/** Whether a key exists in the active (or fallback) dictionary. */
export function tHas(key: string): boolean {
  const dict = dictionaries[currentLocale] ?? fa;
  return key in dict || key in fa;
}

function applyLocaleToDocument(locale: Locale): void {
  if (typeof document === 'undefined') return;
  const meta = LOCALE_META[locale];
  document.documentElement.lang = meta.htmlLang;
  setDocumentDirection(meta.dir);
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Subscribe helper — components call this so they re-render on switch. */
  t: typeof t;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'fa',
  setLocale: () => {},
  t,
});

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /** Override the persisted/locale-storage default (tests, storybook). */
  initialLocale?: Locale;
}) {
  // Apply persisted locale before first paint of provider children.
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = initialLocale ?? readInitialLocale();
    currentLocale = initial;
    return initial;
  });

  useEffect(() => {
    applyLocaleToDocument(locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (next: Locale) => {
        // Update the module-level locale synchronously so this render
        // pass (and any non-React consumer) already sees new strings.
        currentLocale = next;
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* storage unavailable (private mode) — language still switches */
        }
        applyLocaleToDocument(next);
        setLocaleState(next);
      },
      t,
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
