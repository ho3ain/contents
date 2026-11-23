/**
 * Iranian national code (کد ملی) — 10 digits with a check digit.
 * Structural validation only: it proves the number is well-formed, never
 * that it belongs to the person (that is what the KYC review is for).
 */
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

export function normalizeNationalId(input: string): string {
  return input
    .trim()
    .replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC.indexOf(d)))
    .replace(/[\s-]/g, '');
}

export function isValidIranNationalId(input: string): boolean {
  const id = normalizeNationalId(input);
  if (!/^\d{10}$/.test(id)) return false;
  if (/^(\d)\1{9}$/.test(id)) return false;
  const check = Number(id[9]);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(id[i]) * (10 - i);
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}
