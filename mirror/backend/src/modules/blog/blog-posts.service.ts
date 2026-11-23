import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  buildPaginationMeta,
  type PaginationMeta,
} from '../../common/dto/pagination.dto';
import { ApiException } from '../../common/errors/api-error';
import { slugifyProduct } from '../../common/utils/slug';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import { BlogCategory } from '../../database/entities/blog/blog-category.entity';
import {
  BLOG_REVISION_COALESCE_MS,
  BLOG_REVISION_LIMIT,
  BlogPostAgent,
  BlogPostMarketCategory,
  BlogPostRelation,
  BlogPostRevision,
  BlogPostTag,
  BlogSlugRedirect,
  type BlogRevisionReason,
  type BlogRevisionSnapshot,
} from '../../database/entities/blog/blog-post-links.entity';
import { BlogPost } from '../../database/entities/blog/blog-post.entity';
import { BlogTag } from '../../database/entities/blog/blog-tag.entity';
import {
  Category,
  CategoryStatus,
} from '../../database/entities/catalog/category.entity';
import { User, UserRole } from '../../database/entities/identity/user.entity';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import {
  adminRow,
  adminUserRef,
  type AdminBlogPostDetail,
  type AdminBlogPostRow,
  type BlogReadinessIssue,
} from './blog-serializers';
import { buildSearchText, foldSearchText } from './domain/blog-search';
import { conflict, invalid, notFound } from './blog-taxonomy.service';
import { ContentLinksService } from '../seo/content-links.service';
import {
  ContentLink,
  ContentSeo,
  LinkSuggestion,
} from '../../database/entities/seo';
import {
  renderBlogMarkdown,
  type BlogRenderedBody,
} from './domain/blog-markdown';
import {
  BLOG_TRANSITIONS,
  availableActions,
  canTransition,
  DELETABLE_STATUSES,
  type BlogWorkflowAction,
} from './domain/blog-status';
import type {
  BlogPostInputDto,
  BulkBlogPostsDto,
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  UpdateBlogPostDto,
} from './dto/blog-admin.dto';

export interface BlogRevisionRow {
  id: string;
  version: number;
  reason: BlogRevisionReason;
  createdAt: string;
  createdBy: { id: string; name: string; username: string | null } | null;
  title: string;
  wordCount: number;
}

export interface BlogOverview {
  byStatus: Record<string, number>;
  featured: number;
  /** Published more than 180 days ago and not updated since — refresh candidates. */
  stale: number;
  scheduledNext: {
    id: string;
    slug: string;
    title: string;
    scheduledFor: string;
  } | null;
  categories: number;
  tags: number;
}

/**
 * Blog platform — the CMS side of articles.
 *
 * Everything that changes a post goes through here so the invariants live in
 * one place: unique slugs with redirects, server-enforced workflow, optimistic
 * concurrency, bounded revisions, validated marketplace references and an
 * audit record for every consequential step.
 */
@Injectable()
export class BlogPostsService {
  constructor(
    @InjectRepository(BlogPost) private readonly posts: Repository<BlogPost>,
    @InjectRepository(BlogPostRevision)
    private readonly revisions: Repository<BlogPostRevision>,
    @InjectRepository(BlogSlugRedirect)
    private readonly redirects: Repository<BlogSlugRedirect>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly contentLinks: ContentLinksService,
  ) {}

  // ---- scheduling ---------------------------------------------------------

  /**
   * Promotes due scheduled posts. Idempotent and cheap (partial index on
   * scheduled rows), so it runs lazily before public and admin reads instead
   * of needing a scheduler process. `publishedAt` becomes the scheduled
   * instant — the moment the article actually became visible.
   */
  async promoteDue(): Promise<number> {
    const res = await this.posts
      .createQueryBuilder()
      .update(BlogPost)
      .set({
        status: 'published',
        publishedAt: () => 'COALESCE(published_at, scheduled_for)',
        scheduledFor: null,
      })
      .where(`status = 'scheduled' AND scheduled_for <= now()`)
      .returning('id')
      .execute();
    const promoted = (res.raw as Array<{ id: string }>).map((r) => r.id);
    for (const id of promoted) {
      await this.contentLinks.refreshTarget(
        this.dataSource.manager,
        'post',
        id,
        true,
      );
    }
    return res.affected ?? 0;
  }

  // ---- reads --------------------------------------------------------------

  private baseQuery() {
    return this.posts
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .leftJoinAndSelect('p.reviewer', 'reviewer')
      .leftJoinAndSelect('p.primaryCategory', 'category');
  }

  async list(
    query: ListBlogPostsQueryDto,
  ): Promise<{ items: AdminBlogPostRow[]; meta: PaginationMeta }> {
    await this.promoteDue();
    const qb = this.baseQuery();
    if (query.status)
      qb.andWhere('p.status = :status', { status: query.status });
    if (query.category)
      qb.andWhere('p.primaryCategoryId = :category', {
        category: query.category,
      });
    if (query.author)
      qb.andWhere('p.authorUserId = :author', { author: query.author });
    if (query.featured !== undefined)
      qb.andWhere('p.isFeatured = :featured', { featured: query.featured });
    if (query.tag) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM blog_post_tags pt WHERE pt.post_id = p.id AND pt.tag_id = :tag)',
        {
          tag: query.tag,
        },
      );
    }
    if (query.q) {
      // search_text is stored folded — fold the needle the same way.
      const needle = `%${escapeLike(foldSearchText(query.q))}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('p.searchText ILIKE :needle', { needle }).orWhere(
            'p.slug ILIKE :needle',
            { needle },
          );
        }),
      );
    }
    switch (query.sort) {
      case 'created':
        qb.orderBy('p.createdAt', 'DESC');
        break;
      case 'published':
        qb.orderBy('p.publishedAt', 'DESC', 'NULLS LAST');
        break;
      case 'title':
        qb.orderBy('p.title', 'ASC');
        break;
      default:
        qb.orderBy('p.updatedAt', 'DESC');
    }
    qb.addOrderBy('p.id', 'ASC');
    const [rows, total] = await qb
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return {
      items: rows.map(adminRow),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  async findEntity(id: string, em?: EntityManager): Promise<BlogPost> {
    const repo = em ? em.getRepository(BlogPost) : this.posts;
    const post = await repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .leftJoinAndSelect('p.reviewer', 'reviewer')
      .leftJoinAndSelect('p.primaryCategory', 'category')
      .where('p.id = :id', { id })
      .getOne();
    if (!post) throw notFound('Article not found');
    return post;
  }

  async detail(id: string): Promise<AdminBlogPostDetail> {
    await this.promoteDue();
    const post = await this.findEntity(id);
    const [tags, related, agents, marketCategories, revisionCount, redirects] =
      await Promise.all([
        this.dataSource
          .getRepository(BlogPostTag)
          .find({ where: { postId: id } }),
        this.dataSource
          .getRepository(BlogPostRelation)
          .find({ where: { postId: id }, order: { position: 'ASC' } }),
        this.dataSource
          .getRepository(BlogPostAgent)
          .find({ where: { postId: id }, order: { position: 'ASC' } }),
        this.dataSource
          .getRepository(BlogPostMarketCategory)
          .find({ where: { postId: id }, order: { position: 'ASC' } }),
        this.revisions.count({ where: { postId: id } }),
        this.redirects.find({ where: { postId: id } }),
      ]);
    const tagIds = tags.map((t) => t.tagId);
    const relatedIds = related.map((r) => r.relatedPostId);
    const agentIds = agents.map((a) => a.agentId);
    const marketIds = marketCategories.map((c) => c.categoryId);
    const [tagRows, relatedRows, pillarRow, agentRows, marketRows] =
      await Promise.all([
        tagIds.length
          ? this.dataSource
              .getRepository(BlogTag)
              .find({ where: { id: In(tagIds) } })
          : [],
        relatedIds.length
          ? this.posts.find({
              where: { id: In(relatedIds) },
              select: ['id', 'title', 'slug', 'status'],
            })
          : [],
        post.pillarPostId
          ? this.posts.findOne({
              where: { id: post.pillarPostId },
              select: ['id', 'title', 'slug', 'status'],
            })
          : null,
        agentIds.length
          ? this.dataSource.getRepository(Agent).find({
              where: { id: In(agentIds) },
              select: ['id', 'name', 'slug', 'status'],
            })
          : [],
        marketIds.length
          ? this.dataSource.getRepository(Category).find({
              where: { id: In(marketIds) },
              select: ['id', 'name', 'nameFa', 'slug'],
            })
          : [],
      ]);
    const order = <T extends { id: string }>(ids: string[], rows: T[]): T[] =>
      ids
        .map((id) => rows.find((r) => r.id === id))
        .filter((r): r is T => r !== undefined);
    return {
      ...adminRow(post),
      excerpt: post.excerpt,
      bodyMarkdown: post.bodyMarkdown,
      blocks: post.bodyBlocks,
      toc: post.toc,
      featuredImageUrl: post.featuredImageUrl,
      featuredImageAlt: post.featuredImageAlt,
      featuredImageCaption: post.featuredImageCaption,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      canonicalUrl: post.canonicalUrl,
      ogImageUrl: post.ogImageUrl,
      pillarPostId: post.pillarPostId,
      editorialNote: post.editorialNote,
      sources: post.sources,
      tagIds: tags.map((t) => t.tagId),
      relatedPostIds: related.map((r) => r.relatedPostId),
      agentIds: agents.map((a) => a.agentId),
      marketCategoryIds: marketCategories.map((c) => c.categoryId),
      availableActions: availableActions(post.status),
      readiness: this.readiness(post),
      revisionCount,
      redirects: redirects.map((r) => r.oldSlug),
      refs: {
        tags: order(tagIds, tagRows).map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
        })),
        related: order(relatedIds, relatedRows).map((r) => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          status: r.status,
        })),
        pillar: pillarRow
          ? {
              id: pillarRow.id,
              title: pillarRow.title,
              slug: pillarRow.slug,
              status: pillarRow.status,
            }
          : null,
        agents: order(agentIds, agentRows).map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          status: a.status,
        })),
        marketCategories: order(marketIds, marketRows).map((c) => ({
          id: c.id,
          name: c.name,
          nameFa: c.nameFa ?? null,
          slug: c.slug,
        })),
      },
    };
  }

  async overview(): Promise<BlogOverview> {
    await this.promoteDue();
    const [statusRows, featured, stale, next, categories, tags] =
      await Promise.all([
        this.dataSource.query<Array<{ status: string; n: string }>>(
          `SELECT status, COUNT(*)::text AS n FROM blog_posts GROUP BY status`,
        ),
        this.posts.count({ where: { isFeatured: true, status: 'published' } }),
        this.dataSource.query<Array<{ n: string }>>(
          `SELECT COUNT(*)::text AS n FROM blog_posts
          WHERE status = 'published'
            AND COALESCE(content_updated_at, published_at) < now() - interval '180 days'`,
        ),
        this.posts.findOne({
          where: { status: 'scheduled' },
          order: { scheduledFor: 'ASC' },
        }),
        this.dataSource.getRepository(BlogCategory).count(),
        this.dataSource.getRepository(BlogTag).count(),
      ]);
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status] = Number(r.n);
    return {
      byStatus,
      featured,
      stale: Number(stale[0]?.n ?? 0),
      scheduledNext:
        next && next.scheduledFor
          ? {
              id: next.id,
              slug: next.slug,
              title: next.title,
              scheduledFor: next.scheduledFor.toISOString(),
            }
          : null,
      categories,
      tags,
    };
  }

  /** Users who may be credited as authors/reviewers: platform staff. */
  async authorCandidates(
    q?: string,
  ): Promise<Array<{ id: string; name: string; username: string | null }>> {
    const qb = this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .where(
        new Brackets((w) => {
          w.where('u.role = :admin', { admin: UserRole.ADMIN }).orWhere(
            'EXISTS (SELECT 1 FROM admin_role_assignments a WHERE a.user_id = u.id AND a.revoked_at IS NULL)',
          );
        }),
      )
      .orderBy('u.fullName', 'ASC', 'NULLS LAST')
      .addOrderBy('u.username', 'ASC')
      .take(50);
    if (q) {
      const needle = `%${escapeLike(q.toLowerCase())}%`;
      qb.andWhere(
        '(lower(u.fullName) LIKE :needle OR lower(u.username) LIKE :needle)',
        { needle },
      );
    }
    const users = await qb.getMany();
    return users
      .map((u) => adminUserRef(u))
      .filter((u): u is NonNullable<typeof u> => u !== null);
  }

  render(markdown: string): BlogRenderedBody {
    return renderBlogMarkdown(markdown);
  }

  // ---- writes -------------------------------------------------------------

  async create(
    dto: CreateBlogPostDto,
    actorId: string,
  ): Promise<AdminBlogPostDetail> {
    const id = await this.dataSource.transaction(async (em) => {
      const slug = await this.resolveNewSlug(em, dto.slug, dto.title);
      const post = em.getRepository(BlogPost).create({
        slug,
        title: dto.title,
        excerpt: dto.excerpt ?? '',
        bodyMarkdown: dto.bodyMarkdown ?? '',
        authorUserId:
          dto.authorUserId === undefined ? actorId : dto.authorUserId,
        status: 'draft',
        version: 1,
        createdBy: actorId,
        updatedBy: actorId,
        sources: [],
      });
      await this.applyInput(em, post, dto, { creating: true });
      this.applyRender(post);
      post.contentUpdatedAt = new Date();
      const saved = await em.getRepository(BlogPost).save(post);
      await this.replaceRelations(em, saved.id, dto);
      await this.contentLinks.sync(em, 'post', saved.id, saved.bodyBlocks);
      await this.writeRevision(em, saved, 'create', actorId);
      return saved.id;
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_POST_CREATED,
      entity: AUDIT_ENTITIES.BLOG_POST,
      entityId: id,
      context: { actorId },
    });
    return this.detail(id);
  }

  async update(
    id: string,
    dto: UpdateBlogPostDto,
    actorId: string,
  ): Promise<AdminBlogPostDetail> {
    let slugChange = null as { from: string; to: string } | null;
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(BlogPost);
      const post = await repo
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id })
        .getOne();
      if (!post) throw notFound('Article not found');
      if (post.version !== dto.version) {
        throw new ApiException(
          'STALE_STATE',
          'This article was changed by someone else since you opened it. Reload to see the latest version.',
          HttpStatus.CONFLICT,
          {
            currentVersion: post.version,
            updatedAt: post.updatedAt.toISOString(),
            updatedBy: post.updatedBy,
          },
        );
      }
      if (
        dto.autosave &&
        (post.status === 'published' || post.status === 'scheduled')
      ) {
        throw invalid(
          'autosave is only available for drafts; save a live article explicitly',
        );
      }
      const before = snapshotOf(post);
      if (dto.slug !== undefined && dto.slug !== post.slug) {
        await this.assertSlugFree(em, dto.slug, post.id);
        slugChange = { from: post.slug, to: dto.slug };
      }
      await this.applyInput(em, post, dto, { creating: false });
      const after = snapshotOf(post);
      const contentChanged = JSON.stringify(before) !== JSON.stringify(after);
      if (contentChanged) {
        this.applyRender(post);
        post.contentUpdatedAt = new Date();
      }
      post.version += 1;
      post.updatedBy = actorId;
      await repo.save(post);
      await this.replaceRelations(em, post.id, dto);
      if (contentChanged)
        await this.contentLinks.sync(em, 'post', post.id, post.bodyBlocks);
      if (slugChange)
        await this.recordSlugChange(em, post, slugChange.from, slugChange.to);
      if (contentChanged && !dto.autosave)
        await this.writeRevision(em, post, 'save', actorId);
    });
    if (slugChange) {
      await this.audit.record({
        action: AUDIT_ACTIONS.BLOG_POST_SLUG_CHANGED,
        entity: AUDIT_ENTITIES.BLOG_POST,
        entityId: id,
        metadata: { from: slugChange.from, to: slugChange.to },
        context: { actorId },
      });
    }
    return this.detail(id);
  }

  /**
   * Server-enforced workflow step. `publish`/`schedule` run the readiness
   * checklist; `publish` sets `publishedAt` only the first time.
   */
  async transition(
    id: string,
    action: BlogWorkflowAction,
    actorId: string,
    opts: { scheduledFor?: string; note?: string | null } = {},
  ): Promise<AdminBlogPostDetail> {
    let from = '';
    let to = '';
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(BlogPost);
      const post = await repo
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id })
        .getOne();
      if (!post) throw notFound('Article not found');
      if (!canTransition(post.status, action)) {
        throw new ApiException(
          'INVALID_TRANSITION',
          `Cannot ${action.replace('_', ' ')} an article that is ${post.status.replace('_', ' ')}`,
          HttpStatus.CONFLICT,
          {
            status: post.status,
            action,
            allowed: availableActions(post.status),
          },
        );
      }
      from = post.status;
      const target = BLOG_TRANSITIONS[action].to;
      if (action === 'publish' || action === 'schedule') {
        const errors = this.readiness(post).filter(
          (i) => i.severity === 'error',
        );
        if (errors.length) {
          throw new ApiException(
            'PUBLISH_CHECKLIST_FAILED',
            'The article is not ready to be published',
            HttpStatus.UNPROCESSABLE_ENTITY,
            { issues: errors },
          );
        }
      }
      const now = new Date();
      if (action === 'schedule') {
        const when = opts.scheduledFor ? new Date(opts.scheduledFor) : null;
        if (!when || Number.isNaN(when.getTime()))
          throw invalid('scheduledFor is required');
        if (when.getTime() <= now.getTime() + 30_000) {
          throw invalid(
            'scheduledFor must be in the future — use publish for immediate publication',
          );
        }
        if (when.getTime() > now.getTime() + 366 * 24 * 3600 * 1000) {
          throw invalid('scheduledFor must be within the next year');
        }
        post.scheduledFor = when;
      } else {
        post.scheduledFor = null;
      }
      if (action === 'publish') {
        post.publishedAt = post.publishedAt ?? now;
        if (!post.contentUpdatedAt) post.contentUpdatedAt = now;
      }
      if (action === 'request_changes' || action === 'unpublish') {
        post.editorialNote = opts.note ?? post.editorialNote;
      }
      if (action === 'request_changes' || action === 'publish') {
        post.reviewerUserId = post.reviewerUserId ?? actorId;
      }
      post.status = target;
      to = target;
      post.version += 1;
      post.updatedBy = actorId;
      await repo.save(post);
      // Links pointing here flip between ok/unpublished with the status.
      await this.contentLinks.refreshTarget(
        em,
        'post',
        post.id,
        target === 'published',
      );
      if (action === 'publish')
        await this.writeRevision(em, post, 'publish', actorId, true);
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_POST_STATUS_CHANGED,
      entity: AUDIT_ENTITIES.BLOG_POST,
      entityId: id,
      metadata: { action, from, to, scheduledFor: opts.scheduledFor ?? null },
      context: { actorId },
    });
    return this.detail(id);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const post = await this.posts.findOne({ where: { id } });
    if (!post) throw notFound('Article not found');
    if (!DELETABLE_STATUSES.includes(post.status)) {
      throw new ApiException(
        'INVALID_STATE',
        'A published article must be unpublished before it can be deleted',
        HttpStatus.CONFLICT,
        { status: post.status },
      );
    }
    await this.dataSource.transaction(async (em) => {
      await em.getRepository(BlogPost).delete({ id }); // tags, relations, revisions, redirects cascade
      // Polymorphic tables have no FK: clean our rows and mark inbound links broken.
      await this.contentLinks.removeSource(em, 'post', id);
      await em
        .getRepository(ContentLink)
        .update(
          { targetType: 'post', targetId: id },
          { status: 'broken', checkedAt: new Date() },
        );
      await em
        .getRepository(ContentSeo)
        .delete({ contentType: 'post', contentId: id });
      await em
        .getRepository(LinkSuggestion)
        .delete({ sourceType: 'post', sourceId: id });
      await em
        .getRepository(LinkSuggestion)
        .delete({ targetType: 'post', targetId: id });
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_POST_DELETED,
      entity: AUDIT_ENTITIES.BLOG_POST,
      entityId: id,
      metadata: { slug: post.slug, status: post.status, title: post.title },
      context: { actorId },
    });
  }

  /**
   * Bulk actions are a loop of the single-item rules — a post that cannot
   * take the action is reported as skipped, never silently forced.
   */
  async bulk(
    dto: BulkBlogPostsDto,
    actorId: string,
  ): Promise<{
    done: string[];
    skipped: Array<{ id: string; reason: string }>;
  }> {
    const done: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    if (dto.action === 'set_category' && dto.categoryId) {
      const exists = await this.dataSource
        .getRepository(BlogCategory)
        .exists({ where: { id: dto.categoryId } });
      if (!exists) throw invalid('categoryId does not exist');
    }
    for (const id of [...new Set(dto.ids)]) {
      try {
        if (dto.action === 'unpublish' || dto.action === 'archive') {
          await this.transition(id, dto.action, actorId);
        } else {
          const post = await this.posts.findOne({ where: { id } });
          if (!post) throw notFound('Article not found');
          if (dto.action === 'feature') post.isFeatured = true;
          if (dto.action === 'unfeature') post.isFeatured = false;
          if (dto.action === 'set_category')
            post.primaryCategoryId = dto.categoryId ?? null;
          post.version += 1;
          post.updatedBy = actorId;
          await this.posts.save(post);
        }
        done.push(id);
      } catch (err) {
        skipped.push({
          id,
          reason: err instanceof ApiException ? err.message : 'failed',
        });
      }
    }
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_POST_BULK_ACTION,
      entity: AUDIT_ENTITIES.BLOG_POST,
      metadata: {
        action: dto.action,
        done: done.length,
        skipped: skipped.length,
      },
      context: { actorId },
    });
    return { done, skipped };
  }

  // ---- revisions ----------------------------------------------------------

  async listRevisions(postId: string): Promise<BlogRevisionRow[]> {
    await this.findEntity(postId);
    const rows = await this.revisions.find({
      where: { postId },
      relations: { creator: true },
      order: { createdAt: 'DESC' },
      take: BLOG_REVISION_LIMIT,
    });
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      createdBy: adminUserRef(r.creator),
      title: r.snapshot.title,
      wordCount: renderBlogMarkdown(r.snapshot.bodyMarkdown).wordCount,
    }));
  }

  async getRevision(
    postId: string,
    revisionId: string,
  ): Promise<BlogPostRevision> {
    const rev = await this.revisions.findOne({
      where: { id: revisionId, postId },
    });
    if (!rev) throw notFound('Revision not found');
    return rev;
  }

  /**
   * Restores the CONTENT of a revision as a new version (the history keeps
   * growing — a restore is never a destructive rewind). The slug is restored
   * only when it is still free, otherwise the current slug is kept.
   */
  async restoreRevision(
    postId: string,
    revisionId: string,
    actorId: string,
  ): Promise<AdminBlogPostDetail> {
    const rev = await this.getRevision(postId, revisionId);
    let slugChange = null as { from: string; to: string } | null;
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(BlogPost);
      const post = await repo
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: postId })
        .getOne();
      if (!post) throw notFound('Article not found');
      const s = rev.snapshot;
      post.title = s.title;
      post.excerpt = s.excerpt;
      post.bodyMarkdown = s.bodyMarkdown;
      post.featuredImageUrl = s.featuredImageUrl;
      post.featuredImageAlt = s.featuredImageAlt;
      post.featuredImageCaption = s.featuredImageCaption;
      post.seoTitle = s.seoTitle;
      post.seoDescription = s.seoDescription;
      post.canonicalUrl = s.canonicalUrl;
      post.ogImageUrl = s.ogImageUrl;
      post.sources = s.sources;
      if (s.slug !== post.slug) {
        const taken = await em
          .getRepository(BlogPost)
          .exists({ where: { slug: s.slug } });
        const redirectOfOther = await em
          .getRepository(BlogSlugRedirect)
          .findOne({ where: { oldSlug: s.slug } });
        if (
          !taken &&
          (!redirectOfOther || redirectOfOther.postId === post.id)
        ) {
          slugChange = { from: post.slug, to: s.slug };
          post.slug = s.slug;
        }
      }
      this.applyRender(post);
      post.contentUpdatedAt = new Date();
      post.version += 1;
      post.updatedBy = actorId;
      await repo.save(post);
      await this.contentLinks.sync(em, 'post', post.id, post.bodyBlocks);
      if (slugChange)
        await this.recordSlugChange(em, post, slugChange.from, slugChange.to);
      await this.writeRevision(em, post, 'restore', actorId, true);
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_POST_REVISION_RESTORED,
      entity: AUDIT_ENTITIES.BLOG_POST,
      entityId: postId,
      metadata: { revisionId, revisionVersion: rev.version },
      context: { actorId },
    });
    return this.detail(postId);
  }

  // ---- readiness ----------------------------------------------------------

  readiness(post: BlogPost): BlogReadinessIssue[] {
    const issues: BlogReadinessIssue[] = [];
    if (!post.title.trim())
      issues.push({ code: 'title_missing', severity: 'error' });
    if (!post.excerpt.trim())
      issues.push({ code: 'excerpt_missing', severity: 'error' });
    if (!post.bodyBlocks.length || post.wordCount === 0)
      issues.push({ code: 'body_empty', severity: 'error' });
    if (!post.primaryCategoryId)
      issues.push({ code: 'category_missing', severity: 'error' });
    if (!post.authorUserId)
      issues.push({ code: 'author_missing', severity: 'error' });
    if (post.featuredImageUrl && !post.featuredImageAlt?.trim()) {
      issues.push({ code: 'image_alt_missing', severity: 'error' });
    }
    if ((post.seoTitle ?? post.title).length > 60)
      issues.push({ code: 'seo_title_long', severity: 'warning' });
    if ((post.seoDescription ?? post.excerpt).length > 160) {
      issues.push({ code: 'seo_description_long', severity: 'warning' });
    }
    const warnings = renderBlogMarkdown(post.bodyMarkdown).warnings;
    if (warnings.length) {
      issues.push({
        code: 'content_warnings',
        severity: 'warning',
        detail: warnings.map((w) => `${w.code}@${w.line}`).join(','),
      });
    }
    return issues;
  }

  // ---- internals ----------------------------------------------------------

  private applyRender(post: BlogPost): void {
    const rendered = renderBlogMarkdown(post.bodyMarkdown);
    post.bodyBlocks = rendered.blocks;
    post.toc = rendered.toc;
    post.wordCount = rendered.wordCount;
    post.readingMinutes = rendered.readingMinutes;
    // Folded (Persian canonical form, see domain/blog-search.ts) so a reader's
    // spelling variant still matches; the back-fill migration applies the
    // same fold to rows rendered before this.
    post.searchText = buildSearchText(
      post.title,
      post.excerpt,
      rendered.plainText,
    );
  }

  private async applyInput(
    em: EntityManager,
    post: BlogPost,
    dto: BlogPostInputDto,
    { creating }: { creating: boolean },
  ): Promise<void> {
    if (dto.title !== undefined) post.title = dto.title;
    if (dto.slug !== undefined && !creating) post.slug = dto.slug;
    if (dto.excerpt !== undefined) post.excerpt = dto.excerpt;
    if (dto.bodyMarkdown !== undefined) post.bodyMarkdown = dto.bodyMarkdown;
    if (dto.featuredImageUrl !== undefined)
      post.featuredImageUrl = dto.featuredImageUrl;
    if (dto.featuredImageAlt !== undefined)
      post.featuredImageAlt = dto.featuredImageAlt;
    if (dto.featuredImageCaption !== undefined)
      post.featuredImageCaption = dto.featuredImageCaption;
    if (dto.seoTitle !== undefined) post.seoTitle = dto.seoTitle;
    if (dto.seoDescription !== undefined)
      post.seoDescription = dto.seoDescription;
    if (dto.canonicalUrl !== undefined) post.canonicalUrl = dto.canonicalUrl;
    if (dto.ogImageUrl !== undefined) post.ogImageUrl = dto.ogImageUrl;
    if (dto.isFeatured !== undefined) post.isFeatured = dto.isFeatured;
    if (dto.editorialNote !== undefined) post.editorialNote = dto.editorialNote;
    if (dto.sources !== undefined)
      post.sources = dto.sources.map((s) => ({ title: s.title, url: s.url }));

    if (dto.authorUserId !== undefined) {
      if (dto.authorUserId)
        await this.assertUser(em, dto.authorUserId, 'authorUserId');
      post.authorUserId = dto.authorUserId;
    }
    if (dto.reviewerUserId !== undefined) {
      if (dto.reviewerUserId)
        await this.assertUser(em, dto.reviewerUserId, 'reviewerUserId');
      post.reviewerUserId = dto.reviewerUserId;
    }
    if (dto.primaryCategoryId !== undefined) {
      if (dto.primaryCategoryId) {
        const exists = await em
          .getRepository(BlogCategory)
          .exists({ where: { id: dto.primaryCategoryId } });
        if (!exists)
          throw invalid('primaryCategoryId does not exist', {
            field: 'primaryCategoryId',
          });
      }
      post.primaryCategoryId = dto.primaryCategoryId;
    }
    if (dto.pillarPostId !== undefined) {
      if (dto.pillarPostId) {
        if (dto.pillarPostId === post.id)
          throw invalid('an article cannot be its own pillar', {
            field: 'pillarPostId',
          });
        const pillar = await em
          .getRepository(BlogPost)
          .findOne({ where: { id: dto.pillarPostId } });
        if (!pillar)
          throw invalid('pillarPostId does not exist', {
            field: 'pillarPostId',
          });
        if (pillar.pillarPostId)
          throw invalid('a supporting article cannot be a pillar', {
            field: 'pillarPostId',
          });
      }
      post.pillarPostId = dto.pillarPostId;
    }
  }

  private async assertUser(
    em: EntityManager,
    id: string,
    field: string,
  ): Promise<void> {
    const exists = await em.getRepository(User).exists({ where: { id } });
    if (!exists) throw invalid(`${field} does not exist`, { field });
  }

  /** Full replacement of each relation array that is present in the input. */
  private async replaceRelations(
    em: EntityManager,
    postId: string,
    dto: BlogPostInputDto,
  ): Promise<void> {
    if (dto.tagIds !== undefined) {
      const ids = [...new Set(dto.tagIds)];
      const found = await em.getRepository(BlogTag).count({
        where: {
          id: In(ids.length ? ids : ['00000000-0000-4000-8000-000000000000']),
        },
      });
      if (ids.length && found !== ids.length)
        throw invalid('one of tagIds does not exist', { field: 'tagIds' });
      await em.delete(BlogPostTag, { postId });
      if (ids.length)
        await em.insert(
          BlogPostTag,
          ids.map((tagId) => ({ postId, tagId })),
        );
    }
    if (dto.relatedPostIds !== undefined) {
      const ids = [...new Set(dto.relatedPostIds)].filter((x) => x !== postId);
      if (ids.length) {
        const found = await em
          .getRepository(BlogPost)
          .count({ where: { id: In(ids) } });
        if (found !== ids.length)
          throw invalid('one of relatedPostIds does not exist', {
            field: 'relatedPostIds',
          });
      }
      await em.delete(BlogPostRelation, { postId });
      if (ids.length) {
        await em.insert(
          BlogPostRelation,
          ids.map((relatedPostId, position) => ({
            postId,
            relatedPostId,
            position,
          })),
        );
      }
    }
    if (dto.agentIds !== undefined) {
      const ids = [...new Set(dto.agentIds)];
      if (ids.length) {
        // Only LIVE products can be referenced; the public API additionally
        // hides products that are taken down later.
        const live = await em
          .getRepository(Agent)
          .count({ where: { id: In(ids), status: AgentStatus.PUBLISHED } });
        if (live !== ids.length) {
          throw invalid(
            'agentIds must reference published marketplace products',
            { field: 'agentIds' },
          );
        }
      }
      await em.delete(BlogPostAgent, { postId });
      if (ids.length)
        await em.insert(
          BlogPostAgent,
          ids.map((agentId, position) => ({ postId, agentId, position })),
        );
    }
    if (dto.marketCategoryIds !== undefined) {
      const ids = [...new Set(dto.marketCategoryIds)];
      if (ids.length) {
        const active = await em
          .getRepository(Category)
          .count({ where: { id: In(ids), status: CategoryStatus.ACTIVE } });
        if (active !== ids.length) {
          throw invalid(
            'marketCategoryIds must reference active marketplace categories',
            {
              field: 'marketCategoryIds',
            },
          );
        }
      }
      await em.delete(BlogPostMarketCategory, { postId });
      if (ids.length) {
        await em.insert(
          BlogPostMarketCategory,
          ids.map((categoryId, position) => ({ postId, categoryId, position })),
        );
      }
    }
  }

  private async resolveNewSlug(
    em: EntityManager,
    requested: string | undefined,
    title: string,
  ): Promise<string> {
    if (requested) {
      await this.assertSlugFree(em, requested, null);
      return requested;
    }
    const base = (slugifyProduct(title) || 'article').slice(0, 120);
    let candidate = base;
    let n = 2;
    while (await this.slugTaken(em, candidate, null)) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    return candidate;
  }

  private async slugTaken(
    em: EntityManager,
    slug: string,
    selfId: string | null,
  ): Promise<boolean> {
    const post = await em.getRepository(BlogPost).findOne({ where: { slug } });
    if (post && post.id !== selfId) return true;
    const redirect = await em
      .getRepository(BlogSlugRedirect)
      .findOne({ where: { oldSlug: slug } });
    return Boolean(redirect && redirect.postId !== selfId);
  }

  private async assertSlugFree(
    em: EntityManager,
    slug: string,
    selfId: string | null,
  ): Promise<void> {
    if (await this.slugTaken(em, slug, selfId)) {
      throw conflict(
        `slug "${slug}" is already used by another article or kept as a redirect`,
        { slug },
      );
    }
  }

  /**
   * Keeps every URL an article was ever published under resolving. Moving
   * back to an old slug deletes that redirect row (it is live again), so
   * `old → post` rows never point at a slug that is itself a redirect.
   */
  private async recordSlugChange(
    em: EntityManager,
    post: BlogPost,
    from: string,
    to: string,
  ): Promise<void> {
    const repo = em.getRepository(BlogSlugRedirect);
    await repo.delete({ oldSlug: to });
    if (post.publishedAt) {
      await repo.upsert({ oldSlug: from, postId: post.id }, ['oldSlug']);
    }
  }

  private async writeRevision(
    em: EntityManager,
    post: BlogPost,
    reason: BlogRevisionReason,
    actorId: string,
    force = false,
  ): Promise<void> {
    const repo = em.getRepository(BlogPostRevision);
    if (!force && reason === 'save') {
      const last = await repo.findOne({
        where: { postId: post.id },
        order: { createdAt: 'DESC' },
      });
      if (
        last &&
        last.reason === 'save' &&
        last.createdBy === actorId &&
        Date.now() - last.createdAt.getTime() < BLOG_REVISION_COALESCE_MS
      ) {
        last.snapshot = snapshotOf(post);
        last.version = post.version;
        await repo.save(last);
        return;
      }
    }
    await repo.insert({
      postId: post.id,
      version: post.version,
      reason,
      snapshot: snapshotOf(post),
      createdBy: actorId,
    });
    // Bounded history: drop the oldest rows beyond the limit.
    await em.query(
      `DELETE FROM blog_post_revisions WHERE id IN (
         SELECT id FROM blog_post_revisions WHERE post_id = $1
          ORDER BY created_at DESC OFFSET $2)`,
      [post.id, BLOG_REVISION_LIMIT],
    );
  }
}

export function snapshotOf(post: BlogPost): BlogRevisionSnapshot {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    bodyMarkdown: post.bodyMarkdown,
    featuredImageUrl: post.featuredImageUrl ?? null,
    featuredImageAlt: post.featuredImageAlt ?? null,
    featuredImageCaption: post.featuredImageCaption ?? null,
    seoTitle: post.seoTitle ?? null,
    seoDescription: post.seoDescription ?? null,
    canonicalUrl: post.canonicalUrl ?? null,
    ogImageUrl: post.ogImageUrl ?? null,
    sources: post.sources ?? [],
  };
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}
