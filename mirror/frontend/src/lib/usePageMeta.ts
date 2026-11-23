import { useEffect } from 'react';
import { getLocale } from '../i18n';
import { env } from '../config/env';

export interface PageMetaOptions {
  /**
   * Canonical path or absolute URL. Paths are resolved against
   * `env.publicSiteUrl`, so the emitted `<link rel="canonical">` is always
   * absolute. Omit to leave the document without a canonical.
   */
  canonical?: string;
  /** Robots directive for THIS page (`index,follow` is the document default). */
  robots?: 'index,follow' | 'noindex,follow' | 'noindex,nofollow' | 'index,nofollow' | (string & {});
  /** Structured data (JSON-LD) for this page; replaced on every change, removed on unmount. */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  /**
   * Sprint 2 (P2-05) — Open Graph type (`website` default, `product` for a
   * listing, `profile` for a creator) and an absolute/relative image for the
   * share card. Both are restored to the document defaults on unmount.
   */
  ogType?: 'website' | 'product' | 'profile' | 'article';
  ogImage?: string | null;
  /**
   * SEO Studio — content language of THIS page (overrides the UI-locale
   * based `og:locale`), real translations for `<link rel="alternate"
   * hreflang>` (emitted only when the list is non-empty; the page itself and
   * `x-default` are added here), the Twitter card kind and the social
   * title/description when they differ from the page title/description.
   */
  language?: 'fa' | 'en';
  hreflang?: Array<{ lang: string; href: string }>;
  twitterCard?: 'summary' | 'summary_large_image';
  ogTitle?: string;
  ogDescription?: string;
}

const DEFAULT_ROBOTS = 'index,follow';
const JSON_LD_ATTR = 'data-page-meta';

/**
 * Locale strategy (documented in SPRINT-2 UX-SPEC §7): the language is a
 * client preference (localStorage `ah-locale`), both languages share ONE
 * URL, so there is exactly one canonical per page and no hreflang pair.
 * `og:locale` follows the active UI language; the other one is declared as
 * the alternate.
 */
const OG_LOCALES = { fa: 'fa_IR', en: 'en_US' } as const;

/** Document defaults captured once from index.html so pages can be undone cleanly. */
let documentDefaults: { title: string; description: string; ogTitle: string; ogType: string; ogImage: string } | null = null;
function defaults() {
  if (!documentDefaults) {
    const read = (selector: string) => document.head.querySelector(selector)?.getAttribute('content') ?? '';
    documentDefaults = {
      title: document.title,
      description: read('meta[name="description"]'),
      ogTitle: read('meta[property="og:title"]'),
      ogType: read('meta[property="og:type"]') || 'website',
      ogImage: read('meta[property="og:image"]'),
    };
  }
  return documentDefaults;
}

/** Absolute URL for a public path (no trailing slash on the base). */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (env.publicSiteUrl || '').replace(/\/$/, '');
  return `${base}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function setMeta(selector: string, content: string, create?: { name?: string; property?: string }) {
  let el = document.head.querySelector(selector);
  if (!el && create) {
    el = document.createElement('meta');
    if (create.name) el.setAttribute('name', create.name);
    if (create.property) el.setAttribute('property', create.property);
    document.head.appendChild(el);
  }
  if (el) el.setAttribute('content', content);
}

/**
 * Minimal SEO for the SPA: sets document.title, the description / OG
 * description meta, and (Taxonomy v2) the canonical link, robots directive
 * and JSON-LD of the current public page. Page-specific canonical / robots /
 * JSON-LD are removed (robots reset to the document default) when the page
 * unmounts, so a landing page can never leak its directives into the next
 * route. Re-runs when the locale or the supplied strings change.
 */
export function usePageMeta(title: string, description?: string, siteName = 'MESH', options?: PageMetaOptions) {
  const canonical = options?.canonical;
  const robots = options?.robots;
  const ogType = options?.ogType;
  const ogImage = options?.ogImage;
  const jsonLd = options?.jsonLd ? JSON.stringify(options.jsonLd) : null;
  const language = options?.language;
  const hreflangKey = options?.hreflang?.length ? JSON.stringify(options.hreflang) : null;
  const twitterCard = options?.twitterCard;
  const ogTitle = options?.ogTitle;
  const ogDescription = options?.ogDescription;

  useEffect(() => {
    const base = defaults();
    const fullTitle = title ? (siteName ? `${title} — ${siteName}` : title) : siteName;
    document.title = fullTitle;
    setMeta('meta[property="og:title"]', title ? fullTitle : base.ogTitle, { property: 'og:title' });
    if (description) {
      setMeta('meta[name="description"]', description, { name: 'description' });
      setMeta('meta[property="og:description"]', description, { property: 'og:description' });
    }
    const locale = language ?? (getLocale() === 'fa' ? 'fa' : 'en');
    setMeta('meta[property="og:locale"]', OG_LOCALES[locale], { property: 'og:locale' });
    setMeta('meta[property="og:locale:alternate"]', OG_LOCALES[locale === 'fa' ? 'en' : 'fa'], { property: 'og:locale:alternate' });
    return () => {
      // Never leak a page's title/description into the next route (the
      // next page sets its own; the shell falls back to the document copy).
      document.title = base.title;
      setMeta('meta[property="og:title"]', base.ogTitle, { property: 'og:title' });
      if (description) {
        setMeta('meta[name="description"]', base.description, { name: 'description' });
        setMeta('meta[property="og:description"]', base.description, { property: 'og:description' });
      }
    };
  }, [title, description, siteName, language]);

  // Social copy that differs from the page copy (stored OG title/description).
  useEffect(() => {
    if (!ogTitle && !ogDescription) return;
    const base = defaults();
    const fullTitle = title ? (siteName ? `${title} — ${siteName}` : title) : siteName;
    if (ogTitle) setMeta('meta[property="og:title"]', ogTitle, { property: 'og:title' });
    if (ogDescription) setMeta('meta[property="og:description"]', ogDescription, { property: 'og:description' });
    return () => {
      if (ogTitle) setMeta('meta[property="og:title"]', title ? fullTitle : base.ogTitle, { property: 'og:title' });
      if (ogDescription && description) setMeta('meta[property="og:description"]', description, { property: 'og:description' });
    };
  }, [ogTitle, ogDescription, title, description, siteName]);

  useEffect(() => {
    if (!twitterCard) return;
    setMeta('meta[name="twitter:card"]', twitterCard, { name: 'twitter:card' });
    return () => document.head.querySelector('meta[name="twitter:card"]')?.remove();
  }, [twitterCard]);

  // hreflang only for REAL translations: self + alternates + x-default (Persian first).
  useEffect(() => {
    if (!hreflangKey || !canonical) return;
    const alternates = JSON.parse(hreflangKey) as Array<{ lang: string; href: string }>;
    const selfLang = language ?? 'fa';
    const all = [{ lang: selfLang, href: absoluteUrl(canonical) }, ...alternates.map((a) => ({ lang: a.lang, href: absoluteUrl(a.href) }))];
    const xDefault = all.find((a) => a.lang === 'fa') ?? all[0];
    const links = [...all, { lang: 'x-default', href: xDefault.href }].map((a) => {
      const link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', a.lang);
      link.setAttribute('href', a.href);
      link.setAttribute(JSON_LD_ATTR, '1');
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((l) => l.remove());
  }, [hreflangKey, canonical, language]);

  useEffect(() => {
    const base = defaults();
    setMeta('meta[property="og:type"]', ogType ?? base.ogType, { property: 'og:type' });
    const image = ogImage ? absoluteUrl(ogImage) : base.ogImage ? absoluteUrl(base.ogImage) : '';
    if (image) setMeta('meta[property="og:image"]', image, { property: 'og:image' });
    return () => {
      setMeta('meta[property="og:type"]', base.ogType, { property: 'og:type' });
      if (base.ogImage) setMeta('meta[property="og:image"]', absoluteUrl(base.ogImage), { property: 'og:image' });
    };
  }, [ogType, ogImage]);

  useEffect(() => {
    if (!canonical) return;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    const href = absoluteUrl(canonical);
    link.setAttribute('href', href);
    setMeta('meta[property="og:url"]', href, { property: 'og:url' });
    return () => {
      link?.remove();
      document.head.querySelector('meta[property="og:url"]')?.remove();
    };
  }, [canonical]);

  useEffect(() => {
    if (!robots) return;
    setMeta('meta[name="robots"]', robots, { name: 'robots' });
    return () => setMeta('meta[name="robots"]', DEFAULT_ROBOTS, { name: 'robots' });
  }, [robots]);

  useEffect(() => {
    if (!jsonLd) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute(JSON_LD_ATTR, '1');
    script.textContent = jsonLd;
    document.head.appendChild(script);
    return () => script.remove();
  }, [jsonLd]);
}
