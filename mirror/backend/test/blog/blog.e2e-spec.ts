import { restoreRateLimits } from '../helpers/lift-rate-limits';
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
 * Blog platform — end-to-end contract of the CMS and the public reader API.
 *
 * Covers: taxonomy CRUD/merge/reassign; draft privacy (list, detail, search,
 * sitemap, feed, redirects); authorised preview; optimistic concurrency;
 * revisions (coalescing, autosave exemption, restore); server-side
 * rendering/sanitisation; readiness checklist; publish / unpublish /
 * schedule (incl. promotion when due); slug change redirects (no loops, no
 * leaks); marketplace reference validation; permissions per admin role;
 * deletion rules; bulk actions; search + pagination validation; RSS;
 * author archive; uploads disabled → 503.
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
const BODY = [
  '## از نیاز واقعی شروع کنید',
  '',
  'قبل از اینکه بین ده‌ها Agent جستجو کنید، یک **کار مشخص** را انتخاب کنید. ' +
    'این متن برای شمارش کلمات به اندازهٔ کافی طولانی است و چند جمله دارد.',
  '',
  '> [!TIP]',
  '> به‌جای «کدام Agent بهتر است؟» بپرسید «برای انجام کدام کار به کمک نیاز دارم؟»',
  '',
  '## قابلیت‌ها را مقایسه کنید',
  '',
  '| چه چیزی را بررسی کنیم؟ | چرا مهم است؟ |',
  '|---|---|',
  '| کاربرد اصلی | هم‌راستا با نیاز واقعی |',
  '| Integration | در Workflow فعلی قرار می‌گیرد |',
  '',
  '- [مارکت‌پلیس](/agents) را ببینید',
  '- [لینک ناامن](javascript:alert(1)) حذف می‌شود',
  '',
  '<script>alert("xss")</script> متن ساده',
  '',
  '```ts',
  'const agent = pick("best");',
  '```',
].join('\n');

describe('Blog platform (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let w: World;
  let superToken: string;
  let editor: AdminUser; // CONTENT_MODERATOR: blog:view + manage + publish
  let viewer: AdminUser; // READ_ONLY_ADMIN: blog:view only
  let outsider: AdminUser; // RISK_ANALYST: no blog permission at all
  const http = () => app.getHttpServer() as unknown as App;

  let categoryId = '';
  let categorySlug = '';
  let tagA = '';
  let tagB = '';
  let postId = '';
  let slug = '';
  let version = 0;

  const admin = () => bearer(editor.token);

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
  }, 300_000);

  afterAll(async () => {
    restoreRateLimits();
    await closeStepUpPool();
    await app.close();
  });

  // ---- taxonomy -----------------------------------------------------------

  it('T1 categories: Persian name → latin slug, duplicate name 409, one nesting level', async () => {
    const created = await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(admin())
      .send({
        name: `راهنمای انتخاب ${RUN}`,
        description: 'راهنماهای عملی برای انتخاب Agent',
      })
      .expect(201);
    categoryId = created.body.data.id;
    categorySlug = created.body.data.slug;
    expect(categorySlug).toMatch(/^[a-z0-9-]+$/);
    expect(created.body.data.postCount).toBe(0);

    await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(admin())
      .send({ name: `راهنمای انتخاب ${RUN}` })
      .expect(409);

    const child = await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(admin())
      .send({
        name: `زیرشاخه ${RUN}`,
        slug: `child-${RUN}`,
        parentId: categoryId,
      })
      .expect(201);
    // grandchild is refused
    await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(admin())
      .send({ name: `نوه ${RUN}`, parentId: child.body.data.id })
      .expect(400);
    // bad slug format is refused
    await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(admin())
      .send({ name: `بد ${RUN}`, slug: 'Bad Slug!' })
      .expect(400);
  });

  it('T2 tags: create, duplicate name 409, merge moves links and removes sources', async () => {
    const a = await request(http())
      .post(`${PREFIX}/admin/blog/tags`)
      .set(admin())
      .send({ name: `اتوماسیون ${RUN}` })
      .expect(201);
    const b = await request(http())
      .post(`${PREFIX}/admin/blog/tags`)
      .set(admin())
      .send({ name: `Automation ${RUN}`, slug: `automation-${RUN}` })
      .expect(201);
    tagA = a.body.data.id;
    tagB = b.body.data.id;
    await request(http())
      .post(`${PREFIX}/admin/blog/tags`)
      .set(admin())
      .send({ name: `automation ${RUN}` })
      .expect(409);
    const c = await request(http())
      .post(`${PREFIX}/admin/blog/tags`)
      .set(admin())
      .send({ name: `Dup ${RUN}` })
      .expect(201);
    const merged = await request(http())
      .post(`${PREFIX}/admin/blog/tags/merge`)
      .set(admin())
      .send({ sourceIds: [c.body.data.id], targetId: tagB })
      .expect(200);
    expect(merged.body.data.id).toBe(tagB);
    const list = await request(http())
      .get(`${PREFIX}/admin/blog/tags`)
      .set(admin())
      .expect(200);
    expect(
      list.body.data.some((t: { id: string }) => t.id === c.body.data.id),
    ).toBe(false);
  });

  // ---- drafts -------------------------------------------------------------

  it('D1 create draft: slug from title, author defaults to the editor, rendered body, nothing public', async () => {
    const res = await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(admin())
      .send({
        title: `چطور اولین AI Agent را انتخاب کنیم ${RUN}`,
        bodyMarkdown: BODY,
        tagIds: [tagA, tagB],
      })
      .expect(201);
    const d = res.body.data;
    postId = d.id;
    slug = d.slug;
    version = d.version;
    expect(d.status).toBe('draft');
    expect(d.slug).toMatch(/^[a-z0-9-]+$/);
    expect(d.author.id).toBe(editor.userId);
    expect(d.version).toBe(1);
    expect(d.toc.map((t: { text: string }) => t.text)).toEqual([
      'از نیاز واقعی شروع کنید',
      'قابلیت‌ها را مقایسه کنید',
    ]);
    expect(d.readingMinutes).toBe(1);
    expect(d.wordCount).toBeGreaterThan(30);
    expect(d.tagIds.sort()).toEqual([tagA, tagB].sort());
    const types = d.blocks.map((b: { type: string }) => b.type);
    expect(types).toEqual([
      'heading',
      'paragraph',
      'quote',
      'heading',
      'table',
      'list',
      'paragraph',
      'code',
    ]);
    // Sanitisation: raw HTML is literal text, javascript: link became plain text.
    const json = JSON.stringify(d.blocks);
    expect(json).toContain('<script>alert(\\"xss\\")</script>');
    expect(json).not.toContain('javascript:');
    expect(d.readiness.map((i: { code: string }) => i.code)).toEqual(
      expect.arrayContaining([
        'excerpt_missing',
        'category_missing',
        'content_warnings',
      ]),
    );
    expect(d.availableActions).toEqual([
      'submit_review',
      'publish',
      'schedule',
      'archive',
    ]);

    // Draft privacy
    await request(http()).get(`${PREFIX}/blog/posts/${slug}`).expect(404);
    const list = await request(http())
      .get(`${PREFIX}/blog/posts?q=${encodeURIComponent(RUN)}`)
      .expect(200);
    expect(list.body.data.items).toHaveLength(0);
    const sitemap = await request(http())
      .get(`${PREFIX}/blog/sitemap`)
      .expect(200);
    expect(JSON.stringify(sitemap.body.data)).not.toContain(slug);
    const feed = await request(http())
      .get(`${PREFIX}/blog/feed.xml`)
      .expect(200);
    expect(feed.headers['content-type']).toContain('application/rss+xml');
    expect(feed.text).not.toContain(slug);
  });

  it('D2 preview is authorised: editor 200 (public shape), viewer 200, anonymous 401, buyer 403, outsider 403', async () => {
    const p = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/preview`)
      .set(admin())
      .expect(200);
    expect(p.body.data.slug).toBe(slug);
    expect(p.body.data.blocks.length).toBeGreaterThan(0);
    expect(p.body.data).not.toHaveProperty('status');
    expect(p.body.data).not.toHaveProperty('editorialNote');
    await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/preview`)
      .set(bearer(viewer.token))
      .expect(200);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/preview`)
      .expect(401);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/preview`)
      .set(bearer(w.buyerA.token))
      .expect(403);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/preview`)
      .set(bearer(outsider.token))
      .expect(403);
  });

  it('D3 optimistic concurrency: stale version → 409 STALE_STATE, current version saves and bumps', async () => {
    const stale = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({ version: version + 5, excerpt: 'x' })
      .expect(409);
    expect(stale.body.error.code).toBe('STALE_STATE');
    expect(stale.body.error.details.currentVersion).toBe(version);

    const ok = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({
        version,
        excerpt:
          'از شناخت نیاز واقعی تا مقایسه قابلیت‌ها؛ مسیری ساده برای انتخاب ابزار مناسب.',
        primaryCategoryId: categoryId,
        seoDescription:
          'راهنمای انتخاب اولین AI Agent مناسب برای workflow شما.',
        sources: [{ title: 'MESH docs', url: 'https://example.com/docs' }],
      })
      .expect(200);
    expect(ok.body.data.version).toBe(version + 1);
    version = ok.body.data.version;
    expect(ok.body.data.category.id).toBe(categoryId);
    expect(
      ok.body.data.readiness.filter(
        (i: { severity: string }) => i.severity === 'error',
      ),
    ).toEqual([]);
  });

  it('D4 revisions: manual saves coalesce within 10 minutes, autosave adds none, unsafe inputs rejected', async () => {
    const before = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/revisions`)
      .set(admin())
      .expect(200);
    const n = before.body.data.length; // create + (coalesced) save
    expect(n).toBeGreaterThanOrEqual(1);
    await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({
        version,
        bodyMarkdown: `${BODY}\n\nپاراگراف خودکار`,
        autosave: true,
      })
      .expect(200);
    version += 1;
    const after = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/revisions`)
      .set(admin())
      .expect(200);
    expect(after.body.data.length).toBe(n);

    for (const bad of [
      { featuredImageUrl: 'javascript:alert(1)' },
      { canonicalUrl: 'http://insecure.example/x' },
      { sources: [{ title: 'x', url: 'data:text/html,hi' }] },
      { slug: 'Has Space' },
      { tagIds: ['00000000-0000-4000-8000-000000000000'] },
      { agentIds: [w.a.draft.id] }, // not a published product
    ]) {
      await request(http())
        .patch(`${PREFIX}/admin/blog/posts/${postId}`)
        .set(admin())
        .send({ version, ...bad })
        .expect(400);
    }
    // image without alt is a readiness error, not a validation error
    const img = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({ version, featuredImageUrl: 'https://example.com/hero.png' })
      .expect(200);
    version = img.body.data.version;
    expect(
      img.body.data.readiness.map((i: { code: string }) => i.code),
    ).toContain('image_alt_missing');
  });

  // ---- workflow -----------------------------------------------------------

  it('W1 publish is gated by the readiness checklist (422), then publishes once with marketplace links', async () => {
    const blocked = await request(http())
      .post(`${PREFIX}/admin/blog/posts/${postId}/publish`)
      .set(admin())
      .expect(422);
    expect(blocked.body.error.code).toBe('PUBLISH_CHECKLIST_FAILED');
    expect(
      blocked.body.error.details.issues.map((i: { code: string }) => i.code),
    ).toContain('image_alt_missing');

    const fixed = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({
        version,
        featuredImageAlt: 'نمودار انتخاب Agent',
        agentIds: [w.a.liveFree.id],
        isFeatured: true,
      })
      .expect(200);
    version = fixed.body.data.version;

    const pub = await request(http())
      .post(`${PREFIX}/admin/blog/posts/${postId}/publish`)
      .set(admin())
      .expect(200);
    expect(pub.body.data.status).toBe('published');
    expect(pub.body.data.publishedAt).toBeTruthy();
    version = pub.body.data.version;

    const pubDetail = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}`)
      .expect(200);
    const d = pubDetail.body.data;
    expect(d.title).toContain(RUN);
    expect(d.agents).toEqual([
      expect.objectContaining({ slug: w.a.liveFree.slug }),
    ]);
    expect(d.category.slug).toBe(categorySlug);
    expect(d.tags).toHaveLength(2);
    expect(d.seo.description).toContain('راهنمای انتخاب');
    expect(d.seo.ogImageUrl).toBe('https://example.com/hero.png');
    expect(d.featuredImage).toEqual({
      url: 'https://example.com/hero.png',
      alt: 'نمودار انتخاب Agent',
      caption: null,
    });
    expect(d.author).toEqual({
      name: expect.any(String),
      slug: expect.any(String),
      avatarId: null,
      avatarBg: null,
    });
    expect(d).not.toHaveProperty('status');
    expect(d).not.toHaveProperty('version');
    expect(d).not.toHaveProperty('editorialNote');
    expect(d).not.toHaveProperty('reviewer');

    const home = await request(http()).get(`${PREFIX}/blog/home`).expect(200);
    expect(home.body.data.featured.slug).toBe(slug);
    const search = await request(http())
      .get(`${PREFIX}/blog/posts?q=${encodeURIComponent(RUN)}`)
      .expect(200);
    expect(search.body.data.items.map((i: { slug: string }) => i.slug)).toEqual(
      [slug],
    );
    const byCat = await request(http())
      .get(`${PREFIX}/blog/posts?category=${categorySlug}`)
      .expect(200);
    expect(
      byCat.body.data.items.map((i: { slug: string }) => i.slug),
    ).toContain(slug);
    const cat = await request(http())
      .get(`${PREFIX}/blog/categories/${categorySlug}`)
      .expect(200);
    expect(cat.body.data.postCount).toBe(1);
    const sitemap = await request(http())
      .get(`${PREFIX}/blog/sitemap`)
      .expect(200);
    expect(
      sitemap.body.data.posts.map((p: { path: string }) => p.path),
    ).toContain(`/blog/${slug}`);
    const feed = await request(http())
      .get(`${PREFIX}/blog/feed.xml`)
      .expect(200);
    expect(feed.text).toContain(`/blog/${slug}`);
    const author = await request(http())
      .get(`${PREFIX}/blog/authors/${d.author.slug}`)
      .expect(200);
    expect(author.body.data.author.slug).toBe(d.author.slug);
  });

  it('W2 editing a live article keeps publishedAt, moves contentUpdatedAt; autosave on a live article is refused', async () => {
    const before = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .expect(200);
    await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({
        version,
        excerpt: 'خلاصهٔ ویرایش‌شده برای نسخهٔ منتشرشده.',
        autosave: true,
      })
      .expect(400);
    const edited = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({ version, excerpt: 'خلاصهٔ ویرایش‌شده برای نسخهٔ منتشرشده.' })
      .expect(200);
    version = edited.body.data.version;
    expect(edited.body.data.publishedAt).toBe(before.body.data.publishedAt);
    expect(
      new Date(edited.body.data.contentUpdatedAt as string).getTime(),
    ).toBeGreaterThan(
      new Date(before.body.data.contentUpdatedAt as string).getTime(),
    );
    expect(edited.body.data.status).toBe('published');
  });

  it('W3 slug change: old URL redirects to the new slug, no chains, moving back removes the redirect, reserved slugs 409', async () => {
    const oldSlug = slug;
    const newSlug = `${slug}-v2`;
    const renamed = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({ version, slug: newSlug })
      .expect(200);
    version = renamed.body.data.version;
    expect(renamed.body.data.redirects).toEqual([oldSlug]);

    const viaOld = await request(http())
      .get(`${PREFIX}/blog/posts/${oldSlug}`)
      .expect(200);
    expect(viaOld.body.data).toEqual({ redirectTo: newSlug });
    await request(http()).get(`${PREFIX}/blog/posts/${newSlug}`).expect(200);

    // Another article cannot take the reserved slug.
    await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(admin())
      .send({ title: `Squatter ${RUN}`, slug: oldSlug })
      .expect(409);

    // Second rename: both old slugs point at the CURRENT slug (no chain).
    const third = `${slug}-v3`;
    const renamed2 = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({ version, slug: third })
      .expect(200);
    version = renamed2.body.data.version;
    expect(
      (await request(http()).get(`${PREFIX}/blog/posts/${oldSlug}`).expect(200))
        .body.data.redirectTo,
    ).toBe(third);
    expect(
      (await request(http()).get(`${PREFIX}/blog/posts/${newSlug}`).expect(200))
        .body.data.redirectTo,
    ).toBe(third);

    // Back to the original: it is live again, and no redirect loop exists.
    const back = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({ version, slug: oldSlug })
      .expect(200);
    version = back.body.data.version;
    expect(back.body.data.redirects.sort()).toEqual([newSlug, third].sort());
    const live = await request(http())
      .get(`${PREFIX}/blog/posts/${oldSlug}`)
      .expect(200);
    expect(live.body.data.slug).toBe(oldSlug);
    const redirects = await ds.query(
      `SELECT old_slug FROM blog_slug_redirects WHERE post_id = $1 ORDER BY old_slug`,
      [postId],
    );
    expect(
      redirects.map((r: { old_slug: string }) => r.old_slug),
    ).not.toContain(oldSlug);
    slug = oldSlug;
  });

  it('W4 unpublish hides the article everywhere (detail, redirects, list, sitemap, feed) and publish restores it', async () => {
    const un = await request(http())
      .post(`${PREFIX}/admin/blog/posts/${postId}/unpublish`)
      .set(admin())
      .send({ note: 'نیاز به بازبینی منابع' })
      .expect(200);
    expect(un.body.data.status).toBe('unpublished');
    expect(un.body.data.editorialNote).toBe('نیاز به بازبینی منابع');
    version = un.body.data.version;
    await request(http()).get(`${PREFIX}/blog/posts/${slug}`).expect(404);
    await request(http()).get(`${PREFIX}/blog/posts/${slug}-v2`).expect(404);
    const list = await request(http())
      .get(`${PREFIX}/blog/posts?q=${encodeURIComponent(RUN)}`)
      .expect(200);
    expect(list.body.data.items).toHaveLength(0);
    expect(
      JSON.stringify(
        (await request(http()).get(`${PREFIX}/blog/sitemap`).expect(200)).body
          .data,
      ),
    ).not.toContain(slug);
    expect(
      (await request(http()).get(`${PREFIX}/blog/feed.xml`).expect(200)).text,
    ).not.toContain(`/blog/${slug}`);
    // deleting a published article is refused; unpublished may not be deleted yet (we republish)
    const re = await request(http())
      .post(`${PREFIX}/admin/blog/posts/${postId}/publish`)
      .set(admin())
      .expect(200);
    expect(re.body.data.status).toBe('published');
    expect(re.body.data.publishedAt).toBe(un.body.data.publishedAt); // first publication date is kept
    version = re.body.data.version;
    await request(http()).get(`${PREFIX}/blog/posts/${slug}`).expect(200);
  });

  it('W5 invalid transitions are 409 INVALID_TRANSITION; publish → delete is 409', async () => {
    const r = await request(http())
      .post(`${PREFIX}/admin/blog/posts/${postId}/submit-review`)
      .set(admin())
      .expect(409);
    expect(r.body.error.code).toBe('INVALID_TRANSITION');
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${postId}/restore`)
      .set(admin())
      .expect(409);
    await request(http())
      .delete(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .expect(409);
  });

  it('W6 scheduling: past → 400, future → scheduled & private, promoted when due with publishedAt = scheduledFor', async () => {
    const created = await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(admin())
      .send({
        title: `زمان‌بندی ${RUN}`,
        excerpt: 'مقالهٔ زمان‌بندی‌شده',
        bodyMarkdown: '## بخش\n\nمتن کافی برای انتشار این مقالهٔ آزمایشی.',
        primaryCategoryId: categoryId,
      })
      .expect(201);
    const id = created.body.data.id as string;
    const sslug = created.body.data.slug as string;
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${id}/schedule`)
      .set(admin())
      .send({ scheduledFor: new Date(Date.now() - 60_000).toISOString() })
      .expect(400);
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${id}/schedule`)
      .set(admin())
      .send({ scheduledFor: 'tomorrow' })
      .expect(400);
    const when = new Date(Date.now() + 3600_000);
    const sch = await request(http())
      .post(`${PREFIX}/admin/blog/posts/${id}/schedule`)
      .set(admin())
      .send({ scheduledFor: when.toISOString() })
      .expect(200);
    expect(sch.body.data.status).toBe('scheduled');
    expect(sch.body.data.publishedAt).toBeNull();
    await request(http()).get(`${PREFIX}/blog/posts/${sslug}`).expect(404);

    // cancel → draft, then schedule again and make it due.
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${id}/cancel-schedule`)
      .set(admin())
      .expect(200);
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${id}/schedule`)
      .set(admin())
      .send({ scheduledFor: when.toISOString() })
      .expect(200);
    const due = new Date(Date.now() - 5_000);
    await ds.query(`UPDATE blog_posts SET scheduled_for = $2 WHERE id = $1`, [
      id,
      due,
    ]);
    const pub = await request(http())
      .get(`${PREFIX}/blog/posts/${sslug}`)
      .expect(200);
    expect(new Date(pub.body.data.publishedAt as string).getTime()).toBe(
      due.getTime(),
    );
    const adminView = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${id}`)
      .set(admin())
      .expect(200);
    expect(adminView.body.data.status).toBe('published');
    expect(adminView.body.data.scheduledFor).toBeNull();
  });

  it('W7 review loop: submit → request changes (note) → draft; archive/restore; delete of drafts cascades', async () => {
    const created = await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(admin())
      .send({ title: `بازبینی ${RUN}`, bodyMarkdown: 'متن', tagIds: [tagA] })
      .expect(201);
    const id = created.body.data.id as string;
    expect(
      (
        await request(http())
          .post(`${PREFIX}/admin/blog/posts/${id}/submit-review`)
          .set(admin())
          .expect(200)
      ).body.data.status,
    ).toBe('in_review');
    const rc = await request(http())
      .post(`${PREFIX}/admin/blog/posts/${id}/request-changes`)
      .set(admin())
      .send({ note: 'منبع برای ادعای دوم اضافه شود' })
      .expect(200);
    expect(rc.body.data.status).toBe('draft');
    expect(rc.body.data.editorialNote).toBe('منبع برای ادعای دوم اضافه شود');
    expect(rc.body.data.reviewer.id).toBe(editor.userId);
    expect(
      (
        await request(http())
          .post(`${PREFIX}/admin/blog/posts/${id}/archive`)
          .set(admin())
          .expect(200)
      ).body.data.status,
    ).toBe('archived');
    expect(
      (
        await request(http())
          .post(`${PREFIX}/admin/blog/posts/${id}/restore`)
          .set(admin())
          .expect(200)
      ).body.data.status,
    ).toBe('draft');
    await request(http())
      .delete(`${PREFIX}/admin/blog/posts/${id}`)
      .set(admin())
      .expect(204);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts/${id}`)
      .set(admin())
      .expect(404);
    const links = await ds.query(
      `SELECT COUNT(*)::int AS n FROM blog_post_tags WHERE post_id = $1`,
      [id],
    );
    expect(links[0].n).toBe(0);
    const audit = await ds.query(
      `SELECT action FROM audit_logs WHERE entity = 'blog_post' AND entity_id = $1 ORDER BY created_at`,
      [id],
    );
    expect(audit.map((a: { action: string }) => a.action)).toEqual([
      'blog.post_created',
      'blog.post_status_changed',
      'blog.post_status_changed',
      'blog.post_status_changed',
      'blog.post_status_changed',
      'blog.post_deleted',
    ]);
  });

  it('R1 revision restore brings content back as a NEW version (history is never rewound)', async () => {
    const revs = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/revisions`)
      .set(admin())
      .expect(200);
    const first = revs.body.data[revs.body.data.length - 1];
    expect(first.reason).toBe('create');
    const one = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/revisions/${first.id}`)
      .set(admin())
      .expect(200);
    expect(one.body.data.snapshot.excerpt).toBe('');
    const restored = await request(http())
      .post(
        `${PREFIX}/admin/blog/posts/${postId}/revisions/${first.id}/restore`,
      )
      .set(admin())
      .expect(200);
    expect(restored.body.data.version).toBe(version + 1);
    expect(restored.body.data.excerpt).toBe('');
    expect(restored.body.data.status).toBe('published'); // workflow state untouched
    version = restored.body.data.version;
    const after = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}/revisions`)
      .set(admin())
      .expect(200);
    expect(after.body.data[0].reason).toBe('restore');
    expect(after.body.data.length).toBe(revs.body.data.length + 1);
    // put a real excerpt back for the remaining assertions
    const fix = await request(http())
      .patch(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .send({ version, excerpt: 'خلاصهٔ نهایی مقاله.' })
      .expect(200);
    version = fix.body.data.version;
  });

  // ---- permissions --------------------------------------------------------

  it('P1 permissions: viewer reads but cannot write; outsider gets 403 everywhere; anonymous 401; buyer 403', async () => {
    await request(http())
      .get(`${PREFIX}/admin/blog/posts`)
      .set(bearer(viewer.token))
      .expect(200);
    await request(http())
      .get(`${PREFIX}/admin/blog/overview`)
      .set(bearer(viewer.token))
      .expect(200);
    const me = await request(http())
      .get(`${PREFIX}/admin/blog/me`)
      .set(bearer(viewer.token))
      .expect(200);
    expect(me.body.data.can).toEqual({
      view: true,
      manage: false,
      publish: false,
    });
    await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(bearer(viewer.token))
      .send({ title: 'nope nope' })
      .expect(403);
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${postId}/unpublish`)
      .set(bearer(viewer.token))
      .send({})
      .expect(403);
    await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(bearer(viewer.token))
      .send({ name: 'nope' })
      .expect(403);

    await request(http())
      .get(`${PREFIX}/admin/blog/posts`)
      .set(bearer(outsider.token))
      .expect(403);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(bearer(outsider.token))
      .expect(403);

    await request(http()).get(`${PREFIX}/admin/blog/posts`).expect(401);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts`)
      .set(bearer(w.buyerA.token))
      .expect(403);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts`)
      .set(bearer(w.creatorA.token))
      .expect(403);

    const editorMe = await request(http())
      .get(`${PREFIX}/admin/blog/me`)
      .set(admin())
      .expect(200);
    expect(editorMe.body.data.can).toEqual({
      view: true,
      manage: true,
      publish: true,
    });

    // Author picker lists staff only (admin role or an active admin role assignment), never buyers.
    const authors = await request(http())
      .get(`${PREFIX}/admin/blog/authors`)
      .set(admin())
      .expect(200);
    const ids = authors.body.data.map((a: { id: string }) => a.id);
    expect(ids).toContain(editor.userId);
    expect(ids).not.toContain(w.buyerA.userId);
    expect(authors.body.data[0]).not.toHaveProperty('email');
    expect(authors.body.data[0]).not.toHaveProperty('phone');
    await request(http())
      .get(`${PREFIX}/admin/blog/authors?q=${'x'.repeat(100)}`)
      .set(admin())
      .expect(400);
  });

  // ---- lists, search, bulk ------------------------------------------------

  it('L1 admin list filters/sorts/paginates; invalid query values are 400', async () => {
    const mine = await request(http())
      .get(
        `${PREFIX}/admin/blog/posts?q=${encodeURIComponent(RUN)}&status=published&sort=published&pageSize=5`,
      )
      .set(admin())
      .expect(200);
    expect(mine.body.data.items.map((i: { id: string }) => i.id)).toContain(
      postId,
    );
    expect(mine.body.data.meta.pageSize).toBe(5);
    const byAuthor = await request(http())
      .get(
        `${PREFIX}/admin/blog/posts?author=${editor.userId}&category=${categoryId}`,
      )
      .set(admin())
      .expect(200);
    expect(
      byAuthor.body.data.items.every(
        (i: { author: { id: string } }) => i.author.id === editor.userId,
      ),
    ).toBe(true);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts?status=bogus`)
      .set(admin())
      .expect(400);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts?pageSize=1000`)
      .set(admin())
      .expect(400);
    await request(http()).get(`${PREFIX}/blog/posts?pageSize=1000`).expect(400);
    await request(http())
      .get(`${PREFIX}/blog/posts?category=Bad%20Slug`)
      .expect(400);
    await request(http())
      .get(`${PREFIX}/blog/posts/not%20a%20slug`)
      .expect(404);
    const page2 = await request(http())
      .get(`${PREFIX}/blog/posts?page=2&pageSize=1`)
      .expect(200);
    expect(page2.body.data.meta.page).toBe(2);
    expect(page2.body.data.meta.pageSize).toBe(1);
  });

  it('S1 public search: Persian folding, multi-term AND, relevance ranking, snippets, reading filter, strict validation', async () => {
    // A second live article: the main article's title phrase appears only in
    // this one's body, so ranking has something to decide.
    const second = await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(admin())
      .send({
        title: `راهنمای تسویه و نگه‌داشت ${RUN}`,
        excerpt: 'پول شما چه مسیری را طی می‌کند.',
        bodyMarkdown:
          'برای برداشت باید احراز هویت کامل باشد. ' +
          `اینکه چطور اولین AI Agent را انتخاب کنیم ${RUN} موضوع مقالهٔ دیگری است. ` +
          'کارمزد پلتفرم پانزده درصد است و Rate limit در این مقاله نیست.',
        primaryCategoryId: categoryId,
      })
      .expect(201);
    const secondId: string = second.body.data.id;
    const secondSlug: string = second.body.data.slug;
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${secondId}/publish`)
      .set(admin())
      .expect(200);

    const search = async (q: string, extra = '') =>
      (
        await request(http())
          .get(
            `${PREFIX}/blog/posts?q=${encodeURIComponent(q)}${extra ? `&${extra}` : ''}`,
          )
          .expect(200)
      ).body.data as {
        items: {
          slug: string;
          snippet?: { field: string; text: string };
        }[];
        meta: { total: number; page: number; pageSize: number };
      };

    // Phrase in the first article's title, in the second's body → title first,
    // with a snippet that names the field and quotes the original sentence.
    const phrase = await search(`انتخاب کنیم ${RUN}`);
    expect(phrase.items.map((i) => i.slug)).toEqual([slug, secondSlug]);
    expect(phrase.items[0].snippet?.field).toBe('title');
    expect(phrase.items[0].snippet?.text).toContain('انتخاب کنیم');
    expect(phrase.items[1].snippet?.field).toBe('body');
    expect(phrase.items[1].snippet?.text).toContain('مقالهٔ دیگری');

    // Arabic kaf/yeh and Persian digits fold to the same text.
    const arabic = await search(`انتخاب كنيم ${RUN}`);
    expect(arabic.items.map((i) => i.slug)).toEqual([slug, secondSlug]);

    // «می گیرد» typed with a space finds «می‌گیرد» written with ZWNJ (body of
    // the first article); the second article does not contain it.
    const zwnj = await search(`می گیرد ${RUN}`);
    expect(zwnj.items.map((i) => i.slug)).toEqual([slug]);

    // Every term must match (AND): "Integration" + "Workflow" only in the first.
    expect((await search(`Integration workflow ${RUN}`)).meta.total).toBe(1);
    expect((await search(`Integration پانزده ${RUN}`)).meta.total).toBe(0);

    // Explicit chronological sort still works with a query.
    const oldest = await search(`انتخاب کنیم ${RUN}`, 'sort=oldest');
    expect(oldest.items.map((i) => i.slug)).toEqual([slug, secondSlug]);
    const newest = await search(`انتخاب کنیم ${RUN}`, 'sort=newest');
    expect(newest.items.map((i) => i.slug)).toEqual([secondSlug, slug]);

    // Reading-time buckets: both test articles are short; long excludes them.
    const short = (await search(RUN, 'reading=short')).items.map((i) => i.slug);
    expect(short).toEqual(expect.arrayContaining([slug, secondSlug]));
    expect((await search(RUN, 'reading=long')).meta.total).toBe(0);

    // Without a query no snippet is attached and sort=relevance is harmless.
    const plain = await request(http())
      .get(`${PREFIX}/blog/posts?sort=relevance&pageSize=1`)
      .expect(200);
    expect(plain.body.data.items[0].snippet).toBeUndefined();
    expect(plain.body.data.meta.pageSize).toBe(1);

    // Punctuation and LIKE wild-cards are not operators: «%RUN_» and «RUN»
    // are the same query, and nothing matches a term that does not exist.
    expect((await search(`%${RUN}_`)).meta.total).toBe(
      (await search(RUN)).meta.total,
    );
    expect((await search(`${RUN}zz`)).meta.total).toBe(0);

    await request(http()).get(`${PREFIX}/blog/posts?sort=bogus`).expect(400);
    await request(http()).get(`${PREFIX}/blog/posts?reading=huge`).expect(400);
    await request(http()).get(`${PREFIX}/blog/posts?pageSize=0`).expect(400);
    await request(http()).get(`${PREFIX}/blog/posts?page=0`).expect(400);

    // Keep later tests (W4-style "nothing else leaks") deterministic.
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${secondId}/unpublish`)
      .set(admin())
      .expect(200);
  });

  it('L2 bulk actions apply per-item rules and report skipped ids', async () => {
    const draft = await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(admin())
      .send({ title: `Bulk draft ${RUN}` })
      .expect(201);
    const res = await request(http())
      .post(`${PREFIX}/admin/blog/posts/bulk`)
      .set(admin())
      .send({
        ids: [
          postId,
          draft.body.data.id,
          '00000000-0000-4000-8000-000000000000',
        ],
        action: 'unpublish',
      })
      .expect(200);
    expect(res.body.data.done).toEqual([postId]);
    expect(
      res.body.data.skipped.map((s: { id: string }) => s.id).sort(),
    ).toEqual(
      [draft.body.data.id, '00000000-0000-4000-8000-000000000000'].sort(),
    );
    await request(http()).get(`${PREFIX}/blog/posts/${slug}`).expect(404);
    const feat = await request(http())
      .post(`${PREFIX}/admin/blog/posts/bulk`)
      .set(admin())
      .send({ ids: [draft.body.data.id], action: 'unfeature' })
      .expect(200);
    expect(feat.body.data.done).toEqual([draft.body.data.id]);
    await request(http())
      .delete(`${PREFIX}/admin/blog/posts/${draft.body.data.id}`)
      .set(admin())
      .expect(204);
    // Live again for the remaining suites.
    const pub = await request(http())
      .post(`${PREFIX}/admin/blog/posts/${postId}/publish`)
      .set(admin())
      .expect(200);
    version = pub.body.data.version;
  });

  it('T3 deleting a category reassigns its articles first; category 404s publicly afterwards', async () => {
    const other = await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(admin())
      .send({ name: `جایگزین ${RUN}` })
      .expect(201);
    await request(http())
      .post(`${PREFIX}/admin/blog/categories/${categoryId}/delete`)
      .set(admin())
      .send({ reassignToId: categoryId })
      .expect(400);
    const del = await request(http())
      .post(`${PREFIX}/admin/blog/categories/${categoryId}/delete`)
      .set(admin())
      .send({ reassignToId: other.body.data.id })
      .expect(200);
    expect(del.body.data.reassigned).toBeGreaterThanOrEqual(1);
    await request(http())
      .get(`${PREFIX}/blog/categories/${categorySlug}`)
      .expect(404);
    const post = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}`)
      .expect(200);
    expect(post.body.data.category.slug).toBe(other.body.data.slug);
    categoryId = other.body.data.id;
    categorySlug = other.body.data.slug;
  });

  it('M1 uploads: 503 STORAGE_DISABLED without a driver (the API stays honest, no fake success)', async () => {
    const res = await request(http())
      .post(`${PREFIX}/admin/blog/media`)
      .set(admin())
      .attach('file', Buffer.from('not an image'), 'x.png');
    expect([503, 403]).toContain(res.status); // 403 only when the UPLOADS_ENABLED switch is off in this env
    if (res.status === 503)
      expect(res.body.error.code).toBe('STORAGE_DISABLED');
    await request(http())
      .post(`${PREFIX}/admin/blog/media`)
      .set(bearer(viewer.token))
      .attach('file', Buffer.from('x'), 'x.png')
      .expect(403);
  });

  it('X1 unknown ids are 404 (never 500) on every admin GET; render endpoint previews without saving', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    for (const path of ['', '/preview', '/revisions', `/revisions/${id}`]) {
      await request(http())
        .get(`${PREFIX}/admin/blog/posts/${id}${path}`)
        .set(admin())
        .expect(404);
    }
    await request(http())
      .get(`${PREFIX}/admin/blog/posts/not-a-uuid`)
      .set(admin())
      .expect(400);
    const r = await request(http())
      .post(`${PREFIX}/admin/blog/render`)
      .set(admin())
      .send({ bodyMarkdown: '## عنوان\n\nمتن [x](javascript:1)' })
      .expect(200);
    expect(r.body.data.toc).toEqual([{ id: 'عنوان', text: 'عنوان', level: 2 }]);
    expect(r.body.data.warnings).toEqual([
      { code: 'unsafe_url', line: 3, detail: 'javascript:1' },
    ]);
  });
  it('E1 editorial discovery: latest published hero, verified popularity and nine-result server pages', async () => {
    const category = await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(admin())
      .send({ name: `Editorial ${RUN}`, slug: `editorial-${RUN}` })
      .expect(201);
    const ids: Array<{ id: string; slug: string }> = [];
    for (let i = 0; i < 12; i++) {
      const created = await request(http())
        .post(`${PREFIX}/admin/blog/posts`)
        .set(admin())
        .send({
          title: `Editorial article ${RUN} ${i}`,
          excerpt: 'An editorial integration test article.',
          bodyMarkdown:
            '## First section\n\nReadable article content for the editorial integration test.',
          primaryCategoryId: category.body.data.id,
        })
        .expect(201);
      const post = created.body.data as { id: string; slug: string };
      ids.push(post);
      await request(http())
        .post(`${PREFIX}/admin/blog/posts/${post.id}/publish`)
        .set(admin())
        .expect(200);
    }
    const draft = await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(admin())
      .send({
        title: `Newer draft ${RUN}`,
        excerpt: 'Not public',
        bodyMarkdown: '## Draft\n\nPrivate content.',
      })
      .expect(201);
    const preview = await request(http())
      .get(`${PREFIX}/admin/blog/posts/${draft.body.data.id}/preview`)
      .set(admin())
      .expect(200);
    expect(preview.body.data.publishedAt).toBeNull();
    await request(http())
      .get(`${PREFIX}/admin/blog/posts/${draft.body.data.id}/preview`)
      .expect(401);
    await request(http())
      .get(`${PREFIX}/admin/blog/posts/${draft.body.data.id}/preview`)
      .set(bearer(w.buyerA.token))
      .expect(403);
    const home = await request(http()).get(`${PREFIX}/blog/home`).expect(200);
    expect(home.body.data.featured.slug).toBe(ids[11].slug);
    const url = `${PREFIX}/blog/posts?category=${category.body.data.slug}&pageSize=9`;
    const first = (await request(http()).get(url).expect(200)).body.data;
    const second = (await request(http()).get(`${url}&page=2`).expect(200)).body
      .data;
    expect(first.items).toHaveLength(9);
    expect(second.items).toHaveLength(3);
    expect(
      new Set(
        [...first.items, ...second.items].map((p: { slug: string }) => p.slug),
      ).size,
    ).toBe(12);
    await request(http())
      .put(`${PREFIX}/blog/posts/${ids[0].slug}/rating`)
      .set(bearer(w.buyerA.token))
      .send({ rating: 5 })
      .expect(200);
    await request(http())
      .put(`${PREFIX}/blog/posts/${ids[1].slug}/rating`)
      .set(bearer(w.buyerA.token))
      .send({ rating: 3 })
      .expect(200);
    const popular = (
      await request(http()).get(`${url}&sort=popular`).expect(200)
    ).body.data;
    expect(popular.items[0].slug).toBe(ids[0].slug);
    expect(popular.items[1].slug).toBe(ids[1].slug);
    expect(popular.items[0].ratingCount).toBe(1);
    const detail = (
      await request(http())
        .get(`${PREFIX}/blog/posts/${ids[0].slug}`)
        .expect(200)
    ).body.data;
    const related = detail.related as Array<{ slug: string }>;
    expect(related).toHaveLength(3);
    expect(related.every((p: { slug: string }) => p.slug !== ids[0].slug)).toBe(
      true,
    );
    expect(new Set(related.map((p) => p.slug)).size).toBe(3);
  }, 60_000);
});
