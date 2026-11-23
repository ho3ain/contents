import type { Locale } from '../../i18n';
import type { BlogBlock, BlogListItem } from '../../api/blog';
import { inlineText, parseMarkdownLite, type ParsedDocument } from '../markdown-lite';
import { BUYING } from './buying';
import { CREATORS } from './creators';
import { DEVELOPERS } from './developers';
import { GETTING_STARTED } from './getting-started';
import { SECURITY } from './security';
import { STATUS } from './status';
import type { DocArticle, DocsSection, DocsSectionKey } from './types';

export type { DocArticle, DocsSection, DocsSectionKey } from './types';

/**
 * Sprint 1 — documentation center registry. Order here IS the reading order
 * (sidebar, prev/next). Section labels and descriptions live in
 * `src/i18n/trust.{fa,en}.ts` under `docs.section.<key>.*` so the copy is
 * translated through the same mechanism as the rest of the website.
 */
export const DOCS_SECTIONS: readonly DocsSection[] = [
  { key: 'getting-started', icon: 'bookOpen' },
  { key: 'buying', icon: 'shoppingBag' },
  { key: 'creators', icon: 'builder' },
  { key: 'developers', icon: 'tools' },
  { key: 'security', icon: 'shieldCheck' },
  { key: 'status', icon: 'activity' },
];

export const DOCS_ARTICLES: readonly DocArticle[] = [...GETTING_STARTED, ...BUYING, ...CREATORS, ...DEVELOPERS, ...SECURITY, ...STATUS];

const BY_SLUG = new Map(DOCS_ARTICLES.map((article) => [article.slug, article]));

export function findDocArticle(slug: string | undefined): DocArticle | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

export function docsBySection(section: DocsSectionKey): DocArticle[] {
  return DOCS_ARTICLES.filter((article) => article.section === section);
}

export function docNeighbours(slug: string): { prev: DocArticle | null; next: DocArticle | null } {
  const index = DOCS_ARTICLES.findIndex((article) => article.slug === slug);
  if (index < 0) return { prev: null, next: null };
  return { prev: DOCS_ARTICLES[index - 1] ?? null, next: DOCS_ARTICLES[index + 1] ?? null };
}

/** Parse once per (slug, locale); articles are static so the cache never goes stale. */
const PARSE_CACHE = new Map<string, ParsedDocument>();

export function parseDocArticle(article: DocArticle, locale: Locale): ParsedDocument {
  const key = `${article.slug}:${locale}`;
  const cached = PARSE_CACHE.get(key);
  if (cached) return cached;
  const parsed = parseMarkdownLite(article.body[locale]);
  PARSE_CACHE.set(key, parsed);
  return parsed;
}

export interface DocSearchHit {
  article: DocArticle;
  /** Heading the match was found under (null → title/summary match). */
  heading: { id: string; text: string } | null;
  /** Short excerpt around the first match, for the result list. */
  excerpt: string;
  score: number;
}

/** Persian/Arabic digits, diacritics and the ی/ک variants fold to one form. */
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface IndexedSection {
  heading: { id: string; text: string } | null;
  text: string;
  normalized: string;
}

interface IndexedArticle {
  article: DocArticle;
  title: string;
  summary: string;
  sections: IndexedSection[];
}

const INDEX_CACHE = new Map<Locale, IndexedArticle[]>();

function buildIndex(locale: Locale): IndexedArticle[] {
  const cached = INDEX_CACHE.get(locale);
  if (cached) return cached;
  const index = DOCS_ARTICLES.map((article) => {
    const parsed = parseDocArticle(article, locale);
    const sections: IndexedSection[] = [];
    let current: IndexedSection = { heading: null, text: '', normalized: '' };
    const push = () => {
      if (current.text.trim()) {
        current.normalized = normalizeSearchText(current.text);
        sections.push(current);
      }
    };
    for (const block of parsed.blocks) {
      if (block.type === 'heading') {
        push();
        current = { heading: { id: block.id, text: block.text }, text: '', normalized: '' };
        continue;
      }
      current.text += ` ${blockText(block)}`;
    }
    push();
    return {
      article,
      title: normalizeSearchText(article.title[locale]),
      summary: normalizeSearchText(article.summary[locale]),
      sections,
    };
  });
  INDEX_CACHE.set(locale, index);
  return index;
}

function blockText(block: BlogBlock): string {
  switch (block.type) {
    case 'paragraph':
      return inlineText(block.c);
    case 'quote':
      return block.paragraphs.map((p) => inlineText(p)).join(' ');
    case 'list':
      return block.items.map((item) => listItemText(item)).join(' ');
    case 'table':
      return [...block.header, ...block.rows.flat()].map((cell) => inlineText(cell)).join(' ');
    case 'code':
      return block.code;
    default:
      return '';
  }
}

function listItemText(item: BlogListItem): string {
  const own = inlineText(item.c);
  if (!item.children) return own;
  return `${own} ${item.children.items.map((child) => listItemText(child)).join(' ')}`;
}

function excerptAround(text: string, normalizedText: string, needle: string, radius = 70): string {
  const at = normalizedText.indexOf(needle);
  if (at < 0) return text.slice(0, radius * 2).trim();
  // Normalisation keeps the character count in step for the scripts we fold,
  // so the raw offset is a good-enough anchor for an excerpt.
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + needle.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Client-side full-text search over the parsed articles. Every whitespace-
 * separated term must appear (AND); title matches rank above summary matches,
 * which rank above body matches. Returns at most `limit` hits, one per
 * article (the best section).
 */
export function searchDocs(query: string, locale: Locale, limit = 8): DocSearchHit[] {
  const terms = normalizeSearchText(query)
    .split(' ')
    .filter((term) => term.length >= 2);
  if (!terms.length) return [];
  const hits: DocSearchHit[] = [];
  for (const entry of buildIndex(locale)) {
    const titleHit = terms.every((term) => entry.title.includes(term));
    const summaryHit = terms.every((term) => entry.summary.includes(term));
    let best: { section: IndexedSection; score: number } | null = null;
    for (const section of entry.sections) {
      if (!terms.every((term) => section.normalized.includes(term))) continue;
      const score = terms.reduce((sum, term) => sum + (section.normalized.split(term).length - 1), 0);
      if (!best || score > best.score) best = { section, score };
    }
    if (!titleHit && !summaryHit && !best) continue;
    const score = (titleHit ? 100 : 0) + (summaryHit ? 40 : 0) + (best?.score ?? 0);
    const section = best?.section ?? null;
    hits.push({
      article: entry.article,
      heading: section?.heading ?? null,
      excerpt: section ? excerptAround(section.text.trim(), section.normalized, terms[0]) : entry.article.summary[locale],
      score,
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
