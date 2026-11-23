import { SetMetadata } from '@nestjs/common';

export const PUBLIC_CACHE_KEY = 'publicCachePolicy';

/**
 * How a public GET response may be reused by browsers and shared caches.
 *
 *  - `reference`   slow-moving lookups (permission taxonomy, integration
 *                  catalog, category list). Reusable for a minute, then
 *                  served stale while revalidating for a few more.
 *  - `revalidate`  live catalogue data (list, facets, detail). Always
 *                  revalidated through the ETag, so a 304 saves the body
 *                  but a publish or a takedown is visible immediately.
 *
 * Applied by `PublicCacheInterceptor`, and only to anonymous, successful
 * responses — everything else keeps the API-wide `no-store`.
 */
export type PublicCachePolicy = 'reference' | 'revalidate';

export const PublicCache = (policy: PublicCachePolicy) =>
  SetMetadata(PUBLIC_CACHE_KEY, policy);
