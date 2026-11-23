import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  buildPaginationMeta,
  type PaginationMeta,
} from '../../common/dto/pagination.dto';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import {
  BlogPostAgent,
  BlogPostMarketCategory,
  BlogPostRelation,
  BlogPostTag,
  BlogSlugRedirect,
} from '../../database/entities/blog/blog-post-links.entity';
import { BlogPost } from '../../database/entities/blog/blog-post.entity';
import { BlogTag } from '../../database/entities/blog/blog-tag.entity';
import {
  Category,
  CategoryStatus,
} from '../../database/entities/catalog/category.entity';
import { User } from '../../database/entities/identity/user.entity';
import { BlogPostsService } from './blog-posts.service';
import { ContentSeoService } from '../seo/content-seo.service';
import {
  publicAuthor,
  publicCard,
  type PublicBlogAuthor,
  type PublicBlogCard,
  type PublicBlogPostDetail,
} from './blog-serializers';
import { BlogTaxonomyService } from './blog-taxonomy.service';
import { blocksPlainText } from './domain/blog-markdown';
import {
  escapeLikeTerm,
  foldSqlExpression,
  phraseForms,
  searchSnippet,
  tokenizeSearchQuery,
} from './domain/blog-search';
import {
  READING_BUCKETS,
  type PublicBlogListQueryDto,
} from './dto/blog-public.dto';

export interface PublicBlogHome {
  featured: PublicBlogCard | null;
  recent: PublicBlogCard[];
  categories: Array<{
    slug: string;
    name: string;
    description: string | null;
    parentSlug: string | null;
    postCount: number;
  }>;
  totalPublished: number;
}

export type PublicPostLookup =
  | { kind: 'found'; post: PublicBlogPostDetail }
  | { kind: 'redirect'; slug: string }
  | { kind: 'missing' };

export interface BlogSitemapEntry {
  path: string;
  lastmod: string;
  /** hreflang alternates (real, published translations only). */
  alternates?: Array<{ lang: string; path: string }>;
}

/**
 * Blog platform — everything an anonymous reader may see. Every query here
 * carries `status = 'published'`; drafts, scheduled and unpublished posts
 * are unreachable through search, lists, related articles, feeds, sitemap
 * and slug redirects alike.
 */
@Injectable()
export class BlogPublicService {
  constructor(
    @InjectRepository(BlogPost) private readonly posts: Repository<BlogPost>,
    @InjectRepository(BlogSlugRedirect)
    private readonly redirects: Repository<BlogSlugRedirect>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly admin: BlogPostsService,
    private readonly taxonomy: BlogTaxonomyService,
    private readonly contentSeo: ContentSeoService,
  ) {}

  private publishedQuery() {
    return this.posts
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .leftJoinAndSelect('p.primaryCategory', 'category')
      .where(`p.status = 'published'`);
  }

  async home(): Promise<PublicBlogHome> {
    await this.admin.promoteDue();
    const [featured, recent, categories, totalPublished] = await Promise.all([
      this.publishedQuery()
        .orderBy('p.publishedAt', 'DESC')
        .addOrderBy('p.id', 'ASC')
        .getOne(),
      this.publishedQuery()
        .orderBy('p.publishedAt', 'DESC')
        .addOrderBy('p.id', 'ASC')
        .take(7)
        .getMany(),
      this.taxonomy.listCategoriesPublic(),
      this.posts.count({ where: { status: 'published' } }),
    ]);
    const recentCards = await this.cards(
      recent.filter((p) => p.id !== featured?.id).slice(0, 6),
    );
    const featuredCard = featured ? (await this.cards([featured]))[0] : null;
    return {
      featured: featuredCard ?? null,
      recent: recentCards,
      categories: categories.filter((c) => c.postCount > 0),
      totalPublished,
    };
  }

  async list(
    query: PublicBlogListQueryDto,
  ): Promise<{ items: PublicBlogCard[]; meta: PaginationMeta }> {
    await this.admin.promoteDue();
    const qb = this.publishedQuery();
    if (query.category) {
      // A parent category lists its children's articles too.
      qb.andWhere(
        `(category.slug = :category OR category.parent_id IN (SELECT id FROM blog_categories WHERE slug = :category))`,
        { category: query.category },
      ).andWhere('category.is_active = true');
    }
    if (query.tag) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM blog_post_tags pt JOIN blog_tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.slug = :tag)',
        { tag: query.tag },
      );
    }
    if (query.author)
      qb.andWhere('author.username = :author', { author: query.author });
    if (query.featured) qb.andWhere('p.isFeatured = true');
    if (query.reading) {
      const bucket = READING_BUCKETS[query.reading];
      if (bucket.min !== null)
        qb.andWhere('p.readingMinutes >= :readingMin', {
          readingMin: bucket.min,
        });
      if (bucket.max !== null)
        qb.andWhere('p.readingMinutes <= :readingMax', {
          readingMax: bucket.max,
        });
    }

    // Search: every term must occur (AND) in the folded search text; the
    // rank rewards terms found in the title (4) and excerpt (2) over the
    // body (1) — a title hit for all terms outranks a body-only mention.
    const terms = query.q ? tokenizeSearchQuery(query.q) : [];
    const rankParts: string[] = [];
    terms.forEach((term, i) => {
      const key = `t${i}`;
      qb.andWhere(`p.search_text LIKE :${key}`, {
        [key]: `%${escapeLikeTerm(term)}%`,
      });
      rankParts.push(
        `(CASE WHEN ${foldSqlExpression('p.title')} LIKE :${key} THEN 4 WHEN ${foldSqlExpression('p.excerpt')} LIKE :${key} THEN 2 ELSE 1 END)`,
      );
    });

    // Phrase bonus: all terms adjacent (as typed or glued) in the title (8),
    // excerpt (4) or body (2) — an exact phrase outranks scattered terms.
    const forms = phraseForms(terms);
    if (forms.length) {
      const likes = (expr: string) =>
        forms.map((_, i) => `${expr} LIKE :ph${i}`).join(' OR ');
      forms.forEach((form, i) =>
        qb.setParameter(`ph${i}`, `%${escapeLikeTerm(form)}%`),
      );
      rankParts.push(
        `(CASE WHEN ${likes(foldSqlExpression('p.title'))} THEN 8 WHEN ${likes(foldSqlExpression('p.excerpt'))} THEN 4 WHEN ${likes('p.search_text')} THEN 2 ELSE 0 END)`,
      );
    }

    const sort =
      query.sort === 'relevance' || (!query.sort && terms.length)
        ? 'relevance'
        : (query.sort ?? 'newest');
    if (sort === 'relevance' && rankParts.length) {
      qb.addSelect(rankParts.join(' + '), 'rank').orderBy('rank', 'DESC');
      qb.addOrderBy('p.publishedAt', 'DESC');
    } else if (sort === 'oldest') qb.orderBy('p.publishedAt', 'ASC');
    else if (sort === 'popular') {
      // Verified user ratings only; unrated articles follow rated articles.
      qb.orderBy('CASE WHEN p.rating_count > 0 THEN 1 ELSE 0 END', 'DESC')
        .addOrderBy('p.ratingAvg', 'DESC')
        .addOrderBy('p.ratingCount', 'DESC')
        .addOrderBy('p.publishedAt', 'DESC');
    } else if (sort === 'updated')
      qb.orderBy('COALESCE(p.content_updated_at, p.published_at)', 'DESC');
    else qb.orderBy('p.publishedAt', 'DESC');
    qb.addOrderBy('p.id', 'ASC');

    // offset/limit (not skip/take): the joins are many-to-one, so rows never
    // multiply, and a raw `rank` select cannot drive TypeORM's two-step
    // DISTINCT pagination.
    const total = await qb.getCount();
    const rows = await qb
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .getMany();
    return {
      items: await this.cards(rows, terms),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  /**
   * Resolves a public slug: the live article, a redirect to its current slug
   * (only when the target is itself published), or nothing. A redirect never
   * reveals a draft — an unpublished target is "missing".
   */
  async lookup(slug: string): Promise<PublicPostLookup> {
    await this.admin.promoteDue();
    const post = await this.publishedQuery()
      .andWhere('p.slug = :slug', { slug })
      .getOne();
    if (post) return { kind: 'found', post: await this.detail(post) };
    const redirect = await this.redirects.findOne({
      where: { oldSlug: slug },
      relations: { post: true },
    });
    if (redirect && redirect.post.status === 'published')
      return { kind: 'redirect', slug: redirect.post.slug };
    return { kind: 'missing' };
  }

  /** Authorised preview — same shape as the public article, any status. */
  async preview(id: string): Promise<PublicBlogPostDetail> {
    const post = await this.admin.findEntity(id);
    return this.detail(post);
  }

  async authorArchive(
    username: string,
  ): Promise<{ author: PublicBlogAuthor } | null> {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { username } });
    if (!user) return null;
    const hasPublished = await this.posts.exists({
      where: { authorUserId: user.id, status: 'published' },
    });
    if (!hasPublished) return null; // never a user-enumeration oracle
    const author = publicAuthor(user);
    return author ? { author } : null;
  }

  /** Published URLs + lastmod for the static sitemap emitter. */
  async sitemap(): Promise<{
    posts: BlogSitemapEntry[];
    categories: BlogSitemapEntry[];
    tags: BlogSitemapEntry[];
  }> {
    await this.admin.promoteDue();
    // content_seo: noindex posts are excluded; translation groups become
    // hreflang alternates (only members that are themselves published and
    // indexable appear, so no alternate can point at a 404 or a noindex page).
    const posts = await this.dataSource.query<
      Array<{
        slug: string;
        lastmod: Date;
        canonical_url: string | null;
        language: string | null;
        translation_group_id: string | null;
      }>
    >(
      `SELECT p.slug, p.canonical_url, cs.language, cs.translation_group_id,
              GREATEST(p.published_at, COALESCE(p.content_updated_at, p.published_at)) AS lastmod
         FROM blog_posts p
         LEFT JOIN content_seo cs ON cs.content_type = 'post' AND cs.content_id = p.id
        WHERE p.status = 'published' AND COALESCE(cs.robots_index, true)
        ORDER BY p.published_at DESC`,
    );
    const groups = new Map<string, Array<{ lang: string; path: string }>>();
    for (const p of posts) {
      if (!p.translation_group_id || p.canonical_url) continue;
      groups.set(p.translation_group_id, [
        ...(groups.get(p.translation_group_id) ?? []),
        { lang: p.language ?? 'fa', path: `/blog/${p.slug}` },
      ]);
    }
    const categories = await this.dataSource.query<
      Array<{ slug: string; lastmod: Date }>
    >(
      `SELECT c.slug, MAX(GREATEST(p.published_at, COALESCE(p.content_updated_at, p.published_at))) AS lastmod
         FROM blog_categories c
         JOIN blog_posts p ON p.primary_category_id = c.id AND p.status = 'published'
        WHERE c.is_active = true GROUP BY c.id ORDER BY c.slug`,
    );
    const tags = await this.dataSource.query<
      Array<{ slug: string; lastmod: Date; n: string }>
    >(
      `SELECT t.slug, COUNT(p.id)::text AS n,
              MAX(GREATEST(p.published_at, COALESCE(p.content_updated_at, p.published_at))) AS lastmod
         FROM blog_tags t
         JOIN blog_post_tags pt ON pt.tag_id = t.id
         JOIN blog_posts p ON p.id = pt.post_id AND p.status = 'published'
        GROUP BY t.id HAVING COUNT(p.id) >= 2 ORDER BY t.slug`,
    );
    return {
      // Syndicated copies (canonical override) are not sitemap entries.
      posts: posts
        .filter((p) => !p.canonical_url)
        .map((p) => {
          const alternates =
            p.translation_group_id &&
            (groups.get(p.translation_group_id)?.length ?? 0) > 1
              ? groups.get(p.translation_group_id)
              : undefined;
          return {
            path: `/blog/${p.slug}`,
            lastmod: new Date(p.lastmod).toISOString(),
            ...(alternates ? { alternates } : {}),
          };
        }),
      categories: categories.map((c) => ({
        path: `/blog/category/${c.slug}`,
        lastmod: new Date(c.lastmod).toISOString(),
      })),
      tags: tags.map((t) => ({
        path: `/blog/tag/${t.slug}`,
        lastmod: new Date(t.lastmod).toISOString(),
      })),
    };
  }

  /** Latest published articles for the RSS feed (cards only, no body). */
  async feedItems(limit = 20): Promise<PublicBlogCard[]> {
    await this.admin.promoteDue();
    // Syndicated copies (canonical override) stay out of the feed, as they do
    // out of the sitemap: we never advertise content whose canonical home is
    // elsewhere.
    const rows = await this.publishedQuery()
      .andWhere('p.canonicalUrl IS NULL')
      .orderBy('p.publishedAt', 'DESC')
      .take(limit)
      .getMany();
    return this.cards(rows);
  }

  // ---- internals ----------------------------------------------------------

  private async tagsFor(postIds: string[]): Promise<Map<string, BlogTag[]>> {
    const map = new Map<string, BlogTag[]>();
    if (!postIds.length) return map;
    const links = await this.dataSource
      .getRepository(BlogPostTag)
      .find({ where: { postId: In(postIds) }, relations: { tag: true } });
    for (const link of links) {
      const list = map.get(link.postId) ?? [];
      list.push(link.tag);
      map.set(link.postId, list);
    }
    for (const list of map.values())
      list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    return map;
  }

  async cards(
    rows: BlogPost[],
    terms: string[] = [],
  ): Promise<PublicBlogCard[]> {
    const tags = await this.tagsFor(rows.map((r) => r.id));
    return rows.map((r) =>
      publicCard(
        r,
        tags.get(r.id) ?? [],
        terms.length
          ? searchSnippet(
              {
                title: r.title,
                excerpt: r.excerpt,
                body: blocksPlainText(r.bodyBlocks),
              },
              terms,
            )
          : null,
      ),
    );
  }

  private async publishedByIds(ids: string[]): Promise<BlogPost[]> {
    if (!ids.length) return [];
    const rows = await this.publishedQuery()
      .andWhere('p.id IN (:...ids)', { ids })
      .getMany();
    const order = new Map(ids.map((id, i) => [id, i]));
    return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  private async detail(post: BlogPost): Promise<PublicBlogPostDetail> {
    const [card] = await this.cards([post]);
    const [relations, agentLinks, categoryLinks] = await Promise.all([
      this.dataSource
        .getRepository(BlogPostRelation)
        .find({ where: { postId: post.id }, order: { position: 'ASC' } }),
      this.dataSource
        .getRepository(BlogPostAgent)
        .find({ where: { postId: post.id }, order: { position: 'ASC' } }),
      this.dataSource
        .getRepository(BlogPostMarketCategory)
        .find({ where: { postId: post.id }, order: { position: 'ASC' } }),
    ]);

    // Related: editorial picks first, topped up with the newest articles of
    // the same category, then anything recent — published only, never self.
    let relatedRows = await this.publishedByIds(
      relations
        .map((r) => r.relatedPostId)
        .filter((id) => id !== post.id)
        .slice(0, 3),
    );
    if (relatedRows.length < 3) {
      const exclude = [post.id, ...relatedRows.map((r) => r.id)];
      const fill = this.publishedQuery()
        .andWhere('p.id NOT IN (:...exclude)', { exclude })
        .orderBy('p.publishedAt', 'DESC')
        .take(3 - relatedRows.length);
      if (post.primaryCategoryId)
        fill.andWhere('p.primaryCategoryId = :cat', {
          cat: post.primaryCategoryId,
        });
      let extra = await fill.getMany();
      if (extra.length < 3 - relatedRows.length) {
        const more = await this.publishedQuery()
          .andWhere('p.id NOT IN (:...exclude)', {
            exclude: [...exclude, ...extra.map((e) => e.id)],
          })
          .orderBy('p.publishedAt', 'DESC')
          .take(3 - relatedRows.length - extra.length)
          .getMany();
        extra = [...extra, ...more];
      }
      relatedRows = [...relatedRows, ...extra];
    }

    // Topic cluster: the pillar (if this is a supporting article) and the
    // published supporting articles of the pillar.
    const pillarId = post.pillarPostId ?? post.id;
    const pillarRows = post.pillarPostId
      ? await this.publishedByIds([post.pillarPostId])
      : [];
    const clusterRows = await this.publishedQuery()
      .andWhere('p.pillarPostId = :pillarId AND p.id <> :self', {
        pillarId,
        self: post.id,
      })
      .orderBy('p.publishedAt', 'ASC')
      .take(12)
      .getMany();

    const agentIds = agentLinks.map((a) => a.agentId);
    const agents = agentIds.length
      ? await this.dataSource
          .getRepository(Agent)
          .find({ where: { id: In(agentIds), status: AgentStatus.PUBLISHED } })
      : [];
    const agentOrder = new Map(agentIds.map((id, i) => [id, i]));
    agents.sort(
      (a, b) => (agentOrder.get(a.id) ?? 0) - (agentOrder.get(b.id) ?? 0),
    );

    const categoryIds = categoryLinks.map((c) => c.categoryId);
    const marketCategories = categoryIds.length
      ? await this.dataSource.getRepository(Category).find({
          where: { id: In(categoryIds), status: CategoryStatus.ACTIVE },
        })
      : [];

    const [related, pillar, cluster, meta] = await Promise.all([
      this.cards(relatedRows),
      this.cards(pillarRows),
      this.cards(clusterRows),
      this.contentSeo.publicMeta(this.contentSeo.postFacts(post)),
    ]);

    return {
      ...card,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      blocks: post.bodyBlocks,
      toc: post.toc,
      wordCount: post.wordCount,
      sources: post.sources ?? [],
      seo: {
        title: post.seoTitle ?? post.title,
        description: post.seoDescription ?? post.excerpt,
        canonicalUrl: post.canonicalUrl,
        ogImageUrl: post.ogImageUrl ?? post.featuredImageUrl,
        // SEO Studio extension (content_seo): effective values, nothing private.
        robots: meta.robots,
        ogTitle: meta.ogTitle,
        ogDescription: meta.ogDescription,
        twitterCard: meta.twitterCard,
        language: meta.language,
        translations: meta.translations,
      },
      breadcrumbs: [
        { name: 'بلاگ', path: '/blog' },
        ...(card.category
          ? [
              {
                name: card.category.name,
                path: `/blog/category/${card.category.slug}`,
              },
            ]
          : []),
        { name: post.title, path: `/blog/${post.slug}` },
      ],
      related,
      pillar: pillar[0] ?? null,
      cluster,
      agents: agents.map((a) => ({
        slug: a.slug,
        name: a.name,
        shortDescription: a.shortDescription ?? null,
        logoUrl: a.logoUrl ?? null,
      })),
      marketCategories: marketCategories.map((c) => ({
        slug: c.slug,
        name: c.name,
        nameFa: c.nameFa ?? null,
      })),
    };
  }
}
