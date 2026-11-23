/**
 * Locale-aware formatting. All user-visible dates, numbers, money and
 * relative times derive from the ACTIVE LOCALE (fa → fa-IR with Persian
 * digits, en → en-US). Backend enum values are never displayed raw —
 * label helpers in `lib/ui.ts` map them via i18n.
 */
import { intlLocale, getLocale } from '../i18n';
import { toPersianDigits } from '../utils/digits';

/** Wraps formatted output in Persian digits when the locale is fa. */
function digits(value: string): string {
  return getLocale() === 'fa' ? toPersianDigits(value) : value;
}

/**
 * Plain locale number formatter (digit grouping, no fraction). Used for
 * counters and KPIs. **Customer-facing prices must NOT use this** — they
 * go through `<Price>` / `presentPrice()` in `lib/currency.ts`, which
 * converts the IRR amount to Toman exactly once at the presentation
 * boundary (Sprint 2, P2-02).
 */
export function formatMoney(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const number = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(number)) return String(value);
  return digits(
    new Intl.NumberFormat(intlLocale(), {
      maximumFractionDigits: 0,
    }).format(number),
  );
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const dateOnly = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** Locale-aware relative time ("۳ دقیقه پیش" / "3 minutes ago"). */
export function timeAgo(value: string | Date): string {
  const diffSeconds = Math.floor(
    (Date.now() - new Date(value).getTime()) / 1000,
  );
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
  if (diffSeconds < 60) return rtf.format(-diffSeconds, 'second');
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, 'month');
  return rtf.format(-Math.floor(months / 12), 'year');
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

/** Formats a rating with one decimal. */
export function formatRating(value: number | null): string {
  if (value === null) return '—';
  const formatted = value % 1 === 0 ? String(value) : value.toFixed(1);
  return digits(formatted);
}

/** Localized whole percentage: «۵۷٪» (fa) / "57%" (en). */
export function formatPercent(value: number): string {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  return getLocale() === 'fa' ? `${toPersianDigits(String(rounded))}٪` : `${rounded}%`;
}

/** Localized integer count (Persian digits in fa). */
export function formatCount(value: number): string {
  return digits(String(Math.round(Number.isFinite(value) ? value : 0)));
}

/**
 * Locale-aware list: «الف، ب، ج» (fa) / "a, b, c" (en). Never a hardcoded
 * Persian comma in English UI.
 */
export function formatList(items: readonly string[]): string {
  return items.join(getLocale() === 'fa' ? '، ' : ', ');
}
