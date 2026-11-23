import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../i18n';
import {
  DOCS_ARTICLES,
  DOCS_SECTIONS,
  docNeighbours,
  docsBySection,
  findDocArticle,
  normalizeSearchText,
  parseDocArticle,
  searchDocs,
} from '../docs';
import { LEGAL_DOCUMENTS } from '../legal';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTACT_TOPICS = ['general', 'purchase', 'creator', 'partnership', 'privacy', 'bug'];

/**
 * Every route the application actually declares, normalised without the
 * leading/trailing slash (`agents`, `me/notifications/reports`, `creator`).
 * Read from the router so a documentation link can never point at a page
 * that does not exist, and a real page never has to be whitelisted by hand.
 */
const ROUTE_PATHS = new Set(
  [...readFileSync(join(process.cwd(), 'src/app/router.tsx'), 'utf8').matchAll(/path=["']([^"']*)["']/g)]
    .map((match) => match[1].replace(/^\/+|\/+$/g, ''))
    .filter(Boolean),
);

describe('documentation center — registry', () => {
  it('has unique slugs and every section has at least one article', () => {
    const slugs = DOCS_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
    for (const section of DOCS_SECTIONS) expect(docsBySection(section.key).length).toBeGreaterThan(0);
    for (const article of DOCS_ARTICLES) expect(DOCS_SECTIONS.some((s) => s.key === article.section)).toBe(true);
  });

  it('exposes lookup and prev/next in reading order', () => {
    expect(findDocArticle('what-is-mesh')?.section).toBe('getting-started');
    expect(findDocArticle('nope')).toBeNull();
    expect(findDocArticle(undefined)).toBeNull();
    const first = DOCS_ARTICLES[0];
    const last = DOCS_ARTICLES[DOCS_ARTICLES.length - 1];
    expect(docNeighbours(first.slug).prev).toBeNull();
    expect(docNeighbours(first.slug).next?.slug).toBe(DOCS_ARTICLES[1].slug);
    expect(docNeighbours(last.slug).next).toBeNull();
    expect(docNeighbours('nope')).toEqual({ prev: null, next: null });
  });

  it('carries ownership and an ISO update date on every article', () => {
    for (const article of DOCS_ARTICLES) {
      expect(['product', 'operations', 'engineering', 'legal']).toContain(article.owner);
      expect(article.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('documentation center — content', () => {
  for (const article of DOCS_ARTICLES) {
    it(`${article.slug}: parses in both locales with matching structure`, () => {
      const parsed = LOCALES.map((locale) => parseDocArticle(article, locale));
      const [fa, en] = parsed;
      expect(fa.blocks.length).toBeGreaterThanOrEqual(1);
      expect(fa.toc.map((h) => h.level)).toEqual(en.toc.map((h) => h.level));
      expect(fa.blocks.map((b) => b.type)).toEqual(en.blocks.map((b) => b.type));
      for (const locale of LOCALES) {
        expect(article.title[locale].trim()).not.toBe('');
        expect(article.summary[locale].trim()).not.toBe('');
      }
    });

    it(`${article.slug}: contains no placeholders, old brand, SLAs or undefined-number claims`, () => {
      for (const locale of LOCALES) {
        const { text } = parseDocArticle(article, locale);
        expect(text).not.toMatch(/lorem|TODO|TBD|\bxxx\b/i);
        expect(text).not.toMatch(/vardana|وردانا/i);
        expect(text).not.toMatch(/99\.9|uptime guarantee|within 24 hours|ظرف ۲۴ ساعت/i);
      }
    });

    it(`${article.slug}: internal links resolve to real routes`, () => {
      for (const locale of LOCALES) {
        const links = [...article.body[locale].matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
        for (const href of links) {
          if (href.startsWith('/docs/')) {
            expect(findDocArticle(href.slice('/docs/'.length)), `${href} in ${article.slug}`).not.toBeNull();
          } else if (href.startsWith('/legal/')) {
            expect(Object.values(LEGAL_DOCUMENTS).map((d) => d.path)).toContain(href);
          } else if (href === '/legal') {
            expect(href).toBe('/legal');
          } else if (href.startsWith('/contact')) {
            const topic = /topic=([a-z]+)/.exec(href)?.[1];
            if (topic) expect(CONTACT_TOPICS).toContain(topic);
          } else {
            // Previously a hand-maintained allow-list of route prefixes,
            // which could neither catch a link to a route that does not
            // exist nor accept a real one it had not heard of. Validate
            // against the router itself instead.
            const path = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
            expect(ROUTE_PATHS.has(path), `${href} in ${article.slug} is not a declared route`).toBe(true);
          }
        }
      }
    });
  }

  it('developer docs never claim keys, SDKs or webhooks exist', () => {
    const overview = findDocArticle('developer-api-overview');
    expect(overview).not.toBeNull();
    const en = parseDocArticle(overview as NonNullable<typeof overview>, 'en').text;
    expect(en).toMatch(/do not exist/);
    expect(en).toContain('api.example.com');
  });
});

describe('documentation center — search', () => {
  it('normalises Persian digits, ي/ك variants and ZWNJ', () => {
    expect(normalizeSearchText('۱۴ روز')).toBe('14 روز');
    expect(normalizeSearchText('كتابخانه\u200cها')).toBe('کتابخانه ها');
    expect(normalizeSearchText('  Refund   WINDOW ')).toBe('refund window');
  });

  it('finds articles by body text in both locales and ranks title matches first', () => {
    const en = searchDocs('refund', 'en');
    expect(en.length).toBeGreaterThan(1);
    expect(en[0].article.slug).toBe('refunds');
    const fa = searchDocs('بازگشت وجه', 'fa');
    expect(fa.map((h) => h.article.slug)).toContain('refunds');
    const body = searchDocs('Retry-After', 'en');
    expect(body[0]?.article.slug).toBe('errors-and-rate-limits');
    expect(body[0]?.heading?.id).toBeTruthy();
    expect(body[0]?.excerpt).toContain('Retry-After');
  });

  it('requires every term (AND) and ignores one-character noise', () => {
    expect(searchDocs('a', 'en')).toEqual([]);
    expect(searchDocs('zzzz qqqq', 'en')).toEqual([]);
    const two = searchDocs('payout kyc', 'en');
    expect(two[0]?.article.slug).toBe('earnings-and-payouts');
  });
});
