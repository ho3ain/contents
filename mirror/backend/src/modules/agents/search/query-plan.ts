import {
  analyzeQuery,
  normalizeText,
  stemToken,
  tokenize,
  type QueryToken,
} from './search-text';
import {
  CONCEPTS,
  conceptPhrasesIn,
  conceptsForToken,
  type SemanticExpander,
} from './search-concepts';

const CONCEPT_TERMS = new Map(
  CONCEPTS.map((concept) => [
    concept.id,
    concept.terms.filter((term) => /^[\p{L}\p{N} ]+$/u.test(term)),
  ]),
);

/** One "thing the buyer asked for" — a word, or a recognised phrase. */
export interface SearchGroup {
  /** Human-readable label (the typed word/phrase). */
  label: string;
  /** tsquery matching exactly what was typed (prefix-tolerant). */
  exact: string;
  /** tsquery = typed OR every synonym of its concepts; null if no concept. */
  expanded: string | null;
  /** Token used for typo-tolerant trigram matching (null for short tokens). */
  fuzzy: string | null;
  concepts: string[];
}

export interface SearchPlan {
  /** Normalized query as a single string. */
  normalized: string;
  groups: SearchGroup[];
  /** Minimum number of groups a listing must satisfy. */
  minMatch: number;
  /** Concept ids understood from the query (for UI "showing results for…"). */
  concepts: string[];
  /** Every group OR-ed together — used for the index-friendly prefilter. */
  anyExpression: string;
  /**
   * Plain normalized words / concept terms describing the query (for
   * matching category & use-case names in suggestions). Capped at 40.
   */
  terms: string[];
}

export const MAX_GROUPS = 8;

/** Only characters that can never change tsquery syntax. */
const safeLexeme = (word: string) => word.replace(/[^\p{L}\p{N}]/gu, '');

function lexemeQuery(word: string): string {
  const clean = safeLexeme(word);
  if (!clean) return '';
  const stem = safeLexeme(stemToken(clean));
  return clean.length >= 3 && !/^\d+$/.test(clean) ? `${stem}:*` : clean;
}

/** A term (single word or phrase) as a tsquery fragment. */
export function termQuery(term: string): string {
  const words = tokenize(term).map(lexemeQuery).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];
  return `(${words.join(' <-> ')})`;
}

const orJoin = (parts: string[]) => {
  const unique = [...new Set(parts.filter(Boolean))];
  return unique.length === 1 ? unique[0] : `(${unique.join(' | ')})`;
};

function requiredGroups(count: number): number {
  if (count <= 1) return 1;
  return Math.max(1, Math.ceil(count * 0.6));
}

/**
 * Turns free text into a structured plan. Pure and deterministic:
 *   1. normalize + tokenize, drop stop words ("I want to …");
 *   2. recognise multi-word concept phrases ("customer support");
 *   3. each remaining word becomes a group; its concepts (if any) add
 *      synonym alternatives ("tickets" ⇒ ticket, triage, تیکت …);
 *   4. a listing must satisfy `minMatch` groups — so a long natural
 *      sentence still finds "support ticket classification" products
 *      without requiring every filler word to appear.
 */
export function buildSearchPlan(
  input: string | null | undefined,
  options: { relax?: boolean; expanders?: SemanticExpander[] } = {},
): SearchPlan {
  const normalized = normalizeText(input).trim().slice(0, 120);
  const allTokens = analyzeQuery(normalized);
  const meaningful = allTokens.filter((token) => !token.stopword);
  const tokens: QueryToken[] = meaningful.length > 0 ? meaningful : allTokens;

  const groups: SearchGroup[] = [];
  const conceptIds = new Set<string>();
  const stems = tokens.map((token) => token.stem);
  const consumed = new Set<number>();

  const extra = (word: string) =>
    (options.expanders ?? []).flatMap((expander) => expander.expand(word));

  // Phrase concepts first (longest first; tokens can only be used once).
  for (const phrase of conceptPhrasesIn(stems)) {
    const range = Array.from(
      { length: phrase.end - phrase.start },
      (_, i) => phrase.start + i,
    );
    if (range.some((index) => consumed.has(index))) continue;
    range.forEach((index) => consumed.add(index));
    const label = range.map((index) => tokens[index].raw).join(' ');
    const exact = termQuery(label);
    conceptIds.add(phrase.concept.id);
    groups.push({
      label,
      exact,
      expanded: orJoin([
        exact,
        ...phrase.concept.terms.map(termQuery),
        ...extra(label).map(termQuery),
      ]),
      fuzzy: null,
      concepts: [phrase.concept.id],
    });
  }

  tokens.forEach((token, index) => {
    if (consumed.has(index)) return;
    const exact = lexemeQuery(token.raw);
    if (!exact) return;
    const concepts = conceptsForToken(token.stem);
    concepts.forEach((concept) => conceptIds.add(concept.id));
    const synonyms = [
      ...concepts.flatMap((concept) => concept.terms.map(termQuery)),
      ...extra(token.raw).map(termQuery),
    ];
    groups.push({
      label: token.raw,
      exact,
      expanded: synonyms.length > 0 ? orJoin([exact, ...synonyms]) : null,
      fuzzy:
        token.raw.length >= 4 && !/^\d+$/.test(token.raw) ? token.raw : null,
      concepts: concepts.map((concept) => concept.id),
    });
  });

  const limited = groups.slice(0, MAX_GROUPS);
  const terms = new Set<string>();
  for (const group of limited) {
    terms.add(group.label);
  }
  for (const concept of conceptIds) {
    for (const term of CONCEPT_TERMS.get(concept) ?? []) terms.add(term);
  }
  return {
    normalized,
    groups: limited,
    minMatch: options.relax ? 1 : requiredGroups(limited.length),
    concepts: [...conceptIds],
    anyExpression: orJoin(
      limited.map((group) => group.expanded ?? group.exact),
    ),
    terms: [...terms].slice(0, 40),
  };
}
