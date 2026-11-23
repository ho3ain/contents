/**
 * Precision-safe money helpers for the finance surfaces.
 *
 * The financial core keeps integer minor units (bigint, up to 9e18) and the
 * API exposes them as DECIMAL STRINGS ("1250000", "-3000.50"). `formatMoney`
 * in lib/format.ts goes through `Number`, which silently loses precision above
 * 2^53 — fine for counters, not for a ledger. Everything here works on the
 * string / BigInt representation and only touches digits for display.
 */
import { getLocale } from '../i18n';
import { toEnglishDigits, toPersianDigits } from '../utils/digits';

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Group the integer part of a decimal string with the locale's separator. */
export function formatAmount(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const text = toEnglishDigits(String(value)).trim();
  if (!DECIMAL.test(text)) return String(value);
  const negative = text.startsWith('-');
  const [whole, fraction] = (negative ? text.slice(1) : text).split('.');
  const fa = getLocale() === 'fa';
  const separator = fa ? '٬' : ',';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  const body = fraction && /[1-9]/.test(fraction) ? `${grouped}${fa ? '٫' : '.'}${fraction.replace(/0+$/, '')}` : grouped;
  const out = `${negative ? '−' : ''}${body}`;
  return fa ? toPersianDigits(out) : out;
}

/** Decimal-string amount with its currency label (e.g. «۱٬۲۵۰٬۰۰۰ ریال»). */
export function formatAmountWithCurrency(value: string | null | undefined, currencyLabel: string): string {
  const amount = formatAmount(value);
  return amount === '—' ? amount : `${amount} ${currencyLabel}`;
}

/** Whole-unit amounts only (IRR has exponent 0). Accepts Persian digits. */
export function parseWholeAmount(input: string): bigint | null {
  const text = toEnglishDigits(input).replace(/[\s,٬_]/g, '');
  if (!/^\d{1,30}$/.test(text)) return null;
  const value = BigInt(text);
  return value > 0n ? value : null;
}

/** BigInt-safe comparison of two decimal strings with no fraction (IRR). */
export function amountGreaterThan(a: string, b: string): boolean {
  const toBig = (v: string) =>
    BigInt(
      toEnglishDigits(v)
        .split('.')[0]
        .replace(/[^\d-]/g, '') || '0',
    );
  return toBig(a) > toBig(b);
}

export function isZeroAmount(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return /^-?0+(\.0+)?$/.test(toEnglishDigits(String(value)).trim()) || value === '';
}
