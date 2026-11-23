import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { keywordKey } from '../../common/utils/persian-normalize';
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
  type SeoLanguage,
} from '../../database/entities/seo';
import { ContentLinksService } from './content-links.service';
import { ContentSeoService } from './content-seo.service';

export type GraphNodeType = 'post' | 'agent' | 'keyword' | 'category';
export type GraphEdgeType =
  'link' | 'relation' | 'keyword' | 'category' | 'suggestion' | 'translation';

export interface GraphNode {
  id: string; // `${type}:${id}`
  type: GraphNodeType;
  refId: string;
  label: string;
  slug: string | null;
  path: string | null;
  language: SeoLanguage | null;
  status: string | null;
  published: boolean | null;
  categoryId: string | null;
  inbound: number;
  outbound: number;
  issues: { orphan: boolean; brokenOut: number; noOutbound: boolean };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  anchor: string | null;
  status: 'ok' | 'broken' | 'unpublished' | null;
  position: number | null;
  language: SeoLanguage | null;
  /** Suggestion edges only. */
  suggestionId: string | null;
  reason: string | null;
  score: number | null;
  /** Link edges: row id for DELETE /admin/seo/links/:id */
  linkId: string | null;
}

export interface GraphFilters {
  types?: GraphNodeType[];
  language?: SeoLanguage;
  status?: string;
  category?: string;
  keyword?: string;
  relations?: GraphEdgeType[];
  orphans?: 'no-inbound' | 'no-outbound';
  broken?: boolean;
  suggested?: boolean;
  q?: string;
  focus?: string; // node id
  limit?: number;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    nodes: number;
    edges: number;
    truncated: boolean;
    limit: number;
    generatedAt: string;
    counts: Record<GraphNodeType, number> & {
      suggestions: number;
      broken: number;
      orphans: number;
    };
  };
}

const MAX_NODES = 400;

@Injectable()
export class KnowledgeGraphService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ContentLink)
    private readonly links: Repository<ContentLink>,
    @InjectRepository(ContentSeo)
    private readonly seoRows: Repository<ContentSeo>,
    @InjectRepository(LinkSuggestion)
    private readonly suggestions: Repository<LinkSuggestion>,
    private readonly contentLinks: ContentLinksService,
    private readonly contentSeo: ContentSeoService,
  ) {}

  async graph(filters: GraphFilters): Promise<GraphResponse> {
    const limit = Math.min(Math.max(filters.limit ?? 200, 20), MAX_NODES);
    const types = new Set<GraphNodeType>(
      filters.types?.length
        ? filters.types
        : ['post', 'agent', 'keyword', 'category'],
    );
    const relations = new Set<GraphEdgeType>(
      filters.relations?.length
        ? filters.relations
        : [
            'link',
            'relation',
            'keyword',
            'category',
            'translation',
            ...(filters.suggested ? ['suggestion' as const] : []),
          ],
    );
    if (filters.suggested) relations.add('suggestion');

    // ---- base data (server-side filtered where possible) -------------------
    const postQb = this.dataSource
      .getRepository(BlogPost)
      .createQueryBuilder('p')
      .select(['p.id', 'p.title', 'p.slug', 'p.status', 'p.primaryCategoryId']);
    if (filters.status)
      postQb.andWhere('p.status = :status', { status: filters.status });
    if (filters.category)
      postQb.andWhere('p.primaryCategoryId = :category', {
        category: filters.category,
      });
    const posts = await postQb.getMany();
    const postIds = posts.map((p) => p.id);

    const seo = postIds.length
      ? await this.seoRows.find({
          where: { contentType: 'post', contentId: In(postIds) },
        })
      : [];
    const seoByPost = new Map(seo.map((r) => [r.contentId, r]));

    let keptPosts = posts;
    if (filters.language) {
      keptPosts = keptPosts.filter(
        (p) => (seoByPost.get(p.id)?.language ?? 'fa') === filters.language,
      );
    }
    if (filters.keyword) {
      const key = keywordKey(filters.keyword);
      keptPosts = keptPosts.filter((p) => {
        const r = seoByPost.get(p.id);
        return (
          r &&
          (r.focusKeywordKey === key ||
            r.relatedKeywords.some((k) => k.key === key))
        );
      });
    }
    if (filters.q) {
      const q = keywordKey(filters.q);
      keptPosts = keptPosts.filter(
        (p) =>
          keywordKey(p.title).includes(q) ||
          p.slug.includes(filters.q as string),
      );
    }
    const keptPostIds = new Set(keptPosts.map((p) => p.id));

    const allLinks = keptPostIds.size
      ? await this.links.find({
          where: { sourceType: 'post', sourceId: In([...keptPostIds]) },
        })
      : [];
    const inboundRows = keptPostIds.size
      ? await this.links
          .createQueryBuilder('l')
          .select('l.target_id', 'targetId')
          .addSelect('l.target_type', 'targetType')
          .addSelect('COUNT(DISTINCT l.source_id)', 'n')
          .innerJoin(
            BlogPost,
            'sp',
            `sp.id = l.source_id AND sp.status = 'published'`,
          )
          .where('l.target_id IS NOT NULL')
          .andWhere('l.source_id <> l.target_id')
          .groupBy('l.target_id')
          .addGroupBy('l.target_type')
          .getRawMany<{ targetId: string; targetType: string; n: string }>()
      : [];
    const inbound = new Map(
      inboundRows.map((r) => [`${r.targetType}:${r.targetId}`, Number(r.n)]),
    );

    const relationRows = keptPostIds.size
      ? await this.dataSource
          .getRepository(BlogPostRelation)
          .find({ where: { postId: In([...keptPostIds]) } })
      : [];
    const agentRelRows = keptPostIds.size
      ? await this.dataSource
          .getRepository(BlogPostAgent)
          .find({ where: { postId: In([...keptPostIds]) } })
      : [];
    const suggestionRows =
      relations.has('suggestion') && keptPostIds.size
        ? await this.suggestions.find({
            where: { status: 'pending', sourceId: In([...keptPostIds]) },
          })
        : [];

    // Agents referenced by any edge.
    const agentIds = new Set<string>();
    for (const l of allLinks)
      if (l.targetType === 'agent' && l.targetId) agentIds.add(l.targetId);
    for (const r of agentRelRows) agentIds.add(r.agentId);
    for (const s of suggestionRows)
      if (s.targetType === 'agent') agentIds.add(s.targetId);
    // Products: every published listing (bounded) plus any listing an edge
    // references — so an unlinked product is visible as an orphan instead
    // of silently missing from the graph. Language follows the same
    // fallback as posts (no stored row → 'fa').
    const agents = types.has('agent')
      ? await this.loadAgents(agentIds, filters, limit)
      : [];

    const categories = types.has('category')
      ? await this.dataSource.getRepository(BlogCategory).find()
      : [];
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    // ---- nodes ---------------------------------------------------------------
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const nid = (type: GraphNodeType, id: string) => `${type}:${id}`;

    const outboundInternal = new Map<string, number>();
    const brokenOut = new Map<string, number>();
    for (const l of allLinks) {
      if (l.targetType === 'post' || l.targetType === 'agent') {
        outboundInternal.set(
          l.sourceId,
          (outboundInternal.get(l.sourceId) ?? 0) + 1,
        );
      }
      if (l.status === 'broken')
        brokenOut.set(l.sourceId, (brokenOut.get(l.sourceId) ?? 0) + 1);
    }

    if (types.has('post')) {
      for (const p of keptPosts) {
        const r = seoByPost.get(p.id);
        const inb = inbound.get(nid('post', p.id)) ?? 0;
        const outb = outboundInternal.get(p.id) ?? 0;
        nodes.set(nid('post', p.id), {
          id: nid('post', p.id),
          type: 'post',
          refId: p.id,
          label: p.title,
          slug: p.slug,
          path: `/blog/${p.slug}`,
          language: r?.language ?? 'fa',
          status: p.status,
          published: p.status === 'published',
          categoryId: p.primaryCategoryId,
          inbound: inb,
          outbound: outb,
          issues: {
            orphan: p.status === 'published' && inb === 0,
            brokenOut: brokenOut.get(p.id) ?? 0,
            noOutbound: outb === 0,
          },
        });
      }
    }
    for (const a of agents) {
      const inb = inbound.get(nid('agent', a.id)) ?? 0;
      nodes.set(nid('agent', a.id), {
        id: nid('agent', a.id),
        type: 'agent',
        refId: a.id,
        label: a.name,
        slug: a.slug,
        path: `/agents/${a.slug}`,
        language: null,
        status: a.status,
        published: a.status === AgentStatus.PUBLISHED,
        categoryId: null,
        inbound: inb,
        outbound: 0,
        issues: {
          orphan: a.status === AgentStatus.PUBLISHED && inb === 0,
          brokenOut: 0,
          noOutbound: false,
        },
      });
    }

    // ---- edges ---------------------------------------------------------------
    if (relations.has('link')) {
      for (const l of allLinks) {
        if (
          !l.targetId ||
          (l.targetType !== 'post' && l.targetType !== 'agent')
        )
          continue;
        const target = nid(l.targetType, l.targetId);
        if (!nodes.has(target)) {
          // Target outside the current filter → still show the edge target as a node when it exists.
          if (l.targetType === 'post') {
            const tp = posts.find((p) => p.id === l.targetId);
            if (tp && types.has('post')) {
              nodes.set(
                target,
                this.postStub(
                  tp,
                  seoByPost.get(tp.id),
                  inbound.get(target) ?? 0,
                  outboundInternal.get(tp.id) ?? 0,
                  brokenOut.get(tp.id) ?? 0,
                ),
              );
            }
          }
          if (!nodes.has(target)) continue;
        }
        edges.push({
          id: `link:${l.id}`,
          source: nid('post', l.sourceId),
          target,
          type: 'link',
          anchor: l.anchor,
          status: l.status,
          position: l.position,
          language: null,
          suggestionId: null,
          reason: null,
          score: null,
          linkId: l.id,
        });
      }
    }
    if (relations.has('relation')) {
      for (const r of relationRows) {
        const t = nid('post', r.relatedPostId);
        if (nodes.has(nid('post', r.postId)) && nodes.has(t)) {
          edges.push({
            id: `rel:${r.postId}:${r.relatedPostId}`,
            source: nid('post', r.postId),
            target: t,
            type: 'relation',
            anchor: null,
            status: null,
            position: r.position,
            language: null,
            suggestionId: null,
            reason: null,
            score: null,
            linkId: null,
          });
        }
      }
      for (const r of agentRelRows) {
        const t = nid('agent', r.agentId);
        if (nodes.has(nid('post', r.postId)) && nodes.has(t)) {
          edges.push({
            id: `relagent:${r.postId}:${r.agentId}`,
            source: nid('post', r.postId),
            target: t,
            type: 'relation',
            anchor: null,
            status: null,
            position: r.position,
            language: null,
            suggestionId: null,
            reason: null,
            score: null,
            linkId: null,
          });
        }
      }
    }
    if (types.has('keyword') && relations.has('keyword')) {
      for (const p of keptPosts) {
        const r = seoByPost.get(p.id);
        if (!r) continue;
        const kws = [
          ...(r.focusKeyword && r.focusKeywordKey
            ? [{ text: r.focusKeyword, key: r.focusKeywordKey, focus: true }]
            : []),
          ...r.relatedKeywords.map((k) => ({ ...k, focus: false })),
        ];
        for (const k of kws) {
          const kid = nid('keyword', k.key);
          if (!nodes.has(kid)) {
            nodes.set(kid, {
              id: kid,
              type: 'keyword',
              refId: k.key,
              label: k.text,
              slug: null,
              path: null,
              language: r.language,
              status: null,
              published: null,
              categoryId: null,
              inbound: 0,
              outbound: 0,
              issues: { orphan: false, brokenOut: 0, noOutbound: false },
            });
          }
          const node = nodes.get(kid);
          if (node) node.inbound += 1;
          edges.push({
            id: `kw:${p.id}:${k.key}`,
            source: nid('post', p.id),
            target: kid,
            type: 'keyword',
            anchor: k.focus ? 'focus' : null,
            status: null,
            position: null,
            language: r.language,
            suggestionId: null,
            reason: null,
            score: null,
            linkId: null,
          });
        }
      }
    }
    if (types.has('category') && relations.has('category')) {
      for (const p of keptPosts) {
        if (!p.primaryCategoryId) continue;
        const c = categoryById.get(p.primaryCategoryId);
        if (!c) continue;
        const cid = nid('category', c.id);
        if (!nodes.has(cid)) {
          nodes.set(cid, {
            id: cid,
            type: 'category',
            refId: c.id,
            label: c.name,
            slug: c.slug,
            path: `/blog/category/${c.slug}`,
            language: null,
            status: null,
            published: null,
            categoryId: null,
            inbound: 0,
            outbound: 0,
            issues: { orphan: false, brokenOut: 0, noOutbound: false },
          });
        }
        const node = nodes.get(cid);
        if (node) node.inbound += 1;
        edges.push({
          id: `cat:${p.id}:${c.id}`,
          source: nid('post', p.id),
          target: cid,
          type: 'category',
          anchor: null,
          status: null,
          position: null,
          language: null,
          suggestionId: null,
          reason: null,
          score: null,
          linkId: null,
        });
      }
    }
    if (relations.has('translation')) {
      const groups = new Map<string, ContentSeo[]>();
      for (const r of seo)
        if (r.translationGroupId)
          groups.set(r.translationGroupId, [
            ...(groups.get(r.translationGroupId) ?? []),
            r,
          ]);
      for (const members of groups.values()) {
        for (let i = 0; i < members.length; i += 1) {
          for (let j = i + 1; j < members.length; j += 1) {
            const a = nid(members[i].contentType, members[i].contentId);
            const b = nid(members[j].contentType, members[j].contentId);
            if (nodes.has(a) && nodes.has(b)) {
              edges.push({
                id: `tr:${members[i].id}:${members[j].id}`,
                source: a,
                target: b,
                type: 'translation',
                anchor: null,
                status: null,
                position: null,
                language: members[j].language,
                suggestionId: null,
                reason: null,
                score: null,
                linkId: null,
              });
            }
          }
        }
      }
    }
    if (relations.has('suggestion')) {
      for (const s of suggestionRows) {
        const a = nid('post', s.sourceId);
        const b = nid(s.targetType, s.targetId);
        if (!nodes.has(a) || !nodes.has(b)) continue;
        edges.push({
          id: `sug:${s.id}`,
          source: a,
          target: b,
          type: 'suggestion',
          anchor: s.evidence.anchor ?? null,
          status: null,
          position: null,
          language: null,
          suggestionId: s.id,
          reason: s.reason,
          score: s.score,
          linkId: null,
        });
      }
    }

    // ---- node-level filters that need edge data ---------------------------
    let nodeList = [...nodes.values()];
    if (filters.orphans === 'no-inbound')
      nodeList = nodeList.filter((n) =>
        n.type === 'post' || n.type === 'agent' ? n.issues.orphan : false,
      );
    if (filters.orphans === 'no-outbound')
      nodeList = nodeList.filter(
        (n) => n.type === 'post' && n.issues.noOutbound,
      );
    if (filters.broken)
      nodeList = nodeList.filter(
        (n) => n.type === 'post' && n.issues.brokenOut > 0,
      );
    if (filters.focus) {
      const keep = new Set<string>([filters.focus]);
      for (const e of edges) {
        if (e.source === filters.focus) keep.add(e.target);
        if (e.target === filters.focus) keep.add(e.source);
      }
      nodeList = nodeList.filter((n) => keep.has(n.id));
    }
    if (filters.orphans || filters.broken) {
      // Keep the neighbours of the filtered nodes so the picture stays readable.
      const keep = new Set(nodeList.map((n) => n.id));
      for (const e of edges) {
        if (keep.has(e.source)) keep.add(e.target);
        if (keep.has(e.target) && (e.type === 'link' || e.type === 'relation'))
          keep.add(e.source);
      }
      nodeList = [...nodes.values()].filter((n) => keep.has(n.id));
    }

    const truncated = nodeList.length > limit;
    // Content first (posts/agents) so a truncated graph still shows articles.
    const rank: Record<GraphNodeType, number> = {
      post: 0,
      agent: 1,
      category: 2,
      keyword: 3,
    };
    nodeList.sort(
      (a, b) => rank[a.type] - rank[b.type] || b.inbound - a.inbound,
    );
    const finalNodes = nodeList.slice(0, limit);
    const ids = new Set(finalNodes.map((n) => n.id));
    const finalEdges = edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );

    const counts = {
      post: 0,
      agent: 0,
      keyword: 0,
      category: 0,
      suggestions: 0,
      broken: 0,
      orphans: 0,
    };
    for (const n of finalNodes) {
      counts[n.type] += 1;
      if (n.issues.orphan) counts.orphans += 1;
      counts.broken += n.issues.brokenOut;
    }
    counts.suggestions = finalEdges.filter(
      (e) => e.type === 'suggestion',
    ).length;

    return {
      nodes: finalNodes,
      edges: finalEdges,
      meta: {
        nodes: finalNodes.length,
        edges: finalEdges.length,
        truncated,
        limit,
        generatedAt: new Date().toISOString(),
        counts,
      },
    };
  }

  private postStub(
    p: BlogPost,
    r: ContentSeo | undefined,
    inb: number,
    outb: number,
    broken: number,
  ): GraphNode {
    return {
      id: `post:${p.id}`,
      type: 'post',
      refId: p.id,
      label: p.title,
      slug: p.slug,
      path: `/blog/${p.slug}`,
      language: r?.language ?? 'fa',
      status: p.status,
      published: p.status === 'published',
      categoryId: p.primaryCategoryId,
      inbound: inb,
      outbound: outb,
      issues: {
        orphan: p.status === 'published' && inb === 0,
        brokenOut: broken,
        noOutbound: outb === 0,
      },
    };
  }

  /** Details panel of one node. */
  private async loadAgents(
    referenced: Set<string>,
    filters: GraphFilters,
    limit: number,
  ): Promise<Pick<Agent, 'id' | 'name' | 'slug' | 'status'>[]> {
    const repo = this.dataSource.getRepository(Agent);
    const qb = repo
      .createQueryBuilder('a')
      .select(['a.id', 'a.name', 'a.slug', 'a.status'])
      .orderBy('a.publishedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('a.name', 'ASC')
      .take(limit);
    if (filters.q)
      qb.where('a.name ILIKE :q OR a.slug ILIKE :q', { q: `%${filters.q}%` });
    if (filters.status)
      qb.andWhere('a.status = :astatus', { astatus: filters.status });
    else qb.andWhere('a.status = :astatus', { astatus: AgentStatus.PUBLISHED });
    if (filters.language) {
      qb.andWhere(
        `COALESCE((SELECT cs.language FROM content_seo cs WHERE cs.content_type = 'agent' AND cs.content_id = a.id), 'fa') = :alang`,
        { alang: filters.language },
      );
    }
    const rows = await qb.getMany();
    const seen = new Set(rows.map((r) => r.id));
    const missing = [...referenced].filter((id) => !seen.has(id));
    if (!missing.length) return rows;
    const extra = await repo.find({
      where: { id: In(missing) },
      select: ['id', 'name', 'slug', 'status'],
    });
    return [...rows, ...extra];
  }

  async node(type: SeoContentType, id: string) {
    const view = await this.contentSeo.view(type, id);
    const outbound =
      type === 'post' ? await this.contentLinks.linksFrom('post', id) : [];
    const inbound = await this.contentLinks.inbound(type, id);
    const describe = async (t: SeoContentType, cid: string | null) => {
      if (!cid) return null;
      try {
        const f = await this.contentSeo.facts(t, cid);
        return {
          type: f.type,
          id: f.id,
          title: f.title,
          path: f.path,
          published: f.published,
          status: f.status,
        };
      } catch {
        return null;
      }
    };
    const outboundRows = await Promise.all(
      outbound.map(async (l) => ({
        id: l.id,
        href: l.href,
        anchor: l.anchor,
        position: l.position,
        status: l.status,
        targetType: l.targetType,
        target:
          l.targetType === 'post' || l.targetType === 'agent'
            ? await describe(l.targetType, l.targetId)
            : null,
      })),
    );
    const inboundRows = await Promise.all(
      inbound.map(async (l) => ({
        id: l.id,
        href: l.href,
        anchor: l.anchor,
        position: l.position,
        status: l.status,
        source: await describe(l.sourceType, l.sourceId),
      })),
    );
    const relations =
      type === 'post'
        ? await Promise.all(
            (
              await this.dataSource
                .getRepository(BlogPostRelation)
                .find({ where: { postId: id }, order: { position: 'ASC' } })
            ).map((r) => describe('post', r.relatedPostId)),
          )
        : [];
    const agentRelations =
      type === 'post'
        ? await Promise.all(
            (
              await this.dataSource
                .getRepository(BlogPostAgent)
                .find({ where: { postId: id }, order: { position: 'ASC' } })
            ).map((r) => describe('agent', r.agentId)),
          )
        : [];
    const pending = await this.suggestions.find({
      where: [
        { status: 'pending', sourceType: type, sourceId: id },
        { status: 'pending', targetType: type, targetId: id },
      ],
      order: { score: 'DESC' },
    });
    const suggestions = await Promise.all(
      pending.map(async (s) => ({
        id: s.id,
        reason: s.reason,
        score: s.score,
        evidence: s.evidence,
        direction:
          s.sourceId === id && s.sourceType === type ? 'outbound' : 'inbound',
        source: await describe(s.sourceType, s.sourceId),
        target: await describe(s.targetType, s.targetId),
      })),
    );
    const brokenOut = outboundRows.filter((l) => l.status === 'broken').length;
    const internalOut = outboundRows.filter(
      (l) => l.targetType === 'post' || l.targetType === 'agent',
    ).length;
    return {
      content: view.content,
      language: view.fields.language.effective,
      robots: `${view.fields.robotsIndex.effective ? 'index' : 'noindex'},${view.fields.robotsFollow.effective ? 'follow' : 'nofollow'}`,
      keywords: { focus: view.focusKeyword, related: view.relatedKeywords },
      translations: view.translations,
      outbound: outboundRows,
      inbound: inboundRows,
      relations: relations.filter(Boolean),
      agentRelations: agentRelations.filter(Boolean),
      issues: {
        orphan: view.content.published && inboundRows.length === 0,
        noOutbound: type === 'post' && internalOut === 0,
        brokenOut,
        unpublishedOut: outboundRows.filter((l) => l.status === 'unpublished')
          .length,
      },
      suggestions,
      editPath:
        type === 'post'
          ? `/admin/blog/posts/${id}`
          : `/admin/agents?focus=${id}`,
    };
  }

  assertContentType(value: string): SeoContentType {
    if (value === 'post' || value === 'agent') return value;
    throw new ApiException(
      'VALIDATION_ERROR',
      'type must be post or agent',
      HttpStatus.BAD_REQUEST,
    );
  }
}
