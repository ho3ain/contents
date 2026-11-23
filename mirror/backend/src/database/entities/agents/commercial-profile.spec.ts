import {
  commercialProfileIssues,
  contentContractSnapshot,
  materialChangeKeys,
  supportsCurrentCheckout,
  type CommercialProfile,
} from './product-model';

function profile(patch: Partial<CommercialProfile> = {}): CommercialProfile {
  return {
    schemaVersion: 1,
    family: 'standalone',
    delivery: {
      model: 'downloadable',
      commitment: 'Workflow file is delivered after purchase.',
    },
    payment: { model: 'one_time', billingInterval: null },
    license: {
      type: 'perpetual',
      termDays: null,
      usageAllowance: null,
      usageUnit: null,
      rights: ['Use inside one organization'],
      restrictions: ['No resale'],
    },
    service: null,
    support: {
      owner: 'creator',
      scope: 'Setup questions',
      period: '30 days',
      updates: 'Security fixes are included.',
    },
    dependencies: ['n8n account'],
    consumption: {
      costModel: 'buyer_pays_provider',
      terms: 'Buyer pays n8n separately.',
    },
    lifecycle: {
      refundTerms: 'Refund requests follow the stated policy.',
      stopTerms: 'Downloaded files remain available to the buyer.',
    },
    termsVersion: 'v1',
    termsReference: 'creator-terms-v1',
    ...patch,
  };
}

describe('Phase 1 commercial profile', () => {
  it('accepts a complete standalone one-time/perpetual commitment', () => {
    expect(
      commercialProfileIssues(profile(), {
        isFree: false,
        price: '1500000.00',
      }),
    ).toEqual([]);
    expect(supportsCurrentCheckout(profile())).toBe(true);
  });

  it('requires explicit term and usage semantics rather than an ambiguous license note', () => {
    const incomplete = profile({
      license: {
        type: 'hybrid',
        termDays: null,
        usageAllowance: null,
        usageUnit: null,
        rights: ['Use'],
        restrictions: [],
      },
    });
    expect(
      commercialProfileIssues(incomplete).map((issue) => issue.field),
    ).toEqual(
      expect.arrayContaining([
        'license.termDays',
        'license.usageAllowance',
        'license.usageUnit',
      ]),
    );
  });

  it('requires service disclosures and a structured subscription interval', () => {
    const service = profile({
      family: 'service',
      payment: { model: 'subscription', billingInterval: null },
      service: { provider: null, commitment: null, accessTerms: null },
    });
    expect(
      commercialProfileIssues(service).map((issue) => issue.field),
    ).toEqual(
      expect.arrayContaining([
        'payment.billingInterval',
        'service.provider',
        'service.commitment',
        'service.accessTerms',
      ]),
    );
    expect(supportsCurrentCheckout(service)).toBe(false);
  });

  it('keeps payment and license independent while validating price facts', () => {
    const termOneTime = profile({
      license: {
        type: 'term_based',
        termDays: 365,
        usageAllowance: null,
        usageUnit: null,
        rights: ['Use'],
        restrictions: [],
      },
    });
    expect(
      commercialProfileIssues(termOneTime, { isFree: false, price: '10' }),
    ).toEqual([]);
    const freeProfile = {
      ...profile(),
      payment: { model: 'free' as const, billingInterval: null },
    };
    expect(
      commercialProfileIssues(freeProfile, { isFree: false, price: '10' }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'payment.model' }),
      ]),
    );
    expect(
      commercialProfileIssues(freeProfile, { isFree: true, price: '10' }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'payment.model' }),
      ]),
    );
  });

  it('marks a commercial-profile edit as a material product change', () => {
    const published = contentContractSnapshot({ commercialProfile: profile() });
    const pending = contentContractSnapshot({
      commercialProfile: profile({ termsVersion: 'v2' }),
    });
    expect(materialChangeKeys(published, pending)).toEqual([
      'commercialProfile',
    ]);
  });
});
