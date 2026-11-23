/**
 * A small in-process cache for expensive, identical-for-everyone reads.
 *
 *  - TTL: an entry is served for `ttlMs`, then recomputed. `ttlMs <= 0`
 *    disables the cache entirely (every call loads).
 *  - Single flight: concurrent misses for the same key share ONE load, so a
 *    burst of identical requests costs one database round, not N. This is what
 *    protects the database when a cache entry expires under load.
 *  - Bounded: at most `maxEntries`; the least recently used entry is evicted.
 *  - Stale-while-revalidate (optional, `staleMs > 0`): for `staleMs` after the
 *    TTL an entry is still served — once — while ONE background load refreshes
 *    it. Without this, every expiry makes all concurrent callers wait for the
 *    reload (a p99 spike once per TTL under load). Staleness is therefore
 *    bounded by `ttlMs + staleMs`; after that the caller waits for a real load.
 *  - Failures are never cached and never reach a caller as a stale value: every
 *    waiter of a failed foreground load gets the error and the next call
 *    retries. (A failed BACKGROUND refresh is invisible: the entry simply ages
 *    out at `ttlMs + staleMs`.)
 *  - Values are cloned on the way in and out, so a caller that mutates its
 *    response cannot corrupt what the next caller receives.
 *
 * Deliberately NOT shared between processes: each instance keeps its own copy,
 * so the worst staleness is `ttlMs`, with no coordination to get wrong.
 */
export type CacheOutcome = 'hit' | 'stale' | 'miss' | 'coalesced' | 'bypass';

export class SingleFlightTtlCache<T> {
  private readonly entries = new Map<
    string,
    { value: T; expiresAt: number; staleUntil: number }
  >();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
    private readonly onOutcome: (outcome: CacheOutcome) => void = () =>
      undefined,
    private readonly staleMs: number = 0,
  ) {}

  get enabled(): boolean {
    return this.ttlMs > 0 && this.maxEntries > 0;
  }

  get size(): number {
    return this.entries.size;
  }

  async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      this.onOutcome('bypass');
      return load();
    }
    const cached = this.entries.get(key);
    const now = this.now();
    if (cached && cached.expiresAt > now) {
      this.touch(key, cached);
      this.onOutcome('hit');
      return structuredClone(cached.value);
    }
    if (cached && cached.staleUntil > now) {
      // Serve the previous value now; make sure exactly one refresh runs.
      this.touch(key, cached);
      this.onOutcome('stale');
      if (!this.inflight.has(key)) {
        this.startLoad(key, load).catch(() => undefined);
      }
      return structuredClone(cached.value);
    }
    if (cached) this.entries.delete(key);

    const pending = this.inflight.get(key);
    if (pending) {
      this.onOutcome('coalesced');
      return structuredClone(await pending);
    }

    this.onOutcome('miss');
    return structuredClone(await this.startLoad(key, load));
  }

  /** Refresh recency (Map keeps insertion order: last = most recent). */
  private touch(
    key: string,
    entry: { value: T; expiresAt: number; staleUntil: number },
  ): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private startLoad(key: string, load: () => Promise<T>): Promise<T> {
    const loading = load().then(
      (value) => {
        this.inflight.delete(key);
        const expiresAt = this.now() + this.ttlMs;
        this.entries.set(key, {
          value: structuredClone(value),
          expiresAt,
          staleUntil: expiresAt + Math.max(0, this.staleMs),
        });
        while (this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next().value as string;
          this.entries.delete(oldest);
        }
        return value;
      },
      (error: unknown) => {
        this.inflight.delete(key);
        throw error;
      },
    );
    this.inflight.set(key, loading);
    return loading;
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Stable text for an object (sorted keys), used to build cache keys. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}
