import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PublicCache } from '../../common/decorators/public-cache.decorator';
import { SeoService } from './seo.service';
import { SeoRenderService } from './seo-render.service';
import { ApiException } from '../../common/errors/api-error';
import { HttpStatus } from '@nestjs/common';

/**
 * Sprint 2 (P2-05) — public SEO feeds. Both endpoints are anonymous,
 * read-only and list only published/non-suspended rows.
 */
@ApiTags('seo')
@Controller('seo')
export class SeoController {
  constructor(
    private readonly service: SeoService,
    private readonly renderer: SeoRenderService,
  ) {}

  @Get('head')
  @Public()
  @PublicCache('revalidate')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Effective head metadata (title, description, canonical, robots, OG, hreflang, JSON-LD) of a public article/product path',
  })
  async head(@Query('path') path = '') {
    const resolved = await this.renderer.resolve(path);
    if (resolved.kind === 'redirect')
      return { kind: 'redirect', to: resolved.to };
    if (resolved.kind === 'not_found')
      throw new ApiException(
        'NOT_FOUND',
        'No public content at this path',
        HttpStatus.NOT_FOUND,
      );
    return { kind: 'ok', ...resolved.head };
  }

  @Get('render')
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Crawler/link-preview HTML: the built SPA shell with real per-page head tags and a server-rendered body (route /blog/* and /agents/* here from the edge)',
  })
  async render(@Query('path') path = '', @Res() res: Response) {
    const out = await this.renderer.render(path);
    if (out.status === 301 && out.location) {
      res.redirect(301, out.location);
      return;
    }
    if (out.status === 404 || !out.html) {
      res.status(404);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Robots-Tag', 'noindex');
      res.send('Not found');
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Vary', 'Accept');
    if (out.robots) res.setHeader('X-Robots-Tag', out.robots);
    res.send(out.html);
  }

  @Get('sitemap')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary:
      'Published product, creator and taxonomy URLs with lastmod for the sitemap emitter',
  })
  sitemap() {
    return this.service.sitemap();
  }

  @Get('sitemap.xml')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Live sitemap.xml (static + published public URLs, de-duplicated)',
  })
  async sitemapXml(@Res() res: Response) {
    const body = await this.service.sitemapXml();
    res.status(200);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(body);
  }
}
