import './helpers/lift-rate-limits';
import { restoreRateLimits } from './helpers/lift-rate-limits';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.configuration';
import { PREFIX, World, buildWorld } from './helpers/world';

/**
 * Sprint 2 (P2-05) — SEO feeds.
 *
 * `GET /seo/sitemap` (JSON) and `GET /seo/sitemap.xml` list ONLY public,
 * eligible pages: published agents of non-suspended creators, creators with
 * at least one published agent, non-empty taxonomy landings, published blog
 * URLs. Drafts, suspended creators and private routes never appear, and no
 * URL appears twice.
 */
describe('SEO feeds (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let w: World;
  const http = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    w = await buildWorld(app, http);
  }, 300_000);

  afterAll(async () => {
    await app.close();
    restoreRateLimits();
  });

  interface Feed {
    agents: Array<{ path: string; lastmod: string }>;
    creators: Array<{ path: string; lastmod: string }>;
    categories: Array<{ path: string; lastmod: string }>;
    industries: Array<{ path: string; lastmod: string }>;
  }

  const feed = async (): Promise<Feed> => {
    const res = await request(http()).get(`${PREFIX}/seo/sitemap`).expect(200);
    return res.body.data as Feed;
  };

  it('JSON feed lists exactly the published agents of non-suspended creators (DB truth)', async () => {
    const data = await feed();
    const expected = await ds.query<Array<{ slug: string }>>(
      `SELECT a.slug FROM agents a JOIN creator_profiles cp ON cp.id = a.creator_id
        WHERE a.status = 'published' AND cp.status <> 'suspended' ORDER BY a.slug`,
    );
    expect(data.agents.map((e) => e.path)).toEqual(
      expected.map((r) => `/agents/${r.slug}`),
    );
    expect(data.agents.map((e) => e.path)).toContain(
      `/agents/${w.a.livePaid.slug}`,
    );
    expect(data.agents.map((e) => e.path)).toContain(
      `/agents/${w.a.liveFree.slug}`,
    );
    // The draft of creator A is never a public URL.
    expect(data.agents.map((e) => e.path)).not.toContain(
      `/agents/${w.a.draft.slug}`,
    );
    for (const e of data.agents)
      expect(Number.isNaN(Date.parse(e.lastmod))).toBe(false);
  });

  it('creators appear only when not suspended and with ≥1 published agent', async () => {
    const data = await feed();
    const paths = data.creators.map((e) => e.path);
    expect(paths).toContain(`/creators/${w.creatorA.slug}`);
    expect(paths).toContain(`/creators/${w.creatorB.slug}`);
    const expected = await ds.query<Array<{ slug: string }>>(
      `SELECT cp.slug FROM creator_profiles cp
        WHERE cp.status <> 'suspended'
          AND EXISTS (SELECT 1 FROM agents a WHERE a.creator_id = cp.id AND a.status = 'published')
        ORDER BY cp.slug`,
    );
    expect(paths).toEqual(expected.map((r) => `/creators/${r.slug}`));
  });

  it('a suspended creator and their agents drop out of the feed immediately', async () => {
    const before = await feed();
    expect(before.creators.map((e) => e.path)).toContain(
      `/creators/${w.creatorB.slug}`,
    );
    expect(before.agents.map((e) => e.path)).toContain(
      `/agents/${w.b.liveFree.slug}`,
    );
    await ds.query(
      `UPDATE creator_profiles SET status = 'suspended' WHERE id = $1`,
      [w.creatorB.profileId],
    );
    try {
      const after = await feed();
      expect(after.creators.map((e) => e.path)).not.toContain(
        `/creators/${w.creatorB.slug}`,
      );
      expect(after.agents.map((e) => e.path)).not.toContain(
        `/agents/${w.b.liveFree.slug}`,
      );
      // The public profile answers 404 for the same creator → the page sets noindex.
      await request(http())
        .get(`${PREFIX}/creators/${w.creatorB.slug}`)
        .expect(404);
    } finally {
      await ds.query(
        `UPDATE creator_profiles SET status = 'approved' WHERE id = $1`,
        [w.creatorB.profileId],
      );
    }
  });

  it('taxonomy landings are listed only when they have published agents', async () => {
    const data = await feed();
    const cats = await request(http()).get(`${PREFIX}/categories`).expect(200);
    const withAgents = (
      cats.body.data as Array<{ slug: string; agentCount: number }>
    )
      .filter((c) => c.agentCount > 0)
      .map((c) => `/categories/${c.slug}`)
      .sort();
    expect([...data.categories.map((e) => e.path)].sort()).toEqual(withAgents);
  });

  it('sitemap.xml is well-formed, absolute, de-duplicated, excludes private routes and matches the feed', async () => {
    const res = await request(http())
      .get(`${PREFIX}/seo/sitemap.xml`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    const xml = res.text;
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    );
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    expect(new Set(locs).size).toBe(locs.length);
    for (const loc of locs) {
      expect(loc).toMatch(/^https?:\/\/[^/]+\//);
      expect(loc).not.toMatch(
        /\/(admin|checkout|payment|me|creator|dashboard|library|orders|settings)(\/|$)/,
      );
    }
    const data = await feed();
    const paths = locs.map((l) => new URL(l).pathname);
    for (const e of [
      ...data.agents,
      ...data.creators,
      ...data.categories,
      ...data.industries,
    ]) {
      expect(paths).toContain(e.path);
    }
    expect(paths).toContain('/');
    expect(paths).toContain('/agents');
    expect(paths).not.toContain(`/agents/${w.a.draft.slug}`);
    // Every entry carries a valid ISO date.
    for (const m of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      expect(m[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('feeds are anonymous and ignore any body or query input', async () => {
    await request(http())
      .get(`${PREFIX}/seo/sitemap?creator=x&status=draft`)
      .expect(200);
    await request(http()).post(`${PREFIX}/seo/sitemap`).send({}).expect(404);
  });
});
