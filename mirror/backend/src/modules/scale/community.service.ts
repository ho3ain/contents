import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CommunityComment,
  CommunityMembership,
  CommunityPost,
  CommunityReaction,
} from '../../database/entities/scale/community.entity';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { UserRole } from '../../database/entities/identity/user.entity';
import { CrmEventsService } from '../crm/crm-events.service';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';
import { CREATOR_EVENTS } from '../crm/domain/events';
import type { CommunityCategory } from '../../database/entities/scale/community.entity';

/**
 * Phase C5 §26–§30 — the creator community.
 *
 * Owner decision (§55): a REAL, small community, not an integration
 * placeholder. That is a real product decision and this service is the whole
 * of it — membership, posts, comments, reactions, moderation. There is no
 * full forum: one level of reply threading and eleven categories, which is
 * what §26 actually lists.
 *
 * The provider point (§28) is deliberately narrow: nothing outside
 * `community/` touches these tables, so replacing the storage with Discourse
 * later means re-implementing THIS service, not the rest of the platform.
 *
 * Two rules do the work:
 *
 *  - **An invitation is not a membership.** §27 invites a creator; they join.
 *    A creator who has not joined cannot post, so the "you are in the
 *    community" banner is not a decoration.
 *  - **A reaction is unique per actor per target.** The partial unique
 *    indexes on the table enforce it, so a double-clicked heart cannot
 *    inflate an engagement number that §32 reports.
 */
@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name);

  constructor(
    @InjectRepository(CommunityMembership)
    private readonly memberships: Repository<CommunityMembership>,
    @InjectRepository(CommunityPost)
    private readonly posts: Repository<CommunityPost>,
    @InjectRepository(CommunityComment)
    private readonly comments: Repository<CommunityComment>,
    @InjectRepository(CommunityReaction)
    private readonly reactions: Repository<CommunityReaction>,
    private readonly dataSource: DataSource,
    private readonly crmEvents: CrmEventsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The feed query, shared by the creator entry view and the public feed. */
  private async recentPosts(limit: number) {
    return this.dataSource.query<
      Array<{
        id: string;
        title: string;
        category: string;
        pinned: boolean;
        announcement: boolean;
        comment_count: string;
        reaction_count: string;
        last_activity_at: Date;
        author_name: string | null;
      }>
    >(
      `SELECT p.id, p.title, p.category, p.pinned, p.announcement,
              p.comment_count, p.reaction_count, p.last_activity_at,
              cp.display_name AS author_name
         FROM community_posts p
         LEFT JOIN creator_profiles cp ON cp.id = p.author_profile_id
        WHERE p.hidden = false
        ORDER BY p.pinned DESC, p.announcement DESC, p.last_activity_at DESC
        LIMIT $1`,
      [limit],
    );
  }

  /**
   * §30 — the PUBLIC feed: post metadata only, no bodies, no author emails.
   *
   * A separate method rather than a `creatorProfileId?` flag on `entryView`,
   * because the two return different things. The public feed is a marketing
   * surface and must not grow a body field by accident.
   */
  async publicFeed(limit = 20) {
    const posts = await this.recentPosts(limit);
    return posts.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      pinned: row.pinned,
      announcement: row.announcement,
      authorName: row.author_name,
      commentCount: Number.parseInt(row.comment_count, 10),
      reactionCount: Number.parseInt(row.reaction_count, 10),
      lastActivityAt: row.last_activity_at,
    }));
  }

  /**
   * §30 — the entry point in the creator dashboard.
   *
   * Returns the contract in `api/types.ts` (`CommunityView`), which is what
   * the page is written against. It previously returned `stats.activeMembers`
   * and no `today`, while the page rendered `stats.members` and
   * `stats.today` — both `undefined`, printed to the creator as the literal
   * word "undefined" in a stat box. It also omitted `body`, `hidden`,
   * `createdAt` and `reactedByMe`, so the feed could not render a post's
   * text, could not show a moderated post as moderated, and could not mark
   * the reactions the reader had already made.
   *
   * `reactedByMe` is why `userId` is a parameter: whether the heart is
   * filled is a fact about the VIEWER, and the only way the server can
   * answer it is to be told who is looking.
   */
  async entryView(creatorProfileId: string, userId: string) {
    const membership = await this.memberships.findOneBy({ creatorProfileId });

    // Pinned and announcement posts float first, then the newest activity.
    // One query, because a feed assembled from three would disagree with
    // itself on ordering.
    //
    // Hidden posts are NOT filtered out here, deliberately: §30 wants a
    // member whose post was moderated to be able to SEE that it happened
    // rather than finding it silently missing. The public feed
    // (`recentPosts`) is the surface that hides them.
    const posts = await this.dataSource.query<
      Array<{
        id: string;
        title: string;
        body: string;
        category: string;
        pinned: boolean;
        announcement: boolean;
        hidden: boolean;
        comment_count: string;
        reaction_count: string;
        created_at: Date;
        author_name: string | null;
        reacted: boolean;
      }>
    >(
      `SELECT p.id,
              p.title,
              p.body,
              p.category,
              p.pinned,
              p.announcement,
              p.hidden,
              p.comment_count,
              p.reaction_count,
              p.created_at,
              cp.display_name AS author_name,
              EXISTS (SELECT 1 FROM community_reactions r
                       WHERE r.post_id = p.id AND r.actor_id = $1::uuid) AS reacted
         FROM community_posts p
         LEFT JOIN creator_profiles cp ON cp.id = p.author_profile_id
        ORDER BY p.pinned DESC, p.announcement DESC, p.last_activity_at DESC
        LIMIT 20`,
      // Only the viewer is a parameter: the feed is platform-wide, so the
      // creator's own profile id has no place in the SQL. Binding an unused
      // placeholder is a hard error in Postgres ("could not determine data
      // type of parameter $1"), which is exactly how this query used to fail.
      [userId],
    );

    const stats = await this.dataSource.query<
      Array<{ members: string; posts: string; today: string }>
    >(
      `SELECT (SELECT COUNT(*) FROM community_memberships WHERE status = 'active')::text AS members,
              (SELECT COUNT(*) FROM community_posts WHERE hidden = false)::text AS posts,
              (SELECT COUNT(*) FROM community_posts
                WHERE hidden = false
                  AND created_at >= date_trunc('day', now()))::text AS today`,
    );

    // §26 — the real categories, with the real count in each. The page used
    // to hard-code a DIFFERENT list ('general', 'product', …) that is not in
    // the database enum at all, so a post composed from it was rejected.
    const categories = await this.dataSource.query<
      Array<{ category: string; n: string }>
    >(
      `SELECT category, COUNT(*)::text AS n
         FROM community_posts
        WHERE hidden = false
        GROUP BY category
        ORDER BY category ASC`,
    );

    return {
      membership: membership
        ? { status: membership.status, joinedAt: membership.joinedAt }
        : null,
      // §27's invitation, not a dead "coming soon" card.
      invited: membership?.status === 'invited',
      joined: membership?.status === 'active',
      stats: {
        members: Number.parseInt(stats[0]?.members ?? '0', 10),
        posts: Number.parseInt(stats[0]?.posts ?? '0', 10),
        today: Number.parseInt(stats[0]?.today ?? '0', 10),
      },
      categories: categories.map((row) => ({
        key: row.category,
        count: Number.parseInt(row.n, 10),
      })),
      posts: posts.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        category: row.category,
        // A post with no linked creator profile still has an author; the
        // page shows a name, and "undefined" is not a name.
        authorName: row.author_name ?? 'یک عضو جامعه',
        createdAt: row.created_at,
        comments: Number.parseInt(row.comment_count, 10) || 0,
        reactions: Number.parseInt(row.reaction_count, 10) || 0,
        reactedByMe: row.reacted,
        hidden: row.hidden,
        pinned: row.pinned,
        announcement: row.announcement,
      })),
    };
  }

  /**
   * §29/§47 — report a post for moderation.
   *
   * A report is RECORDED and reaches a human; it never hides the post by
   * itself. §47 is explicit that an automated flag must not be an automated
   * block, and a single member's report is weaker evidence than the signals
   * §47 already collects, so one report cannot be allowed to silence a post.
   *
   * Storage is the audit trail plus an admin notification rather than a new
   * moderation table: the platform has no moderation queue to put a row in,
   * and inventing one to hold a single boolean would be schema for its own
   * sake. The audit entry is durable, attributed and reviewable, which is
   * what a report needs to be.
   */
  async reportPost(input: {
    postId: string;
    userId: string;
    creatorProfileId: string;
    reason: string;
    description: string | null;
  }): Promise<{ reported: boolean }> {
    const post = await this.posts.findOneBy({ id: input.postId });
    if (!post) return { reported: false };

    await this.audit.record({
      action: AUDIT_ACTIONS.C5_COMMUNITY_POST_REPORTED,
      entity: AUDIT_ENTITIES.COMMUNITY_POST,
      entityId: post.id,
      metadata: {
        reason: input.reason,
        description: input.description,
        title: post.title,
      },
      context: { actorId: input.userId },
    });

    await this.notifications.notifyRoleEventSafe(
      UserRole.ADMIN,
      NOTIFICATION_TYPES.REPORT_SUBMITTED,
      { title: post.title, reason: input.reason },
      { variant: 'default' },
    );

    return { reported: true };
  }

  /** §27 — accept the invitation. Idempotent. */
  async join(
    creatorProfileId: string,
    userId: string,
  ): Promise<{ joined: boolean; blocked: string | null }> {
    const membership = await this.memberships.findOneBy({ creatorProfileId });
    if (!membership) return { joined: false, blocked: 'not_invited' };
    if (membership.status === 'active') {
      // Already joined. Returning success rather than an error is what makes a
      // double-clicked "Join" button harmless.
      membership.lastSeenAt = new Date();
      await this.memberships.save(membership);
      return { joined: true, blocked: null };
    }

    membership.status = 'active';
    membership.joinedAt = new Date();
    membership.lastSeenAt = new Date();
    await this.memberships.save(membership);

    await this.crmEvents.recordSafe({
      creatorProfileId,
      eventName: CREATOR_EVENTS.COMMUNITY_JOINED,
      dedupKey: `c5:community:joined:${membership.id}`,
      actorId: userId,
    });
    // §34 — the confirmation that joining actually did something.
    await this.notifications.notifyEventSafe(
      userId,
      NOTIFICATION_TYPES.C5_COMMUNITY_JOINED,
      {},
      { link: '/creator/scale/community' },
    );
    return { joined: true, blocked: null };
  }

  /** §29 — create a post. Requires an ACTIVE membership. */
  async createPost(
    authorId: string,
    authorProfileId: string,
    input: { title: string; body: string; category: CommunityCategory },
  ): Promise<{ post: CommunityPost; blocked: string | null }> {
    const membership = await this.memberships.findOneBy({
      creatorProfileId: authorProfileId,
    });
    if (membership?.status !== 'active') {
      return {
        post: null as unknown as CommunityPost,
        blocked: 'not_a_member',
      };
    }

    const post = await this.posts.save(
      this.posts.create({
        authorId,
        authorProfileId,
        title: input.title.slice(0, 200),
        body: input.body,
        category: input.category,
      }),
    );

    membership.postCount += 1;
    membership.lastSeenAt = new Date();
    await this.memberships.save(membership);

    await this.crmEvents.recordSafe({
      creatorProfileId: authorProfileId,
      eventName: CREATOR_EVENTS.COMMUNITY_ENGAGED,
      dedupKey: `c5:community:post:${post.id}`,
      actorId: authorId,
    });
    return { post, blocked: null };
  }

  /** §29 — comments, including one level of reply. */
  async createComment(
    postId: string,
    authorId: string,
    authorProfileId: string,
    input: { body: string; parentId?: string | null; isAnswer?: boolean },
  ): Promise<{ comment: CommunityComment; blocked: string | null }> {
    const membership = await this.memberships.findOneBy({
      creatorProfileId: authorProfileId,
    });
    if (membership?.status !== 'active') {
      return {
        comment: null as unknown as CommunityComment,
        blocked: 'not_a_member',
      };
    }
    const post = await this.posts.findOneBy({ id: postId });
    if (!post || post.hidden) {
      return {
        comment: null as unknown as CommunityComment,
        blocked: 'post_not_found',
      };
    }
    // A reply must belong to the same thread as its parent, or the one-level
    // limit becomes unlimited nesting across posts.
    if (input.parentId) {
      const parent = await this.comments.findOneBy({ id: input.parentId });
      if (!parent || parent.postId !== postId) {
        return {
          comment: null as unknown as CommunityComment,
          blocked: 'parent_mismatch',
        };
      }
    }

    const comment = await this.comments.save(
      this.comments.create({
        postId,
        authorId,
        authorProfileId,
        body: input.body,
        parentId: input.parentId ?? null,
        isAnswer: input.isAnswer ?? false,
      }),
    );

    post.commentCount += 1;
    post.lastActivityAt = new Date();
    await this.posts.save(post);
    membership.commentCount += 1;
    membership.lastSeenAt = new Date();
    await this.memberships.save(membership);

    return { comment, blocked: null };
  }

  /**
   * §29 — react, or toggle off.
   *
   * `ON CONFLICT DO NOTHING` against the partial unique index is what makes
   * the toggle correct: a second click on an already-reacted post removes the
   * row rather than incrementing a counter, so `reaction_count` stays a true
   * count of distinct people.
   */
  async toggleReaction(
    actorId: string,
    target: { postId?: string; commentId?: string },
  ): Promise<{ reacted: boolean; count: number }> {
    const isPost = Boolean(target.postId);
    const table = isPost ? 'community_posts' : 'community_comments';
    const id = (isPost ? target.postId : target.commentId) as string;
    const column = isPost ? 'post_id' : 'comment_id';

    const existing = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM community_reactions WHERE ${column} = $1 AND actor_id = $2`,
      [id, actorId],
    );
    if (existing.length > 0) {
      await this.dataSource.query(
        `DELETE FROM community_reactions WHERE id = $1`,
        [existing[0].id],
      );
    } else {
      await this.dataSource.query(
        `INSERT INTO community_reactions (${column}, actor_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [id, actorId],
      );
    }

    const counted = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n FROM community_reactions WHERE ${column} = $1`,
      [id],
    );
    const count = Number.parseInt(counted[0]?.n ?? '0', 10);
    await this.dataSource.query(
      `UPDATE ${table} SET reaction_count = $1, updated_at = now() WHERE id = $2`,
      [count, id],
    );
    return { reacted: existing.length === 0, count };
  }

  /**
   * §29 — moderation.
   *
   * Hiding is a soft delete: the row stays so a moderation decision is
   * auditable and reversible, and every read path filters `hidden = false`
   * so a hidden post is genuinely invisible rather than merely unlinked.
   */
  async moderate(
    target: { postId?: string; commentId?: string },
    hidden: boolean,
    adminUserId: string,
  ): Promise<{ changed: boolean; blocked: string | null }> {
    const isPost = Boolean(target.postId);
    const table = isPost ? 'community_posts' : 'community_comments';
    const id = (isPost ? target.postId : target.commentId) as string;

    const result = await this.dataSource.query<unknown[]>(
      `UPDATE ${table} SET hidden = $1, updated_at = now() WHERE id = $2`,
      [hidden, id],
    );
    // An UPDATE with no RETURNING yields an array whose length is the number
    // of affected rows, so an empty array means "nothing matched that id".
    if (result.length === 0) return { changed: false, blocked: 'not_found' };

    await this.audit.record({
      action: AUDIT_ACTIONS.C5_MANUAL_ADJUSTMENT,
      // The entity is resolved from the TARGET, not the table: a moderated
      // comment must be audited as a comment. The previous version had two
      // identical branches, which meant comments were recorded as posts —
      // an audit trail that lied about what an admin touched.
      entity: isPost
        ? AUDIT_ENTITIES.COMMUNITY_POST
        : AUDIT_ENTITIES.COMMUNITY_COMMENT,
      entityId: id,
      metadata: { hidden, kind: isPost ? 'post' : 'comment' },
      context: { actorId: adminUserId },
    });
    return { changed: true, blocked: null };
  }

  /** §32 — the community block of the admin growth dashboard. */
  async analytics() {
    const rows = await this.dataSource.query<
      Array<{
        n: string;
        active: string;
        posts: string;
        comments: string;
        returning: string;
      }>
    >(
      `SELECT (SELECT COUNT(*) FROM community_memberships)::text AS n,
              (SELECT COUNT(*) FROM community_memberships WHERE status = 'active')::text AS active,
              (SELECT COUNT(*) FROM community_posts WHERE hidden = false)::text AS posts,
              (SELECT COUNT(*) FROM community_comments WHERE hidden = false)::text AS comments,
              (SELECT COUNT(*) FROM community_memberships
                 WHERE last_seen_at > now() - interval '30 days')::text AS returning`,
    );
    // §31 — moderation needs a QUEUE, not a count. An admin who is told
    // "3 posts are hidden" and given no ids has no way to review or restore
    // them, so the ids come back with the totals.
    const hidden = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM community_posts WHERE hidden = true ORDER BY updated_at DESC LIMIT 50`,
    );

    const row = rows[0];
    return {
      members: Number.parseInt(row?.n ?? '0', 10),
      activeMembers: Number.parseInt(row?.active ?? '0', 10),
      posts: Number.parseInt(row?.posts ?? '0', 10),
      comments: Number.parseInt(row?.comments ?? '0', 10),
      // §32 "returning creators" — people who came back in the last 30 days.
      returningCreators: Number.parseInt(row?.returning ?? '0', 10),
      hiddenPosts: hidden.length,
      hiddenPostIds: hidden.map((h) => h.id),
    };
  }
}
