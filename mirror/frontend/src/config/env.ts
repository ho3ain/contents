/**
 * Centralized environment configuration (mirrors the Playbook's config/ layer).
 *
 * MESH deployment model (see docs/deployment/public-app-architecture-fa.md):
 * the public marketing site and the app shell are the same SPA build today;
 * `publicSiteUrl` / `appUrl` exist so a subdomain split (mesh.example vs
 * app.mesh.example) can be introduced by configuration, not by code changes.
 * No hostname is hard-coded anywhere in the app.
 */
export const env = {
  /**
   * API origin. `VITE_API_URL` is the variable the HTTP client actually
   * reads (`src/api/client.ts`); empty = same-origin `/api/v1` behind the
   * dev/preview proxy or the production reverse proxy. `VITE_API_BASE_URL`
   * is accepted as a legacy alias (Sprint 3 S3-04 F-02: the deployment doc
   * named only the alias, which the client never read).
   */
  apiBaseUrl: (
    (import.meta.env.VITE_API_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    ''
  ).replace(/\/+$/, ''),
  appName: 'MESH',
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,

  /** Absolute base of the public site (sitemap/OG/canonical/share links); empty → current origin. */
  publicSiteUrl:
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ||
    (typeof window !== 'undefined' ? window.location.origin : ''),
  /** Absolute base of the authenticated app (same origin today). */
  appUrl:
    (import.meta.env.VITE_APP_URL as string | undefined) ||
    (typeof window !== 'undefined' ? window.location.origin : ''),
} as const;
