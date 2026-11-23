/**
 * Customer-facing currency presentation (Sprint 2, P2-02).
 *
 * UNIT CONTRACT
 * - Storage, API and gateway stay in **IRR** (DECIMAL strings such as
 *   "1500000.00"); nothing here is ever sent back to the server.
 * - Persian UI presents **Toman** (1 Toman = 10 IRR); English UI presents
 *   Toman with an explicit unit word. The conversion happens exactly once,
 *   at this presentation boundary, by shifting the decimal point of the
 *   string — no floating point, no `Number`, no rounding. An amount that is
 *   not a multiple of 10 Rial keeps its exact fraction ("1500005" → "150000.5")
 *   so a price can never be misstated; the product DTO allows such prices.
 * - Any currency other than IRR is presented unchanged with its ISO code
 *   (none exists today — this is a safety net, not a feature).
 *
 * Formatting (digit grouping, Persian digits) is delegated to the existing
 * string-safe `formatAmount` in `lib/money.ts`; the shared `<Price>` component
 * in `components/ui/Price.tsx` renders the figure + unit (Toman icon in
 * Persian, the word "Toman" in English) with a single accessible unit label.
 */
import { getLocale } from '../i18n';
import { formatAmount } from './money';
import { toEnglishDigits } from '../utils/digits';

export const RIAL_PER_TOMAN = 10;

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Normalise an API/DB amount to an English-digit decimal string, or null when it is not an amount. */
export function normalizeAmount(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = toEnglishDigits(String(value)).trim();
  if (!DECIMAL.test(text)) return null;
  return text;
}

/**
 * Exact IRR → Toman conversion on the string representation (÷10 as a
 * decimal-point shift). Returns null for a non-numeric input.
 *
 *   rialToToman("1500000.00") → "150000"
 *   rialToToman("1500005")    → "150000.5"   (never rounded)
 *   rialToToman("5")          → "0.5"
 *   rialToToman("0")          → "0"
 *   rialToToman("123456789012345678901") → "12345678901234567890.1" (no precision loss)
 */
export function rialToToman(value: string | number | null | undefined): string | null {
  const text = normalizeAmount(value);
  if (text === null) return null;
  const negative = text.startsWith('-');
  const [wholeRaw, fractionRaw = ''] = (negative ? text.slice(1) : text).split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '');
  const shiftedWhole = whole.length > 1 ? whole.slice(0, -1) : '0';
  const shiftedFraction = `${whole.slice(-1)}${fractionRaw}`.replace(/0+$/, '');
  const body = shiftedFraction ? `${shiftedWhole}.${shiftedFraction}` : shiftedWhole;
  const isZero = /^0(\.0*)?$/.test(body);
  return negative && !isZero ? `-${body}` : body;
}

export type PresentedUnit = 'toman' | 'code';

export interface PresentedPrice {
  /** Locale-formatted figure (Persian digits + «٬» in fa, Latin digits + "," in en). */
  figure: string;
  /** `toman` → figure is in Toman; `code` → the original currency code is shown verbatim. */
  unit: PresentedUnit;
  /** ISO code of the ORIGINAL amount (always echoed for `code`). */
  currency: string;
  /** Plain-text unit name for assistive technology / plain-text contexts. */
  unitLabel: string;
  /** Full plain-text rendering ("۱۵۰٬۰۰۰ تومان" / "150,000 Toman"). */
  text: string;
}

export const TOMAN_LABEL = { fa: 'تومان', en: 'Toman' } as const;

/**
 * Presentation record for a customer-facing amount. IRR is converted to
 * Toman; other codes are formatted as-is with their code as the unit.
 * Returns null when the input is not an amount (callers render «—»).
 */
export function presentPrice(amount: string | number | null | undefined, currency: string | null | undefined = 'IRR'): PresentedPrice | null {
  const code = (currency || 'IRR').toUpperCase();
  const locale = getLocale() === 'fa' ? 'fa' : 'en';
  if (code === 'IRR') {
    const toman = rialToToman(amount);
    if (toman === null) return null;
    const figure = formatAmount(toman);
    const unitLabel = TOMAN_LABEL[locale];
    return { figure, unit: 'toman', currency: code, unitLabel, text: `${figure} ${unitLabel}` };
  }
  const normalized = normalizeAmount(amount);
  if (normalized === null) return null;
  const figure = formatAmount(normalized);
  return { figure, unit: 'code', currency: code, unitLabel: code, text: `${figure} ${code}` };
}

/** Plain-text price for toasts, titles, `aria-label`s and e-mails («۱۵۰٬۰۰۰ تومان»). */
export function formatPriceText(amount: string | number | null | undefined, currency: string | null | undefined = 'IRR'): string {
  return presentPrice(amount, currency)?.text ?? '—';
}
