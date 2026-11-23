/**
 * Reviewed snapshot of every route reachable WITHOUT authentication.
 *
 * Adding a `@Public()` route makes `authorization-matrix.e2e-spec.ts` fail
 * until the route is listed here — exposing an unauthenticated endpoint is
 * therefore always an explicit, reviewable diff.
 *
 * Why each group is public:
 *  - catalogue reads (agents, categories, industries, creators incl. the
 *    public showcase creators/:slug/portfolio, promoted, reference,
 *    share, media): the storefront is browsable before sign-up;
 *  - view / impression / click / discovery beacons: anonymous analytics,
 *    bot-filtered and rate limited server-side;
 *  - auth entry points (login, register, refresh, password reset,
 *    username-available): by definition used before a session exists;
 *  - payments/webhook: authenticated by the provider's signature, not a
 *    bearer token;
 *  - health/*: infrastructure probes;
 *  - metrics: guarded by its own bearer token (404 when unset), not a user;
 *  - client-errors: anonymous browser crash reports (throttled, size-capped,
 *    scrubbed) — a crash can happen before anyone signs in;
 *  - Phase C (growth), reviewed when phase-c1-wip was merged:
 *      case-studies (list, :slug): PUBLISHED stories only, by design a
 *      crawlable marketing page;
 *      public/community: read-only feed metadata, no bodies, no author emails,
 *      throttled 60/min;
 *      public/r/:code: share-link resolver, never 404s for a bad code, does not
 *      return profile ids, throttled 60/min;
 *      creator-attribution/capture: anonymous landing attribution, DTO
 *      length-capped and UUID-checked, idempotent; it relies on the global
 *      per-IP throttle only (see docs/foundation/MERGE_REPORT.md).
 *  - blog/* (blog platform): PUBLISHED articles only — home, list/search,
 *      detail (+ slug redirects), categories, tags, author card, sitemap data
 *      and the RSS feed, plus the per-article engagement aggregates and the
 *      comment thread (anonymous read; every write needs a signed-in account,
 *      test/blog/blog-engagement.e2e-spec.ts). Drafts/scheduled/unpublished
 *      are unreachable through any of them (test/blog/blog.e2e-spec.ts);
 *      list/feed are throttled.
 *  - contact (Sprint 1 — C2): the public website contact form. Anonymous by
 *      design (visitors must be able to write to MESH before signing up);
 *      DTO length-capped, honeypot, 5/10 min per IP + 5/day per address +
 *      24 h duplicate guard, persisted to contact_messages and reviewed in
 *      the admin inbox (test/trust/sprint1-trust.e2e-spec.ts).
 */
export const PUBLIC_ROUTES: readonly string[] = [
  'GET /api/v1/agents',
  'GET /api/v1/agents/:slug',
  'GET /api/v1/agents/:slug/reviews',
  'GET /api/v1/agents/:slug/versions',
  'GET /api/v1/agents/discovery/no-results',
  'GET /api/v1/agents/facets',
  'GET /api/v1/agents/suggest',
  'GET /api/v1/auth/username-available',
  'GET /api/v1/blog/authors/:username',
  'GET /api/v1/blog/categories',
  'GET /api/v1/blog/categories/:slug',
  'GET /api/v1/blog/feed.xml',
  'GET /api/v1/blog/home',
  'GET /api/v1/blog/posts',
  'GET /api/v1/blog/posts/:slug',
  'GET /api/v1/blog/posts/:slug/comments',
  'GET /api/v1/blog/posts/:slug/engagement',
  'GET /api/v1/blog/sitemap',
  'GET /api/v1/blog/tags',
  'GET /api/v1/blog/tags/:slug',
  'GET /api/v1/case-studies',
  'GET /api/v1/case-studies/:slug',
  'GET /api/v1/categories',
  'GET /api/v1/creators/:slug',
  'GET /api/v1/creators/:slug/portfolio',
  'GET /api/v1/health',
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'GET /api/v1/industries',
  'GET /api/v1/media/:key',
  'GET /api/v1/metrics',
  'GET /api/v1/promoted',
  'GET /api/v1/public/community',
  'GET /api/v1/public/r/:code',
  'GET /api/v1/reference/integrations',
  'GET /api/v1/reference/permissions',
  'GET /api/v1/seo/sitemap',
  'GET /api/v1/seo/sitemap.xml',
  'GET /api/v1/share/agents/:slug',
  'GET /api/v1/storage/capabilities',
  'POST /api/v1/agents/:slug/demo-click',
  'POST /api/v1/agents/:slug/documentation-view',
  'POST /api/v1/agents/:slug/view',
  'POST /api/v1/agents/impressions',
  'POST /api/v1/agents/promotions/:promotionId/:kind',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/login/mfa',
  'POST /api/v1/auth/password-reset/confirm',
  'POST /api/v1/auth/password-reset/request',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/register',
  'POST /api/v1/client-errors',
  'POST /api/v1/contact',
  'POST /api/v1/creator-attribution/capture',
  'POST /api/v1/discovery/events',
  'POST /api/v1/payments/webhook',
];
