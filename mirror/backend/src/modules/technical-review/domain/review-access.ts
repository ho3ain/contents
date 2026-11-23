import type { TechnicalReviewCaseState } from './technical-review.types';

/**
 * Pure authorization rules for reviewer trial access.
 *
 * Kept free of TypeORM/Nest so every rule is unit-testable without a database.
 * These rules are additive guards: they can only ever REFUSE access. Nothing
 * here can grant a commercial entitlement or relax a mandatory control.
 */

/** Hard ceilings. A caller may request less, never more. */
export const REVIEW_ACCESS_MAX_TTL_MINUTES = 240;
export const REVIEW_ACCESS_MAX_INVOCATIONS = 50;
export const REVIEW_ACCESS_DEFAULT_TTL_MINUTES = 60;
export const REVIEW_ACCESS_DEFAULT_INVOCATIONS = 10;

/**
 * Review access only makes sense while a case is genuinely open. An approved,
 * rejected or superseded case must not keep a live execution path open.
 */
export const REVIEW_ACCESS_GRANTABLE_STATES: ReadonlySet<TechnicalReviewCaseState> =
  new Set<TechnicalReviewCaseState>([
    'PendingReview',
    'InReview',
    'ChangesRequested',
    'AwaitingCreatorResponse',
    'AwaitingRetest',
    'Escalated',
  ]);

export type ReviewAccessDenialReason =
  | 'CASE_NOT_OPEN'
  | 'REVIEWER_NOT_ASSIGNED'
  | 'RUNTIME_NOT_BOUND_TO_AGENT'
  | 'RUNTIME_NOT_SERVING'
  | 'TTL_OUT_OF_RANGE'
  | 'INVOCATIONS_OUT_OF_RANGE';

export interface GrantIssueCandidate {
  caseState: TechnicalReviewCaseState;
  assignedTechnicalReviewerId: string | null;
  assignedSecurityReviewerId: string | null;
  reviewerId: string;
  caseAgentId: string;
  runtimeAgentId: string;
  runtimeIsServing: boolean;
  ttlMinutes: number;
  maxInvocations: number;
}

/**
 * Every reason the platform refuses to mint a grant. Returning all of them at
 * once keeps the admin UI honest instead of revealing one problem at a time.
 */
export function denialsForIssue(
  candidate: GrantIssueCandidate,
): ReviewAccessDenialReason[] {
  const denials: ReviewAccessDenialReason[] = [];

  if (!REVIEW_ACCESS_GRANTABLE_STATES.has(candidate.caseState)) {
    denials.push('CASE_NOT_OPEN');
  }

  // The grant holder must already be an assigned reviewer on this exact case.
  // Being an admin is not sufficient: access follows review responsibility.
  const assigned =
    candidate.reviewerId === candidate.assignedTechnicalReviewerId ||
    candidate.reviewerId === candidate.assignedSecurityReviewerId;
  if (!assigned) denials.push('REVIEWER_NOT_ASSIGNED');

  if (candidate.caseAgentId !== candidate.runtimeAgentId) {
    denials.push('RUNTIME_NOT_BOUND_TO_AGENT');
  }

  if (!candidate.runtimeIsServing) denials.push('RUNTIME_NOT_SERVING');

  if (
    !Number.isInteger(candidate.ttlMinutes) ||
    candidate.ttlMinutes < 1 ||
    candidate.ttlMinutes > REVIEW_ACCESS_MAX_TTL_MINUTES
  ) {
    denials.push('TTL_OUT_OF_RANGE');
  }

  if (
    !Number.isInteger(candidate.maxInvocations) ||
    candidate.maxInvocations < 1 ||
    candidate.maxInvocations > REVIEW_ACCESS_MAX_INVOCATIONS
  ) {
    denials.push('INVOCATIONS_OUT_OF_RANGE');
  }

  return denials;
}

export interface GrantUsabilityCandidate {
  reviewerId: string;
  runtimeId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  usedInvocations: number;
  maxInvocations: number;
}

export type GrantUsabilityFailure =
  | 'GRANT_REVOKED'
  | 'GRANT_EXPIRED'
  | 'GRANT_EXHAUSTED'
  | 'GRANT_WRONG_REVIEWER'
  | 'GRANT_WRONG_RUNTIME';

/**
 * Checks a stored grant against the request actually being made. Returns the
 * first failure, or null when the grant may be consumed.
 *
 * `now` is injected so expiry is testable and never depends on wall clock in
 * unit tests.
 */
export function grantUsability(
  grant: GrantUsabilityCandidate,
  request: { reviewerId: string; runtimeId: string },
  now: Date,
): GrantUsabilityFailure | null {
  if (grant.reviewerId !== request.reviewerId) return 'GRANT_WRONG_REVIEWER';
  if (grant.runtimeId !== request.runtimeId) return 'GRANT_WRONG_RUNTIME';
  if (grant.revokedAt) return 'GRANT_REVOKED';
  if (grant.expiresAt.getTime() <= now.getTime()) return 'GRANT_EXPIRED';
  if (grant.usedInvocations >= grant.maxInvocations) return 'GRANT_EXHAUSTED';
  return null;
}

export const isGrantLive = (
  grant: Pick<
    GrantUsabilityCandidate,
    'revokedAt' | 'expiresAt' | 'usedInvocations' | 'maxInvocations'
  >,
  now: Date,
): boolean =>
  !grant.revokedAt &&
  grant.expiresAt.getTime() > now.getTime() &&
  grant.usedInvocations < grant.maxInvocations;

/** Clamps a caller-supplied TTL/budget into the policy ceiling. */
export function normalizeGrantLimits(input: {
  ttlMinutes?: number;
  maxInvocations?: number;
}): { ttlMinutes: number; maxInvocations: number } {
  return {
    ttlMinutes: Math.min(
      input.ttlMinutes ?? REVIEW_ACCESS_DEFAULT_TTL_MINUTES,
      REVIEW_ACCESS_MAX_TTL_MINUTES,
    ),
    maxInvocations: Math.min(
      input.maxInvocations ?? REVIEW_ACCESS_DEFAULT_INVOCATIONS,
      REVIEW_ACCESS_MAX_INVOCATIONS,
    ),
  };
}
