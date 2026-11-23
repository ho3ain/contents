/**
 * Sprint 2 (P2-05) — page metadata builders for the public product and
 * creator pages. Pure functions over the REAL API payloads so they can be
 * unit-tested; `usePageMeta` applies the result to `document.head`.
 *
 * Rules (UX-SPEC §7):
 * - Only published listings / non-suspended creators reach these builders
 *   (the API 404s otherwise → the page sets `noindex`).
 * - One canonical per page (`/agents/<slug>`, `/creators/<slug>`) — the
 *   language is a client preference, both languages share the URL.
 * - Structured data uses only verified fields. The `Offer` carries the
 *   authoritative amount in **IRR** (schema.org requires an ISO-4217 code;
 *   Toman is a presentation unit, not a currency code). Ratings are emitted
 *   only when at least one published review exists.
 */
import type { AgentDetail, CreatorProfileView } from '../api/types';
import { absoluteUrl } from './usePageMeta';
import { normalizeAmount } from './currency';

const MAX_DESCRIPTION = 160;

/** Collapse whitespace and clamp to a search-snippet length without cutting a word in half. */
export function metaDescription(text: string | null | undefined, max = MAX_DESCRIPTION): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

export interface ProductSeo {
  robots: string;
  language: 'fa' | 'en';
  hreflang: Array<{ lang: string; href: string }>;
  twitterCard: 'summary' | 'summary_large_image';
  ogTitle?: string;
  ogDescription?: string;
  title: string;
  description: string;
  canonical: string;
  ogType: 'product';
  ogImage: string | null;
  jsonLd: Array<Record<string, unknown>>;
}

export function productSeo(agent: AgentDetail, labels: { home: string; market: string }): ProductSeo {
  const canonical = `/agents/${agent.slug}`;
  const price = normalizeAmount(agent.price);
  const offer: Record<string, unknown> = {
    '@type': 'Offer',
    url: absoluteUrl(canonical),
    availability: 'https://schema.org/InStock',
    priceCurrency: agent.currency || 'IRR',
    price: agent.isFree ? '0' : (price ?? '0'),
  };
  // SEO Studio: stored title/description/robots win over the derived copy.
  const stored = agent.seo;
  const title = stored?.title || agent.name;
  const description = stored?.description || metaDescription(agent.shortDescription || agent.fullDescription);
  const product: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: agent.name,
    description: metaDescription(stored?.description || agent.shortDescription || agent.fullDescription, 300),
    url: absoluteUrl(canonical),
    sku: agent.slug,
    brand: { '@type': 'Brand', name: agent.creator.displayName },
    offers: offer,
  };
  const image = stored?.ogImageUrl || agent.coverUrl || agent.logoUrl || null;
  if (image) product.image = absoluteUrl(image);
  if (agent.category?.name) product.category = agent.category.name;
  if (agent.rating.count > 0 && typeof agent.rating.average === 'number') {
    product.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(agent.rating.average.toFixed(1)),
      reviewCount: agent.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: labels.home, item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: labels.market, item: absoluteUrl('/agents') },
      { '@type': 'ListItem', position: 3, name: agent.name, item: absoluteUrl(canonical) },
    ],
  };
  return {
    title,
    description,
    canonical: stored?.canonicalUrl || canonical,
    ogType: 'product',
    ogImage: image,
    jsonLd: [product, breadcrumbs],
    robots: stored?.robots ?? 'index,follow',
    language: stored?.language ?? 'fa',
    hreflang: (stored?.translations ?? []).map((t) => ({ lang: t.language, href: t.path })),
    twitterCard: stored?.twitterCard ?? 'summary_large_image',
    ogTitle: stored?.ogTitle && stored.ogTitle !== title ? stored.ogTitle : undefined,
    ogDescription: stored?.ogDescription && stored.ogDescription !== description ? stored.ogDescription : undefined,
  };
}

export interface CreatorSeo {
  title: string;
  description: string;
  canonical: string;
  ogType: 'profile';
  ogImage: string | null;
  jsonLd: Array<Record<string, unknown>>;
}

export function creatorSeo(creator: CreatorProfileView, labels: { home: string; fallbackDescription: string }): CreatorSeo {
  const canonical = `/creators/${creator.slug}`;
  const description = metaDescription(creator.bio) || labels.fallbackDescription;
  // The platform does not record whether a creator is a person or a company,
  // so the profile's main entity is typed as the neutral schema.org `Thing`
  // subtype both accept for a storefront: `Brand` (name + url + image).
  const profile: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: absoluteUrl(canonical),
    name: creator.displayName,
    description,
    mainEntity: {
      '@type': 'Brand',
      name: creator.displayName,
      url: absoluteUrl(canonical),
      ...(creator.avatarUrl ? { image: absoluteUrl(creator.avatarUrl) } : {}),
      ...(creator.websiteUrl ? { sameAs: [creator.websiteUrl, ...creator.socialLinks] } : creator.socialLinks.length ? { sameAs: creator.socialLinks } : {}),
    },
  };
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      // There is no public creators index page — the trail is Home → Creator.
      { '@type': 'ListItem', position: 1, name: labels.home, item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: creator.displayName, item: absoluteUrl(canonical) },
    ],
  };
  return {
    title: creator.displayName,
    description,
    canonical,
    ogType: 'profile',
    ogImage: creator.avatarUrl,
    jsonLd: [profile, breadcrumbs],
  };
}
