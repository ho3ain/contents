import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request diagnostic context (Batch 10 — Workstream C).
 *
 * An AsyncLocalStorage store is opened by the request-id middleware (the
 * first middleware in the chain) so that EVERY log line emitted during the
 * request — controller, service, gateway adapter, email worker callback —
 * carries the same requestId without threading it through every signature.
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  /** Set while an admin impersonates `userId` (Phase 3). */
  actingAdminId?: string;
  /** W3C trace id (32 hex) shared with the caller's trace. */
  traceId?: string;
  /** This service's span id (16 hex). */
  spanId?: string;
  method?: string;
  route?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` inside a new request context. */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return requestContextStorage.run(context, fn);
}

/** The context of the request being served on this async chain, if any. */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/** Merges a patch into the current request context (e.g. userId after auth). */
export function patchRequestContext(patch: Partial<RequestContext>): void {
  const store = requestContextStorage.getStore();
  if (!store) return;
  Object.assign(store, patch);
}
