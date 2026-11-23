import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGAL_CONTENT, LEGAL_DOCUMENTS, LEGAL_ORDER, CURRENT_TERMS_VERSION, legalKeyFromSlug } from '..';
import { parseMarkdownLite } from '../../markdown-lite';
import { PLATFORM_FACTS } from '../../platform-facts';

/**
 * Sprint 1 (B3) — the consent version the frontend sends must be the one the
 * backend records. The backend file is read as text (no cross-repo import)
 * when the sibling repository is checked out; otherwise the frontend-only
 * invariants still run.
 */
const BACKEND_FILE = resolve(__dirname, '../../../../../agentHub_backend/src/modules/auth/legal-documents.ts');

describe('legal documents — version parity', () => {
  it('keeps legacy registration identifiers stable while exposing an explicit Draft status', () => {
    for (const key of LEGAL_ORDER) {
      const doc = LEGAL_DOCUMENTS[key];
      expect(doc.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Backend compatibility field: not a claim that a Draft is effective.
      expect(doc.effectiveAt).toBe(doc.version);
      expect(doc.status).toBe('draft');
      expect(doc.path).toBe(`/legal/${doc.slug}`);
      expect(legalKeyFromSlug(doc.slug)).toBe(key);
    }
    expect(CURRENT_TERMS_VERSION).toBe(LEGAL_DOCUMENTS.terms.version);
  });

  it.skipIf(!existsSync(BACKEND_FILE))('matches the backend constants (path + version) for every document', () => {
    const source = readFileSync(BACKEND_FILE, 'utf8');
    for (const key of LEGAL_ORDER) {
      const block = new RegExp(`${key}:\\s*\\{([^}]*)\\}`, 'm').exec(source);
      expect(block, `backend entry for ${key}`).not.toBeNull();
      const body = block?.[1] ?? '';
      expect(body).toContain(`path: '${LEGAL_DOCUMENTS[key].path}'`);
      expect(body).toContain(`version: '${LEGAL_DOCUMENTS[key].version}'`);
      expect(body).toContain(`effectiveAt: '${LEGAL_DOCUMENTS[key].effectiveAt}'`);
    }
  });
});

describe('legal documents — content invariants', () => {
  for (const key of LEGAL_ORDER) {
    const fa = parseMarkdownLite(LEGAL_CONTENT[key].fa);
    const en = parseMarkdownLite(LEGAL_CONTENT[key].en);

    it(`${key}: fa and en have the same section structure`, () => {
      const faHeadings = fa.toc.map((h) => h.level);
      const enHeadings = en.toc.map((h) => h.level);
      expect(enHeadings).toEqual(faHeadings);
      expect(fa.toc.length).toBeGreaterThanOrEqual(5);
    });

    it(`${key}: no placeholders, no old brand, no fake promises`, () => {
      for (const text of [fa.text, en.text]) {
        expect(text).not.toMatch(/lorem|TODO|TBD|\[placeholder\]|xxx/i);
        expect(text).not.toMatch(/vardana|وردانا/i);
        expect(text).toContain('MESH');
      }
    });

    it(`${key}: marks the draft as requiring legal review in both languages`, () => {
      expect(fa.text).toMatch(/بررسی حقوقی|مشاور حقوقی/);
      expect(en.text).toMatch(/legal (counsel|review)/i);
    });

    it(`${key}: links only to real routes`, () => {
      const links = [...LEGAL_CONTENT[key].fa.matchAll(/\]\(([^)]+)\)/g), ...LEGAL_CONTENT[key].en.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
      for (const href of links) {
        expect(href).toMatch(/^(\/legal\/(terms|privacy|refunds)|\/docs(\/[a-z-]+)?|\/contact(\?topic=[a-z]+)?|\/settings|\/library|\/orders|#)/);
      }
    });
  }

  it('refund policy quotes the enforced window and the creator share once, from PLATFORM_FACTS', () => {
    expect(LEGAL_CONTENT.refund.fa).toContain(String(PLATFORM_FACTS.refundWindowDays));
    expect(LEGAL_CONTENT.refund.en).toContain(String(PLATFORM_FACTS.refundWindowDays));
    expect(LEGAL_CONTENT.terms.en).toContain(`${PLATFORM_FACTS.commissionPercent}`);
  });
});
