/** Persian (Farsi) / Western digit conversion helpers. */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const PERSIAN_TO_ENGLISH: Record<string, string> = {
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

export function toEnglishDigits(input: string): string {
  return input.replace(/[۰-۹]/g, (digit) => PERSIAN_TO_ENGLISH[digit] ?? digit);
}

export function formatWithPersianDigits(template: string, ...values: Array<string | number>): string {
  return toPersianDigits(template.replace(/\{(\d+)\}/g, (_match, index) => String(values[Number(index)] ?? '')));
}
