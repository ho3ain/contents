/**
 * Phase 3 / §15–§20 — what an impersonating admin may do.
 *
 * The session is READ-ONLY by default (every GET the target could make is
 * allowed, so support can see exactly what the user sees). A mutation is
 * refused unless it is on the short allow-list below — harmless, reversible
 * preference-style actions. Password / email / phone / MFA / KYC / payout /
 * payout-destination / any financial action / security settings / account
 * deletion / role changes / every admin route are therefore blocked without
 * having to enumerate them; BLOCKED_ALWAYS exists so the intent is explicit
 * and tested, and so a future allow-list entry can never open them.
 *
 * To permit one of the blocked operations later, create a separate explicit
 * privileged operation — do not add it here.
 */
export const BLOCKED_ALWAYS: readonly RegExp[] = [
  /^[A-Z]+ \/admin\//,
  /^[A-Z]+ \/auth\//,
  /^[A-Z]+ \/creators\/me\/finance\//,
  /^[A-Z]+ \/creators\/me\/verification\//,
  /^(POST|PUT|PATCH|DELETE) \/me\/password$/,
  /^PATCH \/me$/,
  /^[A-Z]+ \/me\/sessions/,
  /^[A-Z]+ \/payments\//,
  /^POST \/agents\/:slug\/checkout$/,
  /^POST \/me\/orders\/:id\/refunds$/,
  /^POST \/me\/products\/:id\/refund$/,
];

/** Harmless mutations a support agent may perform while debugging. */
export const IMPERSONATION_MUTATION_ALLOWLIST: readonly RegExp[] = [
  /^POST \/me\/impersonation\/end$/,
  /^PATCH \/me\/notifications\/:id\/(read|unread)$/,
  /^POST \/me\/notifications\/read-all$/,
  /^(POST|DELETE) \/me\/products\/:id\/attention$/,
];

export type ImpersonationDecision =
  | { allowed: true }
  | { allowed: false; reason: 'blocked_always' | 'read_only_session' };

export function decideImpersonatedRequest(
  method: string,
  routePattern: string,
): ImpersonationDecision {
  const key = `${method.toUpperCase()} ${routePattern.replace(/^\/api\/v\d+/, '')}`;
  if (BLOCKED_ALWAYS.some((re) => re.test(key)))
    return { allowed: false, reason: 'blocked_always' };
  if (method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD')
    return { allowed: true };
  if (IMPERSONATION_MUTATION_ALLOWLIST.some((re) => re.test(key)))
    return { allowed: true };
  return { allowed: false, reason: 'read_only_session' };
}
