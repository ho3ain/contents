import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { errorMessage } from './error';

export interface AsyncFailure {
  code: string | null;
  /** HTTP status (0 = network). Lets pages render a permission state (A3 §44). */
  status: number | null;
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  failure: AsyncFailure | null;
  /** Re-run and show the loading state again. */
  refetch: () => void;
  /** Re-run silently: keep the current data on screen until the new data arrives. */
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<AsyncFailure | null>(null);
  const [tick, setTick] = useState(0);
  const [completedDeps, setCompletedDeps] = useState<unknown[] | null>(null);
  const dependenciesChanged =
    completedDeps === null ||
    completedDeps.length !== deps.length ||
    deps.some((dependency, index) => !Object.is(dependency, completedDeps[index]));

  useEffect(() => {
    let cancelled = false;

    // First run starts in the loading state already (initial useState);
    // refetches flip it back to loading inside the async flow below.
    const run = async () => {
      try {
        const result = await fn();
        if (!cancelled) {
          setData(result);
          setError(null);
          setFailure(null);
          setLoading(false);
          setCompletedDeps([...deps]);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setData(null);
          setError(errorMessage(err));
          setFailure(
            err instanceof ApiError ? { code: err.code, status: err.status } : { code: null, status: null },
          );
          setLoading(false);
          setCompletedDeps([...deps]);
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    setTick((current) => current + 1);
  }, []);

  const reload = useCallback(() => {
    setTick((current) => current + 1);
  }, []);

  return {
    data,
    loading: loading || dependenciesChanged,
    error: dependenciesChanged ? null : error,
    failure: dependenciesChanged ? null : failure,
    refetch,
    reload,
  };
}
