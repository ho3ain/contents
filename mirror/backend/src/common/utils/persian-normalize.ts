/**
 * Persian text normalisation — FOR COMPARISON ONLY.
 *
 * Used by the SEO analysis engine and the knowledge graph to match keywords
 * and anchors across the spelling variants Persian text arrives in: Arabic
 * yeh/kaf (ي/ك) vs Persian (ی/ک), zero-width non-joiner vs plain space,
 * Arabic-Indic and Persian digits vs ASCII, diacritics (tashkeel) and
 * tatweel. The normalised form is NEVER written back to stored content —
 * callers keep the author's text exactly as typed.
 */

const DIGIT_MAP: Record<string, string> = {
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
};

/** Arabic diacritics (fathatan … sukun), superscript alef, tatweel. */
const DIACRITICS_RE = /[\u064B-\u0652\u0670\u0640]/g;
/** ZWNJ, ZWJ, LRM, RLM, BOM-ish marks → plain space (ZWNJ) or nothing. */
const ZWNJ_RE = /[\u200C]/g;
const INVISIBLE_RE = /\u200B|\u200D|\u200E|\u200F|\uFEFF/g;

export function normalizePersian(input: string): string {
  return input
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ/g, 'ه')
    .replace(/ة/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی')
    .replace(DIACRITICS_RE, '')
    .replace(INVISIBLE_RE, '')
    .replace(ZWNJ_RE, ' ')
    .replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d)
    .toLowerCase()
    .replace(/[\s\u00A0]+/g, ' ')
    .trim();
}

/**
 * Comparison key for a keyword or anchor: normalised, punctuation stripped,
 * single-spaced. `'نیم‌فاصله'`, `'نيم فاصله'` and `'نیم  فاصله'` all map to
 * `'نیم فاصله'`.
 */
export function keywordKey(input: string): string {
  return normalizePersian(input)
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word tokens of a text, normalised; shared by density/distribution rules. */
export function tokenize(input: string): string[] {
  const key = keywordKey(input);
  return key ? key.split(' ') : [];
}

/**
 * Counts whole-phrase occurrences of `keyword` inside `text` (both
 * normalised, word-boundary aware for Latin and Persian scripts).
 */
export function countOccurrences(text: string, keyword: string): number {
  const haystack = ` ${tokenize(text).join(' ')} `;
  const needle = tokenize(keyword).join(' ');
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  const pattern = ` ${needle} `;
  for (;;) {
    const at = haystack.indexOf(pattern, from);
    if (at < 0) return count;
    count += 1;
    from = at + pattern.length - 1;
  }
}
