/**
 * Blog search — text folding, query tokenisation and result snippets.
 *
 * Persian readers type the same word many ways: Arabic ي/ك instead of
 * Persian ی/ک, with or without the zero-width non-joiner («می‌شود» vs
 * «میشود»), with diacritics copied from a source, with Persian or ASCII
 * digits. `foldSearchText` maps all of those onto one canonical form; it is
 * applied to the stored `search_text` (BlogPostsService.applyRender and the
 * migration that back-fills existing rows) AND to every query term, so a
 * reader never misses an article because of orthography.
 *
 * `foldSqlExpression` is the same folding as a PostgreSQL expression — used
 * for the ranking columns (title / excerpt) that are not stored folded and by
 * the back-fill migration. Keep the two in sync: the unit test asserts they
 * agree on a corpus.
 */

/** Arabic presentation → Persian canonical letters (one-to-one, same length). */
const FOLD_FROM = 'يىكؤإأآةۀ' + '۰۱۲۳۴۵۶۷۸۹' + '٠١٢٣٤٥٦٧٨٩';
const FOLD_TO = 'ییکوااا' + 'هه' + '0123456789' + '0123456789';

/** Characters dropped entirely: Arabic diacritics, tatweel, ZWNJ/ZWJ, BOM. */
// ZWJ sits outside the class: a class ending in U+200D reads as a joined
// sequence to linters (no-misleading-character-class).
const DROP_RE = /[\u064B-\u0652\u0670\u0640\u200C\uFEFF]|\u200D/g;
const WS_RE = /\s+/g;
/** Token separators: whitespace plus Latin/Persian punctuation. */
const SPLIT_RE = /[\s,.;:!?،؛؟«»"'()[\]{}<>/\\|+*=~`^%$#@&_-]+/u;

const FOLD_MAP = new Map<string, string>();
for (let i = 0; i < FOLD_FROM.length; i += 1)
  FOLD_MAP.set(FOLD_FROM[i], FOLD_TO[i]);

export const SEARCH_QUERY_MAX_TERMS = 8;
export const SEARCH_TERM_MIN_LENGTH = 2;

export function foldSearchText(value: string): string {
  let out = '';
  const base = value.normalize('NFKC').toLowerCase().replace(DROP_RE, '');
  for (const ch of base) out += FOLD_MAP.get(ch) ?? ch;
  return out.replace(WS_RE, ' ').trim();
}

/** Stored `blog_posts.search_text`: title, excerpt and body, folded. */
export const SEARCH_TEXT_MAX_CHARS = 200_000;
export function buildSearchText(
  title: string,
  excerpt: string,
  plainText: string,
): string {
  return foldSearchText(`${title}\n${excerpt}\n${plainText}`).slice(
    0,
    SEARCH_TEXT_MAX_CHARS,
  );
}

/**
 * Query → distinct folded terms. Terms shorter than two characters are
 * dropped unless they are all there is (a single-letter search still
 * runs). Order is preserved (first term = most important for snippets).
 */
export function tokenizeSearchQuery(query: string): string[] {
  const folded = foldSearchText(query);
  if (!folded) return [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of folded.split(SPLIT_RE)) {
    const term = raw.trim();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  const long = terms.filter((t) => t.length >= SEARCH_TERM_MIN_LENGTH);
  return (long.length ? long : terms.slice(0, 1)).slice(
    0,
    SEARCH_QUERY_MAX_TERMS,
  );
}

/**
 * Phrase forms for ranking a multi-term query: the terms as typed (space
 * separated) and glued together — the folded text drops ZWNJ, so «می شود»
 * typed with a space must still count as a phrase hit on «می‌شود».
 */
export function phraseForms(terms: string[]): string[] {
  if (terms.length < 2) return [];
  const spaced = terms.join(' ');
  const glued = terms.join('');
  return glued === spaced ? [spaced] : [spaced, glued];
}

/** Escapes LIKE wild-cards; folding never introduces them, user input can. */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * PostgreSQL twin of `foldSearchText` for a column/expression. `translate`
 * handles the letter and digit map, `regexp_replace` the dropped set and
 * whitespace; `lower()` matches `toLowerCase()` for Latin text.
 */
export function foldSqlExpression(expr: string): string {
  const drop = '[\\u064B-\\u0652\\u0670\\u0640\\u200C\\u200D\\uFEFF]';
  return `btrim(regexp_replace(regexp_replace(translate(lower(${expr}), '${FOLD_FROM}', '${FOLD_TO}'), '${drop}', '', 'g'), '\\s+', ' ', 'g'))`;
}

export type SnippetField = 'title' | 'excerpt' | 'body';

export interface SearchSnippet {
  /** Where the best match was found. */
  field: SnippetField;
  /** Original (unfolded) text around the first matching term, ≤ ~`maxLength`. */
  text: string;
}

/** Sentence ends (Latin/Persian) or any line break — list items, table cells. */
const SENTENCE_RE = /(?<=[.!?؟!。])\s+|\n+/u;

/**
 * Picks the first sentence of title → excerpt → body that contains any term
 * and trims it around the match. Matching runs on the folded text, the
 * returned snippet is the original segment so the client can highlight.
 */
export function searchSnippet(
  parts: { title: string; excerpt: string; body: string },
  terms: string[],
  maxLength = 180,
): SearchSnippet | null {
  if (!terms.length) return null;
  const fields: Array<[SnippetField, string]> = [
    ['title', parts.title],
    ['excerpt', parts.excerpt],
    ['body', parts.body],
  ];
  // Best segment = the sentence matching the most distinct terms; ties go to
  // the earlier field (title > excerpt > body) and the earlier sentence, so a
  // body sentence holding the whole query beats a title holding one word.
  let best: {
    score: number;
    field: SnippetField;
    segment: string;
    hit: string;
  } | null = null;
  for (const [field, text] of fields) {
    if (!text) continue;
    for (const segment of text.split(SENTENCE_RE)) {
      const folded = foldSearchText(segment);
      const found = terms.filter((t) => folded.includes(t));
      if (!found.length || (best && found.length <= best.score)) continue;
      best = { score: found.length, field, segment, hit: found[0] };
      if (found.length === terms.length) break;
    }
    if (best && best.score === terms.length) break;
  }
  if (!best) return null;
  return {
    field: best.field,
    text: trimAround(
      best.segment.replace(WS_RE, ' ').trim(),
      best.hit,
      maxLength,
    ),
  };
}

function trimAround(segment: string, term: string, maxLength: number): string {
  if (segment.length <= maxLength) return segment;
  // Approximate position on the original string (folding keeps length for
  // letter maps and only shrinks for dropped characters) — good enough to
  // centre the window.
  const at = Math.max(0, foldSearchText(segment).indexOf(term));
  const half = Math.floor(maxLength / 2);
  let start = Math.max(0, at - half);
  let end = Math.min(segment.length, start + maxLength);
  if (end - start < maxLength) start = Math.max(0, end - maxLength);
  // Snap to word boundaries.
  if (start > 0) {
    const sp = segment.indexOf(' ', start);
    if (sp !== -1 && sp < at) start = sp + 1;
  }
  if (end < segment.length) {
    const sp = segment.lastIndexOf(' ', end);
    if (sp > at + term.length) end = sp;
  }
  return `${start > 0 ? '…' : ''}${segment.slice(start, end).trim()}${end < segment.length ? '…' : ''}`;
}
