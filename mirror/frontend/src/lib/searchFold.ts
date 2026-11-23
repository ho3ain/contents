/**
 * Persian-aware search folding — the browser twin of
 * `agentHub_backend/src/modules/blog/domain/blog-search.ts`.
 *
 * The API matches queries against a folded copy of each article (Arabic
 * ي/ك → Persian ی/ک, Arabic/Persian digits → ASCII, diacritics, tatweel
 * and ZWNJ removed, lower-cased, whitespace collapsed). The website folds
 * the same way so it can show *why* a card matched: `highlightRanges` maps
 * matches found in the folded text back onto the original string, so a
 * «می‌شود» written with ZWNJ is marked when the reader typed «میشود».
 *
 * Keep the character tables identical to the backend file.
 */

const LETTER_FROM = 'يىكؤإأآةۀ';
const LETTER_TO = 'ییکواااهه';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const LETTER_MAP = new Map<string, string>();
for (let i = 0; i < LETTER_FROM.length; i += 1) LETTER_MAP.set(LETTER_FROM[i], LETTER_TO[i]);
for (let i = 0; i < 10; i += 1) {
  LETTER_MAP.set(PERSIAN_DIGITS[i], String(i));
  LETTER_MAP.set(ARABIC_DIGITS[i], String(i));
}

/** Arabic diacritics U+064B–U+0652, superscript alef, tatweel, ZWNJ, ZWJ, BOM. */
const DROP_RE = /[\u064B-\u0652\u0670\u0640\u200C\uFEFF]|\u200D/u;
const SPLIT_RE = /[\s,.;:!?،؛؟«»"'()[\]{}<>/\\|+*=~`^%$#@&_-]+/u;

export const SEARCH_QUERY_MAX_TERMS = 8;
export const SEARCH_TERM_MIN_LENGTH = 2;

/** Folds one code point; '' when it is dropped, ' ' for any whitespace. */
function foldChar(ch: string): string {
  if (DROP_RE.test(ch)) return '';
  if (/\s/u.test(ch)) return ' ';
  const mapped = LETTER_MAP.get(ch);
  if (mapped !== undefined) return mapped;
  return ch.normalize('NFKC').toLowerCase();
}

export interface FoldedText {
  folded: string;
  /** `map[i]` = index in the original string of the character that produced `folded[i]`. */
  map: number[];
}

/** Folds while remembering where every folded character came from. */
export function foldWithMap(text: string): FoldedText {
  let folded = '';
  const map: number[] = [];
  let index = 0;
  for (const ch of text) {
    const out = foldChar(ch);
    if (out === ' ') {
      if (folded.length > 0 && !folded.endsWith(' ')) {
        folded += ' ';
        map.push(index);
      }
    } else {
      // One map entry per UTF-16 unit so indices line up with `indexOf`.
      for (let k = 0; k < out.length; k += 1) {
        folded += out[k];
        map.push(index);
      }
    }
    index += ch.length;
  }
  if (folded.endsWith(' ')) {
    folded = folded.slice(0, -1);
    map.pop();
  }
  return { folded, map };
}

export const foldSearchText = (text: string): string => foldWithMap(text).folded;

/** Query → distinct folded terms (same rules as the API's tokenizer). */
export function tokenizeSearchQuery(query: string): string[] {
  const parts = foldSearchText(query).split(SPLIT_RE).filter(Boolean);
  const terms: string[] = [];
  for (const part of parts) {
    if (terms.includes(part)) continue;
    if (part.length < SEARCH_TERM_MIN_LENGTH && parts.length > 1) continue;
    terms.push(part);
    if (terms.length >= SEARCH_QUERY_MAX_TERMS) break;
  }
  return terms;
}

export interface TextRange {
  start: number;
  end: number;
}

/**
 * Character ranges of `text` (original indices) that match any term after
 * folding; overlapping/adjacent ranges are merged and sorted. Terms must
 * already be folded (use `tokenizeSearchQuery`).
 */
export function highlightRanges(text: string, terms: string[]): TextRange[] {
  if (!text || terms.length === 0) return [];
  const { folded, map } = foldWithMap(text);
  const ranges: TextRange[] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;
      const lastFolded = at + term.length - 1;
      const start = map[at];
      const endIndex = map[lastFolded];
      // Extend to the end of the original code point (astral characters span two units).
      const end = endIndex + ((text.codePointAt(endIndex) ?? 0) > 0xffff ? 2 : 1);
      ranges.push({ start, end });
      from = at + 1;
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TextRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export interface TextSegment {
  text: string;
  hit: boolean;
}

/** Splits `text` into plain / highlighted segments for rendering. */
export function highlightSegments(text: string, terms: string[]): TextSegment[] {
  const ranges = highlightRanges(text, terms);
  if (ranges.length === 0) return [{ text, hit: false }];
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const { start, end } of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), hit: false });
    segments.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}
