/**
 * Error presentation contract (Phase 10.4):
 * - API error codes map to localized, human-readable messages via i18n
 *   (`errors.*` namespace) — never raw stack traces or internals.
 * - The original backend code is preserved where useful (ApiError.code).
 */
import { ApiError, retryAfterSeconds } from '../api/client';
import { getLocale, t, tHas } from '../i18n';

/** Persian / Arabic script — a server message the Persian UI may show as-is. */
const PERSIAN_SCRIPT = /[\u0600-\u06FF]/;

/**
 * A server message is shown only when it is safe and readable in the
 * current locale: never for 5xx (internals) and, in the Persian UI, never
 * raw English backend text (A5 §34) — the generic message is used instead.
 */
function presentableServerMessage(error: ApiError): string {
  if (error.status >= 500) return withSupportRef(t('errors.generic'), error);
  if (!error.message) return t('errors.generic');
  if (getLocale() === 'fa' && !PERSIAN_SCRIPT.test(error.message)) return t('errors.generic');
  return error.message;
}

/** Localized message for an unknown error object. */
/**
 * Server failures (5xx) carry the correlation id the API echoed in
 * `X-Request-ID`, so the person can quote exactly the id operations grep the
 * logs for (Sprint 3, S3-05 F-06). Never shown for 4xx — those are the
 * user's own input/permission and need no incident lookup.
 */
function withSupportRef(message: string, error: ApiError): string {
  return error.requestId ? `${message} ${t('errors.supportRef', { id: error.requestId })}` : message;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // A temporary sign-in lock tells the person exactly how long to wait.
    if (error.code === 'TOO_MANY_REQUESTS') {
      const wait = retryAfterSeconds(error);
      if (wait !== null) {
        return wait < 60
          ? t('errors.lockedSeconds', { seconds: wait })
          : t('errors.lockedMinutes', { minutes: Math.ceil(wait / 60) });
      }
    }
    // A specific machine reason (`details.code`, e.g. SECRET_IN_TEXT) beats the
    // generic top-level code (VALIDATION_ERROR / INVALID_STATE).
    const reason = detailCode(error.details);
    const specific = reason ? codeLabel(reason) : '';
    if (specific) return specific;
    const labeled = codeLabel(error.code);
    if (labeled) return error.status >= 500 ? withSupportRef(labeled, error) : labeled;
    return presentableServerMessage(error);
  }
  if (error instanceof Error && error.message) return error.message;
  return t('errors.generic');
}

function detailCode(details: unknown): string | null {
  if (details && typeof details === 'object' && 'code' in details) {
    const code = (details as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z_]{3,48}$/.test(code)) return code;
  }
  return null;
}

export function errorCode(error: unknown): string | null {
  if (error instanceof ApiError) return error.code;
  return null;
}

/**
 * Friendly localized label for a backend error code
 * (used by forms and inline alerts). Returns '' for unknown codes so
 * callers can fall back to the server message.
 */
export function codeLabel(code: string): string {
  const key = `errors.${code}`;
  return tHas(key) ? t(key) : '';
}
