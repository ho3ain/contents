/**
 * Phase C1 — event privacy (spec §11).
 *
 * "اطلاعات Payment Card، Password، Tokenهای حساس و Secretها نباید وارد
 *  Analytics/Event Metadata شوند."
 *
 * This is a hard boundary at the WRITER, not a UI convention: every event
 * goes through `sanitizeMetadata()` before it reaches the database, so a
 * careless call site cannot leak a card number or a refresh token into a
 * table the growth team can read.
 *
 * The sanitizer is deny-by-default on KEY NAME and heuristic on VALUE:
 *   1. a key whose name looks sensitive is dropped entirely;
 *   2. any string value that looks like a card / token / secret is redacted;
 *   3. depth and breadth are bounded so a nested blob cannot blow up a row.
 */

const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|secret|token|api[-_]?key|authorization|auth[-_]?header|cookie|session|cvv|cvc|card[-_]?num|card[-_]?number|pan|iban|account[-_]?number|bank[-_]?account|ssn|national[-_]?id|private[-_]?key|refresh|access[-_]?token|bearer|otp|pin)/i;

const REDACTED = '[redacted]';

/** Long opaque strings that are not free text — tokens, hashes, JWTs. */
const TOKEN_LIKE = /^[A-Za-z0-9_\-+/=]{24,}$/;
const JWT_LIKE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** 12–19 digits with optional separators = a payment card. */
const CARD_LIKE = /^(?:\d[ -]?){12,19}$/;
/** Iran / international IBANs. */
const IBAN_LIKE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
/** bcrypt / argon2 hashes. */
const HASH_LIKE = /^\$(2[aby]|argon2)[$/.]/;

const MAX_DEPTH = 4;
const MAX_KEYS = 40;
const MAX_STRING = 512;
const MAX_ARRAY = 20;

/** True when a free-text value must never be stored as event metadata. */
export function looksSensitiveValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (JWT_LIKE.test(trimmed)) return true;
  if (CARD_LIKE.test(trimmed.replace(/[\s-]/g, ''))) return true;
  if (IBAN_LIKE.test(trimmed.replace(/\s/g, ''))) return true;
  if (HASH_LIKE.test(trimmed)) return true;
  // A hex blob of 32+ chars is a hash, not a word.
  if (/^[a-f0-9]{32,}$/i.test(trimmed)) return true;
  // A high-entropy opaque string — but NOT a normal sentence or a UUID.
  if (TOKEN_LIKE.test(trimmed) && !/^[0-9a-f-]{36}$/i.test(trimmed))
    return true;
  return false;
}

function sanitizeString(value: string): string {
  if (looksSensitiveValue(value)) return REDACTED;
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
}

function walk(
  value: unknown,
  depth: number,
  budget: { keys: number },
): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value.slice(0, MAX_ARRAY)) {
      if (budget.keys >= MAX_KEYS) break;
      budget.keys += 1;
      items.push(walk(item, depth + 1, budget));
    }
    return items;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (budget.keys >= MAX_KEYS) break;
      budget.keys += 1;
      if (SENSITIVE_KEY_PATTERN.test(key)) continue;
      out[key] = walk(raw, depth + 1, budget);
    }
    return out;
  }
  // functions, symbols, bigint…
  return null;
}

/**
 * The single writer-side guard. Always returns a JSON-safe object with no
 * sensitive key and no sensitive value; never throws.
 */
export function sanitizeMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return {};
  const result = walk(metadata, 0, { keys: 0 });
  return result && typeof result === 'object' && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : {};
}

/** True when a sanitize pass would have removed something (used in tests). */
export function containsSensitiveData(metadata: unknown): boolean {
  return (
    JSON.stringify(sanitizeMetadata(metadata)) !==
    JSON.stringify(metadata ?? {})
  );
}

export { REDACTED, SENSITIVE_KEY_PATTERN };
