import type { Locale } from '../../i18n';
import { parseMarkdownLite, type ParsedDocument } from '../markdown-lite';
import { type LegalDocumentKey, LEGAL_DOCUMENTS, LEGAL_ORDER, legalKeyFromSlug } from './legal-documents';
import { PRIVACY_EN, PRIVACY_FA } from './privacy';
import { REFUNDS_EN, REFUNDS_FA } from './refunds';
import { TERMS_EN, TERMS_FA } from './terms';

export * from './legal-documents';

/** Markdown-lite source of each document per locale (single source for the page, the tests and search). */
export const LEGAL_CONTENT: Readonly<Record<LegalDocumentKey, Record<Locale, string>>> = Object.freeze({
  terms: { fa: TERMS_FA, en: TERMS_EN },
  privacy: { fa: PRIVACY_FA, en: PRIVACY_EN },
  refund: { fa: REFUNDS_FA, en: REFUNDS_EN },
});

const PARSE_CACHE = new Map<string, ParsedDocument>();

export function parseLegalDocument(key: LegalDocumentKey, locale: Locale): ParsedDocument {
  const cacheKey = `${key}:${locale}`;
  const cached = PARSE_CACHE.get(cacheKey);
  if (cached) return cached;
  const parsed = parseMarkdownLite(LEGAL_CONTENT[key][locale]);
  PARSE_CACHE.set(cacheKey, parsed);
  return parsed;
}

export function legalNeighbours(key: LegalDocumentKey): { prev: LegalDocumentKey | null; next: LegalDocumentKey | null } {
  const index = LEGAL_ORDER.indexOf(key);
  return { prev: LEGAL_ORDER[index - 1] ?? null, next: LEGAL_ORDER[index + 1] ?? null };
}

export { legalKeyFromSlug, LEGAL_DOCUMENTS };
