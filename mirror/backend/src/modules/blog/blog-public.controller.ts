import { Controller, Get, HttpStatus, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiException } from '../../common/errors/api-error';
import { Public } from '../../common/decorators/public.decorator';
import { PublicCache } from '../../common/decorators/public-cache.decorator';
import { BlogPublicService } from './blog-public.service';
import { BlogTaxonomyService } from './blog-taxonomy.service';
import { PublicBlogListQueryDto } from './dto/blog-public.dto';
import { BLOG_SLUG_PATTERN } from './dto/blog-admin.dto';

function assertSlug(slug: string): string {
  if (!BLOG_SLUG_PATTERN.test(slug) || slug.length > 140) {
    throw new ApiException('NOT_FOUND', 'Not found', HttpStatus.NOT_FOUND);
  }
  return slug;
}

function xml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[c] ?? c,
  );
}

/**
 * Blog platform — public, anonymous reads. Every handler is `@Public()` and
 * ETag-revalidated (`PublicCache('revalidate')`), so a publish or an
 * unpublish is visible on the very next request while unchanged pages cost
 * a 304. Nothing here can return a non-published article.
 */
@ApiTags('blog')
@Controller('blog')
export class BlogPublicController {
  constructor(
    private readonly service: BlogPublicService,
    private readonly taxonomy: BlogTaxonomyService,
    private readonly config: ConfigService,
  ) {}

  @Get('home')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary:
      'Blog landing data: featured article, recent articles, categories with counts',
  })
  home() {
    return this.service.home();
  }

  @Get('posts')
  @Public()
  @PublicCache('revalidate')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Published articles — search (q: Persian-folded, every term must match, ranked by title > excerpt > body with a snippet per card), ' +
      'category, tag, author, featured, reading (short|medium|long), sort (relevance|newest|oldest|updated); paginated',
  })
  list(@Query() query: PublicBlogListQueryDto) {
    return this.service.list(query);
  }

  @Get('posts/:slug')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary:
      'One published article with structured body, TOC, related/cluster articles and marketplace links. ' +
      'A renamed slug answers `{ redirectTo }`; unknown or unpublished slugs are 404.',
  })
  async detail(@Param('slug') slug: string) {
    const result = await this.service.lookup(assertSlug(slug));
    if (result.kind === 'found') return result.post;
    if (result.kind === 'redirect') return { redirectTo: result.slug };
    throw new ApiException(
      'NOT_FOUND',
      'Article not found',
      HttpStatus.NOT_FOUND,
    );
  }

  @Get('categories')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({ summary: 'Active blog categories with published counts' })
  categories() {
    return this.taxonomy.listCategoriesPublic();
  }

  @Get('categories/:slug')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({ summary: 'One blog category (404 when unknown or inactive)' })
  async category(@Param('slug') slug: string) {
    const cat = await this.taxonomy.findCategoryBySlugPublic(assertSlug(slug));
    if (!cat)
      throw new ApiException(
        'NOT_FOUND',
        'Blog category not found',
        HttpStatus.NOT_FOUND,
      );
    return cat;
  }

  @Get('tags')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary: 'Blog tags that have at least one published article',
  })
  tags() {
    return this.taxonomy.listTagsPublic();
  }

  @Get('tags/:slug')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary: 'One blog tag (404 when unknown or without published articles)',
  })
  async tag(@Param('slug') slug: string) {
    const tags = await this.taxonomy.listTagsPublic();
    const tag = tags.find((t) => t.slug === assertSlug(slug));
    if (!tag)
      throw new ApiException(
        'NOT_FOUND',
        'Blog tag not found',
        HttpStatus.NOT_FOUND,
      );
    return tag;
  }

  @Get('authors/:username')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary: 'Public author card (only for users with a published article)',
  })
  async author(@Param('username') username: string) {
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(username)) {
      throw new ApiException(
        'NOT_FOUND',
        'Author not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const result = await this.service.authorArchive(username);
    if (!result)
      throw new ApiException(
        'NOT_FOUND',
        'Author not found',
        HttpStatus.NOT_FOUND,
      );
    return result;
  }

  @Get('sitemap')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary: 'Published blog URLs with lastmod for the static sitemap emitter',
  })
  sitemap() {
    return this.service.sitemap();
  }

  @Get('feed.xml')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'RSS 2.0 feed of the latest published articles' })
  async feed(@Res() res: Response) {
    const site = (
      this.config.get<string>('publicSiteUrl') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
    const items = await this.service.feedItems(20);
    const lastBuild = items[0]?.updatedAt ?? new Date().toISOString();
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
      `<title>${xml('بلاگ MESH')}</title><link>${xml(`${site}/blog`)}</link>` +
      `<description>${xml('راهنماها و بینش‌های کاربردی دربارهٔ AI Agentها')}</description>` +
      `<language>fa</language><lastBuildDate>${new Date(lastBuild).toUTCString()}</lastBuildDate>` +
      `<atom:link href="${xml(`${site}/api/v1/blog/feed.xml`)}" rel="self" type="application/rss+xml"/>` +
      items
        .map(
          (i) =>
            `<item><title>${xml(i.title)}</title><link>${xml(`${site}/blog/${i.slug}`)}</link>` +
            `<guid isPermaLink="true">${xml(`${site}/blog/${i.slug}`)}</guid>` +
            `<pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate>` +
            `<description>${xml(i.excerpt)}</description>` +
            (i.category ? `<category>${xml(i.category.name)}</category>` : '') +
            `</item>`,
        )
        .join('') +
      `</channel></rss>`;
    res.status(200);
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(body);
  }
}
