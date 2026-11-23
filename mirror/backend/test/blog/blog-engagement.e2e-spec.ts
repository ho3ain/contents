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
import {
  PREFIX,
  bearer,
  registerActor,
  uniq,
  type Actor,
} from '../helpers/world';

/**
 * Blog engagement — ratings, comments, likes, reports, moderation.
 *
 * Covers: anonymous reads vs. signed-in writes; drafts answer 404
 * everywhere; rating upsert/withdraw with live distribution and the
 * denormalised counters on cards; comments (publish immediately, one reply
 * level, duplicate 409, edit marks `editedAt`, withdraw keeps a placeholder
 * when replies exist); likes idempotent; reports (own 409, twice 409);
 * notifications to the article author / parent commenter; admin queue,
 * remove (+ author notification, audit, reports resolved), restore,
 * dismiss-reports; comment bans (403 COMMENTS_BLOCKED, ratings still
 * allowed, admins cannot be banned, lift); permissions per admin role;
 * validation (rating range, body length, bad sort, pageSize cap).
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

describe('Blog engagement (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let superToken: string;
  let editor: AdminUser; // CONTENT_MODERATOR: blog:view + manage
  let viewer: AdminUser; // READ_ONLY_ADMIN: blog:view only
  let outsider: AdminUser; // RISK_ANALYST: nothing on blog
  let readerA: Actor;
  let readerB: Actor;
  let readerC: Actor;
  const http = () => app.getHttpServer() as unknown as App;
  const admin = () => bearer(editor.token);

  let categoryId = '';
  let postId = '';
  let slug = '';
  let draftSlug = '';
  let rootA = ''; // reader A top-level comment
  let replyB = ''; // reader B reply to rootA
  let rootB = ''; // reader B top-level comment (gets reported/removed)

  const createPost = async (title: string, publish: boolean) => {
    const created = await request(http())
      .post(`${PREFIX}/admin/blog/posts`)
      .set(admin())
      .send({
        title,
        excerpt: 'خلاصهٔ مقاله برای آزمون تعامل خوانندگان.',
        bodyMarkdown:
          '## بخش اول\n\nمتن کافی برای انتشار این مقالهٔ آزمایشی که چند جمله دارد.',
        primaryCategoryId: categoryId,
      })
      .expect(201);
    if (publish) {
      await request(http())
        .post(`${PREFIX}/admin/blog/posts/${created.body.data.id}/publish`)
        .set(admin())
        .expect(200);
    }
    return {
      id: created.body.data.id as string,
      slug: created.body.data.slug as string,
    };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .setLogger(new SilentLogger())
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    superToken = await loginSuperAdmin(http);
    editor = await createAdminUser(http, superToken, 'CONTENT_MODERATOR');
    viewer = await createAdminUser(http, superToken, 'READ_ONLY_ADMIN');
    outsider = await createAdminUser(http, superToken, 'RISK_ANALYST');
    readerA = await registerActor(http, 'rda');
    readerB = await registerActor(http, 'rdb');
    readerC = await registerActor(http, 'rdc');

    const cat = await request(http())
      .post(`${PREFIX}/admin/blog/categories`)
      .set(admin())
      .send({ name: `تعامل ${RUN}` })
      .expect(201);
    categoryId = cat.body.data.id;
    const live = await createPost(`مقالهٔ تعامل ${RUN}`, true);
    postId = live.id;
    slug = live.slug;
    const draft = await createPost(`پیش‌نویس تعامل ${RUN}`, false);
    draftSlug = draft.slug;
  }, 300_000);

  afterAll(async () => {
    restoreRateLimits();
    await closeStepUpPool();
    await app.close();
  });

  // ---- access -------------------------------------------------------------

  it('A1 anonymous: summary and comments are public and empty; every write is 401; drafts are 404', async () => {
    const summary = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/engagement`)
      .expect(200);
    expect(summary.body.data).toEqual({
      rating: {
        average: 0,
        count: 0,
        distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      },
      commentCount: 0,
    });
    const list = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/comments`)
      .expect(200);
    expect(list.body.data.items).toEqual([]);
    expect(list.body.data.meta.total).toBe(0);

    await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/engagement/me`)
      .expect(401);
    await request(http())
      .put(`${PREFIX}/blog/posts/${slug}/rating`)
      .send({ rating: 5 })
      .expect(401);
    await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .send({ body: 'بدون ورود' })
      .expect(401);

    await request(http())
      .get(`${PREFIX}/blog/posts/${draftSlug}/engagement`)
      .expect(404);
    await request(http())
      .get(`${PREFIX}/blog/posts/${draftSlug}/comments`)
      .expect(404);
    await request(http())
      .put(`${PREFIX}/blog/posts/${draftSlug}/rating`)
      .set(bearer(readerA.token))
      .send({ rating: 4 })
      .expect(404);
    await request(http())
      .post(`${PREFIX}/blog/posts/${draftSlug}/comments`)
      .set(bearer(readerA.token))
      .send({ body: 'روی پیش‌نویس نمی‌شود نوشت' })
      .expect(404);
    await request(http())
      .get(`${PREFIX}/blog/posts/Bad_Slug/engagement`)
      .expect(404);
  });

  // ---- ratings ------------------------------------------------------------

  it('R1 rating: range validated, upsert per reader, distribution/average live, counters on the card, withdraw', async () => {
    for (const bad of [0, 6, 2.5, 'five']) {
      await request(http())
        .put(`${PREFIX}/blog/posts/${slug}/rating`)
        .set(bearer(readerA.token))
        .send({ rating: bad })
        .expect(400);
    }
    const first = await request(http())
      .put(`${PREFIX}/blog/posts/${slug}/rating`)
      .set(bearer(readerA.token))
      .send({ rating: 5 })
      .expect(200);
    expect(first.body.data.myRating).toBe(5);
    expect(first.body.data.rating).toEqual({
      average: 5,
      count: 1,
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
    });
    // Same reader changes their mind → still one vote.
    const changed = await request(http())
      .put(`${PREFIX}/blog/posts/${slug}/rating`)
      .set(bearer(readerA.token))
      .send({ rating: 3 })
      .expect(200);
    expect(changed.body.data.rating.count).toBe(1);
    expect(changed.body.data.rating.average).toBe(3);
    await request(http())
      .put(`${PREFIX}/blog/posts/${slug}/rating`)
      .set(bearer(readerB.token))
      .send({ rating: 4 })
      .expect(200);
    const summary = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/engagement`)
      .expect(200);
    expect(summary.body.data.rating).toEqual({
      average: 3.5,
      count: 2,
      distribution: { '1': 0, '2': 0, '3': 1, '4': 1, '5': 0 },
    });
    const me = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/engagement/me`)
      .set(bearer(readerA.token))
      .expect(200);
    expect(me.body.data.myRating).toBe(3);
    expect(me.body.data.canComment).toBe(true);

    // Denormalised counters reach the public card and the article detail.
    const detail = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}`)
      .expect(200);
    expect(detail.body.data.ratingAvg).toBe(3.5);
    expect(detail.body.data.ratingCount).toBe(2);
    const cards = await request(http())
      .get(`${PREFIX}/blog/posts?q=${encodeURIComponent(RUN)}`)
      .expect(200);
    const card = cards.body.data.items.find(
      (i: { slug: string }) => i.slug === slug,
    );
    expect(card.ratingAvg).toBe(3.5);
    expect(card.ratingCount).toBe(2);
    expect(card.commentCount).toBe(0);

    // Withdraw → one vote left; a second withdraw is a no-op.
    const gone = await request(http())
      .delete(`${PREFIX}/blog/posts/${slug}/rating`)
      .set(bearer(readerB.token))
      .expect(200);
    expect(gone.body.data.rating.count).toBe(1);
    await request(http())
      .delete(`${PREFIX}/blog/posts/${slug}/rating`)
      .set(bearer(readerB.token))
      .expect(200);
  });

  // ---- comments -----------------------------------------------------------

  it('C1 comments: validation, publish immediately, reply depth 1, duplicate 409, notifications, sorting, me-state', async () => {
    await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerA.token))
      .send({ body: 'a' })
      .expect(400);
    await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerA.token))
      .send({ body: 'x'.repeat(2001) })
      .expect(400);
    await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerA.token))
      .send({ body: 'پاسخ به هیچ', parentId: 'not-a-uuid' })
      .expect(400);
    await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerA.token))
      .send({
        body: 'پاسخ به کامنت ناموجود',
        parentId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(404);

    const created = await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerA.token))
      .send({ body: `  دیدگاه اول خوانندهٔ الف ${RUN}  ` })
      .expect(201);
    rootA = created.body.data.id;
    expect(created.body.data.status).toBe('published');
    expect(created.body.data.body).toBe(`دیدگاه اول خوانندهٔ الف ${RUN}`);
    expect(created.body.data.parentId).toBeNull();
    expect(created.body.data.author.badge).toBeNull();
    expect(created.body.data.author).not.toHaveProperty('id');
    expect(created.body.data.editedAt).toBeNull();

    // Identical repeat inside the window is a double submit.
    await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerA.token))
      .send({ body: `دیدگاه اول خوانندهٔ الف ${RUN}` })
      .expect(409);

    const reply = await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerB.token))
      .send({ body: `پاسخ ب به الف ${RUN}`, parentId: rootA })
      .expect(201);
    replyB = reply.body.data.id;
    expect(reply.body.data.parentId).toBe(rootA);
    // No reply-to-reply.
    await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerC.token))
      .send({ body: `پاسخ به پاسخ ${RUN}`, parentId: replyB })
      .expect(400);

    const second = await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerB.token))
      .send({ body: `دیدگاه مستقل ب ${RUN}` })
      .expect(201);
    rootB = second.body.data.id;

    // Staff badge for an admin comment.
    const staff = await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(admin())
      .send({ body: `پاسخ تحریریه ${RUN}`, parentId: rootA })
      .expect(201);
    expect(staff.body.data.author.badge).toBe('author'); // editor is the article author

    // Listing: 2 roots, newest first; replies oldest first under rootA.
    const list = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/comments`)
      .expect(200);
    expect(list.body.data.meta.total).toBe(2);
    expect(list.body.data.items.map((i: { id: string }) => i.id)).toEqual([
      rootB,
      rootA,
    ]);
    const a = list.body.data.items[1];
    expect(a.replyCount).toBe(2);
    expect(a.replies.map((r: { id: string }) => r.id)).toEqual([
      replyB,
      staff.body.data.id,
    ]);
    const oldest = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/comments?sort=oldest`)
      .expect(200);
    expect(oldest.body.data.items[0].id).toBe(rootA);
    await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/comments?sort=best`)
      .expect(400);
    await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/comments?pageSize=51`)
      .expect(400);

    // Counter on the article: 4 published comments (roots + replies).
    const detail = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}`)
      .expect(200);
    expect(detail.body.data.commentCount).toBe(4);

    // Notifications: the parent commenter got a reply notice; the article
    // author (editor) got a new-comment notice for each root. Self-replies
    // never notify.
    const notifA = await request(http())
      .get(`${PREFIX}/me/notifications?pageSize=20`)
      .set(bearer(readerA.token))
      .expect(200);
    const replies = notifA.body.data.items.filter(
      (n: { type: string }) => n.type === 'blog_comment_reply',
    );
    expect(replies).toHaveLength(2);
    expect(replies[0].link).toBe(`/blog/${slug}#comment-${staff.body.data.id}`);
    const notifEditor = await request(http())
      .get(`${PREFIX}/me/notifications?pageSize=50`)
      .set(admin())
      .expect(200);
    const news = notifEditor.body.data.items.filter(
      (n: { type: string; link: string }) =>
        n.type === 'blog_comment_new' && n.link.includes(slug),
    );
    expect(news).toHaveLength(2);

    const me = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/engagement/me`)
      .set(bearer(readerB.token))
      .expect(200);
    expect(me.body.data.myCommentIds.sort()).toEqual([replyB, rootB].sort());
    expect(me.body.data.likedCommentIds).toEqual([]);
  });

  it('C2 edit own only (marks editedAt); likes are idempotent and feed the top sort', async () => {
    await request(http())
      .patch(`${PREFIX}/blog/comments/${rootA}`)
      .set(bearer(readerB.token))
      .send({ body: 'تلاش برای ویرایش دیدگاه دیگری' })
      .expect(404);
    const edited = await request(http())
      .patch(`${PREFIX}/blog/comments/${rootA}`)
      .set(bearer(readerA.token))
      .send({ body: `دیدگاه ویرایش‌شدهٔ الف ${RUN}` })
      .expect(200);
    expect(edited.body.data.editedAt).toBeTruthy();
    expect(edited.body.data.body).toBe(`دیدگاه ویرایش‌شدهٔ الف ${RUN}`);

    const like1 = await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/like`)
      .set(bearer(readerA.token))
      .expect(200);
    expect(like1.body.data.likeCount).toBe(1);
    const like2 = await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/like`)
      .set(bearer(readerA.token))
      .expect(200);
    expect(like2.body.data.likeCount).toBe(1);
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/like`)
      .set(bearer(readerC.token))
      .expect(200);
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootA}/like`)
      .set(bearer(readerC.token))
      .expect(200);
    const top = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/comments?sort=top`)
      .expect(200);
    expect(top.body.data.items.map((i: { id: string }) => i.id)).toEqual([
      rootB,
      rootA,
    ]);
    expect(top.body.data.items[0].likeCount).toBe(2);
    const me = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/engagement/me`)
      .set(bearer(readerC.token))
      .expect(200);
    expect(me.body.data.likedCommentIds.sort()).toEqual([rootA, rootB].sort());
    const unlike = await request(http())
      .delete(`${PREFIX}/blog/comments/${rootB}/like`)
      .set(bearer(readerC.token))
      .expect(200);
    expect(unlike.body.data.likeCount).toBe(1);
    await request(http())
      .post(`${PREFIX}/blog/comments/00000000-0000-4000-8000-000000000000/like`)
      .set(bearer(readerC.token))
      .expect(404);
  });

  it('C3 reports: own comment 409, once per reader, note length capped, visible in the admin queue', async () => {
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/report`)
      .set(bearer(readerB.token))
      .send({ reason: 'spam' })
      .expect(409);
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/report`)
      .set(bearer(readerA.token))
      .send({ reason: 'rude' })
      .expect(400);
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/report`)
      .set(bearer(readerA.token))
      .send({ reason: 'other', note: 'n'.repeat(501) })
      .expect(400);
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/report`)
      .set(bearer(readerA.token))
      .send({ reason: 'abuse', note: 'لحن توهین‌آمیز' })
      .expect(201);
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/report`)
      .set(bearer(readerA.token))
      .send({ reason: 'spam' })
      .expect(409);
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/report`)
      .set(bearer(readerC.token))
      .send({ reason: 'off_topic' })
      .expect(201);

    const me = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/engagement/me`)
      .set(bearer(readerA.token))
      .expect(200);
    expect(me.body.data.reportedCommentIds).toEqual([rootB]);

    const queue = await request(http())
      .get(`${PREFIX}/admin/blog/comments?reported=true`)
      .set(admin())
      .expect(200);
    expect(queue.body.data.items.map((i: { id: string }) => i.id)).toContain(
      rootB,
    );
    const row = queue.body.data.items.find(
      (i: { id: string }) => i.id === rootB,
    );
    expect(row.openReportCount).toBe(2);
    expect(row.reports.map((r: { reason: string }) => r.reason).sort()).toEqual(
      ['abuse', 'off_topic'],
    );
    expect(row.post.slug).toBe(slug);
    expect(row.author.banned).toBe(false);
    const overview = await request(http())
      .get(`${PREFIX}/admin/blog/comments/overview`)
      .set(admin())
      .expect(200);
    expect(overview.body.data.openReports).toBeGreaterThanOrEqual(2);
    expect(overview.body.data.published).toBeGreaterThanOrEqual(4);
  });

  it('C4 withdraw: own only; a root with live replies stays as an empty placeholder; counters drop', async () => {
    await request(http())
      .delete(`${PREFIX}/blog/comments/${rootA}`)
      .set(bearer(readerB.token))
      .expect(404);
    await request(http())
      .delete(`${PREFIX}/blog/comments/${rootA}`)
      .set(bearer(readerA.token))
      .expect(204);
    await request(http())
      .delete(`${PREFIX}/blog/comments/${rootA}`)
      .set(bearer(readerA.token))
      .expect(204);
    const list = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/comments?sort=oldest`)
      .expect(200);
    const placeholder = list.body.data.items.find(
      (i: { id: string }) => i.id === rootA,
    );
    expect(placeholder.status).toBe('hidden');
    expect(placeholder.body).toBe('');
    expect(placeholder.author).toBeNull();
    expect(placeholder.likeCount).toBe(0);
    expect(placeholder.replies).toHaveLength(2);
    const detail = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}`)
      .expect(200);
    expect(detail.body.data.commentCount).toBe(3);
    // Nothing can be done to a withdrawn comment.
    await request(http())
      .patch(`${PREFIX}/blog/comments/${rootA}`)
      .set(bearer(readerA.token))
      .send({ body: 'ویرایش پس از حذف' })
      .expect(404);
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootA}/like`)
      .set(bearer(readerC.token))
      .expect(404);
  });

  // ---- moderation ---------------------------------------------------------

  it('M1 permissions: viewer reads the queue but cannot act; outsider gets nothing; buyers 403', async () => {
    await request(http())
      .get(`${PREFIX}/admin/blog/comments`)
      .set(bearer(viewer.token))
      .expect(200);
    await request(http())
      .post(`${PREFIX}/admin/blog/comments/${rootB}/remove`)
      .set(bearer(viewer.token))
      .send({})
      .expect(403);
    await request(http())
      .get(`${PREFIX}/admin/blog/comments`)
      .set(bearer(outsider.token))
      .expect(403);
    await request(http())
      .get(`${PREFIX}/admin/blog/comments`)
      .set(bearer(readerA.token))
      .expect(403);
  });

  it('M2 remove: resolves reports, notifies the author with the reason, audits; restore brings it back', async () => {
    const removed = await request(http())
      .post(`${PREFIX}/admin/blog/comments/${rootB}/remove`)
      .set(admin())
      .send({ reason: 'تبلیغات' })
      .expect(200);
    expect(removed.body.data.status).toBe('removed');
    expect(removed.body.data.openReportCount).toBe(0);
    expect(
      removed.body.data.reports.every(
        (r: { status: string }) => r.status === 'resolved',
      ),
    ).toBe(true);
    await request(http())
      .post(`${PREFIX}/admin/blog/comments/${rootB}/remove`)
      .set(admin())
      .send({})
      .expect(409);

    // Gone from the public thread (no replies → no placeholder); counters drop.
    const list = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/comments`)
      .expect(200);
    expect(list.body.data.items.map((i: { id: string }) => i.id)).not.toContain(
      rootB,
    );
    const detail = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}`)
      .expect(200);
    expect(detail.body.data.commentCount).toBe(2);

    const notif = await request(http())
      .get(`${PREFIX}/me/notifications?pageSize=20`)
      .set(bearer(readerB.token))
      .expect(200);
    const gone = notif.body.data.items.find(
      (n: { type: string }) => n.type === 'blog_comment_removed',
    );
    expect(gone).toBeTruthy();
    expect(gone.body).toContain('تبلیغات');
    expect(gone.severity).toBe('warning');

    const audit = await ds.query(
      `SELECT action, actor_id FROM audit_logs WHERE entity = 'blog_comment' AND entity_id = $1 ORDER BY created_at`,
      [rootB],
    );
    expect(audit.map((a: { action: string }) => a.action)).toEqual([
      'blog.comment_removed',
    ]);
    expect(audit[0].actor_id).toBe(editor.userId);

    const restored = await request(http())
      .post(`${PREFIX}/admin/blog/comments/${rootB}/restore`)
      .set(admin())
      .expect(200);
    expect(restored.body.data.status).toBe('published');
    expect(restored.body.data.removedReason).toBeNull();
    await request(http())
      .post(`${PREFIX}/admin/blog/comments/${rootB}/restore`)
      .set(admin())
      .expect(409);
    const after = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}`)
      .expect(200);
    expect(after.body.data.commentCount).toBe(3);

    // Restoring a reply whose parent is withdrawn is refused.
    await request(http())
      .delete(`${PREFIX}/blog/comments/${replyB}`)
      .set(bearer(readerB.token))
      .expect(204);
    await request(http())
      .post(`${PREFIX}/admin/blog/comments/${replyB}/restore`)
      .set(admin())
      .expect(409);
    await request(http())
      .post(`${PREFIX}/admin/blog/comments/${rootA}/restore`)
      .set(admin())
      .expect(200);
    await request(http())
      .post(`${PREFIX}/admin/blog/comments/${replyB}/restore`)
      .set(admin())
      .expect(200);
  });

  it('M3 dismiss-reports closes the open reports without touching the comment; filters and search work', async () => {
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootA}/report`)
      .set(bearer(readerC.token))
      .send({ reason: 'other', note: 'آزمون' })
      .expect(201);
    const dismissed = await request(http())
      .post(`${PREFIX}/admin/blog/comments/${rootA}/dismiss-reports`)
      .set(admin())
      .expect(200);
    expect(dismissed.body.data.status).toBe('published');
    expect(dismissed.body.data.openReportCount).toBe(0);
    expect(
      dismissed.body.data.reports.map((r: { status: string }) => r.status),
    ).toEqual(['dismissed']);

    const byPost = await request(http())
      .get(`${PREFIX}/admin/blog/comments?postId=${postId}&status=published`)
      .set(admin())
      .expect(200);
    expect(byPost.body.data.meta.total).toBe(4);
    const byUser = await request(http())
      .get(`${PREFIX}/admin/blog/comments?userId=${readerB.userId}`)
      .set(admin())
      .expect(200);
    expect(byUser.body.data.meta.total).toBe(2);
    const search = await request(http())
      .get(
        `${PREFIX}/admin/blog/comments?q=${encodeURIComponent(`مستقل ب ${RUN}`)}`,
      )
      .set(admin())
      .expect(200);
    expect(search.body.data.items.map((i: { id: string }) => i.id)).toEqual([
      rootB,
    ]);
    await request(http())
      .get(`${PREFIX}/admin/blog/comments?status=deleted`)
      .set(admin())
      .expect(400);
  });

  it('M4 comment bans: 403 COMMENTS_BLOCKED, ratings still allowed, admins cannot be banned, audit, lift', async () => {
    await request(http())
      .post(`${PREFIX}/admin/blog/comment-bans`)
      .set(admin())
      .send({ userId: editor.userId })
      .expect(403);
    await request(http())
      .post(`${PREFIX}/admin/blog/comment-bans`)
      .set(admin())
      .send({ userId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
    const ban = await request(http())
      .post(`${PREFIX}/admin/blog/comment-bans`)
      .set(admin())
      .send({ userId: readerC.userId, reason: 'اسپم مکرر' })
      .expect(201);
    expect(ban.body.data.user.id).toBe(readerC.userId);
    expect(ban.body.data.reason).toBe('اسپم مکرر');

    const blocked = await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerC.token))
      .send({ body: `تلاش پس از مسدودی ${RUN}` })
      .expect(403);
    expect(blocked.body.error.details.reason).toBe('COMMENTS_BLOCKED');
    const me = await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/engagement/me`)
      .set(bearer(readerC.token))
      .expect(200);
    expect(me.body.data.canComment).toBe(false);
    await request(http())
      .put(`${PREFIX}/blog/posts/${slug}/rating`)
      .set(bearer(readerC.token))
      .send({ rating: 2 })
      .expect(200);

    const bans = await request(http())
      .get(`${PREFIX}/admin/blog/comment-bans`)
      .set(admin())
      .expect(200);
    expect(
      bans.body.data.map((b: { user: { id: string } }) => b.user.id),
    ).toContain(readerC.userId);
    const queue = await request(http())
      .get(`${PREFIX}/admin/blog/comments?userId=${readerC.userId}`)
      .set(admin())
      .expect(200);
    expect(queue.body.data.meta.total).toBe(0);

    await request(http())
      .delete(`${PREFIX}/admin/blog/comment-bans/${readerC.userId}`)
      .set(bearer(viewer.token))
      .expect(403);
    await request(http())
      .delete(`${PREFIX}/admin/blog/comment-bans/${readerC.userId}`)
      .set(admin())
      .expect(204);
    await request(http())
      .delete(`${PREFIX}/admin/blog/comment-bans/${readerC.userId}`)
      .set(admin())
      .expect(404);
    await request(http())
      .post(`${PREFIX}/blog/posts/${slug}/comments`)
      .set(bearer(readerC.token))
      .send({ body: `پس از رفع مسدودی ${RUN}` })
      .expect(201);

    const audit = await ds.query(
      `SELECT action FROM audit_logs WHERE entity = 'blog_comment_ban' AND entity_id = $1 ORDER BY created_at`,
      [readerC.userId],
    );
    expect(audit.map((a: { action: string }) => a.action)).toEqual([
      'blog.comment_ban_created',
      'blog.comment_ban_lifted',
    ]);
  });

  it('M5 unpublishing the article hides its engagement; deleting it cascades', async () => {
    await request(http())
      .post(`${PREFIX}/admin/blog/posts/${postId}/unpublish`)
      .set(admin())
      .send({ note: 'آزمون' })
      .expect(200);
    await request(http())
      .get(`${PREFIX}/blog/posts/${slug}/engagement`)
      .expect(404);
    await request(http())
      .post(`${PREFIX}/blog/comments/${rootB}/like`)
      .set(bearer(readerA.token))
      .expect(404);
    const before = await ds.query(
      `SELECT COUNT(*)::int AS n FROM blog_comments WHERE post_id = $1`,
      [postId],
    );
    expect(before[0].n).toBeGreaterThan(0);
    await request(http())
      .delete(`${PREFIX}/admin/blog/posts/${postId}`)
      .set(admin())
      .expect(204);
    const after = await ds.query(
      `SELECT (SELECT COUNT(*) FROM blog_comments WHERE post_id = $1)::int AS c,
              (SELECT COUNT(*) FROM blog_post_ratings WHERE post_id = $1)::int AS r`,
      [postId],
    );
    expect(after[0]).toEqual({ c: 0, r: 0 });
  });
});
