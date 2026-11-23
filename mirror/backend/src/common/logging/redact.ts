/**
 * Centralized log redaction (Batch 10 — Workstream C, §37).
 *
 * Every structured log entry passes through `redactForLog` before it is
 * serialized: sensitive keys are replaced wherever they appear in the object
 * graph, and oversized values are truncated so a logged entity can never
 * blow up the log pipeline. Redaction must NOT rely on each call site
 * remembering to sanitize its own fields.
 */

const SENSITIVE_KEY_PATTERN =
  /(pass(word|wd)?|secret|token|authorization|auth|cookie|session|cvv|cvc|card(_?number|pan|no)?|api[-_]?key|smtp[-_]?pass|webhook[-_]?secret|client[-_]?secret|credential|private[-_]?key|refresh|bearer|code)/i;

/** Keys that hold one-time codes — redacted by exact name only. */
const EXACT_SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'cvv',
  'cvc',
  'password',
  'passwordconfirmation',
  'confirmpassword',
  'newpassword',
  'currentpassword',
  'smtp_password',
  'smtppassword',
]);

const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 6;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s_-]/g, '');
  if (EXACT_SENSITIVE_KEYS.has(normalized)) return true;
  if (normalized === 'code' || normalized.endsWith('code')) {
    // `code` alone is ambiguous (error codes are safe); only exact
    // verification-style names are sensitive.
    return /verification|reset|otp|one[-_]?time/.test(normalized);
  }
  return (
    SENSITIVE_KEY_PATTERN.test(key) && !/errorcode|statuscode/.test(normalized)
  );
}

/**
 * Returns a redacted, size-bounded copy of `value` safe for logs.
 * The input is never mutated.
 */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated ${value.length}]`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return '[fn]';
  if (depth >= MAX_DEPTH) return '[max-depth]';

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactForLog(item, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value instanceof Map || value instanceof Set) {
    return `[${value.constructor.name}]`;
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redactForLog(val, depth + 1);
  }
  return output;
}

/** Redacts a single scalar or object destined for a log field. */
export function redactValue(value: unknown): unknown {
  return redactForLog(value);
}

const FREE_TEXT_RULES: Array<[RegExp, string]> = [
  // JWT-shaped strings (header.payload.signature)
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, REDACTED],
  // Authorization header values
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
  // key=value / key: value pairs for secret-looking keys
  [
    /\b(password|passwd|secret|token|api[-_]?key|authorization|cookie|code)(["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi,
    `$1$2${REDACTED}`,
  ],
  // e-mail addresses
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // long opaque tokens: hex or base64url runs of 32+ characters
  [/\b[A-Fa-f0-9]{32,}\b/g, REDACTED],
  // (lookarounds, not \b: a url-safe token may END in '-', where \b never matches)
  [/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,}(?![A-Za-z0-9_-])/g, REDACTED],
];

/**
 * Scrubs secrets and personal data out of FREE TEXT (error messages, stack
 * traces, URLs) that cannot be redacted by key. Used for text that originates
 * in a browser and therefore cannot be trusted to be clean.
 */
export function scrubFreeText(value: string): string {
  let out = value;
  for (const [pattern, replacement] of FREE_TEXT_RULES) {
    out = out.replace(pattern, replacement);
  }
  return out.length > MAX_STRING_LENGTH
    ? `${out.slice(0, MAX_STRING_LENGTH)}…[truncated ${out.length}]`
    : out;
}

export { REDACTED };
