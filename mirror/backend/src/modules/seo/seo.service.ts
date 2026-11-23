import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BlogPublicService } from '../blog/blog-public.service';
import { CategoriesService } from '../categories/categories.service';
import { IndustriesService } from '../categories/industries.service';

export interface SitemapEntry {
  path: string;
  lastmod: string;
}

export interface SitemapFeed {
  /** `agents.status = 'published'` AND creator not suspended — the exact public-detail criteria. */
  agents: SitemapEntry[];
  /** Creators that are not suspended AND have ≥1 published agent (empty profiles are thin pages). */
  creators: SitemapEntry[];
  /** Active taxonomy landing pages with ≥1 published agent (the pages are noindex when empty). */
  categories: SitemapEntry[];
  industries: SitemapEntry[];
}

/**
 * Static public routes of the SPA that have no data source. Mirrors the
 * list in the frontend `scripts/emit-seo.mjs`; both are verified against
 * `test/fixtures/public-routes.ts` by the route-contract e2e test.
 */
export const STATIC_PUBLIC_ROUTES: ReadonlyArray<{
  path: string;
  priority: string;
  changefreq: string;
}> = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/agents', priority: '0.9', changefreq: 'daily' },
  { path: '/categories', priority: '0.8', changefreq: 'weekly' },
  { path: '/developers', priority: '0.7', changefreq: 'monthly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/blog', priority: '0.6', changefreq: 'weekly' },
  { path: '/contact', priority: '0.5', changefreq: 'monthly' },
];

const SLUG = /^[a-z0-9-]+$/;

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sprint 2 (P2-05) — ONE place that knows which public URLs exist. The JSON
 * feed is consumed by the build-time emitter; the XML is the live sitemap
 * for deployments that proxy `/sitemap.xml` to the API. Every entry comes
 * from a `status = 'published'` / non-suspended row: no drafts, no private
 * pages, no invented URLs. Paths are de-duplicated before serialisation.
 */
@Injectable()
export class SeoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly blog: BlogPublicService,
    private readonly categories: CategoriesService,
    private readonly industries: IndustriesService,
  ) {}

  async sitemap(): Promise<SitemapFeed> {
    const agents = await this.dataSource.query<
      Array<{ slug: string; lastmod: Date }>
    >(
      `SELECT a.slug, GREATEST(a.updated_at, COALESCE(a.published_at, a.updated_at)) AS lastmod
         FROM agents a
         JOIN creator_profiles cp ON cp.id = a.creator_id
         LEFT JOIN content_seo cs ON cs.content_type = 'agent' AND cs.content_id = a.id
        WHERE a.status = 'published' AND cp.status <> 'suspended'
          AND COALESCE(cs.robots_index, true)
        ORDER BY a.slug`,
    );
    const creators = await this.dataSource.query<
      Array<{ slug: string; lastmod: Date }>
    >(
      `SELECT cp.slug, GREATEST(cp.updated_at, MAX(COALESCE(a.published_at, a.updated_at))) AS lastmod
         FROM creator_profiles cp
         JOIN agents a ON a.creator_id = cp.id AND a.status = 'published'
        WHERE cp.status <> 'suspended'
        GROUP BY cp.id ORDER BY cp.slug`,
    );
    const [categories, industries] = await Promise.all([
      this.categories.listActive(),
      this.industries.listActive(),
    ]);
    const now = new Date().toISOString();
    const entry =
      (prefix: string) => (row: { slug: string; lastmod: Date }) => ({
        path: `${prefix}/${row.slug}`,
        lastmod: new Date(row.lastmod).toISOString(),
      });
    return {
      agents: agents.filter((r) => SLUG.test(r.slug)).map(entry('/agents')),
      creators: creators
        .filter((r) => SLUG.test(r.slug))
        .map(entry('/creators')),
      categories: categories
        .filter((c) => c.agentCount > 0 && SLUG.test(c.slug))
        .map((c) => ({ path: `/categories/${c.slug}`, lastmod: now })),
      industries: industries
        .filter((i) => i.agentCount > 0 && SLUG.test(i.slug))
        .map((i) => ({ path: `/industries/${i.slug}`, lastmod: now })),
    };
  }

  /** Full live sitemap (static routes + every data-driven section), de-duplicated by path. */
  async sitemapXml(): Promise<string> {
    const site = (
      this.config.get<string>('publicSiteUrl') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
    const [feed, blog] = await Promise.all([
      this.sitemap(),
      this.blog.sitemap(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set<string>();
    const rows: string[] = [];
    const push = (
      path: string,
      lastmod: string,
      changefreq: string,
      priority: string,
      alternates?: Array<{ lang: string; path: string }>,
    ) => {
      if (seen.has(path)) return;
      seen.add(path);
      const links = (alternates ?? [])
        .map(
          (a) =>
            `<xhtml:link rel="alternate" hreflang="${xml(a.lang)}" href="${xml(`${site}${a.path}`)}"/>`,
        )
        .join('');
      rows.push(
        `<url><loc>${xml(`${site}${path}`)}</loc><lastmod>${lastmod.slice(0, 10)}</lastmod>` +
          `<changefreq>${changefreq}</changefreq><priority>${priority}</priority>${links}</url>`,
      );
    };
    for (const r of STATIC_PUBLIC_ROUTES)
      push(r.path, today, r.changefreq, r.priority);
    for (const e of feed.categories) push(e.path, e.lastmod, 'weekly', '0.7');
    for (const e of feed.industries) push(e.path, e.lastmod, 'weekly', '0.7');
    for (const e of feed.agents) push(e.path, e.lastmod, 'weekly', '0.8');
    for (const e of feed.creators) push(e.path, e.lastmod, 'weekly', '0.6');
    for (const e of blog.posts)
      push(e.path, e.lastmod, 'monthly', '0.7', e.alternates);
    for (const e of blog.categories) push(e.path, e.lastmod, 'weekly', '0.6');
    for (const e of blog.tags) push(e.path, e.lastmod, 'weekly', '0.4');
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
      rows.map((r) => `  ${r}`).join('\n') +
      `\n</urlset>\n`
    );
  }
}
