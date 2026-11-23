import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, stat } from 'node:fs/promises';
import { ApiException } from '../../common/errors/api-error';
import { AgentsService } from '../agents/agents.service';
import { BlogPublicService } from '../blog/blog-public.service';
import type { PublicBlogPostDetail } from '../blog/blog-serializers';
import { ContentSeoService } from './content-seo.service';
import { blocksToHtml, escapeHtml, jsonForScript } from './domain/blocks-html';

/** Everything a public page needs in its `<head>` — nothing private. */
export interface PublicHead {
  path: string;
  type: 'post' | 'agent';
  title: string;
  description: string;
  canonical: string;
  robots: string;
  language: 'fa' | 'en';
  locale: 'fa_IR' | 'en_US';
  og: {
    type: 'article' | 'product';
    title: string;
    description: string;
    image: string | null;
    url: string;
    siteName: 'MESH';
  };
  twitterCard: 'summary' | 'summary_large_image';
  hreflang: Array<{ lang: string; href: string }>;
  jsonLd: Array<Record<string, unknown>>;
  breadcrumbs: Array<{ name: string; path: string }>;
  dates: { published: string | null; modified: string | null };
}

export type HeadResolution =
  | { kind: 'ok'; head: PublicHead; bodyHtml: string }
  | { kind: 'redirect'; to: string }
  | { kind: 'not_found' };

const OG_LOCALE = { fa: 'fa_IR', en: 'en_US' } as const;
const TEMPLATE_TTL_MS = 5 * 60_000;

function hasControlChars(value: string): boolean {
  for (const ch of value) if (ch.charCodeAt(0) < 0x20) return true;
  return false;
}

@Injectable()
export class SeoRenderService {
  private readonly logger = new Logger('SeoRender');
  private template: {
    html: string;
    loadedAt: number;
    mtimeMs: number | null;
  } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly blog: BlogPublicService,
    private readonly agents: AgentsService,
    private readonly contentSeo: ContentSeoService,
  ) {}

  private site(): string {
    return (
      this.config.get<string>('publicSiteUrl') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
  }

  private abs(pathOrUrl: string): string;
  private abs(pathOrUrl: string | null): string | null;
  private abs(pathOrUrl: string | null): string | null {
    if (!pathOrUrl) return null;
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${this.site()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }

  // ---- resolution ----------------------------------------------------------

  /** Only `/blog/:slug` and `/agents/:slug` are rendered; everything else stays a plain SPA route. */
  async resolve(rawPath: string): Promise<HeadResolution> {
    const path = this.cleanPath(rawPath);
    const m = /^\/(blog|agents)\/([^/]+)$/.exec(path);
    if (!m) return { kind: 'not_found' };
    const slug = decodeURIComponent(m[2]);
    if (m[1] === 'blog') {
      const found = await this.blog.lookup(slug);
      if (found.kind === 'redirect')
        return { kind: 'redirect', to: `/blog/${found.slug}` };
      if (found.kind === 'missing') return { kind: 'not_found' };
      return {
        kind: 'ok',
        head: this.postHead(found.post),
        bodyHtml: this.postBody(found.post),
      };
    }
    const agent = await this.agents.getBySlug(slug);
    if (!agent || !agent.publishedAt) return { kind: 'not_found' };
    const meta = await this.contentSeo.publicMeta(
      await this.contentSeo.facts('agent', agent.id),
    );
    const canonical = meta.canonicalUrl;
    const image = this.abs(agent.logoUrl);
    const product: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: agent.name,
      description: meta.description,
      url: this.abs(`/agents/${agent.slug}`),
      sku: agent.slug,
      brand: { '@type': 'Brand', name: agent.creator.displayName },
      offers: {
        '@type': 'Offer',
        url: this.abs(`/agents/${agent.slug}`),
        availability: 'https://schema.org/InStock',
        priceCurrency: agent.currency || 'IRR',
        price: agent.isFree ? '0' : String(agent.price ?? '0'),
      },
      ...(image ? { image } : {}),
      ...(agent.category?.name ? { category: agent.category.name } : {}),
      // Real ratings only — never fabricated.
      ...(agent.rating.count > 0 && typeof agent.rating.average === 'number'
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(agent.rating.average.toFixed(1)),
              reviewCount: agent.rating.count,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
    };
    const breadcrumbs = [
      { name: 'MESH', path: '/' },
      { name: 'ایجنت‌ها', path: '/agents' },
      { name: agent.name, path: `/agents/${agent.slug}` },
    ];
    const head: PublicHead = {
      path: `/agents/${agent.slug}`,
      type: 'agent',
      title: meta.title,
      description: meta.description,
      canonical,
      robots: meta.robots,
      language: meta.language,
      locale: OG_LOCALE[meta.language],
      og: {
        type: 'product',
        title: meta.ogTitle,
        description: meta.ogDescription,
        image: this.abs(meta.ogImageUrl),
        url: canonical,
        siteName: 'MESH',
      },
      twitterCard: meta.twitterCard,
      hreflang: this.hreflang(
        meta.language,
        `/agents/${agent.slug}`,
        meta.translations,
      ),
      jsonLd: [product, this.breadcrumbList(breadcrumbs)],
      breadcrumbs,
      dates: {
        published: agent.publishedAt?.toISOString() ?? null,
        modified: null,
      },
    };
    const body =
      `<article><h1>${escapeHtml(agent.name)}</h1><p>${escapeHtml(agent.shortDescription ?? '')}</p>` +
      `<p>${escapeHtml(agent.fullDescription ?? '')}</p>` +
      `<p><a href="/creators/${escapeHtml(agent.creator.slug)}">${escapeHtml(agent.creator.displayName)}</a></p></article>`;
    return { kind: 'ok', head, bodyHtml: body };
  }

  private cleanPath(raw: string): string {
    let path = (raw || '/').split(/[?#]/)[0].trim();
    if (!path.startsWith('/')) path = `/${path}`;
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (path.includes('..') || hasControlChars(path)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'invalid path',
        HttpStatus.BAD_REQUEST,
      );
    }
    return path;
  }

  private hreflang(
    language: 'fa' | 'en',
    selfPath: string,
    translations: Array<{ language: string; path: string }>,
  ) {
    if (!translations.length) return [];
    // hreflang must be reciprocal and include the page itself.
    const self = { lang: language, href: this.abs(selfPath) };
    const others = translations.map((t) => ({
      lang: t.language,
      href: this.abs(t.path),
    }));
    return [
      self,
      ...others,
      {
        lang: 'x-default',
        href: (others.find((o) => o.lang === 'fa') ?? self).href,
      },
    ];
  }

  private breadcrumbList(items: Array<{ name: string; path: string }>) {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: b.name,
        item: this.abs(b.path),
      })),
    };
  }

  private postHead(post: PublicBlogPostDetail): PublicHead {
    const path = `/blog/${post.slug}`;
    const canonical: string = post.seo.canonicalUrl ?? this.abs(path);
    const image = this.abs(post.seo.ogImageUrl);
    const article: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.seo.description,
      url: this.abs(path),
      mainEntityOfPage: this.abs(path),
      inLanguage: post.seo.language,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt ?? post.publishedAt,
      wordCount: post.wordCount,
      ...(image ? { image } : {}),
      ...(post.author
        ? {
            author: {
              '@type': 'Person',
              name: post.author.name,
              ...(post.author.slug
                ? { url: this.abs(`/blog/author/${post.author.slug}`) }
                : {}),
            },
          }
        : {}),
      publisher: { '@type': 'Organization', name: 'MESH', url: this.site() },
      ...(post.ratingCount > 0 && post.ratingAvg
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(post.ratingAvg),
              ratingCount: post.ratingCount,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
    };
    const breadcrumbs = [{ name: 'MESH', path: '/' }, ...post.breadcrumbs];
    return {
      path,
      type: 'post',
      title: post.seo.title,
      description: post.seo.description,
      canonical,
      robots: post.seo.robots,
      language: post.seo.language,
      locale: OG_LOCALE[post.seo.language],
      og: {
        type: 'article',
        title: post.seo.ogTitle,
        description: post.seo.ogDescription,
        image,
        url: canonical,
        siteName: 'MESH',
      },
      twitterCard: post.seo.twitterCard,
      hreflang: this.hreflang(post.seo.language, path, post.seo.translations),
      jsonLd: [article, this.breadcrumbList(breadcrumbs)],
      breadcrumbs,
      dates: { published: post.publishedAt, modified: post.updatedAt ?? null },
    };
  }

  private postBody(post: PublicBlogPostDetail): string {
    const crumbs = `<nav aria-label="breadcrumb"><ol>${post.breadcrumbs
      .map(
        (b) =>
          `<li><a href="${escapeHtml(b.path)}">${escapeHtml(b.name)}</a></li>`,
      )
      .join('')}</ol></nav>`;
    const figure = post.featuredImage
      ? `<figure><img src="${escapeHtml(post.featuredImage.url)}" alt="${escapeHtml(post.featuredImage.alt)}"/>${post.featuredImage.caption ? `<figcaption>${escapeHtml(post.featuredImage.caption)}</figcaption>` : ''}</figure>`
      : '';
    const related = post.related.length
      ? `<aside><h2>مطالب مرتبط</h2><ul>${post.related.map((r) => `<li><a href="/blog/${escapeHtml(r.slug)}">${escapeHtml(r.title)}</a></li>`).join('')}</ul></aside>`
      : '';
    return `<article lang="${post.seo.language}" dir="${post.seo.language === 'fa' ? 'rtl' : 'ltr'}">${crumbs}<h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.excerpt)}</p>${figure}${blocksToHtml(post.blocks)}${related}</article>`;
  }

  // ---- HTML shell ----------------------------------------------------------

  headTags(head: PublicHead): string {
    const meta = (attrs: Record<string, string | null | undefined>) =>
      `<meta ${Object.entries(attrs)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
        .join(' ')}/>`;
    const tags = [
      `<title>${escapeHtml(head.title)} — MESH</title>`,
      meta({ name: 'description', content: head.description }),
      meta({ name: 'robots', content: head.robots }),
      `<link rel="canonical" href="${escapeHtml(head.canonical)}"/>`,
      ...head.hreflang.map(
        (h) =>
          `<link rel="alternate" hreflang="${escapeHtml(h.lang)}" href="${escapeHtml(h.href)}"/>`,
      ),
      meta({ property: 'og:type', content: head.og.type }),
      meta({ property: 'og:site_name', content: head.og.siteName }),
      meta({ property: 'og:title', content: head.og.title }),
      meta({ property: 'og:description', content: head.og.description }),
      meta({ property: 'og:url', content: head.og.url }),
      meta({ property: 'og:locale', content: head.locale }),
      ...(head.og.image
        ? [meta({ property: 'og:image', content: head.og.image })]
        : []),
      ...(head.dates.published
        ? [
            meta({
              property: 'article:published_time',
              content: head.dates.published,
            }),
          ]
        : []),
      ...(head.dates.modified
        ? [
            meta({
              property: 'article:modified_time',
              content: head.dates.modified,
            }),
          ]
        : []),
      meta({ name: 'twitter:card', content: head.twitterCard }),
      meta({ name: 'twitter:title', content: head.og.title }),
      meta({ name: 'twitter:description', content: head.og.description }),
      ...(head.og.image
        ? [meta({ name: 'twitter:image', content: head.og.image })]
        : []),
      ...head.jsonLd.map(
        (j) =>
          `<script type="application/ld+json">${jsonForScript(j)}</script>`,
      ),
    ];
    return tags.map((t) => `    ${t}`).join('\n');
  }

  /** Builds the full document: template head stripped of generic tags + ours + prerendered body. */
  async render(path: string): Promise<{
    status: 200 | 301 | 404;
    html?: string;
    location?: string;
    robots?: string;
  }> {
    const resolved = await this.resolve(path);
    if (resolved.kind === 'redirect')
      return { status: 301, location: resolved.to };
    if (resolved.kind === 'not_found') return { status: 404 };
    const template = await this.loadTemplate();
    const { head, bodyHtml } = resolved;
    let html = template
      .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
      .replace(
        /<meta\s+name="(description|robots|twitter:[a-z:]+)"[^>]*>\s*/gi,
        '',
      )
      .replace(/<meta\s+property="og:[a-z:_]+"[^>]*>\s*/gi, '')
      .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');
    html = html.replace(/<html([^>]*)>/i, (m, attrs: string) => {
      const cleaned = attrs.replace(/\s(lang|dir)="[^"]*"/g, '');
      return `<html${cleaned} lang="${head.language}" dir="${head.language === 'fa' ? 'rtl' : 'ltr'}">`;
    });
    html = html.replace(/<\/head>/i, `${this.headTags(head)}\n  </head>`);
    html = html.replace(
      /<div id="root"><\/div>/i,
      `<div id="root">${bodyHtml}</div>`,
    );
    return { status: 200, html, robots: head.robots };
  }

  private async loadTemplate(): Promise<string> {
    const now = Date.now();
    const filePath = this.config.get<string | null>('seoShellTemplatePath');
    if (filePath) {
      const info = await stat(filePath).catch(() => null);
      if (!info) {
        this.logger.error(`SEO_SHELL_TEMPLATE not readable: ${filePath}`);
        throw new ApiException(
          'SERVICE_UNAVAILABLE',
          'SEO shell template is not available',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (!this.template || this.template.mtimeMs !== info.mtimeMs) {
        this.template = {
          html: await readFile(filePath, 'utf8'),
          loadedAt: now,
          mtimeMs: info.mtimeMs,
        };
      }
      return this.template.html;
    }
    if (this.template && now - this.template.loadedAt < TEMPLATE_TTL_MS)
      return this.template.html;
    try {
      const res = await fetch(`${this.site()}/`, {
        signal: AbortSignal.timeout(5000),
        headers: { accept: 'text/html' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (!/<div id="root">/.test(html)) throw new Error('not the SPA shell');
      this.template = { html, loadedAt: now, mtimeMs: null };
      return html;
    } catch (error) {
      this.logger.error(
        `SPA shell not fetchable from ${this.site()} — set SEO_SHELL_TEMPLATE (${error instanceof Error ? error.message : String(error)})`,
      );
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'SEO shell template is not available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
