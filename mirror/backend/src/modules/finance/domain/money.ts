/**
 * Phase 2 / W0 — the money model.
 *
 * DECISION (documented in docs/finance/MONEY_MODEL.md)
 * ---------------------------------------------------
 * Money inside the financial core is an INTEGER NUMBER OF MINOR UNITS held in
 * a `bigint`, together with an explicit currency code. There is no floating
 * point anywhere in this module and `Number` is never used for an amount.
 *
 *  - The database stores minor units as BIGINT (never NUMERIC, never FLOAT).
 *  - The legacy commerce tables (`orders`, `payments`, `refunds`) store
 *    NUMERIC(20,2) MAJOR units as strings. `parseMajorToMinor` converts them
 *    EXACTLY (string arithmetic) and refuses a value that cannot be
 *    represented without rounding — a fractional rial is a data error to be
 *    reported, not a number to be rounded away.
 *  - The currency exponent table is explicit. IRR has exponent 0: the
 *    platform's prices are whole rials, matching the existing growth code
 *    (`scale/domain/money.ts`) and the Zarinpal adapter (integral rial only).
 *    Using the ISO-4217 exponent of 2 for IRR would silently make every
 *    amount 100x its real value.
 *
 * Rounding (the only place it happens): `mulDivRound` — HALF_UP on a
 * non-negative quotient, computed with integer arithmetic. The mode is part
 * of a commission policy version, so it can never change under old data.
 */

/** Minor-unit exponent per supported currency. An unknown code is an error. */
const CURRENCY_EXPONENT: Readonly<Record<string, number>> = Object.freeze({
  IRR: 0,
  USD: 2,
  EUR: 2,
});

export class MoneyError extends Error {
  constructor(
    readonly code:
      | 'UNKNOWN_CURRENCY'
      | 'INVALID_AMOUNT'
      | 'PRECISION_LOSS'
      | 'CURRENCY_MISMATCH'
      | 'NEGATIVE'
      | 'OVERFLOW'
      | 'DIVISION_BY_ZERO',
    message: string,
  ) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Largest amount accepted anywhere (BIGINT range, with head-room). */
export const MAX_MINOR: bigint = 9_000_000_000_000_000_000n;

export function isSupportedCurrency(code: string): boolean {
  return Object.keys(CURRENCY_EXPONENT).includes(code);
}

export function currencyExponent(code: string): number {
  if (!isSupportedCurrency(code)) {
    throw new MoneyError(
      'UNKNOWN_CURRENCY',
      `Currency "${code}" has no minor-unit definition`,
    );
  }
  return CURRENCY_EXPONENT[code];
}

/** An exact amount: integer minor units + explicit currency. Immutable. */
export interface Money {
  readonly minor: bigint;
  readonly currency: string;
}

export function money(minor: bigint, currency: string): Money {
  currencyExponent(currency); // validates the currency
  if (minor > MAX_MINOR || minor < -MAX_MINOR) {
    throw new MoneyError('OVERFLOW', 'Amount exceeds the supported range');
  }
  return Object.freeze({ minor, currency });
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      'CURRENCY_MISMATCH',
      `Cannot combine ${a.currency} with ${b.currency}`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function isZero(a: Money): boolean {
  return a.minor === 0n;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

/**
 * Parses a NON-NEGATIVE decimal string ("250000", "250000.00", "12.5") into
 * minor units of `currency`, exactly. A digit beyond the currency's exponent
 * is accepted only when it is zero ("250000.00" for IRR is fine, "250000.50"
 * is a PRECISION_LOSS error).
 */
export function parseMajorToMinor(value: string, currency: string): bigint {
  const exponent = currencyExponent(currency);
  if (typeof value !== 'string' || !/^\d{1,30}(\.\d{1,30})?$/.test(value)) {
    throw new MoneyError(
      'INVALID_AMOUNT',
      `"${String(value)}" is not a non-negative decimal amount`,
    );
  }
  const [whole, fraction = ''] = value.split('.');
  const kept = fraction.slice(0, exponent).padEnd(exponent, '0');
  const dropped = fraction.slice(exponent);
  if (/[1-9]/.test(dropped)) {
    throw new MoneyError(
      'PRECISION_LOSS',
      `"${value}" has more precision than ${currency} allows (${exponent} decimals)`,
    );
  }
  const minor = BigInt(whole + kept);
  if (minor > MAX_MINOR) {
    throw new MoneyError('OVERFLOW', 'Amount exceeds the supported range');
  }
  return minor;
}

/** Inverse of `parseMajorToMinor` — the canonical decimal string. */
export function formatMinorToMajor(minor: bigint, currency: string): string {
  const exponent = currencyExponent(currency);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString();
  if (exponent === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(exponent + 1, '0');
  const whole = padded.slice(0, padded.length - exponent);
  const fraction = padded.slice(padded.length - exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Parses a database BIGINT/count rendered as text. Rejects anything else. */
export function parseMinorText(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new MoneyError('INVALID_AMOUNT', 'Unsafe integer amount');
    }
    return BigInt(value);
  }
  if (!/^-?\d{1,20}$/.test(value)) {
    throw new MoneyError('INVALID_AMOUNT', `"${value}" is not an integer`);
  }
  return BigInt(value);
}

export type RoundingMode = 'HALF_UP' | 'DOWN' | 'UP';

/**
 * `round(value * numerator / denominator)` for a non-negative `value`,
 * `numerator` and a positive `denominator`, in pure integer arithmetic.
 */
export function mulDivRound(
  value: bigint,
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = 'HALF_UP',
): bigint {
  if (denominator <= 0n) {
    throw new MoneyError('DIVISION_BY_ZERO', 'Denominator must be positive');
  }
  if (value < 0n || numerator < 0n) {
    throw new MoneyError('NEGATIVE', 'mulDivRound works on non-negative input');
  }
  const product = value * numerator;
  const quotient = product / denominator;
  const remainder = product % denominator;
  if (remainder === 0n) return quotient;
  switch (mode) {
    case 'DOWN':
      return quotient;
    case 'UP':
      return quotient + 1n;
    case 'HALF_UP':
      return remainder * 2n >= denominator ? quotient + 1n : quotient;
  }
}

/**
 * Splits `total` into parts proportional to `weights` so that the parts add
 * up to EXACTLY `total` (largest-remainder method, ties broken by index —
 * fully deterministic). No unit can appear or disappear.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  if (total < 0n)
    throw new MoneyError('NEGATIVE', 'Cannot allocate a negative');
  if (weights.length === 0) {
    throw new MoneyError('INVALID_AMOUNT', 'At least one weight is required');
  }
  if (weights.some((w) => w < 0n)) {
    throw new MoneyError('NEGATIVE', 'Weights must not be negative');
  }
  const sum = weights.reduce((acc, w) => acc + w, 0n);
  if (sum === 0n) {
    throw new MoneyError('DIVISION_BY_ZERO', 'Weights must not all be zero');
  }
  const shares = weights.map((w) => (total * w) / sum);
  const remainders = weights.map((w, index) => ({
    index,
    rest: (total * w) % sum,
  }));
  let left = total - shares.reduce((acc, s) => acc + s, 0n);
  remainders.sort((a, b) =>
    a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1,
  );
  for (const { index } of remainders) {
    if (left === 0n) break;
    shares[index] += 1n;
    left -= 1n;
  }
  return shares;
}
