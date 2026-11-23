/**
 * Public legal-document registry.
 *
 * This stays intentionally small: it is the existing static public legal
 * surface, not a legal-document CMS or a second consent system. The backend
 * only records the legacy Terms/Privacy registration bundle version; it has
 * no document lifecycle model. A document therefore must not be described as
 * approved, binding, current, or effective unless its explicit publication
 * status is `effective`.
 *
 * `version` remains aligned with
 * `agentHub_backend/src/modules/auth/legal-documents.ts`. It is a legacy
 * registration identifier while these documents are Draft — it is not proof
 * of approval or an effective date.
 */
export type LegalDocumentKey = 'terms' | 'privacy' | 'refund';

/** Public-facing lifecycle vocabulary; no status is inferred from a date. */
export const LEGAL_PUBLICATION_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'effective',
  'retired',
] as const;
export type LegalPublicationStatus = (typeof LEGAL_PUBLICATION_STATUSES)[number];

export interface LegalDocumentMeta {
  key: LegalDocumentKey;
  /** Stable public route. */
  path: string;
  /** YYYY-MM-DD identifier currently stored by the legacy registration flow. */
  version: string;
  /**
   * Compatibility field for the old registration bundle. Never render this
   * as an effective date unless `status === 'effective'`.
   */
  effectiveAt: string;
  /** Explicit publication lifecycle; all existing public texts are drafts. */
  status: LegalPublicationStatus;
  /** Second URL segment of `/legal/:doc`. */
  slug: string;
}

/** Existing public/registration identifier; it is not an approval date. */
export const LEGAL_VERSION = '2026-10-13';

export const LEGAL_DOCUMENTS: Readonly<Record<LegalDocumentKey, LegalDocumentMeta>> = Object.freeze({
  terms: {
    key: 'terms',
    path: '/legal/terms',
    slug: 'terms',
    version: LEGAL_VERSION,
    effectiveAt: LEGAL_VERSION,
    status: 'draft',
  },
  privacy: {
    key: 'privacy',
    path: '/legal/privacy',
    slug: 'privacy',
    version: LEGAL_VERSION,
    effectiveAt: LEGAL_VERSION,
    status: 'draft',
  },
  refund: {
    key: 'refund',
    path: '/legal/refunds',
    slug: 'refunds',
    version: LEGAL_VERSION,
    effectiveAt: LEGAL_VERSION,
    status: 'draft',
  },
});

/** The legacy registration bundle identifier (Terms + Privacy), not a lifecycle state. */
export const CURRENT_TERMS_VERSION = LEGAL_DOCUMENTS.terms.version;

export const LEGAL_ORDER: LegalDocumentKey[] = ['terms', 'privacy', 'refund'];

export function isLegalDocumentEffective(document: LegalDocumentMeta): boolean {
  return document.status === 'effective';
}

export function legalKeyFromSlug(slug: string | undefined): LegalDocumentKey | null {
  const hit = LEGAL_ORDER.find((key) => LEGAL_DOCUMENTS[key].slug === slug);
  return hit ?? null;
}
