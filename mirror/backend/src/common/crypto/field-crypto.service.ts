import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hkdfSync } from 'crypto';
import { ApiException } from '../errors/api-error';
import { FieldCrypto, FieldKeyRing } from './field-crypto';

/**
 * Injectable wrapper around `FieldCrypto` shared by every feature that stores
 * a secret it must read back (TOTP seeds, bank account numbers).
 *
 *  - Production: requires `FIELD_ENCRYPTION_KEYS` (validated at startup when
 *    set). Without it the dependent features answer 503 rather than storing
 *    anything in clear — failing closed.
 *  - Development/test: a key derived (HKDF) from the JWT secret, so the
 *    features work out of the box. The derived key is never used in
 *    production, where the JWT secret is already required to be strong and
 *    must not double as a data-encryption key.
 */
@Injectable()
export class FieldCryptoService {
  private readonly logger = new Logger(FieldCryptoService.name);
  private readonly crypto: FieldCrypto | null;

  constructor(config: ConfigService) {
    const ring = config.get<FieldKeyRing | null>('fieldEncryption') ?? null;
    if (ring) {
      this.crypto = new FieldCrypto(ring);
    } else if (config.get<string>('nodeEnv') === 'production') {
      this.crypto = null;
      this.logger.warn(
        'FIELD_ENCRYPTION_KEYS is not set: two-factor authentication and payout bank accounts are unavailable until it is.',
      );
    } else {
      const secret = config.getOrThrow<string>('jwtAccessSecret');
      const derived = Buffer.from(
        hkdfSync('sha256', secret, 'mesh-field-crypto', 'dev-data-key-v1', 32),
      );
      this.crypto = new FieldCrypto({
        currentKeyId: 'dev',
        keys: new Map([['dev', derived]]),
      });
    }
  }

  get available(): boolean {
    return this.crypto !== null;
  }

  encrypt(plaintext: string, context: string): string {
    return this.require().encrypt(plaintext, context);
  }

  decrypt(envelope: string, context: string): string {
    return this.require().decrypt(envelope, context);
  }

  blindIndex(plaintext: string, purpose: string): string {
    return this.require().blindIndex(plaintext, purpose);
  }

  private require(): FieldCrypto {
    if (!this.crypto) {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Secure storage is not configured on this server',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.crypto;
  }
}
