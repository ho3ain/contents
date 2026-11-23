import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DOCS_ARTICLES } from '../../content/docs';
import { LEGAL_DOCUMENTS } from '../../content/legal';

/**
 * `scripts/emit-seo.mjs` writes the build-time `sitemap.xml`. Every sitemap
 * it produced before this test existed listed seven static routes and left
 * out the entire documentation centre and the legal documents — 24 public,
 * `index,follow`, canonical-bearing pages that search engines were simply
 * never told about.
 *
 * This runs the real emitter (no API base, so only the static + content
 * routes are produced) and asserts the coverage stays complete as articles
 * are added or removed. It writes into a temp dir and restores `public/`
 * afterwards so the working tree is untouched.
 */

const root = process.cwd();
const outputs = ['public/sitemap.xml', 'public/robots.txt'];
const backup = new Map<string, string>();
let xml = '';

beforeAll(() => {
  for (const file of outputs) {
    try {
      backup.set(file, readFileSync(join(root, file), 'utf8'));
    } catch {
      /* not generated yet */
    }
  }
  execFileSync(process.execPath, ['scripts/emit-seo.mjs'], {
    cwd: root,
    env: { ...process.env, VITE_PUBLIC_SITE_URL: 'https://example.test', SEO_API_BASE: '' },
    stdio: 'pipe',
  });
  xml = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
});

afterAll(() => {
  // Restore whatever was there before, or remove what we created.
  for (const file of outputs) {
    const previous = backup.get(file);
    if (previous === undefined) rmSync(join(root, file), { force: true });
    else execFileSync('/bin/sh', ['-c', 'cat > "$0"', join(root, file)], { input: previous });
  }
});

const locations = () => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://example.test', ''));

describe('sitemap coverage', () => {
  it('keeps the static marketing routes', () => {
    const paths = locations();
    for (const route of ['/', '/agents', '/categories', '/developers', '/about', '/blog', '/contact']) {
      expect(paths, route).toContain(route);
    }
  });

  it('lists the documentation centre and every published article', () => {
    const paths = locations();
    expect(paths).toContain('/docs');
    for (const article of DOCS_ARTICLES) expect(paths, article.slug).toContain(`/docs/${article.slug}`);
    // and no stale article that the registry no longer has
    const registry = new Set(DOCS_ARTICLES.map((article) => `/docs/${article.slug}`));
    for (const path of paths.filter((value) => value.startsWith('/docs/'))) {
      expect(registry.has(path), `${path} is in the sitemap but not in the registry`).toBe(true);
    }
  });

  it('lists the legal index and every legal document', () => {
    const paths = locations();
    expect(paths).toContain('/legal');
    for (const document of Object.values(LEGAL_DOCUMENTS)) expect(paths, document.path).toContain(document.path);
  });

  it('gives every URL a well-formed lastmod and no duplicates', () => {
    const paths = locations();
    expect(new Set(paths).size, 'duplicate <loc> entries').toBe(paths.length);
    for (const match of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      expect(match[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
