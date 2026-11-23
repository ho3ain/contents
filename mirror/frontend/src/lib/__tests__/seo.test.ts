import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentDetail, CreatorProfileView } from '../../api/types';
import { setLocale } from '../../i18n';
import { creatorSeo, metaDescription, productSeo } from '../seo';

/**
 * Sprint 2 (P2-05) — metadata builders over REAL payload shapes. The offer
 * stays in IRR (ISO code) even though the UI presents Toman; ratings are
 * only emitted when reviews exist; one canonical per page.
 */
function agent(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return {
    id: 'a1',
    name: 'Invoice Sentinel',
    slug: 'invoice-sentinel',
    shortDescription: 'Flags duplicate and anomalous invoices before payment.',
    logoUrl: '/api/v1/media/logo-1',
    tags: [],
    isFree: false,
    price: '1500000.00',
    currency: 'IRR',
    riskLevel: 'low',
    version: '1.0.0',
    rating: { average: 4.6, count: 12 },
    verified: true,
    productType: null,
    category: { id: 'c1', slug: 'finance', name: 'مالی' },
    creator: { id: 'cr1', slug: 'arshan-studio', displayName: 'Arshan Studio', avatarUrl: null, verified: true },
    publishedAt: '2026-01-01T00:00:00.000Z',
    useCases: [],
    integrationNames: [],
    deliveryModel: null,
    executionModel: null,
    setupDifficulty: 'unknown',
    popular: false,
    fullDescription: 'Long description.',
    capabilities: [],
    limitations: [],
    targetAudience: [],
    inputs: [],
    outputs: [],
    howItWorks: [],
    exampleInput: null,
    exampleOutput: null,
    usageGuide: null,
    demoUrl: null,
    demoVideoUrl: null,
    buildTool: null,
    buildToolDetail: null,
    hostingResponsibility: null,
    whatBuyerReceives: [],
    whatBuyerDoesNotReceive: [],
    additionalCosts: [],
    usageModel: 'one_time',
    supportOwner: null,
    supportScope: null,
    supportPeriod: null,
    permissions: [],
    integrations: [],
    requirements: [],
    dataPolicy: null,
    purchased: false,
    ...overrides,
  } as unknown as AgentDetail;
}

const creator: CreatorProfileView = {
  id: 'cr1',
  slug: 'arshan-studio',
  displayName: 'Arshan Studio',
  bio: '  Automation studio\n building finance agents.  ',
  avatarUrl: '/api/v1/media/avatar-1',
  websiteUrl: 'https://arshan.example',
  socialLinks: ['https://x.com/arshan'],
  expertise: [],
  activityAreas: [],
  verificationStatus: 'verified',
  verifiedAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  stats: { publishedAgentCount: 5, averageRating: 4.5, ratingCount: 8 },
};

describe('lib/seo — product page metadata', () => {
  beforeEach(() => setLocale('fa'));
  afterEach(() => setLocale('fa'));

  it('builds title, clamped description, one canonical, product OG and absolute image', () => {
    const seo = productSeo(agent(), { home: 'خانه', market: 'کشف ایجنت‌ها' });
    expect(seo.title).toBe('Invoice Sentinel');
    expect(seo.description).toBe('Flags duplicate and anomalous invoices before payment.');
    expect(seo.canonical).toBe('/agents/invoice-sentinel');
    expect(seo.ogType).toBe('product');
    expect(seo.ogImage).toBe('/api/v1/media/logo-1');
  });

  it('emits a schema.org Product whose Offer is the authoritative IRR amount (never Toman)', () => {
    const [product, breadcrumbs] = productSeo(agent(), { home: 'خانه', market: 'بازار' }).jsonLd;
    expect(product['@type']).toBe('Product');
    expect(product.offers).toMatchObject({ '@type': 'Offer', priceCurrency: 'IRR', price: '1500000.00', availability: 'https://schema.org/InStock' });
    expect((product.offers as { url: string }).url).toMatch(/^https?:\/\/.+\/agents\/invoice-sentinel$/);
    expect(product.image).toMatch(/^https?:\/\/.+\/api\/v1\/media\/logo-1$/);
    expect(product.brand).toEqual({ '@type': 'Brand', name: 'Arshan Studio' });
    expect(product.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.6, reviewCount: 12, bestRating: 5, worstRating: 1 });
    expect(breadcrumbs['@type']).toBe('BreadcrumbList');
    expect((breadcrumbs.itemListElement as unknown[]).length).toBe(3);
  });

  it('omits the rating block when there are no reviews and prices free listings at 0', () => {
    const [product] = productSeo(agent({ rating: { average: null, count: 0 }, isFree: true, price: '0.00' }), { home: 'h', market: 'm' }).jsonLd;
    expect(product.aggregateRating).toBeUndefined();
    expect(product.offers).toMatchObject({ price: '0', priceCurrency: 'IRR' });
  });

  it('falls back to the full description and omits the image when none exists', () => {
    const seo = productSeo(agent({ shortDescription: '', logoUrl: null }), { home: 'h', market: 'm' });
    expect(seo.description).toBe('Long description.');
    expect(seo.ogImage).toBeNull();
    expect(seo.jsonLd[0].image).toBeUndefined();
  });
});

describe('lib/seo — creator page metadata', () => {
  it('uses the real bio (normalised), /creators/<slug> canonical and a 2-step breadcrumb', () => {
    const seo = creatorSeo(creator, { home: 'خانه', fallbackDescription: 'fallback' });
    expect(seo.title).toBe('Arshan Studio');
    expect(seo.description).toBe('Automation studio building finance agents.');
    expect(seo.canonical).toBe('/creators/arshan-studio');
    expect(seo.ogType).toBe('profile');
    const [profile, breadcrumbs] = seo.jsonLd;
    expect(profile['@type']).toBe('ProfilePage');
    expect(profile.mainEntity).toMatchObject({ '@type': 'Brand', name: 'Arshan Studio', sameAs: ['https://arshan.example', 'https://x.com/arshan'] });
    expect((breadcrumbs.itemListElement as unknown[]).length).toBe(2);
  });

  it('falls back to a generic description when the bio is empty', () => {
    const seo = creatorSeo({ ...creator, bio: '', avatarUrl: null, websiteUrl: null, socialLinks: [] }, { home: 'h', fallbackDescription: 'fallback text' });
    expect(seo.description).toBe('fallback text');
    expect(seo.ogImage).toBeNull();
    expect((seo.jsonLd[0].mainEntity as Record<string, unknown>).sameAs).toBeUndefined();
  });
});

describe('lib/seo — metaDescription', () => {
  it('collapses whitespace and clamps on a word boundary with an ellipsis', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join('  ');
    const out = metaDescription(long, 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s{2,}/);
    expect(metaDescription('short')).toBe('short');
    expect(metaDescription(null)).toBe('');
  });
});
