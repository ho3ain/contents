/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin (empty = same-origin `/api/v1`). */
  readonly VITE_API_URL?: string;
  /** Legacy alias of VITE_API_URL. */
  readonly VITE_API_BASE_URL?: string;
  /** Absolute public-site base for canonical/OG/sitemap (empty = current origin). */
  readonly VITE_PUBLIC_SITE_URL?: string;
  /** Absolute app base (same origin today). */
  readonly VITE_APP_URL?: string;
  /** Optional build identifier attached to crash reports. */
  readonly VITE_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
