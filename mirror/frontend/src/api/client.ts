import type { ApiErrorBody, AuthResponse, Envelope } from './types';

const API_PREFIX = '/api/v1';
/**
 * API base origin. Default: SAME-ORIGIN (empty string) — the Vite dev
 * server (and `vite preview`) proxy `/api` to the backend (see
 * vite.config.ts). Same-origin means:
 *   - no CORS configuration needed for local dev/preview;
 *   - the httpOnly refresh cookie is first-party (no cross-site issues);
 *   - the app works from any host the dev server is reached through
 *     (localhost, LAN IP, or a sandbox preview URL) — the browser never
 *     needs to reach `localhost:3000` itself.
 * Override with `VITE_API_URL` when the API lives on another origin
 * (either the bare origin, e.g. `http://localhost:3000`, or the full
 * origin+prefix — both are accepted; the `/api/v1` prefix is never
 * appended twice).
 */
const RAW_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const BASE_URL = RAW_BASE_URL.endsWith(API_PREFIX)
  ? RAW_BASE_URL.slice(0, -API_PREFIX.length)
  : RAW_BASE_URL;

/** API origin ('' = same origin as the app, proxied under /api). */
export function apiOrigin(): string {
  return BASE_URL;
}

// Access token is kept in memory only (never localStorage) — sessions are
// re-established via the httpOnly refresh cookie when the page reloads.
let accessToken: string | null = null;
const authListeners = new Set<() => void>();

/**
 * The refresh token lives in an httpOnly cookie the page cannot inspect, so we
 * keep a readable "session exists" hint cookie. Without it we skip the refresh
 * call entirely — anonymous visitors otherwise fire a doomed 401 request (and
 * a console error) on every page load.
 */
const SESSION_HINT_COOKIE = 'ah-session-hint';

function hasSessionHint(): boolean {
  try {
    return document.cookie.includes(SESSION_HINT_COOKIE);
  } catch {
    // storage unavailable — fall back to attempting refresh
    return true;
  }
}

export function markSessionActive(): void {
  try {
    document.cookie = `${SESSION_HINT_COOKIE}=1; path=/; max-age=2592000; samesite=lax`;
  } catch {
    /* non-fatal */
  }
}

export function clearSessionHint(): void {
  try {
    document.cookie = `${SESSION_HINT_COOKIE}=; path=/; max-age=0`;
  } catch {
    /* non-fatal */
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  authListeners.forEach((listener) => listener());
}

/**
 * Impersonation (Phase 3): while an impersonation token is in use the refresh
 * cookie still belongs to the ADMIN. A 401 must therefore never silently
 * exchange it for an admin token behind an on-screen "viewing as user" state;
 * the session simply ends (`IMPERSONATION_ENDED`) and the UI returns to admin.
 */
let impersonating = false;
export function setImpersonating(value: boolean): void {
  impersonating = value;
}
export function isImpersonating(): boolean {
  return impersonating;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onAuthChange(listener: () => void): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

/** Seconds the server asks the client to wait (sign-in lock / throttling). */
export function retryAfterSeconds(error: ApiError): number | null {
  const details = error.details;
  if (details && typeof details === 'object' && 'retryAfterSeconds' in details) {
    const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.ceil(value);
  }
  return null;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  /**
   * Server correlation id (`X-Request-ID` response header). Every backend
   * log line of that request carries the same value, so a person quoting it
   * to support lets operations find the incident immediately (Sprint 3,
   * S3-05 F-06). Absent for network failures and for non-API responses.
   */
  requestId?: string;

  constructor(code: string, message: string, status: number, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    if (requestId) this.requestId = requestId;
  }
}

/** Safe copy of the correlation id the API echoes (same charset/length rule as the server). */
function requestIdOf(response: Response): string | undefined {
  const raw = response.headers.get('x-request-id');
  return raw && /^[A-Za-z0-9_.:-]{8,128}$/.test(raw) ? raw : undefined;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  retry?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE_URL}${API_PREFIX}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `${url}?${serialized}` : url;
}

/**
 * Gap closure (P7) — a fire-and-forget request that survives page unload
 * (`fetch(..., { keepalive: true })`). Browsers cap keepalive bodies at
 * 64 KB, so larger bodies are not sent (returns false) — the caller keeps
 * its local recovery copy instead. Never throws.
 */
export function keepaliveRequest(path: string, method: 'PATCH' | 'POST' | 'PUT', body: unknown): boolean {
  try {
    const json = JSON.stringify(body);
    if (json.length > 60_000 || typeof fetch !== 'function') return false;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    void fetch(buildUrl(path), { method, headers, body: json, credentials: 'include', keepalive: true }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, skipAuth = false, retry = true } = options;
  const headers: Record<string, string> = {};
  // Multipart uploads (gap closure — media storage): the browser sets the
  // Content-Type with its boundary; never JSON-encode a FormData body.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (!skipAuth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: 'include', // refresh cookie
      body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Network request failed. Check your connection.', 0);
  }

  if (response.status === 401 && !skipAuth && retry && !impersonating) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, { ...options, retry: false });
    }
    throw unauthorizedError();
  }

  if (!response.ok) {
    let errorBody: ApiErrorBody | undefined;
    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      // non-JSON error body
    }
    const error = errorBody?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.details,
      requestIdOf(response),
    );
  }

  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as Envelope<T> | T;
  if (payload && typeof payload === 'object' && 'success' in payload) {
    const envelope = payload as Envelope<T>;
    return envelope.data;
  }
  return payload as T;
}

/**
 * Single choke-point for the refresh-token exchange. Concurrent callers
 * (StrictMode's double bootstrap, simultaneous 401 retries) share one in-flight
 * request: the backend rotates the refresh cookie on every exchange, so a
 * second parallel call would use the already-consumed cookie and fail with 401
 * even though the session is alive.
 */
let refreshPromise: Promise<AuthResponse | null> | null = null;

export function refreshSession(): Promise<AuthResponse | null> {
  if (!hasSessionHint()) return Promise.resolve(null);
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE_URL}${API_PREFIX}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          clearSessionHint();
          return null;
        }
        const payload = (await response.json()) as Envelope<AuthResponse>;
        setAccessToken(payload.data.accessToken);
        markSessionActive();
        return payload.data;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function tryRefresh(): Promise<boolean> {
  return (await refreshSession()) !== null;
}

/** Whether a persisted session plausibly exists (used to skip doomed refreshes). */
export function hasPersistedSession(): boolean {
  return hasSessionHint();
}

function unauthorizedError(): ApiError {
  return new ApiError('UNAUTHORIZED', 'Your session has expired. Please sign in again.', 401);
}

export const http = {
  get: <T>(path: string, query?: RequestOptions['query'], skipAuth = false) =>
    request<T>(path, { query, skipAuth }),
  post: <T>(path: string, body?: unknown, options?: { skipAuth?: boolean }) =>
    request<T>(path, { method: 'POST', body, skipAuth: options?.skipAuth }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, form: Record<string, string>) =>
    request<T>(path, { method: 'POST', body: form, skipAuth: false }),
};

/**
 * Download a file with the bearer token attached.
 *
 * The CRM export is a real CSV from an authenticated endpoint, so an
 * `<a href>` would land on a login page instead of the file. This is the one
 * place that fetches a Blob rather than JSON, and it deliberately returns the
 * byte length so the UI can report what was actually exported.
 */
export async function downloadFile(url: string, filename: string): Promise<number> {
  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const response = await fetch(url, { headers, credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);

  // Row count: one line per record, minus the header.
  const text = await blob.text();
  const lines = text.split('\n').filter((line) => line.trim().length > 0).length;
  return Math.max(0, lines - 1);
}
