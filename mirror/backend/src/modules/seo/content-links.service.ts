import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import { BlogPost, BlogSlugRedirect } from '../../database/entities/blog';
import {
  ContentLink,
  type LinkStatus,
  type SeoContentType,
} from '../../database/entities/seo';
import type { BlogBlock } from '../blog/domain/blog-markdown';
import { classifyHref, extractLinks } from './domain/content-links';

export interface ResolvedLink {
  href: string;
  anchor: string;
  position: number;
  targetType: ContentLink['targetType'];
  targetId: string | null;
  status: LinkStatus;
}

/**
 * Keeps `content_links` equal to the hyperlinks that really exist in stored
 * content. Called inside the article save transaction (so links and body
 * never disagree), on status transitions of link targets, and by the admin
 * rescan. No network requests: external links are recorded, not fetched.
 */
@Injectable()
export class ContentLinksService {
  private readonly logger = new Logger('ContentLinks');

  constructor(
    @InjectRepository(ContentLink)
    private readonly links: Repository<ContentLink>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  siteOrigin(): string | null {
    const raw = this.config.get<string>('publicSiteUrl');
    if (!raw) return null;
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  }

  /** Resolves every link of a block tree against the database (no writes). */
  async resolve(
    em: EntityManager,
    blocks: BlogBlock[],
  ): Promise<ResolvedLink[]> {
    const extracted = extractLinks(blocks);
    const origin = this.siteOrigin();
    const postSlugs = new Set<string>();
    const agentSlugs = new Set<string>();
    const classified = extracted.map((link) => {
      const target = classifyHref(link.href, origin);
      if (target.kind === 'post') postSlugs.add(target.slug);
      if (target.kind === 'agent') agentSlugs.add(target.slug);
      return { link, target };
    });

    const posts = postSlugs.size
      ? await em.getRepository(BlogPost).find({
          where: { slug: In([...postSlugs]) },
          select: ['id', 'slug', 'status'],
        })
      : [];
    const postBySlug = new Map(posts.map((p) => [p.slug, p]));
    const missingPostSlugs = [...postSlugs].filter((s) => !postBySlug.has(s));
    const redirects = missingPostSlugs.length
      ? await em.getRepository(BlogSlugRedirect).find({
          where: { oldSlug: In(missingPostSlugs) },
          relations: { post: true },
        })
      : [];
    for (const r of redirects) if (r.post) postBySlug.set(r.oldSlug, r.post);

    const agents = agentSlugs.size
      ? await em.getRepository(Agent).find({
          where: { slug: In([...agentSlugs]) },
          select: ['id', 'slug', 'status'],
        })
      : [];
    const agentBySlug = new Map(agents.map((a) => [a.slug, a]));

    const out: ResolvedLink[] = [];
    for (const { link, target } of classified) {
      if (target.kind === 'anchor') continue;
      const base = {
        href: link.href,
        anchor: link.anchor.slice(0, 300),
        position: link.position,
      };
      if (target.kind === 'post') {
        const post = postBySlug.get(target.slug);
        out.push({
          ...base,
          targetType: 'post',
          targetId: post?.id ?? null,
          status: !post
            ? 'broken'
            : post.status === 'published'
              ? 'ok'
              : 'unpublished',
        });
      } else if (target.kind === 'agent') {
        const agent = agentBySlug.get(target.slug);
        out.push({
          ...base,
          targetType: 'agent',
          targetId: agent?.id ?? null,
          status: !agent
            ? 'broken'
            : agent.status === AgentStatus.PUBLISHED
              ? 'ok'
              : 'unpublished',
        });
      } else if (target.kind === 'route') {
        out.push({
          ...base,
          targetType: 'route',
          targetId: null,
          status: 'ok',
        });
      } else {
        out.push({
          ...base,
          targetType: 'external',
          targetId: null,
          status: 'ok',
        });
      }
    }
    return out;
  }

  /** Replaces the stored links of one source with the links in `blocks`. */
  async sync(
    em: EntityManager,
    sourceType: SeoContentType,
    sourceId: string,
    blocks: BlogBlock[],
  ): Promise<ResolvedLink[]> {
    const resolved = await this.resolve(em, blocks);
    const repo = em.getRepository(ContentLink);
    // Diff against the stored rows so link ids stay stable across saves
    // (the graph and the editor address links by id): match on href+anchor
    // first, then on href alone; update what changed, insert the rest,
    // delete what disappeared.
    const existing = await repo.find({ where: { sourceType, sourceId } });
    const pool = new Map<string, ContentLink[]>();
    const key = (href: string, anchor: string | null) =>
      `${href}\u0000${anchor ?? ''}`;
    for (const row of existing) {
      const k = key(row.href, row.anchor);
      pool.set(k, [...(pool.get(k) ?? []), row]);
      const h = key(row.href, null) + '*';
      pool.set(h, [...(pool.get(h) ?? []), row]);
    }
    const taken = new Set<string>();
    const take = (l: ResolvedLink): ContentLink | null => {
      for (const k of [key(l.href, l.anchor), key(l.href, null) + '*']) {
        const row = (pool.get(k) ?? []).find((r) => !taken.has(r.id));
        if (row) {
          taken.add(row.id);
          return row;
        }
      }
      return null;
    };
    const now = new Date();
    const inserts: Partial<ContentLink>[] = [];
    for (const l of resolved) {
      const row = take(l);
      const next = {
        targetType: l.targetType,
        targetId: l.targetId,
        href: l.href,
        anchor: l.anchor,
        position: l.position,
        status: l.status,
      };
      if (!row) {
        inserts.push({ sourceType, sourceId, ...next, checkedAt: now });
        continue;
      }
      const changed = (Object.keys(next) as Array<keyof typeof next>).some(
        (k) => row[k] !== next[k],
      );
      if (changed)
        await repo.update({ id: row.id }, { ...next, checkedAt: now });
    }
    const stale = existing.filter((r) => !taken.has(r.id)).map((r) => r.id);
    if (stale.length) await repo.delete({ id: In(stale) });
    if (inserts.length) await repo.insert(inserts);
    return resolved;
  }

  async removeSource(
    em: EntityManager,
    sourceType: SeoContentType,
    sourceId: string,
  ): Promise<void> {
    await em.getRepository(ContentLink).delete({ sourceType, sourceId });
  }

  /**
   * A target changed publish state: links pointing at it flip between
   * `ok` and `unpublished` without re-parsing every source.
   */
  async refreshTarget(
    em: EntityManager,
    targetType: 'post' | 'agent',
    targetId: string,
    published: boolean,
  ): Promise<void> {
    await em
      .getRepository(ContentLink)
      .update(
        { targetType, targetId },
        { status: published ? 'ok' : 'unpublished', checkedAt: new Date() },
      );
  }

  /** Links of one source (editor "links" panel, graph details). */
  linksFrom(
    sourceType: SeoContentType,
    sourceId: string,
  ): Promise<ContentLink[]> {
    return this.links.find({
      where: { sourceType, sourceId },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
  }

  /** Inbound links from OTHER published sources (orphan detection). */
  async inbound(
    targetType: 'post' | 'agent',
    targetId: string,
  ): Promise<ContentLink[]> {
    return this.links
      .createQueryBuilder('l')
      .innerJoin(
        BlogPost,
        'p',
        `l.source_type = 'post' AND p.id = l.source_id AND p.status = 'published'`,
      )
      .where('l.target_type = :targetType AND l.target_id = :targetId', {
        targetType,
        targetId,
      })
      .andWhere(
        'NOT (l.source_type = :targetType AND l.source_id = :targetId)',
        {
          targetType,
          targetId,
        },
      )
      .orderBy('l.created_at', 'ASC')
      .getMany();
  }

  /** Re-extracts links for every article (admin action, idempotent). */
  async rescan(): Promise<{ sources: number; links: number; broken: number }> {
    const posts = await this.dataSource.getRepository(BlogPost).find({
      select: ['id', 'bodyBlocks'],
    });
    let links = 0;
    let broken = 0;
    for (const post of posts) {
      await this.dataSource.transaction(async (em) => {
        const resolved = await this.sync(em, 'post', post.id, post.bodyBlocks);
        links += resolved.length;
        broken += resolved.filter((l) => l.status === 'broken').length;
      });
    }
    this.logger.log(
      `Rescanned ${posts.length} article(s): ${links} link(s), ${broken} broken`,
    );
    return { sources: posts.length, links, broken };
  }
}
