import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, In, Not, Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { keywordKey } from '../../common/utils/persian-normalize';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import { BlogPost } from '../../database/entities/blog';
import {
  ContentSeo,
  type SeoContentType,
  type SeoLanguage,
  type StoredKeyword,
  type TwitterCard,
} from '../../database/entities/seo';
import {
  renderBlogMarkdown,
  type BlogBlock,
} from '../blog/domain/blog-markdown';
import {
  analyzeContent,
  seoTextKey,
  type AnalysisBasis,
  type AnalysisLink,
  type AnalysisReport,
} from './analysis/seo-analysis';
import { ContentLinksService } from './content-links.service';

/** Resolved content facts both services and public pages agree on. */
export interface ContentFacts {
  type: SeoContentType;
  id: string;
  title: string;
  slug: string;
  path: string;
  status: string;
  published: boolean;
  excerpt: string;
  imageUrl: string | null;
  blocks: BlogBlock[];
  /** Post-level legacy SEO columns (null for agents). */
  legacy: {
    seoTitle: string | null;
    seoDescription: string | null;
    canonicalUrl: string | null;
    ogImageUrl: string | null;
  };
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface SeoFieldValue<T> {
  /** Exactly what is stored (null = nothing stored). */
  stored: T | null;
  /** What the public page will use. */
  effective: T;
  /** Where `effective` came from. */
  source: 'stored' | 'fallback' | 'forced';
}

export interface ContentSeoView {
  content: {
    type: SeoContentType;
    id: string;
    title: string;
    slug: string;
    path: string;
    status: string;
    published: boolean;
    updatedAt: string;
  };
  fields: {
    seoTitle: SeoFieldValue<string>;
    seoDescription: SeoFieldValue<string>;
    canonicalUrl: SeoFieldValue<string>;
    ogImageUrl: SeoFieldValue<string | null>;
    ogTitle: SeoFieldValue<string>;
    ogDescription: SeoFieldValue<string>;
    twitterCard: SeoFieldValue<TwitterCard>;
    robotsIndex: SeoFieldValue<boolean>;
    robotsFollow: SeoFieldValue<boolean>;
    language: SeoFieldValue<SeoLanguage>;
  };
  focusKeyword: string | null;
  relatedKeywords: string[];
  translationGroupId: string | null;
  translations: Array<{
    type: SeoContentType;
    id: string;
    language: SeoLanguage;
    title: string;
    path: string;
    published: boolean;
  }>;
  /** Legacy post columns live on the post; everything else on content_seo. */
  storage: 'content_seo' | 'blog_posts+content_seo';
  updatedAt: string | null;
}

export interface UpsertContentSeoInput {
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  twitterCard?: TwitterCard;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
  focusKeyword?: string | null;
  relatedKeywords?: string[];
  language?: SeoLanguage;
}

export interface AnalyzeInput {
  contentType: SeoContentType;
  contentId?: string | null;
  language: SeoLanguage;
  title: string;
  slug: string;
  excerpt?: string;
  bodyMarkdown?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  featuredImageUrl?: string | null;
  robotsIndex?: boolean;
  focusKeyword?: string | null;
  relatedKeywords?: string[];
}

/** What public pages (and the HTML shell renderer) need, nothing private. */
export interface PublicSeoMeta {
  title: string;
  description: string;
  canonicalUrl: string;
  ogImageUrl: string | null;
  ogTitle: string;
  ogDescription: string;
  twitterCard: TwitterCard;
  robots:
    'index,follow' | 'index,nofollow' | 'noindex,follow' | 'noindex,nofollow';
  language: SeoLanguage;
  translations: Array<{ language: SeoLanguage; path: string }>;
}

const notFound = (m: string) =>
  new ApiException('NOT_FOUND', m, HttpStatus.NOT_FOUND);

@Injectable()
export class ContentSeoService {
  constructor(
    @InjectRepository(ContentSeo)
    private readonly repo: Repository<ContentSeo>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly links: ContentLinksService,
  ) {}

  siteUrl(): string {
    return (
      this.config.get<string>('publicSiteUrl') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
  }

  // ---- facts ---------------------------------------------------------------

  async facts(type: SeoContentType, id: string): Promise<ContentFacts> {
    if (type === 'post') {
      const post = await this.dataSource
        .getRepository(BlogPost)
        .findOne({ where: { id } });
      if (!post) throw notFound('Article not found');
      return this.postFacts(post);
    }
    const agent = await this.dataSource
      .getRepository(Agent)
      .findOne({ where: { id } });
    if (!agent) throw notFound('Product not found');
    return this.agentFacts(agent);
  }

  postFacts(post: BlogPost): ContentFacts {
    return {
      type: 'post',
      id: post.id,
      title: post.title,
      slug: post.slug,
      path: `/blog/${post.slug}`,
      status: post.status,
      published: post.status === 'published',
      excerpt: post.excerpt ?? '',
      imageUrl: post.featuredImageUrl ?? null,
      blocks: post.bodyBlocks ?? [],
      legacy: {
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        canonicalUrl: post.canonicalUrl,
        ogImageUrl: post.ogImageUrl,
      },
      updatedAt: post.updatedAt,
      publishedAt: post.publishedAt,
    };
  }

  agentFacts(agent: Agent): ContentFacts {
    return {
      type: 'agent',
      id: agent.id,
      title: agent.name,
      slug: agent.slug,
      path: `/agents/${agent.slug}`,
      status: agent.status,
      published: agent.status === AgentStatus.PUBLISHED,
      excerpt: agent.shortDescription ?? '',
      imageUrl: agent.logoUrl ?? null,
      blocks: [],
      legacy: {
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        ogImageUrl: null,
      },
      updatedAt: agent.updatedAt,
      publishedAt: agent.publishedAt ?? null,
    };
  }

  // ---- read ----------------------------------------------------------------

  async view(type: SeoContentType, id: string): Promise<ContentSeoView> {
    const facts = await this.facts(type, id);
    const row = await this.repo.findOne({
      where: { contentType: type, contentId: id },
    });
    return this.compose(facts, row);
  }

  private async compose(
    facts: ContentFacts,
    row: ContentSeo | null,
  ): Promise<ContentSeoView> {
    const isPost = facts.type === 'post';
    const storedTitle = isPost
      ? facts.legacy.seoTitle
      : (row?.seoTitle ?? null);
    const storedDescription = isPost
      ? facts.legacy.seoDescription
      : (row?.seoDescription ?? null);
    const storedCanonical = isPost
      ? facts.legacy.canonicalUrl
      : (row?.canonicalUrl ?? null);
    const storedOgImage = isPost
      ? facts.legacy.ogImageUrl
      : (row?.ogImageUrl ?? null);

    const field = <T>(
      stored: T | null,
      fallback: T,
      forced?: T,
    ): SeoFieldValue<T> =>
      forced !== undefined
        ? { stored, effective: forced, source: 'forced' }
        : stored !== null && stored !== undefined && stored !== ''
          ? { stored, effective: stored, source: 'stored' }
          : { stored: null, effective: fallback, source: 'fallback' };

    const seoTitle = field(storedTitle, facts.title);
    const seoDescription = field(storedDescription, facts.excerpt);
    const canonicalUrl = field(
      storedCanonical,
      `${this.siteUrl()}${facts.path}`,
    );
    const ogImageUrl = field<string | null>(storedOgImage, facts.imageUrl);
    const ogTitle = field(row?.ogTitle ?? null, seoTitle.effective);
    const ogDescription = field(
      row?.ogDescription ?? null,
      seoDescription.effective,
    );
    const twitterCard = field<TwitterCard>(
      row?.twitterCard ?? null,
      'summary_large_image',
    );
    // Drafts / unpublished / archived content is NEVER indexable, whatever is stored.
    const robotsIndex = field<boolean>(
      row ? row.robotsIndex : null,
      true,
      facts.published ? undefined : false,
    );
    const robotsFollow = field<boolean>(row ? row.robotsFollow : null, true);
    const language = field<SeoLanguage>(row?.language ?? null, 'fa');

    return {
      content: {
        type: facts.type,
        id: facts.id,
        title: facts.title,
        slug: facts.slug,
        path: facts.path,
        status: facts.status,
        published: facts.published,
        updatedAt: facts.updatedAt.toISOString(),
      },
      fields: {
        seoTitle,
        seoDescription,
        canonicalUrl,
        ogImageUrl,
        ogTitle,
        ogDescription,
        twitterCard,
        robotsIndex,
        robotsFollow,
        language,
      },
      focusKeyword: row?.focusKeyword ?? null,
      relatedKeywords: (row?.relatedKeywords ?? []).map((k) => k.text),
      translationGroupId: row?.translationGroupId ?? null,
      translations: row?.translationGroupId
        ? await this.translationsOf(
            row.translationGroupId,
            facts.type,
            facts.id,
          )
        : [],
      storage: isPost ? 'blog_posts+content_seo' : 'content_seo',
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  private async translationsOf(
    groupId: string,
    selfType: SeoContentType,
    selfId: string,
  ): Promise<ContentSeoView['translations']> {
    const rows = await this.repo.find({
      where: { translationGroupId: groupId },
    });
    const out: ContentSeoView['translations'] = [];
    for (const r of rows) {
      if (r.contentType === selfType && r.contentId === selfId) continue;
      try {
        const f = await this.facts(r.contentType, r.contentId);
        out.push({
          type: f.type,
          id: f.id,
          language: r.language,
          title: f.title,
          path: f.path,
          published: f.published,
        });
      } catch {
        // Content deleted meanwhile — the dangling row is ignored.
      }
    }
    return out;
  }

  // ---- write ---------------------------------------------------------------

  async upsert(
    type: SeoContentType,
    id: string,
    input: UpsertContentSeoInput,
    actorId: string,
  ): Promise<ContentSeoView> {
    await this.facts(type, id);
    const keywords = (input.relatedKeywords ?? undefined)?.map(
      (text): StoredKeyword => ({ text: text.trim(), key: keywordKey(text) }),
    );
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ContentSeo);
      let row = await repo.findOne({
        where: { contentType: type, contentId: id },
      });
      if (!row) {
        row = repo.create({
          contentType: type,
          contentId: id,
          relatedKeywords: [],
        });
      }
      if (type === 'post') {
        // Legacy columns stay on the post so every existing reader keeps working.
        const patch: Partial<BlogPost> = {};
        if (input.seoTitle !== undefined) patch.seoTitle = input.seoTitle;
        if (input.seoDescription !== undefined)
          patch.seoDescription = input.seoDescription;
        if (input.canonicalUrl !== undefined)
          patch.canonicalUrl = input.canonicalUrl;
        if (input.ogImageUrl !== undefined) patch.ogImageUrl = input.ogImageUrl;
        if (Object.keys(patch).length) {
          await em
            .getRepository(BlogPost)
            .update({ id }, { ...patch, updatedBy: actorId });
        }
      } else {
        if (input.seoTitle !== undefined) row.seoTitle = input.seoTitle;
        if (input.seoDescription !== undefined)
          row.seoDescription = input.seoDescription;
        if (input.canonicalUrl !== undefined)
          row.canonicalUrl = input.canonicalUrl;
        if (input.ogImageUrl !== undefined) row.ogImageUrl = input.ogImageUrl;
      }
      if (input.ogTitle !== undefined) row.ogTitle = input.ogTitle;
      if (input.ogDescription !== undefined)
        row.ogDescription = input.ogDescription;
      if (input.twitterCard !== undefined) row.twitterCard = input.twitterCard;
      if (input.robotsIndex !== undefined) row.robotsIndex = input.robotsIndex;
      if (input.robotsFollow !== undefined)
        row.robotsFollow = input.robotsFollow;
      if (input.focusKeyword !== undefined) {
        row.focusKeyword = input.focusKeyword?.trim() || null;
        row.focusKeywordKey = row.focusKeyword
          ? keywordKey(row.focusKeyword).slice(0, 80)
          : null;
      }
      if (keywords) row.relatedKeywords = keywords.filter((k) => k.key);
      if (input.language !== undefined) {
        if (row.translationGroupId) {
          const clash = await repo.findOne({
            where: {
              translationGroupId: row.translationGroupId,
              language: input.language,
              contentId: Not(id),
            },
          });
          if (clash) {
            throw new ApiException(
              'CONFLICT',
              'Another item of this translation group already has that language',
              HttpStatus.CONFLICT,
              { language: input.language },
            );
          }
        }
        row.language = input.language;
      }
      row.updatedBy = actorId;
      await repo.save(row);
    });
    return this.view(type, id);
  }

  /** Links `a` and `b` as translations (joins/creates a group). */
  async linkTranslation(
    a: { type: SeoContentType; id: string },
    b: { type: SeoContentType; id: string },
  ): Promise<ContentSeoView> {
    if (a.type === b.type && a.id === b.id) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Content cannot be its own translation',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.facts(a.type, a.id);
    await this.facts(b.type, b.id);
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ContentSeo);
      const ensure = async (c: { type: SeoContentType; id: string }) =>
        (await repo.findOne({
          where: { contentType: c.type, contentId: c.id },
        })) ??
        (await repo.save(
          repo.create({
            contentType: c.type,
            contentId: c.id,
            relatedKeywords: [],
          }),
        ));
      const ra = await ensure(a);
      const rb = await ensure(b);
      if (ra.language === rb.language) {
        throw new ApiException(
          'CONFLICT',
          'Both items have the same language — set the language first',
          HttpStatus.CONFLICT,
          { language: ra.language },
        );
      }
      const groupId =
        ra.translationGroupId ?? rb.translationGroupId ?? randomUUID();
      const groupIds = [ra.translationGroupId, rb.translationGroupId].filter(
        (g): g is string => Boolean(g),
      );
      const members = groupIds.length
        ? await repo.find({ where: { translationGroupId: In(groupIds) } })
        : [];
      const all = new Map<string, ContentSeo>();
      for (const m of [...members, ra, rb]) all.set(m.id, m);
      const perLanguage = new Map<string, string>();
      for (const m of all.values()) {
        const prev = perLanguage.get(m.language);
        if (prev && prev !== m.id) {
          throw new ApiException(
            'CONFLICT',
            `The translation group already contains a ${m.language} item`,
            HttpStatus.CONFLICT,
            { language: m.language },
          );
        }
        perLanguage.set(m.language, m.id);
      }
      await repo.update(
        { id: In([...all.keys()]) },
        { translationGroupId: groupId },
      );
    });
    return this.view(a.type, a.id);
  }

  async unlinkTranslation(c: {
    type: SeoContentType;
    id: string;
  }): Promise<ContentSeoView> {
    await this.repo.update(
      { contentType: c.type, contentId: c.id },
      { translationGroupId: null },
    );
    return this.view(c.type, c.id);
  }

  async removeContent(type: SeoContentType, id: string): Promise<void> {
    await this.repo.delete({ contentType: type, contentId: id });
  }

  // ---- public --------------------------------------------------------------

  /** Effective metadata for a public page; never includes private fields. */
  async publicMeta(facts: ContentFacts): Promise<PublicSeoMeta> {
    const row = await this.repo.findOne({
      where: { contentType: facts.type, contentId: facts.id },
    });
    const v = await this.compose(facts, row);
    const index = v.fields.robotsIndex.effective;
    const follow = v.fields.robotsFollow.effective;
    return {
      title: v.fields.seoTitle.effective,
      description: v.fields.seoDescription.effective,
      canonicalUrl: v.fields.canonicalUrl.effective,
      ogImageUrl: v.fields.ogImageUrl.effective,
      ogTitle: v.fields.ogTitle.effective,
      ogDescription: v.fields.ogDescription.effective,
      twitterCard: v.fields.twitterCard.effective,
      robots: `${index ? 'index' : 'noindex'},${follow ? 'follow' : 'nofollow'}`,
      language: v.fields.language.effective,
      // hreflang only for REAL, published translations.
      translations: v.translations
        .filter((t) => t.published)
        .map((t) => ({ language: t.language, path: t.path })),
    };
  }

  // ---- analysis ------------------------------------------------------------

  async analyze(
    input: AnalyzeInput,
    basis: AnalysisBasis,
  ): Promise<AnalysisReport> {
    const rendered = renderBlogMarkdown(input.bodyMarkdown ?? '');
    const resolved = await this.links.resolve(
      this.dataSource.manager,
      rendered.blocks,
    );
    const links: AnalysisLink[] = resolved.map((l) => ({
      href: l.href,
      anchor: l.anchor,
      position: l.position,
      internal: l.targetType !== 'external',
      status: l.status,
    }));
    let inboundLinks: number | null = null;
    if (input.contentId) {
      inboundLinks = (
        await this.links.inbound(input.contentType, input.contentId)
      ).length;
    }
    const duplicates = await this.duplicates(
      input.contentType,
      input.contentId ?? null,
      input.seoTitle?.trim() || input.title,
      input.seoDescription?.trim() || input.excerpt || '',
    );
    return analyzeContent({
      contentType: input.contentType,
      language: input.language,
      basis,
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt ?? '',
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      canonicalUrl: input.canonicalUrl ?? null,
      socialImageUrl: input.ogImageUrl ?? input.featuredImageUrl ?? null,
      robotsIndex: input.robotsIndex ?? true,
      focusKeyword: input.focusKeyword ?? null,
      relatedKeywords: input.relatedKeywords ?? [],
      blocks: rendered.blocks,
      links,
      inboundLinks,
      duplicates,
      siteOrigin: this.links.siteOrigin(),
    });
  }

  /** Report for the SAVED state of one content item. */
  async analyzeSaved(
    type: SeoContentType,
    id: string,
  ): Promise<AnalysisReport> {
    const facts = await this.facts(type, id);
    const v = await this.view(type, id);
    const post =
      type === 'post'
        ? await this.dataSource
            .getRepository(BlogPost)
            .findOne({ where: { id } })
        : null;
    return this.analyze(
      {
        contentType: type,
        contentId: id,
        language: v.fields.language.effective,
        title: facts.title,
        slug: facts.slug,
        excerpt: facts.excerpt,
        bodyMarkdown: post?.bodyMarkdown ?? '',
        seoTitle: v.fields.seoTitle.stored,
        seoDescription: v.fields.seoDescription.stored,
        canonicalUrl: v.fields.canonicalUrl.stored,
        ogImageUrl: v.fields.ogImageUrl.stored,
        featuredImageUrl: facts.imageUrl,
        robotsIndex: v.fields.robotsIndex.effective,
        focusKeyword: v.focusKeyword,
        relatedKeywords: v.relatedKeywords,
      },
      'saved',
    );
  }

  /** Other PUBLISHED content whose effective title/description equals ours. */
  async duplicates(
    type: SeoContentType,
    selfId: string | null,
    title: string,
    description: string,
  ): Promise<{ title: string[]; description: string[] }> {
    const titleKey = seoTextKey(title);
    const descKey = seoTextKey(description);
    const out = { title: [] as string[], description: [] as string[] };
    if (!titleKey && !descKey) return out;
    const posts = await this.dataSource.getRepository(BlogPost).find({
      where: { status: 'published' },
      select: ['id', 'title', 'seoTitle', 'excerpt', 'seoDescription'],
    });
    for (const p of posts) {
      if (type === 'post' && p.id === selfId) continue;
      if (titleKey && seoTextKey(p.seoTitle ?? p.title) === titleKey)
        out.title.push(p.title);
      if (descKey && seoTextKey(p.seoDescription ?? p.excerpt) === descKey)
        out.description.push(p.title);
    }
    return out;
  }
}
