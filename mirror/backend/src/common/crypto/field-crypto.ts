import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'crypto';

/**
 * Application-level encryption for individual sensitive columns
 * (AES-256-GCM, authenticated, with key versioning).
 *
 * Envelope:  `v1.<keyId>.<iv>.<tag>.<ciphertext>`  (base64url segments)
 *
 *  - A fresh random 96-bit IV per call: the same plaintext never produces
 *    the same ciphertext.
 *  - GCM authenticates the ciphertext AND the optional `context`
 *    (e.g. `payout_account.iban:<rowId>`). A value copied into another row
 *    or column fails to decrypt, so a DB-level write cannot swap secrets.
 *  - Keys are identified by id so a new key can be introduced while old
 *    rows stay readable; `needsRotation()` tells a backfill job which rows
 *    still use a retired key.
 *
 * Use it for values that must be READ BACK (account identifiers, API keys
 * a creator gives Mesh). Values that are only ever compared (passwords,
 * refresh tokens, verification codes) must stay one-way hashes instead.
 */

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface FieldKeyRing {
  /** Key used for every new encryption. */
  currentKeyId: string;
  /** keyId → raw 32-byte key (current AND retired keys). */
  keys: ReadonlyMap<string, Buffer>;
}

export class FieldCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldCryptoError';
  }
}

/**
 * Parses `FIELD_ENCRYPTION_KEYS="2026a:<base64 key>,2025b:<base64 key>"`.
 * Every key must decode to exactly 32 bytes; ids are `[A-Za-z0-9_-]{1,32}`.
 */
export function parseKeyRing(spec: string, currentKeyId: string): FieldKeyRing {
  const keys = new Map<string, Buffer>();
  for (const entry of spec.split(',').map((part) => part.trim())) {
    if (entry === '') continue;
    const separator = entry.indexOf(':');
    const id = separator > 0 ? entry.slice(0, separator) : '';
    const encoded = separator > 0 ? entry.slice(separator + 1) : '';
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
      throw new FieldCryptoError(
        'FIELD_ENCRYPTION_KEYS: each entry must look like <keyId>:<base64 key>',
      );
    }
    if (keys.has(id)) {
      throw new FieldCryptoError(
        `FIELD_ENCRYPTION_KEYS: duplicate key id "${id}"`,
      );
    }
    const raw = Buffer.from(encoded, 'base64');
    if (raw.length !== KEY_BYTES) {
      throw new FieldCryptoError(
        `FIELD_ENCRYPTION_KEYS: key "${id}" must be exactly ${KEY_BYTES} bytes (base64)`,
      );
    }
    keys.set(id, raw);
  }
  if (!keys.has(currentKeyId)) {
    throw new FieldCryptoError(
      `FIELD_ENCRYPTION_CURRENT "${currentKeyId}" is not in FIELD_ENCRYPTION_KEYS`,
    );
  }
  return { currentKeyId, keys };
}

export class FieldCrypto {
  constructor(private readonly ring: FieldKeyRing) {
    if (!ring.keys.has(ring.currentKeyId)) {
      throw new FieldCryptoError(
        'The current key is missing from the key ring',
      );
    }
  }

  encrypt(plaintext: string, context = ''): string {
    const key = this.ring.keys.get(this.ring.currentKeyId) as Buffer;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(this.aad(this.ring.currentKeyId, context)));
    const body = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [
      VERSION,
      this.ring.currentKeyId,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      body.toString('base64url'),
    ].join('.');
  }

  decrypt(envelope: string, context = ''): string {
    const [version, keyId, iv, tag, body, ...extra] = envelope.split('.');
    if (
      version !== VERSION ||
      !keyId ||
      !iv ||
      !tag ||
      body === undefined ||
      extra.length > 0
    ) {
      throw new FieldCryptoError('Not a field-encrypted value');
    }
    const key = this.ring.keys.get(keyId);
    if (!key) {
      throw new FieldCryptoError(`Unknown encryption key id "${keyId}"`);
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAAD(Buffer.from(this.aad(keyId, context)));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Never reveal which part failed: wrong key, wrong context and
      // tampering are indistinguishable to a caller.
      throw new FieldCryptoError('Value could not be decrypted');
    }
  }

  /** True when the value is encrypted under a key other than the current one. */
  needsRotation(envelope: string): boolean {
    return envelope.split('.')[1] !== this.ring.currentKeyId;
  }

  /** Re-encrypts under the current key (for backfills after a rotation). */
  rotate(envelope: string, context = ''): string {
    return this.needsRotation(envelope)
      ? this.encrypt(this.decrypt(envelope, context), context)
      : envelope;
  }

  /**
   * Deterministic keyed digest for EQUALITY lookups over encrypted values
   * (e.g. "is this Shaba already registered by someone else?") without a
   * plaintext column. HMAC-SHA256 under a sub-key HKDF-derived from the FIRST
   * key of the ring, so it stays stable when the current encryption key is
   * rotated — keep the first key in FIELD_ENCRYPTION_KEYS (never remove it),
   * or recompute the digests before dropping it.
   */
  blindIndex(plaintext: string, purpose: string): string {
    const first = this.ring.keys.values().next().value as Buffer;
    const subKey = Buffer.from(
      hkdfSync('sha256', first, 'mesh-blind-index', purpose, 32),
    );
    return createHmac('sha256', subKey).update(plaintext, 'utf8').digest('hex');
  }

  private aad(keyId: string, context: string): string {
    return `${VERSION}|${keyId}|${context}`;
  }
}

/** Generates a new random key in the format `FIELD_ENCRYPTION_KEYS` expects. */
export function generateFieldKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}
