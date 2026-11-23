import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SingleFlightTtlCache, stableKey } from './single-flight-ttl-cache';
import { queryCacheTotal } from '../observability/metrics';

/** Longest cache key we accept; a longer (attacker-chosen) query bypasses. */
const MAX_KEY_LENGTH = 1024;
const MAX_ENTRIES = 300;

/**
 * Short-lived, in-process cache for the anonymous catalogue reads (list,
 * suggest, facets, zero-result guidance). They rank / aggregate the whole
 * published catalogue, are identical for every anonymous visitor, and are the
 * most requested routes — so a burst of identical requests must cost one
 * database round, not one each.
 *
 * Only ever used for requests WITHOUT a viewer. Staleness is bounded by
 * `PUBLIC_QUERY_CACHE_TTL_MS` (production default 15 s; 0 = off, the default
 * outside production so tests see their own writes immediately). With the
 * stale-while-revalidate window an entry can be served for at most
 * `TTL + TTL/3` (20 s at the 15 s default) before a caller must wait.
 */
@Injectable()
export class PublicQueryCache {
  private readonly cache: SingleFlightTtlCache<unknown>;

  constructor(config: ConfigService) {
    const ttlMs = config.get<number>('publicQueryCacheTtlMs') ?? 0;
    this.cache = new SingleFlightTtlCache<unknown>(
      ttlMs,
      MAX_ENTRIES,
      Date.now,
      (result) => queryCacheTotal.inc({ cache: 'public_query', result }),
      // Serve the previous value for up to a third of the TTL more while one
      // background load refreshes it: no caller waits for the reload at expiry.
      Math.floor(ttlMs / 3),
    );
  }

  /** Caches `load()` under `name` + the request's parameters (viewer-free). */
  get<T>(name: string, params: unknown, load: () => Promise<T>): Promise<T> {
    const key = `${name}:${stableKey(params)}`;
    if (key.length > MAX_KEY_LENGTH) {
      queryCacheTotal.inc({ cache: 'public_query', result: 'bypass' });
      return load();
    }
    return this.cache.getOrLoad(key, load) as Promise<T>;
  }
}
