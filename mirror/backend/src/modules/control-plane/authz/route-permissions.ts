import type { Permission } from './admin-permissions';

/**
 * Phase 3 / W0 — the central route → permission table.
 *
 * Every route that only an admin may reach (`@Roles(UserRole.ADMIN)`) is
 * authorised against ONE permission here (or by an explicit
 * `@AdminPermission()` on the handler, which wins). First matching rule
 * wins. A route that matches no rule is denied to every admin that is not
 * SUPER_ADMIN (deny by default) and fails the coverage test, so a new admin
 * route cannot ship without an explicit decision.
 *
 * Paths are matched against Express' route pattern with the `/api/v1`
 * prefix removed, e.g. `POST /admin/finance/payouts/:id/approve`.
 */
export interface RouteRule {
  /** Matches `METHOD /path/with/:params`. */
  match: RegExp;
  permission: Permission;
}

const R = (match: RegExp, permission: Permission): RouteRule => ({
  match,
  permission,
});

const GET = (path: string, permission: Permission): RouteRule =>
  R(new RegExp(`^GET ${path}$`), permission);
const POST = (path: string, permission: Permission): RouteRule =>
  R(new RegExp(`^POST ${path}$`), permission);
const ANY = (path: string, permission: Permission): RouteRule =>
  R(new RegExp(`^[A-Z]+ ${path}$`), permission);

export const ADMIN_ROUTE_RULES: readonly RouteRule[] = [
  // ---- Phase 3 control plane (explicit decorators are preferred; these
  //      prefixes are the safety net) ---------------------------------------
  ANY('/admin/security/.*', 'admin:security:self'),
  GET('/admin/governance/roles.*', 'admin:roles:view'),
  ANY('/admin/governance/roles.*', 'admin:roles:update'),
  GET('/admin/governance/audit.*', 'audit:view'),
  ANY('/admin/governance/audit.*', 'audit:verify'),
  GET('/admin/platform/kill-switches', 'platform:feature_flags:view'),
  POST('/admin/platform/kill-switches/:key', 'platform:kill_switch:update'),
  GET('/admin/platform/settings.*', 'platform:settings:view'),
  ANY('/admin/platform/settings.*', 'platform:settings:update'),
  GET('/admin/platform/feature-flags.*', 'platform:feature_flags:view'),
  ANY('/admin/platform/feature-flags.*', 'platform:feature_flags:update'),
  GET('/admin/analytics.*', 'analytics:view'),
  GET('/admin/search.*', 'search:use'),
  GET('/admin/exports.*', 'exports:create'),
  POST('/admin/exports.*', 'exports:create'),
  GET('/admin/moderation/bulk/.*', 'moderation:bulk_action'),
  POST('/admin/moderation/bulk/.*', 'moderation:bulk_action'),
  POST('/admin/moderation/cases', 'moderation:assign'),
  POST(
    '/admin/moderation/cases/:id/(triage|assign|claim|priority)',
    'moderation:assign',
  ),
  GET('/admin/moderation.*', 'moderation:view'),
  ANY('/admin/moderation.*', 'moderation:resolve'),
  POST(
    '/admin/support/requests/:id/(assign|priority|escalate|de-escalate)',
    'support:assign',
  ),
  POST('/admin/support/requests/:id/notes', 'support:internal_note'),
  GET('/admin/support.*', 'support:view'),
  ANY('/admin/support.*', 'support:respond'),
  GET('/admin/risk.*', 'risk:view'),
  ANY('/admin/risk.*', 'risk:review'),
  GET('/admin/command-center.*', 'command_center:view'),
  GET(
    '/admin/payout-operations/:id/destination',
    'finance:payout:view_sensitive',
  ),
  GET(
    '/admin/payout-operations/:id/evidence/:evidenceId',
    'finance:payout:view_sensitive',
  ),
  POST('/admin/payout-operations/:id/approve', 'finance:payout:approve'),
  POST('/admin/payout-operations/:id/mark-paid', 'finance:payout:mark_paid'),
  POST(
    '/admin/payout-operations/:id/(reference|evidence)',
    'finance:payout:upload_evidence',
  ),
  POST(
    '/admin/payout-operations/:id/(record-failure|exceptions|exceptions/resolve)',
    'finance:payout:exception',
  ),
  GET('/admin/payout-operations.*', 'finance:payout:view'),
  ANY('/admin/payout-operations.*', 'finance:payout:review'),
  // An admin may always list and end THEIR OWN sessions (the service filters
  // by admin_id), even after the impersonate permission was withdrawn; only
  // STARTING a session needs `users:impersonate`.
  GET('/admin/impersonation/sessions', 'admin:security:self'),
  POST('/admin/impersonation/sessions/:id/end', 'admin:security:self'),
  GET('/admin/impersonation.*', 'users:impersonate'),
  ANY('/admin/impersonation.*', 'users:impersonate'),

  // ---- Phase 2 financial surface (consumed, never re-implemented) ---------
  GET('/admin/finance/dashboard', 'finance:view'),
  GET('/admin/finance/trial-balance', 'finance:view'),
  GET('/admin/finance/audit', 'finance:view'),
  GET('/admin/finance/integrity', 'finance:view'),
  GET('/admin/finance/clock', 'finance:view'),
  GET('/admin/finance/policies', 'finance:view'),
  POST('/admin/finance/policies', 'finance:policy:manage'),
  GET('/admin/finance/ledger/transactions/:id', 'finance:view'),
  POST(
    '/admin/finance/ledger/transactions/:id/reverse',
    'finance:ledger:reverse',
  ),
  GET('/admin/finance/payouts', 'finance:payout:view'),
  GET('/admin/finance/payouts/:id', 'finance:payout:view'),
  POST('/admin/finance/payouts/run-automatic', 'finance:jobs:run'),
  POST('/admin/finance/payouts/:id/approve', 'finance:payout:approve'),
  POST('/admin/finance/payouts/:id/start-processing', 'finance:payout:review'),
  POST('/admin/finance/payouts/:id/reject', 'finance:payout:review'),
  POST('/admin/finance/payouts/:id/cancel', 'finance:payout:review'),
  POST('/admin/finance/payouts/:id/mark-paid', 'finance:payout:mark_paid'),
  POST('/admin/finance/payouts/:id/mark-failed', 'finance:payout:exception'),
  POST(
    '/admin/finance/payouts/:id/destination',
    'finance:payout:view_sensitive',
  ),
  GET('/admin/finance/kyc', 'finance:kyc:view'),
  GET('/admin/finance/kyc/:creatorId', 'finance:kyc:view'),
  POST('/admin/finance/kyc/:creatorId/.*', 'finance:kyc:review'),
  POST('/admin/finance/bank-accounts/:id/.*', 'finance:bank:verify'),
  GET('/admin/finance/creators/:creatorId/balance', 'finance:view'),
  GET('/admin/finance/creators/:creatorId/statement', 'finance:view'),
  POST(
    '/admin/finance/creators/:creatorId/balance/rebuild',
    'finance:balance:rebuild',
  ),
  POST('/admin/finance/creators/:creatorId/hold', 'finance:hold:manage'),
  POST(
    '/admin/finance/creators/:creatorId/hold/release',
    'finance:hold:manage',
  ),
  POST('/admin/finance/jobs/release-due', 'finance:jobs:run'),
  GET('/admin/finance/exceptions', 'finance:exception:view'),
  POST('/admin/finance/exceptions/:id/resolve', 'finance:exception:resolve'),
  GET('/admin/finance/reconciliation/.*', 'finance:reconciliation:view'),
  POST('/admin/finance/reconciliation/.*', 'finance:reconciliation:manage'),
  GET('/admin/finance/receipts/:id', 'finance:view'),
  // Phase 4: reading attribution is financial visibility; recording a manual
  // estimate/reconciliation observation uses the existing reconciliation
  // management permission and never performs a settlement.
  GET('/admin/finance/usage-summary', 'finance:view'),
  POST(
    '/admin/finance/usage-events/:id/costs',
    'finance:reconciliation:manage',
  ),
  POST(
    '/admin/finance/refunds/:refundId/disbursement',
    'finance:refund:decide',
  ),
  GET('/admin/finance/.*', 'finance:view'),

  // ---- existing admin surfaces ---------------------------------------------
  GET('/admin/refunds', 'finance:refund:view'),
  POST('/admin/refunds/.*', 'finance:refund:decide'),
  GET('/admin/orders', 'commerce:view'),
  GET('/admin/payments', 'commerce:view'),
  GET('/admin/stats', 'analytics:view'),
  GET('/admin/audit-logs', 'audit:view'),
  GET('/admin/users', 'users:view'),
  GET('/admin/users/:id/(360|timeline)', 'users:view'),
  R(/^PATCH \/admin\/users\/:id\/state$/, 'users:suspend'),
  GET('/admin/reports', 'moderation:view'),
  POST('/admin/reports/.*', 'moderation:resolve'),
  GET('/admin/reviews.*', 'content:review'),
  ANY('/admin/reviews.*', 'content:review'),
  GET('/admin/agents.*', 'content:review'),
  ANY('/admin/agents.*', 'content:review'),
  GET('/admin/categories', 'content:review'),
  ANY('/admin/categories.*', 'platform:settings:update'),
  // ---- blog platform: view < manage < publish (first match wins) --------
  GET('/admin/blog.*', 'blog:view'),
  POST(
    '/admin/blog/posts/:id/(publish|schedule|unpublish|request-changes|cancel-schedule)',
    'blog:publish',
  ),
  ANY('/admin/blog.*', 'blog:manage'),
  // ---- SEO studio / knowledge graph: same editorial permissions ---------
  GET('/admin/seo.*', 'blog:view'),
  ANY('/admin/seo.*', 'blog:manage'),
  GET('/admin/creators', 'users:view'),
  GET('/admin/creators/assistance/queue', 'support:view'),
  POST('/admin/creators/assistance/:id', 'support:respond'),
  POST('/admin/creators/:id/(approve|suspend|verification)', 'creators:manage'),
  GET('/admin/creators/.*', 'growth:view'),
  POST('/admin/creators/.*', 'growth:manage'),
  GET('/admin/crm/export', 'analytics:export'),
  GET('/admin/crm/.*', 'growth:view'),
  ANY('/admin/crm/.*', 'growth:manage'),
  GET('/admin/scale/.*', 'growth:view'),
  ANY('/admin/scale/.*', 'growth:manage'),
  GET('/admin/promotions.*', 'growth:view'),
  ANY('/admin/promotions.*', 'growth:manage'),
  GET('/admin/growth/.*', 'growth:view'),
  GET('/admin/discovery/.*', 'growth:view'),
  GET('/admin/buyer-journey/.*', 'growth:view'),
  POST('/admin/buyer-journey/.*', 'growth:manage'),
  GET('/creator-attribution/admin/.*', 'growth:view'),
  GET('/health/detailed', 'system:health:view'),
];

/** Resolves the permission for `METHOD /pattern`; null = no rule (deny non-super). */
export function permissionForRoute(
  method: string,
  routePattern: string,
): Permission | null {
  const key = `${method.toUpperCase()} ${stripPrefix(routePattern)}`;
  for (const rule of ADMIN_ROUTE_RULES) {
    if (rule.match.test(key)) return rule.permission;
  }
  return null;
}

export function stripPrefix(path: string): string {
  return path.replace(/^\/api\/v\d+/, '').replace(/\/+$/, '') || '/';
}
