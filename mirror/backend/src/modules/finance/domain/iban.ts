/**
 * W6.5 — Iranian bank destination (Shaba / IBAN, ISO 13616).
 *
 * Pure normalisation and validation. Validation proves only that the string
 * is a well-formed Iranian IBAN with correct check digits; it says NOTHING
 * about who owns the account. Ownership is a separate, explicit state
 * (`creator_bank_accounts.ownership_state`) and is never claimed without an
 * actual verification provider.
 */
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export class IbanError extends Error {
  constructor(
    readonly code: 'FORMAT' | 'CHECK_DIGITS' | 'COUNTRY',
    message: string,
  ) {
    super(message);
    this.name = 'IbanError';
  }
}

/** Persian/Arabic digits → ASCII, strips spaces, dashes and dots, upper-cases. */
export function normalizeIban(input: string): string {
  let out = '';
  for (const char of input.normalize('NFKC')) {
    const persian = PERSIAN_DIGITS.indexOf(char);
    const arabic = ARABIC_DIGITS.indexOf(char);
    if (persian >= 0) out += String(persian);
    else if (arabic >= 0) out += String(arabic);
    else if (/[\s\-.\u200c\u200f\u200e]/.test(char)) continue;
    else out += char.toUpperCase();
  }
  // People type the 24 digits without the country prefix.
  if (/^\d{24}$/.test(out)) out = `IR${out}`;
  return out;
}

/** ISO 7064 MOD 97-10 over the rearranged IBAN, without big-number maths. */
export function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const digits = code >= 48 && code <= 57 ? char : String(code - 55); // A=10 … Z=35
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

/** Returns the normalised IBAN or throws IbanError. */
export function validateIranIban(input: string): string {
  const iban = normalizeIban(input);
  if (!iban.startsWith('IR')) {
    throw new IbanError(
      'COUNTRY',
      'Only Iranian (IR) Shaba numbers are supported',
    );
  }
  if (!/^IR\d{24}$/.test(iban)) {
    throw new IbanError('FORMAT', 'A Shaba number is IR followed by 24 digits');
  }
  if (ibanMod97(iban) !== 1) {
    throw new IbanError('CHECK_DIGITS', 'The Shaba check digits are invalid');
  }
  return iban;
}

export function isValidIranIban(input: string): boolean {
  try {
    validateIranIban(input);
    return true;
  } catch {
    return false;
  }
}

/** Display form that never reveals more than the last four digits. */
export function maskIban(iban: string): string {
  const last4 = iban.slice(-4);
  return `IR** **** **** **** **** **${last4.slice(0, 2)} ${last4.slice(2)}`;
}

/** Builds a valid IR IBAN from 22 body digits (tests / fixtures only). */
export function buildIranIban(body22: string): string {
  if (!/^\d{22}$/.test(body22)) {
    throw new IbanError('FORMAT', 'Body must be 22 digits');
  }
  const provisional = `IR00${body22}`;
  const check = 98 - ibanMod97(provisional);
  return `IR${String(check).padStart(2, '0')}${body22}`;
}
