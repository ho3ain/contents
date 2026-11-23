import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { keywordKey, tokenize } from '../../common/utils/persian-normalize';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import {
  BlogCategory,
  BlogPost,
  BlogPostAgent,
  BlogPostRelation,
} from '../../database/entities/blog';
import {
  ContentLink,
  ContentSeo,
  LinkSuggestion,
  type SeoContentType,
  type SuggestionEvidence,
  type SuggestionReason,
} from '../../database/entities/seo';
import { BlogPostsService } from '../blog/blog-posts.service';
import { blocksPlainText } from '../blog/domain/blog-markdown';
import {
  anchorAvailable,
  unwrapLink,
  wrapFirstOccurrence,
} from './domain/markdown-link-edit';

export interface LinkMutationResult {
  applied: 'link' | 'relation';
  sourceId: string;
  targetId: string;
  href: string;
  anchor: string | null;
  version: number;
}

const STOPWORDS = new Set(
  'و در به از که با را این آن برای است یک های هر چه می شود کنیم کنید چطور چگونه چرا تا یا هم نیز اگر بر روی the a an and or of to for in on with how why what is are your you we our it its be can'.split(
    ' ',
  ),
);

const err = (
  code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'CONFLICT' | 'INVALID_STATE',
  message: string,
  status: HttpStatus,
  details?: Record<string, unknown>,
) => new ApiException(code, message, status, details);

/**
 * Internal-link suggestions computed from REAL data and the edits that apply
 * them. Content changes always go through `BlogPostsService.update` so the
 * normal pipeline (render, version bump, revision, link sync, audit) runs.
 */
@Injectable()
export class LinkSuggestionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(LinkSuggestion)
    private readonly suggestions: Repository<LinkSuggestion>,
    @InjectRepository(ContentLink)
    private readonly links: Repository<ContentLink>,
    @InjectRepository(ContentSeo)
    private readonly seoRows: Repository<ContentSeo>,
    private readonly posts: BlogPostsService,
  ) {}

  // ---- listing -------------------------------------------------------------

  async list(opts: {
    status?: string;
    sourceId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const qb = this.suggestions
      .createQueryBuilder('s')
      .orderBy('s.score', 'DESC')
      .addOrderBy('s.createdAt', 'DESC');
    if (opts.status) qb.andWhere('s.status = :status', { status: opts.status });
    if (opts.sourceId)
      qb.andWhere('s.source_id = :sourceId', { sourceId: opts.sourceId });
    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.sourceId);
      if (r.targetType === 'post') ids.add(r.targetId);
    }
    const posts = ids.size
      ? await this.dataSource.getRepository(BlogPost).find({
          where: { id: In([...ids]) },
          select: ['id', 'title', 'slug', 'status'],
        })
      : [];
    const agentIds = rows
      .filter((r) => r.targetType === 'agent')
      .map((r) => r.targetId);
    const agents = agentIds.length
      ? await this.dataSource.getRepository(Agent).find({
          where: { id: In(agentIds) },
          select: ['id', 'name', 'slug', 'status'],
        })
      : [];
    const postById = new Map(posts.map((p) => [p.id, p]));
    const agentById = new Map(agents.map((a) => [a.id, a]));
    const ref = (type: SeoContentType, id: string) => {
      if (type === 'post') {
        const p = postById.get(id);
        return p
          ? {
              type,
              id,
              title: p.title,
              path: `/blog/${p.slug}`,
              status: p.status,
            }
          : null;
      }
      const a = agentById.get(id);
      return a
        ? {
            type,
            id,
            title: a.name,
            path: `/agents/${a.slug}`,
            status: a.status,
          }
        : null;
    };
    return {
      items: rows.map((r) => ({
        id: r.id,
        reason: r.reason,
        score: r.score,
        status: r.status,
        evidence: r.evidence,
        source: ref(r.sourceType, r.sourceId),
        target: ref(r.targetType, r.targetId),
        createdAt: r.createdAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
      })),
      meta: { total, page, pageSize },
    };
  }

  // ---- generation ----------------------------------------------------------

  /**
   * Builds pending suggestions between published articles (and products
   * they could link to). Explainable reasons only; previously rejected pairs
   * are left alone; already-linked pairs are skipped.
   */
  async generate(opts: { sourceId?: string } = {}): Promise<{
    created: number;
    updated: number;
    skipped: number;
    sources: number;
  }> {
    const posts = await this.dataSource
      .getRepository(BlogPost)
      .find({ where: { status: 'published' } });
    const seo = await this.seoRows.find({
      where: { contentType: 'post', contentId: In(posts.map((p) => p.id)) },
    });
    const seoByPost = new Map(seo.map((r) => [r.contentId, r]));
    const categories = new Map(
      (await this.dataSource.getRepository(BlogCategory).find()).map((c) => [
        c.id,
        c,
      ]),
    );
    const existing = await this.links.find({
      where: { sourceType: 'post', sourceId: In(posts.map((p) => p.id)) },
    });
    const linked = new Set(
      existing
        .filter((l) => l.targetId)
        .map((l) => `${l.sourceId}>${l.targetType}:${l.targetId}`),
    );
    const relations = await this.dataSource
      .getRepository(BlogPostRelation)
      .find({ where: { postId: In(posts.map((p) => p.id)) } });
    for (const r of relations)
      linked.add(`${r.postId}>post:${r.relatedPostId}`);
    const inboundRows = await this.links
      .createQueryBuilder('l')
      .select('l.target_id', 'targetId')
      .addSelect('COUNT(DISTINCT l.source_id)', 'n')
      .innerJoin(
        BlogPost,
        'sp',
        `sp.id = l.source_id AND sp.status = 'published'`,
      )
      .where(
        `l.target_type = 'post' AND l.target_id IS NOT NULL AND l.source_id <> l.target_id`,
      )
      .groupBy('l.target_id')
      .getRawMany<{ targetId: string; n: string }>();
    const inbound = new Map(inboundRows.map((r) => [r.targetId, Number(r.n)]));

    const keywordsOf = (p: BlogPost) => {
      const r = seoByPost.get(p.id);
      const out = new Map<string, string>();
      if (r?.focusKeyword && r.focusKeywordKey)
        out.set(r.focusKeywordKey, r.focusKeyword);
      for (const k of r?.relatedKeywords ?? [])
        if (k.key && !out.has(k.key)) out.set(k.key, k.text);
      return out;
    };
    const titleWords = (p: BlogPost) =>
      new Set(
        tokenize(p.title).filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
      );

    const sources = opts.sourceId
      ? posts.filter((p) => p.id === opts.sourceId)
      : posts;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const source of sources) {
      const sourceText = blocksPlainText(source.bodyBlocks ?? []);
      const sourceKw = keywordsOf(source);
      const sourceTitle = titleWords(source);
      for (const target of posts) {
        if (target.id === source.id) continue;
        if (linked.has(`${source.id}>post:${target.id}`)) {
          skipped += 1;
          continue;
        }
        const targetKw = keywordsOf(target);
        const shared = [...targetKw.keys()].filter(
          (k) =>
            sourceKw.has(k) ||
            keywordKey(sourceText).includes(` ${k} `) ||
            keywordKey(sourceText).startsWith(`${k} `),
        );
        const candidates: Array<{
          reason: SuggestionReason;
          score: number;
          evidence: SuggestionEvidence;
        }> = [];
        if (shared.length) {
          const anchorTerm =
            shared
              .map((k) => targetKw.get(k) as string)
              .find((t) => anchorAvailable(source.bodyMarkdown, t)) ?? null;
          candidates.push({
            reason: 'shared_keyword',
            score: Math.min(
              100,
              55 + 10 * shared.length + (anchorTerm ? 10 : 0),
            ),
            evidence: {
              terms: shared.map((k) => targetKw.get(k) as string),
              anchor: anchorTerm,
            },
          });
        }
        if (
          source.primaryCategoryId &&
          source.primaryCategoryId === target.primaryCategoryId
        ) {
          const c = categories.get(source.primaryCategoryId);
          candidates.push({
            reason: 'same_category',
            score: 30,
            evidence: {
              category: c ? { id: c.id, name: c.name } : undefined,
              anchor: null,
            },
          });
        }
        const overlap = [...titleWords(target)].filter((w) =>
          sourceTitle.has(w),
        );
        if (overlap.length >= 2) {
          candidates.push({
            reason: 'title_overlap',
            score: Math.min(60, 25 + 10 * overlap.length),
            evidence: { terms: overlap, anchor: null },
          });
        }
        const targetInbound = inbound.get(target.id) ?? 0;
        if (targetInbound === 0 && candidates.length) {
          candidates.push({
            reason: 'orphan_target',
            score: Math.min(
              100,
              Math.max(...candidates.map((c) => c.score)) + 15,
            ),
            evidence: {
              inbound: 0,
              anchor:
                candidates.find((c) => c.evidence.anchor)?.evidence.anchor ??
                null,
              terms: candidates.flatMap((c) => c.evidence.terms ?? []),
            },
          });
        }
        for (const c of candidates) {
          const row = await this.suggestions.findOne({
            where: {
              sourceType: 'post',
              sourceId: source.id,
              targetType: 'post',
              targetId: target.id,
              reason: c.reason,
            },
          });
          if (row) {
            if (
              row.status === 'pending' &&
              (row.score !== c.score ||
                JSON.stringify(row.evidence) !== JSON.stringify(c.evidence))
            ) {
              row.score = c.score;
              row.evidence = c.evidence;
              await this.suggestions.save(row);
              updated += 1;
            } else skipped += 1;
            continue;
          }
          await this.suggestions.insert({
            sourceType: 'post',
            sourceId: source.id,
            targetType: 'post',
            targetId: target.id,
            reason: c.reason,
            score: c.score,
            evidence: c.evidence,
            status: 'pending',
          });
          created += 1;
        }
      }
    }
    return { created, updated, skipped, sources: sources.length };
  }

  // ---- decisions -----------------------------------------------------------

  async approve(
    id: string,
    actorId: string,
    anchorOverride?: string | null,
  ): Promise<LinkMutationResult & { suggestionId: string }> {
    const s = await this.suggestions.findOne({ where: { id } });
    if (!s)
      throw err('NOT_FOUND', 'Suggestion not found', HttpStatus.NOT_FOUND);
    if (s.status !== 'pending')
      throw err(
        'INVALID_STATE',
        `Suggestion already ${s.status}`,
        HttpStatus.CONFLICT,
        { status: s.status },
      );
    const result = await this.createLink(
      {
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        targetType: s.targetType,
        targetId: s.targetId,
        anchor: anchorOverride ?? s.evidence.anchor ?? null,
      },
      actorId,
    );
    s.status = 'approved';
    s.decidedBy = actorId;
    s.decidedAt = new Date();
    await this.suggestions.save(s);
    return { ...result, suggestionId: s.id };
  }

  async reject(
    id: string,
    actorId: string,
  ): Promise<{ id: string; status: 'rejected' }> {
    const s = await this.suggestions.findOne({ where: { id } });
    if (!s)
      throw err('NOT_FOUND', 'Suggestion not found', HttpStatus.NOT_FOUND);
    if (s.status !== 'pending')
      throw err(
        'INVALID_STATE',
        `Suggestion already ${s.status}`,
        HttpStatus.CONFLICT,
        { status: s.status },
      );
    s.status = 'rejected';
    s.decidedBy = actorId;
    s.decidedAt = new Date();
    await this.suggestions.save(s);
    return { id: s.id, status: 'rejected' };
  }

  // ---- links (content edits) ----------------------------------------------

  /**
   * Creates a real link from an article to an article/product. With an
   * anchor that occurs in the prose, the first occurrence becomes a Markdown
   * link; otherwise the target is added as a confirmed relation (related
   * posts / featured agents) — both are server-confirmed and visible in the
   * editor after reload.
   */
  async createLink(
    input: {
      sourceType: SeoContentType;
      sourceId: string;
      targetType: SeoContentType;
      targetId: string;
      anchor?: string | null;
    },
    actorId: string,
  ): Promise<LinkMutationResult> {
    if (input.sourceType !== 'post')
      throw err(
        'VALIDATION_ERROR',
        'Only articles can be link sources',
        HttpStatus.BAD_REQUEST,
      );
    if (
      input.sourceType === input.targetType &&
      input.sourceId === input.targetId
    )
      throw err(
        'VALIDATION_ERROR',
        'Content cannot link to itself',
        HttpStatus.BAD_REQUEST,
      );
    const source = await this.dataSource
      .getRepository(BlogPost)
      .findOne({ where: { id: input.sourceId } });
    if (!source)
      throw err('NOT_FOUND', 'Source article not found', HttpStatus.NOT_FOUND);
    let href: string;
    if (input.targetType === 'post') {
      const target = await this.dataSource
        .getRepository(BlogPost)
        .findOne({ where: { id: input.targetId } });
      if (!target)
        throw err(
          'NOT_FOUND',
          'Target article not found',
          HttpStatus.NOT_FOUND,
        );
      if (target.status === 'archived')
        throw err(
          'INVALID_STATE',
          'Cannot link to an archived article',
          HttpStatus.CONFLICT,
          { status: target.status },
        );
      href = `/blog/${target.slug}`;
    } else {
      const target = await this.dataSource
        .getRepository(Agent)
        .findOne({ where: { id: input.targetId } });
      if (!target)
        throw err(
          'NOT_FOUND',
          'Target product not found',
          HttpStatus.NOT_FOUND,
        );
      if (
        ![
          AgentStatus.PUBLISHED,
          AgentStatus.UNPUBLISHED,
          AgentStatus.READY_TO_PUBLISH,
          AgentStatus.APPROVED,
        ].includes(target.status)
      ) {
        throw err(
          'INVALID_STATE',
          'Cannot link to a product that is not publishable',
          HttpStatus.CONFLICT,
          { status: target.status },
        );
      }
      href = `/agents/${target.slug}`;
    }
    const detail = await this.posts.detail(source.id);
    const anchor = input.anchor?.trim() || null;
    if (anchor) {
      const edit = wrapFirstOccurrence(detail.bodyMarkdown, anchor, href);
      if (edit.changed) {
        const saved = await this.posts.update(
          source.id,
          { version: detail.version, bodyMarkdown: edit.markdown },
          actorId,
        );
        return {
          applied: 'link',
          sourceId: source.id,
          targetId: input.targetId,
          href,
          anchor,
          version: saved.version,
        };
      }
    }
    // Relation fallback — server-confirmed, shown in the editor's pickers.
    if (input.targetType === 'post') {
      if (detail.relatedPostIds.includes(input.targetId))
        throw err('CONFLICT', 'Already related', HttpStatus.CONFLICT);
      const saved = await this.posts.update(
        source.id,
        {
          version: detail.version,
          relatedPostIds: [...detail.relatedPostIds, input.targetId],
        },
        actorId,
      );
      return {
        applied: 'relation',
        sourceId: source.id,
        targetId: input.targetId,
        href,
        anchor: null,
        version: saved.version,
      };
    }
    if (detail.agentIds.includes(input.targetId))
      throw err('CONFLICT', 'Already related', HttpStatus.CONFLICT);
    const saved = await this.posts.update(
      source.id,
      {
        version: detail.version,
        agentIds: [...detail.agentIds, input.targetId],
      },
      actorId,
    );
    return {
      applied: 'relation',
      sourceId: source.id,
      targetId: input.targetId,
      href,
      anchor: null,
      version: saved.version,
    };
  }

  /** Removes a real in-text link (content edit) — relations are removed in the editor. */
  async deleteLink(
    linkId: string,
    actorId: string,
  ): Promise<{ id: string; removed: boolean; version: number }> {
    const link = await this.links.findOne({ where: { id: linkId } });
    if (!link) throw err('NOT_FOUND', 'Link not found', HttpStatus.NOT_FOUND);
    if (link.sourceType !== 'post')
      throw err(
        'VALIDATION_ERROR',
        'Only article links can be edited here',
        HttpStatus.BAD_REQUEST,
      );
    const detail = await this.posts.detail(link.sourceId);
    const edit = unwrapLink(detail.bodyMarkdown, link.href, link.anchor);
    if (!edit.changed) {
      throw err(
        'CONFLICT',
        'The link is no longer present in the article source — reload the graph',
        HttpStatus.CONFLICT,
        { href: link.href },
      );
    }
    const saved = await this.posts.update(
      link.sourceId,
      { version: detail.version, bodyMarkdown: edit.markdown },
      actorId,
    );
    return { id: linkId, removed: true, version: saved.version };
  }

  async removeRelation(
    input: { sourceId: string; targetType: SeoContentType; targetId: string },
    actorId: string,
  ): Promise<{ removed: boolean; version: number }> {
    const detail = await this.posts.detail(input.sourceId);
    if (input.targetType === 'post') {
      if (!detail.relatedPostIds.includes(input.targetId))
        throw err('NOT_FOUND', 'Relation not found', HttpStatus.NOT_FOUND);
      const saved = await this.posts.update(
        input.sourceId,
        {
          version: detail.version,
          relatedPostIds: detail.relatedPostIds.filter(
            (x) => x !== input.targetId,
          ),
        },
        actorId,
      );
      return { removed: true, version: saved.version };
    }
    if (!detail.agentIds.includes(input.targetId))
      throw err('NOT_FOUND', 'Relation not found', HttpStatus.NOT_FOUND);
    const saved = await this.posts.update(
      input.sourceId,
      {
        version: detail.version,
        agentIds: detail.agentIds.filter((x) => x !== input.targetId),
      },
      actorId,
    );
    return { removed: true, version: saved.version };
  }

  /** Used by tests/cleanup; keeps the service self-contained. */
  async relationExists(sourceId: string, agentId: string): Promise<boolean> {
    return Boolean(
      await this.dataSource
        .getRepository(BlogPostAgent)
        .findOne({ where: { postId: sourceId, agentId } }),
    );
  }
}
