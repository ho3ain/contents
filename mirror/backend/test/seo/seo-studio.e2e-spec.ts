import { restoreRateLimits } from '../helpers/lift-rate-limits';
import '../helpers/seo-shell';
import { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.configuration';
import {
  createAdminUser,
  loginSuperAdmin,
  type AdminUser,
} from '../helpers/admin-world';
import { closeStepUpPool } from '../helpers/step-up';
import { PREFIX, bearer, buildWorld, uniq, type World } from '../helpers/world';

/**
 * SEO Studio + Knowledge Graph — end-to-end contract.
 *
 * Covers: per-content SEO metadata (stored vs fallback, validation, draft
 * never indexable), translation links + hreflang, the analysis engine on a
 * Persian and an English article (saved and unsaved basis), the real public
 * HTML (`/seo/render`, `/seo/head`: title/meta/canonical/robots/OG/JSON-LD/
 * breadcrumbs/301 on slug change/404), sitemap exclusions, the content link
 * index (ok/broken/unpublished), the knowledge graph (real vs suggested
 * edges, filters, node details), link creation/removal that edits the
 * article through the normal versioned update path, explainable
 * suggestions (approve/reject), product SEO, and role authorisation.
 */
class SilentLogger implements LoggerService {
  log() {}
  error() {}
  warn() {}
  debug() {}
  verbose() {}
  fatal(message: unknown) {
    console.error(message);
  }
}

const RUN = uniq();
const WORD =
  'به‌کارگیری ایجنت هوشمند در کسب‌وکار کوچک نیازمند برنامه‌ریزی است. ';

describe('SEO Studio + Knowledge Graph (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let w: World;
  let superToken: string;
  let editor: AdminUser; // CONTENT_MODERATOR: blog:view + manage + publish
  let viewer: AdminUser; // READ_ONLY_ADMIN: blog:view only
  let outsider: AdminUser; // RISK_ANALYST: no blog permission
  const http = () => app.getHttpServer() as unknown as App;
  const admin = () => bearer(editor.token);

  let categoryId = '';
  let categorySlug = '';
  // A: Persian, links to B (ok), to the live product (ok), to a missing post (broken), to the draft (unpublished)
  let aId = '';
  let aSlug = '';
  let aVersion = 0;
  // B: Persian, no outbound links (orphan source)
  let bId = '';
  let bSlug = '';
  // E: English translation of A
  let eId = '';
  let eSlug = '';
  // D: draft
  let dId = '';
  let dSlug = '';

  async function createPost(body: Record<string, unknown>) {
    const res = await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(admin())
      .send({
        excerpt:
          'خلاصهٔ آزمایشی برای مقالهٔ سئو که به اندازهٔ کافی طولانی است.',
        primaryCategoryId: categoryId,
        ...body,
      })
      .expect(201);
    return res.body.data as { id: string; slug: string; version: number };
  }
  async function publish(id: string) {
    const res = await request(http())
      .post(`${PREFIX}/admin/blog/posts/${id}/publish`)
      .set(admin())
      .expect(200);
    return res.body.data as { version: number; slug: string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .setLogger(new SilentLogger())
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    w = await buildWorld(app, http);
    superToken = await loginSuperAdmin(http);
    editor = await createAdminUser(http, superToken, 'CONTENT_MODERATOR');
    viewer = await createAdminUser(http, superToken, 'READ_ONLY_ADMIN');
    outsider = await createAdminUser(http, superToken, 'RISK_ANALYST');

    const cat = await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(admin())
      .send({ name: `سئو ${RUN}`, description: 'دستهٔ آزمایشی سئو' })
      .expect(201);
    categoryId = cat.body.data.id;
    categorySlug = cat.body.data.slug;

    const d = await createPost({
      title: `پیش‌نویس سئو ${RUN}`,
      bodyMarkdown: `${WORD.repeat(10)}`,
    });
    dId = d.id;
    dSlug = d.slug;

    const b = await createPost({
      title: `مقالهٔ هدف ${RUN}`,
      bodyMarkdown: `## مقدمه\n\n${WORD.repeat(40)}\n\n## نتیجه\n\n${WORD.repeat(20)}`,
    });
    bId = b.id;
    bSlug = (await publish(b.id)).slug;

    const aBody = [
      `## ایجنت هوشمند چیست؟`,
      '',
      `ایجنت هوشمند ابزاری است که کارهای تکراری را انجام می‌دهد. ${WORD.repeat(12)}`,
      '',
      `## انتخاب ایجنت هوشمند`,
      '',
      `برای شروع [مقالهٔ هدف](/blog/${bSlug}) را بخوانید و سپس [محصول زنده](/agents/${w.a.liveFree.slug}) را ببینید. ${WORD.repeat(12)}`,
      '',
      `این [لینک شکسته](/blog/does-not-exist-${RUN}) و این [پیش‌نویس](/blog/${dSlug}) هر دو باید گزارش شوند. ${WORD.repeat(12)}`,
      '',
      `![](https://cdn.example.com/${RUN}.png)`,
      '',
      `## جمع‌بندی ایجنت هوشمند`,
      '',
      `${WORD.repeat(14)}`,
    ].join('\n');
    const a = await createPost({
      title: `راهنمای کامل ایجنت هوشمند برای کسب‌وکار ${RUN}`,
      bodyMarkdown: aBody,
    });
    aId = a.id;
    const pa = await publish(a.id);
    aSlug = pa.slug;
    aVersion = pa.version;

    const e = await createPost({
      title: `Complete guide to smart agents for small business ${RUN}`,
      excerpt: 'A practical English guide to choosing your first smart agent.',
      bodyMarkdown: `## What is a smart agent?\n\n${'A smart agent automates repetitive work for a small business and needs planning. '.repeat(45)}`,
    });
    eId = e.id;
    eSlug = (await publish(e.id)).slug;
  }, 300_000);

  afterAll(async () => {
    restoreRateLimits();
    await closeStepUpPool();
    await app.close();
  });

  // ---- metadata ------------------------------------------------------------

  it('S1 metadata view distinguishes stored from fallback values; PUT stores; validation rejects bad input', async () => {
    const view = await request(http())
      .get(`${PREFIX}/admin/seo/content/post/${aId}`)
      .set(admin())
      .expect(200);
    const v = view.body.data;
    expect(v.content).toMatchObject({
      type: 'post',
      id: aId,
      slug: aSlug,
      published: true,
    });
    expect(v.fields.seoTitle.source).toBe('fallback');
    expect(v.fields.seoTitle.stored).toBeNull();
    expect(v.fields.seoTitle.effective).toContain('راهنمای کامل');
    expect(v.fields.canonicalUrl.source).toBe('fallback');
    expect(v.fields.canonicalUrl.effective).toContain(`/blog/${aSlug}`);
    expect(v.fields.robotsIndex).toMatchObject({
      effective: true,
      source: 'fallback',
    });
    expect(v.fields.language).toMatchObject({
      effective: 'fa',
      source: 'fallback',
    });
    expect(v.focusKeyword).toBeNull();

    const saved = await request(http())
      .put(`${PREFIX}/admin/seo/content/post/${aId}`)
      .set(admin())
      .send({
        seoTitle: `راهنمای کامل ایجنت هوشمند برای کسب‌وکار کوچک ${RUN}`.slice(
          0,
          60,
        ),
        seoDescription:
          'راهنمای عملی انتخاب ایجنت هوشمند برای کسب‌وکارهای کوچک: معیارها، هزینه، یکپارچه‌سازی و نکات امنیتی که باید بدانید.',
        focusKeyword: 'ایجنت هوشمند',
        relatedKeywords: ['کسب‌وکار کوچک', 'اتوماسیون'],
        twitterCard: 'summary',
        ogTitle: 'راهنمای ایجنت هوشمند',
        language: 'fa',
      })
      .expect(200);
    const s = saved.body.data;
    expect(s.fields.seoTitle.source).toBe('stored');
    expect(s.fields.twitterCard).toMatchObject({
      stored: 'summary',
      effective: 'summary',
      source: 'stored',
    });
    expect(s.fields.ogTitle.effective).toBe('راهنمای ایجنت هوشمند');
    expect(s.fields.ogDescription.source).toBe('fallback');
    expect(s.focusKeyword).toBe('ایجنت هوشمند');
    expect(s.relatedKeywords).toEqual(['کسب‌وکار کوچک', 'اتوماسیون']);

    // Legacy columns stay the source of truth for posts → the admin blog API sees the same title.
    const legacy = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${aId}`)
      .set(admin())
      .expect(200);
    expect(legacy.body.data.seoTitle).toBe(s.fields.seoTitle.stored);

    // Validation: canonical must be https on an allowed host; title length capped.
    const bad = await request(http())
      .put(`${PREFIX}/admin/seo/content/post/${aId}`)
      .set(admin())
      .send({ canonicalUrl: 'http://evil.example/x' })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    await request(http())
      .put(`${PREFIX}/admin/seo/content/post/${aId}`)
      .set(admin())
      .send({ seoTitle: 'x'.repeat(71) })
      .expect(400);
    await request(http())
      .put(`${PREFIX}/admin/seo/content/post/${aId}`)
      .set(admin())
      .send({ twitterCard: 'player' })
      .expect(400);
    await request(http())
      .get(
        `${PREFIX}/admin/seo/content/post/00000000-0000-4000-8000-000000000000`,
      )
      .set(admin())
      .expect(404);
    await request(http())
      .get(`${PREFIX}/admin/seo/content/widget/${aId}`)
      .set(admin())
      .expect(400);
  });

  it('S2 drafts are never indexable; noindex removes a published article from the sitemap and marks its HTML', async () => {
    const draft = await request(http())
      .get(`${PREFIX}/admin/seo/content/post/${dId}`)
      .set(admin())
      .expect(200);
    expect(draft.body.data.fields.robotsIndex).toMatchObject({
      effective: false,
      source: 'forced',
    });
    await request(http())
      .get(`${PREFIX}/seo/head?path=/blog/${dSlug}`)
      .expect(404);
    await request(http())
      .get(`${PREFIX}/seo/render?path=/blog/${dSlug}`)
      .expect(404);

    const before = await request(http())
      .get(`${PREFIX}/seo/sitemap.xml`)
      .expect(200);
    expect(before.text).toContain(`/blog/${bSlug}</loc>`);
    expect(before.text).not.toContain(`/blog/${dSlug}</loc>`);

    await request(http())
      .put(`${PREFIX}/admin/seo/content/post/${bId}`)
      .set(admin())
      .send({ robotsIndex: false })
      .expect(200);
    const after = await request(http())
      .get(`${PREFIX}/seo/sitemap.xml`)
      .expect(200);
    expect(after.text).not.toContain(`/blog/${bSlug}</loc>`);
    const html = await request(http())
      .get(`${PREFIX}/seo/render?path=/blog/${bSlug}`)
      .expect(200);
    expect(html.text).toContain(
      '<meta name="robots" content="noindex,follow"/>',
    );
    expect(html.headers['x-robots-tag']).toBe('noindex,follow');
    const pub = await request(http())
      .get(`${PREFIX}/blog/posts/${bSlug}`)
      .expect(200);
    expect(pub.body.data.seo.robots).toBe('noindex,follow');

    await request(http())
      .put(`${PREFIX}/admin/seo/content/post/${bId}`)
      .set(admin())
      .send({ robotsIndex: true })
      .expect(200);
    const restored = await request(http())
      .get(`${PREFIX}/seo/sitemap.xml`)
      .expect(200);
    expect(restored.text).toContain(`/blog/${bSlug}</loc>`);
  });

  it('S3 translation links produce reciprocal hreflang in the sitemap, HTML and public payload; same language is refused', async () => {
    await request(http())
      .put(`${PREFIX}/admin/seo/content/post/${eId}`)
      .set(admin())
      .send({ language: 'en' })
      .expect(200);
    const linked = await request(http())
      .post(`${PREFIX}/admin/seo/content/post/${aId}/translations`)
      .set(admin())
      .send({ targetType: 'post', targetId: eId })
      .expect(200);
    expect(linked.body.data.translations).toEqual([
      expect.objectContaining({
        type: 'post',
        id: eId,
        language: 'en',
        path: `/blog/${eSlug}`,
      }),
    ]);
    // A third Persian article cannot join a group that already has Persian.
    const clash = await request(http())
      .post(`${PREFIX}/admin/seo/content/post/${aId}/translations`)
      .set(admin())
      .send({ targetType: 'post', targetId: bId })
      .expect(409);
    expect(clash.body.error.code).toBe('CONFLICT');

    const sitemap = await request(http())
      .get(`${PREFIX}/seo/sitemap.xml`)
      .expect(200);
    expect(sitemap.text).toContain(
      `<xhtml:link rel="alternate" hreflang="en" href="http://localhost:5173/blog/${eSlug}"/>`,
    );
    expect(sitemap.text).toContain(
      `<xhtml:link rel="alternate" hreflang="fa" href="http://localhost:5173/blog/${aSlug}"/>`,
    );

    const head = await request(http())
      .get(`${PREFIX}/seo/head?path=/blog/${eSlug}`)
      .expect(200);
    expect(head.body.data.language).toBe('en');
    expect(head.body.data.locale).toBe('en_US');
    expect(head.body.data.hreflang).toEqual([
      { lang: 'en', href: `http://localhost:5173/blog/${eSlug}` },
      { lang: 'fa', href: `http://localhost:5173/blog/${aSlug}` },
      { lang: 'x-default', href: `http://localhost:5173/blog/${aSlug}` },
    ]);
    const html = await request(http())
      .get(`${PREFIX}/seo/render?path=/blog/${eSlug}`)
      .expect(200);
    expect(html.text).toContain('<html lang="en" dir="ltr">');
    expect(html.text).toContain(
      `<link rel="alternate" hreflang="fa" href="http://localhost:5173/blog/${aSlug}"/>`,
    );
    const pub = await request(http())
      .get(`${PREFIX}/blog/posts/${aSlug}`)
      .expect(200);
    expect(pub.body.data.seo.translations).toEqual([
      { language: 'en', path: `/blog/${eSlug}` },
    ]);

    // Articles without a translation emit NO hreflang at all.
    const solo = await request(http())
      .get(`${PREFIX}/seo/head?path=/blog/${bSlug}`)
      .expect(200);
    expect(solo.body.data.hreflang).toEqual([]);
  });

  // ---- analysis ------------------------------------------------------------

  it('S4 analysis (fa): rules fire on real content — broken/unpublished links, image alt, keyword rules; score is a labelled MESH metric', async () => {
    const res = await request(http())
      .get(`${PREFIX}/admin/seo/content/post/${aId}/analysis`)
      .set(admin())
      .expect(200);
    const r = res.body.data;
    expect(r.engine).toBe('mesh-rules');
    expect(r.basis).toBe('saved');
    expect(r.language).toBe('fa');
    expect(r.score.label).toBe('MESH internal metric');
    expect(typeof r.score.value).toBe('number');
    expect(r.score.weights.seo_title).toBe(10);
    const by = Object.fromEntries(
      r.recommendations.map((x: { rule: string }) => [x.rule, x]),
    ) as Record<
      string,
      {
        passed: boolean;
        applicable: boolean;
        severity: string;
        location: unknown;
        problem: { fa: string; en: string };
        fix: { fa: string };
        why: { fa: string };
      }
    >;
    expect(by.broken_links.passed).toBe(false);
    expect(by.broken_links.severity).toBe('critical');
    expect(by.broken_links.location).toBeTruthy();
    expect(by.unpublished_links.passed).toBe(false);
    expect(by.images_alt.passed).toBe(false);
    expect(by.internal_links.passed).toBe(true);
    expect(by.keyword_in_title.passed).toBe(true);
    expect(by.keyword_in_headings.passed).toBe(true);
    expect(by.heading_structure.passed).toBe(true);
    expect(by.seo_title.passed).toBe(true);
    expect(by.content_length.passed).toBe(true);
    expect(r.score.criticalFailed).toBe(true);
    expect(r.score.value).toBeLessThanOrEqual(49);
    for (const rec of r.recommendations) {
      expect(rec.title.fa).toBeTruthy();
      expect(rec.title.en).toBeTruthy();
      expect(rec.problem.fa).toBeTruthy();
      expect(rec.why.fa).toBeTruthy();
      expect(rec.fix.fa).toBeTruthy();
    }
    expect(r.stats.words).toBeGreaterThan(300);
    expect(r.stats.internalLinks).toBeGreaterThanOrEqual(2);
  });

  it('S4b analysis (en) + unsaved analysis of editor state: readability per language, keyword stuffing cap', async () => {
    const en = await request(http())
      .get(`${PREFIX}/admin/seo/content/post/${eId}/analysis`)
      .set(admin())
      .expect(200);
    expect(en.body.data.language).toBe('en');
    const enBy = Object.fromEntries(
      en.body.data.recommendations.map((x: { rule: string }) => [x.rule, x]),
    );
    expect(enBy.readability.applicable).toBe(true);
    expect(enBy.keyword_in_title).toBeUndefined(); // not applicable without a focus keyword → excluded from the report and the score

    const stuffed = await request(http())
      .post(`${PREFIX}/admin/seo/analyze`)
      .set(admin())
      .send({
        contentType: 'post',
        contentId: aId,
        language: 'fa',
        title: 'ایجنت هوشمند ایجنت هوشمند',
        slug: 'agent-agent',
        excerpt: 'ایجنت هوشمند',
        bodyMarkdown: `${'ایجنت هوشمند '.repeat(200)}`,
        seoTitle: 'ایجنت هوشمند ایجنت هوشمند ایجنت هوشمند ایجنت',
        seoDescription: 'ایجنت هوشمند '.repeat(8),
        focusKeyword: 'ایجنت هوشمند',
      })
      .expect(200);
    const s = stuffed.body.data;
    expect(s.basis).toBe('unsaved');
    const sBy = Object.fromEntries(
      s.recommendations.map((x: { rule: string }) => [x.rule, x]),
    );
    expect(sBy.keyword_density.passed).toBe(false);
    expect(s.score.value).toBeLessThanOrEqual(49);
    // Optional: analysis never requires a saved row.
    await request(http())
      .post(`${PREFIX}/admin/seo/analyze`)
      .set(admin())
      .send({
        contentType: 'post',
        language: 'en',
        title: 'New draft',
        slug: 'new-draft',
        bodyMarkdown: 'Short.',
      })
      .expect(200);
  });

  // ---- public HTML ---------------------------------------------------------

  it('S5 public HTML carries real title/meta/canonical/OG/JSON-LD/breadcrumbs; slug change → 301; unknown → 404', async () => {
    const res = await request(http())
      .get(`${PREFIX}/seo/render?path=/blog/${aSlug}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    const html = res.text;
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain(
      `<title>راهنمای کامل ایجنت هوشمند برای کسب‌وکار کوچک ${RUN}`.slice(0, 60),
    );
    expect(html).not.toContain('generic description');
    expect(html).not.toContain('generic og');
    expect(html).toContain('<meta name="robots" content="index,follow"/>');
    expect(html).toContain(
      `<link rel="canonical" href="http://localhost:5173/blog/${aSlug}"/>`,
    );
    expect(html).toContain('<meta property="og:type" content="article"/>');
    expect(html).toContain('<meta property="og:locale" content="fa_IR"/>');
    expect(html).toContain('<meta name="twitter:card" content="summary"/>');
    expect(html).toContain('<html lang="fa" dir="rtl">');
    // Body is server-rendered inside #root (hydration-safe: React replaces it on mount).
    expect(html).toContain(`<div id="root"><article lang="fa" dir="rtl">`);
    expect(html).toContain(`<a href="/blog/${bSlug}">مقالهٔ هدف</a>`);
    expect(html).toContain('<h2 id=');
    expect(html).toContain('</script>'); // JSON-LD present
    expect(html).toContain(
      '<script type="module" src="/assets/index.js"></script>',
    ); // SPA still boots

    const scripts = [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ].map((m) => JSON.parse(m[1]));
    expect(scripts).toHaveLength(2);
    const [article, crumbs] = scripts;
    expect(article['@type']).toBe('BlogPosting');
    expect(article.headline).toContain('راهنمای کامل');
    expect(article.inLanguage).toBe('fa');
    expect(article.aggregateRating).toBeUndefined(); // no ratings → no fabricated rating
    expect(article.author).toMatchObject({ '@type': 'Person' });
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(
      ['MESH', 'بلاگ', `سئو ${RUN}`, expect.stringContaining('راهنمای کامل')],
    );
    expect(crumbs.itemListElement[2].item).toBe(
      `http://localhost:5173/blog/category/${categorySlug}`,
    );

    // JSON head for the SPA/edge.
    const head = await request(http())
      .get(`${PREFIX}/seo/head?path=/blog/${aSlug}`)
      .expect(200);
    expect(head.body.data.kind).toBe('ok');
    expect(head.body.data.breadcrumbs).toHaveLength(4);
    expect(head.body.data.jsonLd).toHaveLength(2);

    // Slug change → redirect.
    const renamed = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${aId}`)
      .set(admin())
      .send({ version: aVersion, slug: `${aSlug}-v2` })
      .expect(200);
    aVersion = renamed.body.data.version;
    const oldSlug = aSlug;
    aSlug = renamed.body.data.slug;
    const moved = await request(http())
      .get(`${PREFIX}/seo/render?path=/blog/${oldSlug}`)
      .expect(301);
    expect(moved.headers.location).toBe(`/blog/${aSlug}`);
    const movedHead = await request(http())
      .get(`${PREFIX}/seo/head?path=/blog/${oldSlug}`)
      .expect(200);
    expect(movedHead.body.data).toEqual({
      kind: 'redirect',
      to: `/blog/${aSlug}`,
    });

    await request(http())
      .get(`${PREFIX}/seo/render?path=/blog/nope-${RUN}`)
      .expect(404);
    await request(http()).get(`${PREFIX}/seo/head?path=/pricing`).expect(404);
    await request(http())
      .get(`${PREFIX}/seo/head?path=/blog/../etc`)
      .expect(400);
  });

  it('S5b product HTML: Product JSON-LD with real offer, no fabricated rating; public agent payload exposes seo', async () => {
    const slug = w.a.livePaid.slug;
    const head = await request(http())
      .get(`${PREFIX}/seo/head?path=/agents/${slug}`)
      .expect(200);
    const h = head.body.data;
    expect(h.type).toBe('agent');
    expect(h.og.type).toBe('product');
    const product = h.jsonLd[0];
    expect(product['@type']).toBe('Product');
    expect(product.offers).toMatchObject({
      '@type': 'Offer',
      priceCurrency: 'IRR',
    });
    expect(Number(product.offers.price)).toBeGreaterThan(0);
    expect(product.aggregateRating).toBeUndefined();
    expect(h.jsonLd[1]['@type']).toBe('BreadcrumbList');

    const detail = await request(http())
      .get(`${PREFIX}/agents/${slug}`)
      .expect(200);
    expect(detail.body.data.seo).toMatchObject({
      robots: 'index,follow',
      canonicalUrl: `http://localhost:5173/agents/${slug}`,
      language: 'fa',
    });

    // Admin stores product SEO in content_seo (agents have no legacy columns).
    const put = await request(http())
      .put(`${PREFIX}/admin/seo/content/agent/${w.a.livePaid.id}`)
      .set(admin())
      .send({
        seoTitle: 'Warehouse reconciliation agent for operations teams',
        language: 'en',
        robotsIndex: false,
      })
      .expect(200);
    expect(put.body.data.storage).toBe('content_seo');
    expect(put.body.data.fields.seoTitle.source).toBe('stored');
    const sitemap = await request(http())
      .get(`${PREFIX}/seo/sitemap.xml`)
      .expect(200);
    expect(sitemap.text).not.toContain(`/agents/${slug}</loc>`);
    const html = await request(http())
      .get(`${PREFIX}/seo/render?path=/agents/${slug}`)
      .expect(200);
    expect(html.text).toContain(
      '<title>Warehouse reconciliation agent for operations teams — MESH</title>',
    );
    expect(html.text).toContain(
      '<meta name="robots" content="noindex,follow"/>',
    );
    await request(http())
      .put(`${PREFIX}/admin/seo/content/agent/${w.a.livePaid.id}`)
      .set(admin())
      .send({ robotsIndex: true })
      .expect(200);
    // Draft products are never public.
    await request(http())
      .get(`${PREFIX}/seo/head?path=/agents/${w.a.draft.slug}`)
      .expect(404);
  });

  // ---- link index + graph ----------------------------------------------------

  it('S6 the link index reflects real link statuses and the graph exposes real vs suggested edges with server-side filters', async () => {
    const rows = await ds.query(
      `SELECT target_type, href, status FROM content_links WHERE source_type = 'post' AND source_id = $1 ORDER BY position, href`,
      [aId],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_type: 'post',
          href: `/blog/${bSlug}`,
          status: 'ok',
        }),
        expect.objectContaining({
          target_type: 'agent',
          href: `/agents/${w.a.liveFree.slug}`,
          status: 'ok',
        }),
        expect.objectContaining({
          target_type: 'post',
          href: `/blog/does-not-exist-${RUN}`,
          status: 'broken',
        }),
        expect.objectContaining({
          target_type: 'post',
          href: `/blog/${dSlug}`,
          status: 'unpublished',
        }),
      ]),
    );

    const g = await request(http())
      .get(
        `${PREFIX}/admin/seo/graph?q=${encodeURIComponent(RUN)}&types=post,agent,category`,
      )
      .set(bearer(viewer.token)) // blog:view is enough to read the graph
      .expect(200);
    const graph = g.body.data;
    expect(graph.meta.truncated).toBe(false);
    const ids = graph.nodes.map((n: { id: string }) => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        `post:${aId}`,
        `post:${bId}`,
        `post:${eId}`,
        `post:${dId}`,
      ]),
    );
    const aNode = graph.nodes.find(
      (n: { id: string }) => n.id === `post:${aId}`,
    );
    expect(aNode.issues.brokenOut).toBe(1);
    expect(aNode.outbound).toBeGreaterThanOrEqual(3);
    const bNode = graph.nodes.find(
      (n: { id: string }) => n.id === `post:${bId}`,
    );
    expect(bNode.inbound).toBe(1);
    expect(bNode.issues.orphan).toBe(false);
    expect(bNode.issues.noOutbound).toBe(true);
    const edges = graph.edges as Array<{
      type: string;
      source: string;
      target: string;
      status: string | null;
      anchor: string | null;
    }>;
    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'link',
          source: `post:${aId}`,
          target: `post:${bId}`,
          status: 'ok',
          anchor: 'مقالهٔ هدف',
        }),
        expect.objectContaining({
          type: 'link',
          source: `post:${aId}`,
          target: `post:${dId}`,
          status: 'unpublished',
        }),
        expect.objectContaining({ type: 'translation' }),
        expect.objectContaining({
          type: 'category',
          source: `post:${aId}`,
          target: `category:${categoryId}`,
        }),
      ]),
    );
    const tr = edges.filter((e) => e.type === 'translation');
    expect(tr).toHaveLength(1);
    expect([tr[0].source, tr[0].target].sort()).toEqual(
      [`post:${aId}`, `post:${eId}`].sort(),
    );
    expect(edges.some((e) => e.type === 'suggestion')).toBe(false); // not requested

    // Server-side filters.
    const broken = await request(http())
      .get(`${PREFIX}/admin/seo/graph?q=${encodeURIComponent(RUN)}&broken=true`)
      .set(admin())
      .expect(200);
    const brokenNodes = broken.body.data.nodes as Array<{
      id: string;
      type: string;
      issues: { brokenOut: number };
    }>;
    const brokenEdges = broken.body.data.edges as Array<{
      source: string;
      target: string;
    }>;
    const withBroken = brokenNodes
      .filter((n) => n.issues.brokenOut > 0)
      .map((n) => n.id);
    expect(withBroken).toEqual([`post:${aId}`]);
    // Every other node is a direct neighbour of a node with broken links (kept for context).
    for (const n of brokenNodes) {
      if (withBroken.includes(n.id)) continue;
      expect(
        brokenEdges.some(
          (e) =>
            (withBroken.includes(e.source) && e.target === n.id) ||
            (withBroken.includes(e.target) && e.source === n.id),
        ),
      ).toBe(true);
    }
    const en = await request(http())
      .get(
        `${PREFIX}/admin/seo/graph?q=${encodeURIComponent(RUN)}&language=en&types=post`,
      )
      .set(admin())
      .expect(200);
    expect(en.body.data.nodes.map((n: { id: string }) => n.id)).toEqual([
      `post:${eId}`,
    ]);
    const orphans = await request(http())
      .get(
        `${PREFIX}/admin/seo/graph?q=${encodeURIComponent(RUN)}&orphans=no-inbound&types=post`,
      )
      .set(admin())
      .expect(200);
    const orphanNodes = orphans.body.data.nodes as Array<{
      id: string;
      issues: { orphan: boolean };
    }>;
    const orphanIds = orphanNodes
      .filter((n) => n.issues.orphan)
      .map((n) => n.id);
    expect(orphanIds).toContain(`post:${aId}`); // nobody links to A yet
    expect(orphanIds).not.toContain(`post:${bId}`); // A links to B
    expect(orphanIds).not.toContain(`post:${dId}`); // drafts are not orphans
    await request(http())
      .get(`${PREFIX}/admin/seo/graph?types=blob`)
      .set(admin())
      .expect(400);

    // Node details.
    const node = await request(http())
      .get(`${PREFIX}/admin/seo/graph/nodes/post/${aId}`)
      .set(admin())
      .expect(200);
    expect(node.body.data.content.id).toBe(aId);
    expect(
      node.body.data.outbound.map((l: { href: string }) => l.href),
    ).toContain(`/blog/${bSlug}`);
    expect(node.body.data.inbound).toEqual([]);
    expect(node.body.data.keywords.focus).toBe('ایجنت هوشمند');
    expect(node.body.data.issues).toMatchObject({
      orphan: true,
      brokenOut: 1,
      unpublishedOut: 1,
    });
  });

  it('S7 links are created and removed through the API, editing the article via the versioned update path', async () => {
    // Anchor present in B's body → inline link; B gains an outbound link and A an inbound one.
    const created = await request(http())
      .post(`${PREFIX}/admin/seo/links`)
      .set(admin())
      .send({
        sourceType: 'post',
        sourceId: bId,
        targetType: 'post',
        targetId: aId,
        anchor: 'برنامه‌ریزی',
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      applied: 'link',
      href: `/blog/${aSlug}`,
      anchor: 'برنامه‌ریزی',
    });
    const bDetail = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${bId}`)
      .set(admin())
      .expect(200);
    expect(bDetail.body.data.bodyMarkdown).toContain(
      `[برنامه‌ریزی](/blog/${aSlug})`,
    );
    expect(bDetail.body.data.version).toBe(created.body.data.version);
    const publicB = await request(http())
      .get(`${PREFIX}/blog/posts/${bSlug}`)
      .expect(200);
    expect(JSON.stringify(publicB.body.data.blocks)).toContain(
      `/blog/${aSlug}`,
    );

    const node = await request(http())
      .get(`${PREFIX}/admin/seo/graph/nodes/post/${aId}`)
      .set(admin())
      .expect(200);
    const inbound = node.body.data.inbound as Array<{
      id: string;
      source: { id: string };
    }>;
    expect(inbound.map((l) => l.source.id)).toContain(bId);
    const linkId = (inbound.find((l) => l.source.id === bId) as { id: string })
      .id;

    // Invalid relations.
    await request(http())
      .post(`${PREFIX}/admin/seo/links`)
      .set(admin())
      .send({
        sourceType: 'post',
        sourceId: bId,
        targetType: 'post',
        targetId: bId,
      })
      .expect(400);
    await request(http())
      .post(`${PREFIX}/admin/seo/links`)
      .set(admin())
      .send({
        sourceType: 'agent',
        sourceId: w.a.liveFree.id,
        targetType: 'post',
        targetId: aId,
      })
      .expect(400);
    await request(http())
      .post(`${PREFIX}/admin/seo/links`)
      .set(admin())
      .send({
        sourceType: 'post',
        sourceId: bId,
        targetType: 'post',
        targetId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(404);
    // Linking to a draft is an editorial choice: allowed, but indexed as "unpublished" until it goes live.
    const toDraft = await request(http())
      .post(`${PREFIX}/admin/seo/links`)
      .set(admin())
      .send({
        sourceType: 'post',
        sourceId: bId,
        targetType: 'post',
        targetId: dId,
        anchor: 'کسب‌وکار کوچک',
      })
      .expect(201);
    expect(toDraft.body.data.applied).toBe('link');
    const draftRow = await ds.query(
      `SELECT id, status FROM content_links WHERE source_id = $1 AND target_id = $2`,
      [bId, dId],
    );
    expect(draftRow).toEqual([
      expect.objectContaining({ status: 'unpublished' }),
    ]);
    await request(http())
      .delete(`${PREFIX}/admin/seo/links/${draftRow[0].id}`)
      .set(admin())
      .expect(200);

    // Anchor absent → falls back to a confirmed relation (related article), reported honestly.
    const rel = await request(http())
      .post(`${PREFIX}/admin/seo/links`)
      .set(admin())
      .send({
        sourceType: 'post',
        sourceId: bId,
        targetType: 'post',
        targetId: eId,
        anchor: 'nicht vorhanden',
      })
      .expect(201);
    expect(rel.body.data.applied).toBe('relation');
    const withRel = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${bId}`)
      .set(admin())
      .expect(200);
    expect(withRel.body.data.relatedPostIds).toContain(eId);
    await request(http())
      .post(`${PREFIX}/admin/seo/relations/remove`)
      .set(admin())
      .send({ sourceId: bId, targetType: 'post', targetId: eId })
      .expect(200);

    // Delete the inline link: markdown loses the link, text stays.
    const removed = await request(http())
      .delete(`${PREFIX}/admin/seo/links/${linkId}`)
      .set(admin())
      .expect(200);
    expect(removed.body.data.removed).toBe(true);
    const bAfter = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${bId}`)
      .set(admin())
      .expect(200);
    expect(bAfter.body.data.bodyMarkdown).not.toContain(`](/blog/${aSlug})`);
    expect(bAfter.body.data.bodyMarkdown).toContain('برنامه‌ریزی');
    expect(bAfter.body.data.relatedPostIds).not.toContain(eId);
    await request(http())
      .delete(`${PREFIX}/admin/seo/links/${linkId}`)
      .set(admin())
      .expect(404);
  });

  it('S8 suggestions are explainable, generated from real signals, and approve/reject are idempotent decisions', async () => {
    const gen = await request(http())
      .post(`${PREFIX}/admin/seo/suggestions/generate`)
      .set(admin())
      .send({ sourceId: bId })
      .expect(200);
    expect(gen.body.data.created + gen.body.data.updated).toBeGreaterThan(0);
    const list = await request(http())
      .get(`${PREFIX}/admin/seo/suggestions?sourceId=${bId}&status=pending`)
      .set(admin())
      .expect(200);
    const items = list.body.data.items as Array<{
      id: string;
      reason: string;
      score: number;
      evidence: Record<string, unknown>;
      target: { id: string };
    }>;
    expect(items.length).toBeGreaterThan(0);
    for (const s of items) {
      expect([
        'shared_keyword',
        'same_category',
        'orphan_target',
        'title_overlap',
      ]).toContain(s.reason);
      expect(s.score).toBeGreaterThan(0);
      expect(s.evidence).toBeTruthy();
      expect(s.target.id).not.toBe(bId);
    }
    const toA = items.find((s) => s.target.id === aId);
    expect(toA).toBeTruthy();
    // Suggested edges appear in the graph only when asked for.
    const g = await request(http())
      .get(
        `${PREFIX}/admin/seo/graph?q=${encodeURIComponent(RUN)}&suggested=true`,
      )
      .set(admin())
      .expect(200);
    expect(
      g.body.data.edges.some(
        (e: { type: string; source: string }) =>
          e.type === 'suggestion' && e.source === `post:${bId}`,
      ),
    ).toBe(true);

    const other = items.find((s) => s.target.id !== aId);
    if (other) {
      const rej = await request(http())
        .post(`${PREFIX}/admin/seo/suggestions/${other.id}/reject`)
        .set(admin())
        .expect(200);
      expect(rej.body.data.status).toBe('rejected');
      await request(http())
        .post(`${PREFIX}/admin/seo/suggestions/${other.id}/approve`)
        .set(admin())
        .send({})
        .expect(409);
    }
    const approved = await request(http())
      .post(
        `${PREFIX}/admin/seo/suggestions/${(toA as { id: string }).id}/approve`,
      )
      .set(admin())
      .send({ anchor: 'برنامه‌ریزی' })
      .expect(200);
    expect(approved.body.data.applied).toBe('link');
    const bDetail = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${bId}`)
      .set(admin())
      .expect(200);
    expect(bDetail.body.data.bodyMarkdown).toContain(`](/blog/${aSlug})`);
    await request(http())
      .post(
        `${PREFIX}/admin/seo/suggestions/${(toA as { id: string }).id}/approve`,
      )
      .set(admin())
      .send({})
      .expect(409);

    // Rescan is idempotent and reports counts.
    const rescan = await request(http())
      .post(`${PREFIX}/admin/seo/links/rescan`)
      .set(admin())
      .expect(200);
    expect(rescan.body.data.sources).toBeGreaterThanOrEqual(3);
    expect(rescan.body.data.broken).toBeGreaterThanOrEqual(1);
  });

  it('S9 unpublishing a link target flips inbound link status; republishing restores it', async () => {
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${aId}/unpublish`)
      .set(admin())
      .expect(200);
    const down = await ds.query(
      `SELECT status FROM content_links WHERE target_type = 'post' AND target_id = $1`,
      [aId],
    );
    expect(down.length).toBeGreaterThan(0);
    expect(
      down.every((r: { status: string }) => r.status === 'unpublished'),
    ).toBe(true);
    await request(http())
      .get(`${PREFIX}/seo/render?path=/blog/${aSlug}`)
      .expect(404);
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${aId}/publish`)
      .set(admin())
      .expect(200);
    const up = await ds.query(
      `SELECT status FROM content_links WHERE target_type = 'post' AND target_id = $1`,
      [aId],
    );
    expect(up.every((r: { status: string }) => r.status === 'ok')).toBe(true);
  });

  it('S10 authorisation: blog:view reads, blog:manage writes, others are refused, anonymous is 401', async () => {
    await request(http())
      .get(`${PREFIX}/admin/seo/content/post/${aId}`)
      .set(bearer(viewer.token))
      .expect(200);
    await request(http())
      .put(`${PREFIX}/admin/seo/content/post/${aId}`)
      .set(bearer(viewer.token))
      .send({ seoTitle: 'x' })
      .expect(403);
    await request(http())
      .post(`${PREFIX}/admin/seo/suggestions/generate`)
      .set(bearer(viewer.token))
      .send({})
      .expect(403);
    await request(http())
      .get(`${PREFIX}/admin/seo/graph`)
      .set(bearer(outsider.token))
      .expect(403);
    await request(http())
      .get(`${PREFIX}/admin/seo/graph`)
      .set(bearer(w.buyerA.token))
      .expect(403);
    await request(http()).get(`${PREFIX}/admin/seo/graph`).expect(401);
    // Public endpoints never leak drafts or admin-only fields.
    const pub = await request(http())
      .get(`${PREFIX}/blog/posts/${aSlug}`)
      .expect(200);
    expect(pub.body.data.seo).not.toHaveProperty('updatedBy');
    expect(JSON.stringify(pub.body.data)).not.toContain(editor.userId);
  });
});
