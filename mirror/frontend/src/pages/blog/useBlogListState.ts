import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { OnChange } from './BlogFilters';
import { listSearchParams, patchState, readListState, type BlogListState, type LockedDimension } from './blogListState';

/**
 * URL round-trip shared by `/blog` and the archive pages: the state is read
 * from the query string on every render and every change is written back
 * (`replace` while typing a query so history is not flooded).
 *
 * Two quick interactions (sort, then reading time before React committed the
 * first URL) must not lose the first one: React Router's `setSearchParams`
 * reads the params captured at render time, so the hook remembers the last
 * state it wrote until the location catches up and patches on top of that.
 */
export function useBlogListState(lock?: LockedDimension): [BlogListState, OnChange] {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const state = readListState(params, lock);
  const pending = useRef<{ search: string; state: BlogListState } | null>(null);

  useEffect(() => {
    // The location committed (our own write or the back button) — fresh
    // params are authoritative again.
    pending.current = null;
  }, [search]);

  const onChange = useCallback<OnChange>(
    (patch, options) => {
      const base = pending.current && pending.current.search !== search ? pending.current.state : readListState(params, lock);
      const next = patchState(base, patch);
      const qs = listSearchParams(next).toString();
      const nextSearch = qs ? `?${qs}` : '';
      pending.current = { search: nextSearch, state: next };
      navigate({ search: nextSearch }, { replace: options?.replace });
    },
    [navigate, params, search, lock],
  );
  return [state, onChange];
}
