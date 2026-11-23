/**
 * Legacy registration-bundle identifiers shared with the static public legal
 * pages. This is deliberately not a legal-document publication model: the
 * backend has no per-document lifecycle, approval, effective-date, archive,
 * or granular-consent record.
 *
 * The API needs a configured identifier so it can reject a stale registration
 * page and store exactly what that legacy flow displayed. Frontend and backend
 * identifiers remain equal (`legal-version-parity.test.ts`); equality alone
 * does not establish legal approval, binding effect, or publication status.
 *
 * The date-shaped values are historical identifiers stored verbatim beside the
 * account's registration-gate timestamp. They are not evidence that a draft
 * document is effective. Accounts created before version recording retain
 * NULL rather than a fabricated value.
 */
export type LegalDocumentKey = 'terms' | 'privacy' | 'refund';

export interface LegalDocumentVersion {
  /** Stable public route in the frontend. */
  path: string;
  /** Legacy, date-shaped registration-bundle identifier. */
  version: string;
  /** Compatibility field; not a lifecycle/effectiveness assertion. */
  effectiveAt: string;
}

export const LEGAL_DOCUMENTS: Readonly<
  Record<LegalDocumentKey, LegalDocumentVersion>
> = Object.freeze({
  terms: {
    path: '/legal/terms',
    version: '2026-10-13',
    effectiveAt: '2026-10-13',
  },
  privacy: {
    path: '/legal/privacy',
    version: '2026-10-13',
    effectiveAt: '2026-10-13',
  },
  refund: {
    path: '/legal/refunds',
    version: '2026-10-13',
    effectiveAt: '2026-10-13',
  },
});

/**
 * Legacy bundle identifier recorded by the current registration gate. It
 * covers the Terms/Privacy pair as one value; it is not evidence of
 * per-document consent or a publication lifecycle.
 */
export const CURRENT_TERMS_VERSION: string = LEGAL_DOCUMENTS.terms.version;

/** Shape accepted on the wire: YYYY-MM-DD (never free text into the DB). */
export const TERMS_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
