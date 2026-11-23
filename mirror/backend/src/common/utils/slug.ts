/**
 * Deterministic URL-safe slug from arbitrary text. Latin letters are kept,
 * everything else (including Persian script) is dropped, so Persian product
 * names need a Latin fallback supplied by the caller.
 */
export function slugify(input: string): string {
  return input
    .toString()
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * Returns a slug guaranteed not to exist yet by appending a short suffix
 * while the candidate keeps colliding.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || 'item';
  let candidate = root;
  let attempt = 0;
  while (await exists(candidate)) {
    attempt += 1;
    candidate = `${root}-${attempt + 1}`;
    if (attempt > 50) {
      candidate = `${root}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}

/**
 * Persian → Latin letter map for product slugs (Phase A2 §7). Consonant-
 * level and deterministic — a readable, editable suggestion rather than a
 * linguistic transliteration. Mirrored 1:1 by the frontend slug preview
 * (src/lib/product-creation.ts) so the suggestion shown in the wizard is
 * exactly what the server generates.
 */
const FA_TO_LATIN: Record<string, string> = {
  ا: 'a',
  آ: 'a',
  أ: 'a',
  إ: 'e',
  ب: 'b',
  پ: 'p',
  ت: 't',
  ث: 's',
  ج: 'j',
  چ: 'ch',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'z',
  ر: 'r',
  ز: 'z',
  ژ: 'zh',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'z',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ق: 'gh',
  ک: 'k',
  ك: 'k',
  گ: 'g',
  ل: 'l',
  م: 'm',
  ن: 'n',
  و: 'v',
  ؤ: 'v',
  ه: 'h',
  ۀ: 'e',
  ة: 'h',
  ی: 'y',
  ي: 'y',
  ئ: 'y',
  ء: '',
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
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '\u200c': '',
};

/** Product slug: Persian letters transliterated, then {@link slugify}. */
export function slugifyProduct(input: string): string {
  const latin = Array.from(input.toString())
    .map((char) => FA_TO_LATIN[char] ?? char)
    .join('');
  return slugify(latin);
}
