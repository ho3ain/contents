/**
 * Build-time SEO emitter for the MESH SPA.
 *
 * Writes `robots.txt` and `sitemap.xml` into `public/` (picked up by the
 * Vite build) using VITE_PUBLIC_SITE_URL as the base — no domain is ever
 * hard-coded in the repository. Missing/placeholder bases fall back to the
 * local dev origin so a bad deploy config produces an obviously-local
 * sitemap instead of a wrong production one.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);

const routes = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/agents', priority: '0.9', changefreq: 'daily' },
  { path: '/categories', priority: '0.8', changefreq: 'weekly' },
  { path: '/developers', priority: '0.7', changefreq: 'monthly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/blog', priority: '0.6', changefreq: 'weekly' },
  { path: '/contact', priority: '0.5', changefreq: 'monthly' },
];


/**
 * Taxonomy v2 — landing pages (`/categories/<slug>`, `/industries/<slug>`).
 * The slugs live in the database, so they are fetched from the API at build
 * time when SEO_API_BASE (e.g. https://api.example.com/api/v1) is set. Only
 * sections with at least one published product are listed (the pages
 * themselves are noindex when empty). Without SEO_API_BASE, or when the API
 * is unreachable, the static routes above are emitted and a notice is
 * printed — nothing is ever invented.
 */
const apiBase = (process.env.SEO_API_BASE || '').replace(/\/$/, '');
async function taxonomyRoutes() {
  if (!apiBase) {
    console.log('[emit-seo] SEO_API_BASE not set — taxonomy landing pages not added to sitemap');
    return [];
  }
  const out = [];
  for (const [path, prefix] of [
    ['/categories', '/categories'],
    ['/industries', '/industries'],
  ]) {
    try {
      const res = await fetch(`${apiBase}${path}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const items = Array.isArray(body?.data) ? body.data : [];
      for (const item of items) {
        if (typeof item?.slug !== 'string' || !/^[a-z0-9-]+$/.test(item.slug)) continue;
        if (!(Number(item.agentCount) > 0)) continue;
        out.push({ path: `${prefix}/${item.slug}`, priority: '0.7', changefreq: 'weekly' });
      }
    } catch (error) {
      console.log(`[emit-seo] ${path} not fetched from ${apiBase}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`[emit-seo] taxonomy landing pages in sitemap: ${out.length}`);
  return out;
}
routes.push(...(await taxonomyRoutes()));

/**
 * Documentation centre and legal documents. These are static, public,
 * `index,follow` pages with their own canonicals (`DocsPage` and
 * `LegalDocumentPage` set them) — 19 articles and 3 documents that were
 * missing from every sitemap this script has produced.
 *
 * The slugs are read from the content registry itself rather than being
 * duplicated here, so an added or removed article can never desynchronise
 * the sitemap. `lastmod` uses each article's real `updatedAt`.
 */
function staticContentRoutes() {
  const read = (file) => readFileSync(join(root, 'src/content', file), 'utf8');
  const out = [
    { path: '/docs', priority: '0.7', changefreq: 'weekly' },
    { path: '/legal', priority: '0.5', changefreq: 'monthly' },
  ];

  const docFiles = readdirSync(join(root, 'src/content/docs')).filter((name) => /\.ts$/.test(name) && name !== 'index.ts' && name !== 'types.ts');
  for (const file of docFiles) {
    const source = read(join('docs', file));
    // Articles date themselves either with a literal or with the file-level
    // `const UPDATED` shared by the section.
    const shared = /const UPDATED\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(source)?.[1];
    // Split on the slug field so each chunk holds exactly one article.
    const chunks = source.split(/slug:\s*'/).slice(1);
    for (const chunk of chunks) {
      const slug = /^([a-z0-9-]+)'/.exec(chunk)?.[1];
      if (!slug) continue;
      const literal = /updatedAt:\s*'(\d{4}-\d{2}-\d{2})'/.exec(chunk)?.[1];
      const usesShared = /updatedAt:\s*UPDATED\b/.test(chunk);
      const lastmod = literal ?? (usesShared ? shared : undefined) ?? today;
      out.push({ path: `/docs/${slug}`, priority: '0.6', changefreq: 'monthly', lastmod });
    }
  }

  const legal = read('legal/legal-documents.ts');
  const legalVersion = /LEGAL_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(legal)?.[1] ?? today;
  for (const match of legal.matchAll(/path:\s*'(\/legal\/[a-z-]+)'/g)) {
    out.push({ path: match[1], priority: '0.5', changefreq: 'monthly', lastmod: legalVersion });
  }

  console.log(`[emit-seo] docs + legal urls in sitemap: ${out.length}`);
  return out;
}
routes.push(...staticContentRoutes());

/**
 * Blog platform — published articles, categories and (non-thin) tags come
 * from `GET /blog/sitemap`, which only ever lists `status = 'published'`
 * rows and carries a real `lastmod` (publish or last content update).
 * Articles with a canonical override (syndicated copies) are excluded by the
 * API. Without SEO_API_BASE only `/blog` itself is emitted.
 */
async function blogRoutes() {
  if (!apiBase) {
    console.log('[emit-seo] SEO_API_BASE not set — blog articles not added to sitemap');
    return [];
  }
  try {
    const res = await fetch(`${apiBase}/blog/sitemap`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const data = body?.data ?? {};
    const out = [];
    const push = (entries, priority, changefreq) => {
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (typeof entry?.path !== 'string' || !/^\/blog\/[a-z0-9/-]+$/.test(entry.path)) continue;
        const lastmod = typeof entry.lastmod === 'string' && !Number.isNaN(Date.parse(entry.lastmod)) ? entry.lastmod.slice(0, 10) : today;
        out.push({ path: entry.path, priority, changefreq, lastmod });
      }
    };
    push(data.posts, '0.7', 'monthly');
    push(data.categories, '0.6', 'weekly');
    push(data.tags, '0.4', 'weekly');
    console.log(`[emit-seo] blog urls in sitemap: ${out.length}`);
    return out;
  } catch (error) {
    console.log(`[emit-seo] /blog/sitemap not fetched from ${apiBase}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
routes.push(...(await blogRoutes()));

/**
 * Sprint 2 (P2-05) — product and creator pages come from `GET /seo/sitemap`
 * (`agents.status = 'published'` with a non-suspended creator; creators
 * that are not suspended and have ≥1 published agent). The same endpoint
 * also serves `/seo/sitemap.xml` live, for deployments that proxy
 * `/sitemap.xml` to the API instead of shipping this build-time snapshot
 * (see docs/sprint-2-product-experience/…-IMPLEMENTATION-REPORT.md §SEO).
 */
async function catalogueRoutes() {
  if (!apiBase) {
    console.log('[emit-seo] SEO_API_BASE not set — product/creator pages not added to sitemap');
    return [];
  }
  try {
    const res = await fetch(`${apiBase}/seo/sitemap`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const data = body?.data ?? {};
    const out = [];
    const push = (entries, pattern, priority, changefreq) => {
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (typeof entry?.path !== 'string' || !pattern.test(entry.path)) continue;
        const lastmod = typeof entry.lastmod === 'string' && !Number.isNaN(Date.parse(entry.lastmod)) ? entry.lastmod.slice(0, 10) : today;
        out.push({ path: entry.path, priority, changefreq, lastmod });
      }
    };
    push(data.agents, /^\/agents\/[a-z0-9-]+$/, '0.8', 'weekly');
    push(data.creators, /^\/creators\/[a-z0-9-]+$/, '0.6', 'weekly');
    console.log(`[emit-seo] product/creator urls in sitemap: ${out.length}`);
    return out;
  } catch (error) {
    console.log(`[emit-seo] /seo/sitemap not fetched from ${apiBase}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
routes.push(...(await catalogueRoutes()));

// One <url> per path, whichever section listed it first.
const seen = new Set();
const uniqueRoutes = routes.filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true)));

const urls = uniqueRoutes
  .map(
    (r) => `  <url>
    <loc>${base}${r.path}</loc>
    <lastmod>${r.lastmod ?? today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`,
  )
  .join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const robots = `User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /library
Disallow: /orders
Disallow: /settings
Disallow: /me/
Disallow: /creator
Disallow: /admin
Disallow: /payment/
Disallow: /checkout/

Sitemap: ${base}/sitemap.xml
`;

writeFileSync(join(root, 'public', 'sitemap.xml'), sitemap);
writeFileSync(join(root, 'public', 'robots.txt'), robots);
console.log(`[emit-seo] robots.txt + sitemap.xml written for base ${base}`);
