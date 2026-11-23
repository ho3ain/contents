import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { ApiException } from '../../common/errors/api-error';
import {
  BlogComment,
  BlogCommentBan,
  BlogCommentLike,
  BlogCommentReport,
  BlogPostRating,
  type BlogCommentReportReason,
  type BlogCommentReportStatus,
  type BlogCommentStatus,
} from '../../database/entities/blog/blog-engagement.entity';
import { BlogPost } from '../../database/entities/blog/blog-post.entity';
import { User, UserRole } from '../../database/entities/identity/user.entity';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';
import {
  adminUserRef,
  publicAuthor,
  type AdminBlogUserRef,
  type PublicBlogAuthor,
} from './blog-serializers';
import { escapeLikeTerm } from './domain/blog-search';
import type {
  AdminListBlogCommentsQueryDto,
  BlogCommentSort,
} from './dto/blog-engagement.dto';

// ---- limits (documented in docs/blog/MESH_Blog_Decisions_FA.md) -------------

/** A reader may post at most this many comments per window (per account). */
export const BLOG_COMMENT_BURST_LIMIT = 10;
export const BLOG_COMMENT_BURST_WINDOW_MS = 10 * 60_000;
/** The same text twice inside this window is treated as a double submit. */
export const BLOG_COMMENT_DUPLICATE_WINDOW_MS = 10 * 60_000;
/** How many of a reader's own comment ids `/engagement/me` returns. */
const MY_COMMENT_IDS_LIMIT = 200;
const REPLY_PREVIEW_LIMIT = 50;

// ---- public shapes ------------------------------------------------------------

export interface BlogRatingSummary {
  average: number;
  count: number;
  /** Votes per star, 1..5 (always all five keys). */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface BlogEngagementSummary {
  rating: BlogRatingSummary;
  commentCount: number;
}

export interface BlogEngagementMe {
  myRating: number | null;
  myCommentIds: string[];
  likedCommentIds: string[];
  reportedCommentIds: string[];
  /** false when the editorial team barred this account from commenting. */
  canComment: boolean;
}

export type PublicCommentBadge = 'author' | 'staff' | null;

export interface PublicBlogComment {
  id: string;
  parentId: string | null;
  /** `published`; a `hidden`/`removed` top-level comment that still has replies is a placeholder (body ''). */
  status: BlogCommentStatus;
  body: string;
  author: (PublicBlogAuthor & { badge: PublicCommentBadge }) | null;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  editedAt: string | null;
  replies: PublicBlogComment[];
}

export interface AdminBlogCommentReportRow {
  id: string;
  reason: BlogCommentReportReason;
  note: string | null;
  status: BlogCommentReportStatus;
  reporter: AdminBlogUserRef | null;
  createdAt: string;
}

export interface AdminBlogCommentRow {
  id: string;
  parentId: string | null;
  status: BlogCommentStatus;
  body: string;
  likeCount: number;
  replyCount: number;
  author: (AdminBlogUserRef & { banned: boolean }) | null;
  post: { id: string; slug: string; title: string } | null;
  openReportCount: number;
  reports: AdminBlogCommentReportRow[];
  removedReason: string | null;
  removedAt: string | null;
  editedAt: string | null;
  createdAt: string;
}

export interface AdminBlogCommentOverview {
  published: number;
  hidden: number;
  removed: number;
  openReports: number;
  bans: number;
}

export interface AdminBlogCommentBanRow {
  user: AdminBlogUserRef | null;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

const EMPTY_DISTRIBUTION = (): BlogRatingSummary['distribution'] => ({
  '1': 0,
  '2': 0,
  '3': 0,
  '4': 0,
  '5': 0,
});

function notFound(message: string): ApiException {
  return new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
}

/**
 * Reader engagement on articles: star ratings, threaded comments, likes,
 * reports and the moderation queue. Rules in one place:
 *
 *  - Signed-in readers only; the article must be `published` (a draft or an
 *    unpublished article answers 404 exactly like `GET /blog/posts/:slug`).
 *  - Comments publish immediately (post-moderation). Readers report; the
 *    editorial team removes/restores from `/admin/blog/comments` and may bar
 *    an account from commenting (`blog_comment_bans`). Ratings are never
 *    banned — they carry no text.
 *  - One reply level: a reply always points at a top-level comment.
 *  - Author withdraws → `hidden`; moderation → `removed` (author is notified
 *    with the reason). A withdrawn/removed top-level comment with live
 *    replies stays as an empty placeholder so the thread keeps its shape.
 *  - Denormalised counters (`blog_posts.rating_*`, `comment_count`,
 *    `blog_comments.like_count/reply_count`) are recomputed from the source
 *    tables inside the same transaction as every write.
 */
@Injectable()
export class BlogEngagementService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BlogPost)
    private readonly posts: Repository<BlogPost>,
    @InjectRepository(BlogPostRating)
    private readonly ratings: Repository<BlogPostRating>,
    @InjectRepository(BlogComment)
    private readonly comments: Repository<BlogComment>,
    @InjectRepository(BlogCommentLike)
    private readonly likes: Repository<BlogCommentLike>,
    @InjectRepository(BlogCommentReport)
    private readonly reports: Repository<BlogCommentReport>,
    @InjectRepository(BlogCommentBan)
    private readonly bans: Repository<BlogCommentBan>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- lookups ------------------------------------------------------------

  private async publishedPost(slug: string): Promise<BlogPost> {
    const post = await this.posts.findOne({
      where: { slug, status: 'published' },
    });
    if (!post) throw notFound('Article not found');
    return post;
  }

  private async liveComment(id: string): Promise<BlogComment> {
    const comment = await this.comments.findOne({
      where: { id, status: 'published' },
      relations: { post: true },
    });
    if (!comment || comment.post.status !== 'published') {
      throw notFound('Comment not found');
    }
    return comment;
  }

  async isBanned(userId: string): Promise<boolean> {
    return (await this.bans.countBy({ userId })) > 0;
  }

  // ---- ratings ------------------------------------------------------------

  async summary(slug: string): Promise<BlogEngagementSummary> {
    const post = await this.publishedPost(slug);
    const rows = await this.ratings
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'n')
      .where('r.post_id = :postId', { postId: post.id })
      .groupBy('r.rating')
      .getRawMany<{ rating: number; n: string }>();
    const distribution = EMPTY_DISTRIBUTION();
    let count = 0;
    let sum = 0;
    for (const row of rows) {
      const star = Number(row.rating);
      const n = Number(row.n);
      if (star >= 1 && star <= 5) {
        distribution[String(star) as keyof typeof distribution] = n;
        count += n;
        sum += star * n;
      }
    }
    return {
      rating: {
        average: count ? Math.round((sum / count) * 100) / 100 : 0,
        count,
        distribution,
      },
      commentCount: post.commentCount,
    };
  }

  async me(slug: string, userId: string): Promise<BlogEngagementMe> {
    const post = await this.publishedPost(slug);
    const [mine, myComments, banned] = await Promise.all([
      this.ratings.findOne({ where: { postId: post.id, userId } }),
      this.comments.find({
        where: { postId: post.id, userId },
        select: { id: true },
        order: { createdAt: 'DESC' },
        take: MY_COMMENT_IDS_LIMIT,
      }),
      this.isBanned(userId),
    ]);
    const postCommentIds = this.comments
      .createQueryBuilder('c')
      .select('c.id')
      .where('c.post_id = :postId');
    const [liked, reported] = await Promise.all([
      this.likes
        .createQueryBuilder('l')
        .select('l.comment_id', 'id')
        .where('l.user_id = :userId', { userId })
        .andWhere(`l.comment_id IN (${postCommentIds.getQuery()})`)
        .setParameters({ postId: post.id })
        .getRawMany<{ id: string }>(),
      this.reports
        .createQueryBuilder('rp')
        .select('rp.comment_id', 'id')
        .where('rp.reporter_id = :userId', { userId })
        .andWhere(`rp.comment_id IN (${postCommentIds.getQuery()})`)
        .setParameters({ postId: post.id })
        .getRawMany<{ id: string }>(),
    ]);
    return {
      myRating: mine?.rating ?? null,
      myCommentIds: myComments.map((c) => c.id),
      likedCommentIds: liked.map((r) => r.id),
      reportedCommentIds: reported.map((r) => r.id),
      canComment: !banned,
    };
  }

  async rate(
    slug: string,
    userId: string,
    rating: number,
  ): Promise<BlogEngagementSummary & { myRating: number }> {
    const post = await this.publishedPost(slug);
    await this.dataSource.transaction(async (em) => {
      await em
        .createQueryBuilder()
        .insert()
        .into(BlogPostRating)
        .values({ postId: post.id, userId, rating })
        .orUpdate(['rating', 'updated_at'], ['post_id', 'user_id'])
        .execute();
      await this.recomputeRating(em, post.id);
    });
    const summary = await this.summary(slug);
    return { ...summary, myRating: rating };
  }

  async unrate(slug: string, userId: string): Promise<BlogEngagementSummary> {
    const post = await this.publishedPost(slug);
    await this.dataSource.transaction(async (em) => {
      await em.delete(BlogPostRating, { postId: post.id, userId });
      await this.recomputeRating(em, post.id);
    });
    return this.summary(slug);
  }

  private async recomputeRating(em: EntityManager, postId: string) {
    await em.query(
      `UPDATE "blog_posts" p SET
         "rating_avg" = COALESCE((SELECT ROUND(AVG("rating")::numeric, 2) FROM "blog_post_ratings" WHERE "post_id" = $1), 0),
         "rating_count" = (SELECT COUNT(*) FROM "blog_post_ratings" WHERE "post_id" = $1)
       WHERE p."id" = $1`,
      [postId],
    );
  }

  private async recomputeCommentCount(em: EntityManager, postId: string) {
    await em.query(
      `UPDATE "blog_posts" SET "comment_count" =
         (SELECT COUNT(*) FROM "blog_comments" WHERE "post_id" = $1 AND "status" = 'published')
       WHERE "id" = $1`,
      [postId],
    );
  }

  private async recomputeReplyCount(em: EntityManager, parentId: string) {
    await em.query(
      `UPDATE "blog_comments" SET "reply_count" =
         (SELECT COUNT(*) FROM "blog_comments" WHERE "parent_id" = $1 AND "status" = 'published')
       WHERE "id" = $1`,
      [parentId],
    );
  }

  private async recomputeLikeCount(em: EntityManager, commentId: string) {
    await em.query(
      `UPDATE "blog_comments" SET "like_count" =
         (SELECT COUNT(*) FROM "blog_comment_likes" WHERE "comment_id" = $1)
       WHERE "id" = $1`,
      [commentId],
    );
  }

  // ---- comments: read -----------------------------------------------------

  async list(
    slug: string,
    query: { sort: BlogCommentSort; page: number; pageSize: number },
  ) {
    const post = await this.publishedPost(slug);
    const qb = this.comments
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.user', 'u')
      .where('c.post_id = :postId', { postId: post.id })
      .andWhere('c.parent_id IS NULL')
      // Live comments, plus withdrawn/removed ones that still anchor replies.
      .andWhere(
        new Brackets((w) =>
          w.where(`c.status = 'published'`).orWhere('c.reply_count > 0'),
        ),
      );
    if (query.sort === 'top') {
      qb.orderBy('c.likeCount', 'DESC').addOrderBy('c.createdAt', 'DESC');
    } else {
      qb.orderBy('c.createdAt', query.sort === 'oldest' ? 'ASC' : 'DESC');
    }
    qb.addOrderBy('c.id', 'ASC');
    // offset/limit (not skip/take): the join is many-to-one, rows never
    // multiply, and raw ORDER BY expressions cannot drive TypeORM's
    // two-step DISTINCT pagination.
    const total = await qb.getCount();
    const roots = await qb
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .getMany();

    const replies = roots.length
      ? await this.comments.find({
          where: {
            parentId: In(roots.map((r) => r.id)),
            status: 'published',
          },
          relations: { user: true },
          order: { createdAt: 'ASC' },
        })
      : [];
    const byParent = new Map<string, BlogComment[]>();
    for (const r of replies) {
      const list = byParent.get(r.parentId as string) ?? [];
      if (list.length < REPLY_PREVIEW_LIMIT) list.push(r);
      byParent.set(r.parentId as string, list);
    }
    const items = roots.map((root) =>
      this.publicComment(
        root,
        post,
        (byParent.get(root.id) ?? []).map((r) =>
          this.publicComment(r, post, []),
        ),
      ),
    );
    return {
      items,
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  private publicComment(
    c: BlogComment,
    post: BlogPost,
    replies: PublicBlogComment[],
  ): PublicBlogComment {
    const live = c.status === 'published';
    const author = live ? publicAuthor(c.user) : null;
    return {
      id: c.id,
      parentId: c.parentId,
      status: c.status,
      body: live ? c.body : '',
      author: author
        ? {
            ...author,
            badge:
              c.userId === post.authorUserId
                ? 'author'
                : c.user?.role === UserRole.ADMIN
                  ? 'staff'
                  : null,
          }
        : null,
      likeCount: live ? c.likeCount : 0,
      replyCount: c.replyCount,
      createdAt: c.createdAt.toISOString(),
      editedAt: live && c.editedAt ? c.editedAt.toISOString() : null,
      replies,
    };
  }

  // ---- comments: write ----------------------------------------------------

  async create(
    slug: string,
    userId: string,
    input: { body: string; parentId?: string },
  ): Promise<PublicBlogComment> {
    const post = await this.publishedPost(slug);
    if (await this.isBanned(userId)) {
      throw new ApiException(
        'FORBIDDEN',
        'Commenting is disabled for this account',
        HttpStatus.FORBIDDEN,
        { reason: 'COMMENTS_BLOCKED' },
      );
    }
    const body = input.body.trim();
    const since = new Date(Date.now() - BLOG_COMMENT_BURST_WINDOW_MS);
    const recent = await this.comments
      .createQueryBuilder('c')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.created_at >= :since', { since })
      .getCount();
    if (recent >= BLOG_COMMENT_BURST_LIMIT) {
      throw new ApiException(
        'TOO_MANY_REQUESTS',
        'Too many comments in a short time — please wait a few minutes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const duplicate = await this.comments
      .createQueryBuilder('c')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.post_id = :postId', { postId: post.id })
      .andWhere('c.body = :body', { body })
      .andWhere('c.created_at >= :since', {
        since: new Date(Date.now() - BLOG_COMMENT_DUPLICATE_WINDOW_MS),
      })
      .getCount();
    if (duplicate > 0) {
      throw new ApiException(
        'CONFLICT',
        'You already posted this comment',
        HttpStatus.CONFLICT,
      );
    }

    let parent: BlogComment | null = null;
    if (input.parentId) {
      parent = await this.comments.findOne({
        where: { id: input.parentId, postId: post.id, status: 'published' },
      });
      if (!parent) throw notFound('Comment not found');
      if (parent.parentId) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'Replies can only be added to top-level comments',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const created = await this.dataSource.transaction(async (em) => {
      const comment = await em.save(
        em.create(BlogComment, {
          postId: post.id,
          userId,
          parentId: parent?.id ?? null,
          body,
          status: 'published',
        }),
      );
      if (parent) await this.recomputeReplyCount(em, parent.id);
      await this.recomputeCommentCount(em, post.id);
      return comment;
    });

    const excerpt = body.slice(0, 120);
    const link = `/blog/${post.slug}#comment-${created.id}`;
    if (parent && parent.userId !== userId) {
      await this.notifications.notifyEventSafe(
        parent.userId,
        NOTIFICATION_TYPES.BLOG_COMMENT_REPLY,
        { postTitle: post.title, excerpt },
        {
          link,
          relatedType: 'blog_comment',
          relatedId: created.id,
          dedupKey: `blog_comment_reply:${created.id}`,
        },
      );
    } else if (!parent && post.authorUserId && post.authorUserId !== userId) {
      await this.notifications.notifyEventSafe(
        post.authorUserId,
        NOTIFICATION_TYPES.BLOG_COMMENT_NEW,
        { postTitle: post.title, excerpt },
        {
          link,
          relatedType: 'blog_comment',
          relatedId: created.id,
          dedupKey: `blog_comment_new:${created.id}`,
        },
      );
    }

    const full = await this.comments.findOneOrFail({
      where: { id: created.id },
      relations: { user: true },
    });
    return this.publicComment(full, post, []);
  }

  async update(
    commentId: string,
    userId: string,
    body: string,
  ): Promise<PublicBlogComment> {
    const comment = await this.liveComment(commentId);
    if (comment.userId !== userId) throw notFound('Comment not found');
    const next = body.trim();
    if (next !== comment.body) {
      comment.body = next;
      comment.editedAt = new Date();
      await this.comments.save(comment);
    }
    const full = await this.comments.findOneOrFail({
      where: { id: comment.id },
      relations: { user: true },
    });
    return this.publicComment(full, comment.post, []);
  }

  /** Author withdraws (status → hidden). Idempotent. */
  async withdraw(commentId: string, userId: string): Promise<void> {
    const comment = await this.comments.findOne({
      where: { id: commentId, userId },
    });
    if (!comment) throw notFound('Comment not found');
    if (comment.status !== 'published') return;
    await this.dataSource.transaction(async (em) => {
      await em.update(BlogComment, { id: comment.id }, { status: 'hidden' });
      if (comment.parentId)
        await this.recomputeReplyCount(em, comment.parentId);
      await this.recomputeCommentCount(em, comment.postId);
    });
  }

  async like(
    commentId: string,
    userId: string,
  ): Promise<{ likeCount: number }> {
    const comment = await this.liveComment(commentId);
    return this.dataSource.transaction(async (em) => {
      await em
        .createQueryBuilder()
        .insert()
        .into(BlogCommentLike)
        .values({ commentId: comment.id, userId })
        .orIgnore()
        .execute();
      await this.recomputeLikeCount(em, comment.id);
      const fresh = await em.findOneByOrFail(BlogComment, { id: comment.id });
      return { likeCount: fresh.likeCount };
    });
  }

  async unlike(
    commentId: string,
    userId: string,
  ): Promise<{ likeCount: number }> {
    const comment = await this.liveComment(commentId);
    return this.dataSource.transaction(async (em) => {
      await em.delete(BlogCommentLike, { commentId: comment.id, userId });
      await this.recomputeLikeCount(em, comment.id);
      const fresh = await em.findOneByOrFail(BlogComment, { id: comment.id });
      return { likeCount: fresh.likeCount };
    });
  }

  async report(
    commentId: string,
    reporterId: string,
    input: { reason: BlogCommentReportReason; note?: string },
  ): Promise<{ id: string }> {
    const comment = await this.liveComment(commentId);
    if (comment.userId === reporterId) {
      throw new ApiException(
        'CONFLICT',
        'You cannot report your own comment',
        HttpStatus.CONFLICT,
      );
    }
    const existing = await this.reports.findOne({
      where: { commentId: comment.id, reporterId },
    });
    if (existing) {
      throw new ApiException(
        'CONFLICT',
        'You already reported this comment',
        HttpStatus.CONFLICT,
      );
    }
    const saved = await this.reports.save(
      this.reports.create({
        commentId: comment.id,
        reporterId,
        reason: input.reason,
        note: input.note?.trim() || null,
        status: 'open',
      }),
    );
    return { id: saved.id };
  }

  // ---- admin --------------------------------------------------------------

  async adminOverview(): Promise<AdminBlogCommentOverview> {
    const [byStatus, openReports, bans] = await Promise.all([
      this.comments
        .createQueryBuilder('c')
        .select('c.status', 'status')
        .addSelect('COUNT(*)', 'n')
        .groupBy('c.status')
        .getRawMany<{ status: BlogCommentStatus; n: string }>(),
      this.reports.countBy({ status: 'open' }),
      this.bans.count(),
    ]);
    const n = (s: BlogCommentStatus) =>
      Number(byStatus.find((r) => r.status === s)?.n ?? 0);
    return {
      published: n('published'),
      hidden: n('hidden'),
      removed: n('removed'),
      openReports,
      bans,
    };
  }

  async adminList(query: AdminListBlogCommentsQueryDto) {
    const qb = this.comments
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.user', 'u')
      .leftJoinAndSelect('c.post', 'p');
    if (query.status)
      qb.andWhere('c.status = :status', { status: query.status });
    if (query.postId)
      qb.andWhere('c.post_id = :postId', { postId: query.postId });
    if (query.userId)
      qb.andWhere('c.user_id = :userId', { userId: query.userId });
    if (query.reported) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM "blog_comment_reports" r WHERE r."comment_id" = c."id" AND r."status" = 'open')`,
      );
      qb.orderBy(
        `(SELECT COUNT(*) FROM "blog_comment_reports" r2 WHERE r2."comment_id" = c."id" AND r2."status" = 'open')`,
        'DESC',
      ).addOrderBy('c.createdAt', 'DESC');
    } else {
      qb.orderBy('c.createdAt', 'DESC');
    }
    qb.addOrderBy('c.id', 'ASC');
    const q = query.q?.trim();
    if (q) {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('c.body ILIKE :q', { q: `%${escapeLikeTerm(q)}%` })
            .orWhere('p.title ILIKE :q')
            .orWhere('u.username ILIKE :q')
            .orWhere('u.full_name ILIKE :q'),
        ),
      );
    }
    const total = await qb.getCount();
    const rows = await qb
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const [reports, banned]: [BlogCommentReport[], BlogCommentBan[]] =
      await Promise.all([
        ids.length
          ? this.reports.find({
              where: { commentId: In(ids) },
              relations: { reporter: true },
              order: { createdAt: 'DESC' },
            })
          : Promise.resolve([]),
        rows.length
          ? this.bans.find({
              where: { userId: In(rows.map((r) => r.userId)) },
            })
          : Promise.resolve([]),
      ]);
    const bannedIds = new Set(banned.map((b) => b.userId));
    const reportsByComment = new Map<string, BlogCommentReport[]>();
    for (const r of reports) {
      const list = reportsByComment.get(r.commentId) ?? [];
      list.push(r);
      reportsByComment.set(r.commentId, list);
    }
    const items: AdminBlogCommentRow[] = rows.map((c) =>
      this.adminRow(c, reportsByComment.get(c.id) ?? [], bannedIds),
    );
    return {
      items,
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  private adminRow(
    c: BlogComment,
    reports: BlogCommentReport[],
    bannedIds: Set<string>,
  ): AdminBlogCommentRow {
    const author = adminUserRef(c.user);
    return {
      id: c.id,
      parentId: c.parentId,
      status: c.status,
      body: c.body,
      likeCount: c.likeCount,
      replyCount: c.replyCount,
      author: author ? { ...author, banned: bannedIds.has(c.userId) } : null,
      post: c.post
        ? { id: c.post.id, slug: c.post.slug, title: c.post.title }
        : null,
      openReportCount: reports.filter((r) => r.status === 'open').length,
      reports: reports.map((r) => ({
        id: r.id,
        reason: r.reason,
        note: r.note,
        status: r.status,
        reporter: adminUserRef(r.reporter),
        createdAt: r.createdAt.toISOString(),
      })),
      removedReason: c.removedReason,
      removedAt: c.removedAt?.toISOString() ?? null,
      editedAt: c.editedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private async adminComment(id: string): Promise<BlogComment> {
    const comment = await this.comments.findOne({
      where: { id },
      relations: { post: true, user: true },
    });
    if (!comment) throw notFound('Comment not found');
    return comment;
  }

  /** Moderation removal: status → removed, open reports resolved, author notified. */
  async adminRemove(
    id: string,
    adminId: string,
    reason?: string,
  ): Promise<AdminBlogCommentRow> {
    const comment = await this.adminComment(id);
    if (comment.status === 'removed') {
      throw new ApiException(
        'INVALID_STATE',
        'Comment is already removed',
        HttpStatus.CONFLICT,
      );
    }
    const trimmedReason = reason?.trim() || null;
    await this.dataSource.transaction(async (em) => {
      await em.update(
        BlogComment,
        { id: comment.id },
        {
          status: 'removed',
          removedBy: adminId,
          removedAt: new Date(),
          removedReason: trimmedReason,
        },
      );
      await em.update(
        BlogCommentReport,
        { commentId: comment.id, status: 'open' },
        { status: 'resolved', resolvedBy: adminId, resolvedAt: new Date() },
      );
      if (comment.parentId)
        await this.recomputeReplyCount(em, comment.parentId);
      await this.recomputeCommentCount(em, comment.postId);
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_COMMENT_REMOVED,
      entity: AUDIT_ENTITIES.BLOG_COMMENT,
      entityId: comment.id,
      metadata: {
        postId: comment.postId,
        authorId: comment.userId,
        previousStatus: comment.status,
        reason: trimmedReason,
      },
      context: { actorId: adminId },
    });
    await this.notifications.notifyEventSafe(
      comment.userId,
      NOTIFICATION_TYPES.BLOG_COMMENT_REMOVED,
      { postTitle: comment.post.title, reason: trimmedReason ?? '' },
      {
        link: `/blog/${comment.post.slug}`,
        relatedType: 'blog_comment',
        relatedId: comment.id,
        dedupKey: `blog_comment_removed:${comment.id}`,
      },
    );
    return this.adminRowById(comment.id);
  }

  /** Puts a hidden/removed comment back (status → published). */
  async adminRestore(
    id: string,
    adminId: string,
  ): Promise<AdminBlogCommentRow> {
    const comment = await this.adminComment(id);
    if (comment.status === 'published') {
      throw new ApiException(
        'INVALID_STATE',
        'Comment is already published',
        HttpStatus.CONFLICT,
      );
    }
    if (comment.parentId) {
      const parent = await this.comments.findOneBy({ id: comment.parentId });
      if (!parent || parent.status !== 'published') {
        throw new ApiException(
          'INVALID_STATE',
          'Restore the parent comment first',
          HttpStatus.CONFLICT,
        );
      }
    }
    await this.dataSource.transaction(async (em) => {
      await em.update(
        BlogComment,
        { id: comment.id },
        {
          status: 'published',
          removedBy: null,
          removedAt: null,
          removedReason: null,
        },
      );
      if (comment.parentId)
        await this.recomputeReplyCount(em, comment.parentId);
      await this.recomputeCommentCount(em, comment.postId);
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_COMMENT_RESTORED,
      entity: AUDIT_ENTITIES.BLOG_COMMENT,
      entityId: comment.id,
      metadata: { postId: comment.postId, previousStatus: comment.status },
      context: { actorId: adminId },
    });
    return this.adminRowById(comment.id);
  }

  /** Reports were reviewed and the comment stays: open reports → dismissed. */
  async adminDismissReports(
    id: string,
    adminId: string,
  ): Promise<AdminBlogCommentRow> {
    const comment = await this.adminComment(id);
    const result = await this.reports.update(
      { commentId: comment.id, status: 'open' },
      { status: 'dismissed', resolvedBy: adminId, resolvedAt: new Date() },
    );
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_COMMENT_REPORTS_DISMISSED,
      entity: AUDIT_ENTITIES.BLOG_COMMENT,
      entityId: comment.id,
      metadata: { postId: comment.postId, dismissed: result.affected ?? 0 },
      context: { actorId: adminId },
    });
    return this.adminRowById(comment.id);
  }

  private async adminRowById(id: string): Promise<AdminBlogCommentRow> {
    const c = await this.adminComment(id);
    const [reports, ban] = await Promise.all([
      this.reports.find({
        where: { commentId: c.id },
        relations: { reporter: true },
        order: { createdAt: 'DESC' },
      }),
      this.bans.findOneBy({ userId: c.userId }),
    ]);
    return this.adminRow(c, reports, new Set(ban ? [ban.userId] : []));
  }

  async adminListBans(): Promise<AdminBlogCommentBanRow[]> {
    const rows = await this.bans.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((b) => ({
      user: adminUserRef(b.user),
      reason: b.reason,
      createdBy: b.createdBy,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  async adminBan(
    adminId: string,
    input: { userId: string; reason?: string },
  ): Promise<AdminBlogCommentBanRow> {
    const user = await this.dataSource
      .getRepository(User)
      .findOneBy({ id: input.userId });
    if (!user) throw notFound('User not found');
    if (user.role === UserRole.ADMIN) {
      throw new ApiException(
        'FORBIDDEN',
        'Admin accounts cannot be barred from commenting',
        HttpStatus.FORBIDDEN,
      );
    }
    const reason = input.reason?.trim() || null;
    await this.bans
      .createQueryBuilder()
      .insert()
      .into(BlogCommentBan)
      .values({ userId: user.id, createdBy: adminId, reason })
      .orUpdate(['reason', 'created_by'], ['user_id'])
      .execute();
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_COMMENT_BAN_CREATED,
      entity: AUDIT_ENTITIES.BLOG_COMMENT_BAN,
      entityId: user.id,
      metadata: { reason },
      context: { actorId: adminId },
    });
    const row = await this.bans.findOneOrFail({
      where: { userId: user.id },
      relations: { user: true },
    });
    return {
      user: adminUserRef(row.user),
      reason: row.reason,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async adminUnban(adminId: string, userId: string): Promise<void> {
    const result = await this.bans.delete({ userId });
    if (!result.affected) throw notFound('Ban not found');
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_COMMENT_BAN_LIFTED,
      entity: AUDIT_ENTITIES.BLOG_COMMENT_BAN,
      entityId: userId,
      metadata: {},
      context: { actorId: adminId },
    });
  }
}
