import { returned } from '../../common/db/returned';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { FieldCryptoService } from '../../common/crypto/field-crypto.service';
import {
  buildOtpauthUri,
  generateTotpSecret,
  verifyTotp,
} from '../../common/crypto/totp';
import { ApiException } from '../../common/errors/api-error';
import { UsersService } from '../users/users.service';
import { AuthTokensService } from './auth-tokens.service';
import { LoginAttemptsService } from './login-attempts.service';

export const MFA_CHALLENGE_TTL_SECONDS = 300;
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
export const RECOVERY_CODE_COUNT = 10;
const ISSUER = 'Mesh';
/** 32 symbols, no 0/O/1/I: codes are read off a screen or paper by a person. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface TwoFactorStatus {
  enabled: boolean;
  /** Setup was started but never confirmed: 2FA is not protecting the account yet. */
  pendingSetup: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export type SecondFactorKind = 'totp' | 'recovery';

/**
 * Time-based one-time passwords + single-use recovery codes.
 *
 * Security properties (each covered by a test):
 *  - the seed is encrypted at rest and bound to the user id (a copied value
 *    fails to decrypt for another account);
 *  - a seed is only *active* after the user proves the app works (confirm);
 *  - a TOTP code can be used once: the accepted time step is stored with an
 *    atomic compare-and-set, so replays and parallel submissions both fail;
 *  - recovery codes are stored as keyed hashes and burn on use (CAS);
 *  - brute force is bounded per challenge AND per account, so minting fresh
 *    challenges with a stolen password does not reset the budget;
 *  - turning it off / regenerating codes needs the current password and a
 *    valid second factor.
 */
@Injectable()
export class TwoFactorService {
  private readonly hmacKey: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: FieldCryptoService,
    private readonly tokens: AuthTokensService,
    private readonly loginAttempts: LoginAttemptsService,
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    this.hmacKey = config.getOrThrow<string>('jwtAccessSecret');
  }

  private context(userId: string): string {
    return `user_totp.secret:${userId}`;
  }

  private recoveryHash(userId: string, code: string): string {
    return createHmac('sha256', this.hmacKey)
      .update(`recovery:${userId}:${normalizeRecoveryCode(code)}`)
      .digest('hex');
  }

  // ------------------------------------------------------------------
  // Status / setup
  // ------------------------------------------------------------------

  async isEnabled(userId: string): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM "user_totp" WHERE "user_id" = $1 AND "confirmed_at" IS NOT NULL`,
      [userId],
    );
    return rows.length > 0;
  }

  async status(userId: string): Promise<TwoFactorStatus> {
    const rows: Array<{ confirmed_at: Date | null }> =
      await this.dataSource.query(
        `SELECT "confirmed_at" FROM "user_totp" WHERE "user_id" = $1`,
        [userId],
      );
    const row = rows[0];
    const remaining: Array<{ n: string }> = row?.confirmed_at
      ? await this.dataSource.query(
          `SELECT count(*)::text AS n FROM "user_recovery_codes" WHERE "user_id" = $1 AND "used_at" IS NULL`,
          [userId],
        )
      : [{ n: '0' }];
    return {
      enabled: Boolean(row?.confirmed_at),
      pendingSetup: Boolean(row && !row.confirmed_at),
      enabledAt: row?.confirmed_at ? row.confirmed_at.toISOString() : null,
      recoveryCodesRemaining: Number(remaining[0].n),
    };
  }

  /** Starts (or restarts) setup. Refused while 2FA is already active. */
  async beginSetup(
    userId: string,
    accountName: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    this.requireStorage();
    if (await this.isEnabled(userId)) {
      throw new ApiException(
        'CONFLICT',
        'Two-step sign-in is already on. Turn it off first to set it up again.',
        HttpStatus.CONFLICT,
      );
    }
    const secret = generateTotpSecret();
    await this.dataSource.query(
      `INSERT INTO "user_totp" ("user_id", "secret_enc", "confirmed_at", "last_used_step")
       VALUES ($1, $2, NULL, 0)
       ON CONFLICT ("user_id") DO UPDATE
         SET "secret_enc" = EXCLUDED."secret_enc", "confirmed_at" = NULL,
             "last_used_step" = 0, "updated_at" = now()`,
      [userId, this.crypto.encrypt(secret, this.context(userId))],
    );
    return {
      secret,
      otpauthUri: buildOtpauthUri({
        secretBase32: secret,
        accountName,
        issuer: ISSUER,
      }),
    };
  }

  /** Confirms setup with a first valid code and returns the recovery codes (shown once). */
  async confirmSetup(userId: string, code: string): Promise<string[]> {
    this.requireStorage();
    const rows: Array<{ secret_enc: string; confirmed_at: Date | null }> =
      await this.dataSource.query(
        `SELECT "secret_enc", "confirmed_at" FROM "user_totp" WHERE "user_id" = $1`,
        [userId],
      );
    const row = rows[0];
    if (!row || row.confirmed_at) {
      throw new ApiException(
        'INVALID_STATE',
        'There is no pending two-step setup to confirm',
        HttpStatus.CONFLICT,
      );
    }
    const step = verifyTotp(
      this.crypto.decrypt(row.secret_enc, this.context(userId)),
      normalizeDigits(code),
    );
    if (step === null) throw invalidCode();
    const updated = returned<unknown[]>(
      await this.dataSource.query(
        `UPDATE "user_totp"
          SET "confirmed_at" = now(), "last_used_step" = $2, "updated_at" = now()
        WHERE "user_id" = $1 AND "confirmed_at" IS NULL
        RETURNING 1`,
        [userId, step],
      ),
    );
    if (updated.length === 0) throw invalidCode();
    return this.replaceRecoveryCodes(userId);
  }

  // ------------------------------------------------------------------
  // Management (password + a valid second factor required)
  // ------------------------------------------------------------------

  async disable(
    userId: string,
    password: string,
    secondFactor: string,
    ip: string | null,
  ): Promise<void> {
    await this.assertPassword(userId, password);
    await this.verifySecondFactor(userId, secondFactor, ip);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`DELETE FROM "user_totp" WHERE "user_id" = $1`, [
        userId,
      ]);
      await manager.query(
        `DELETE FROM "user_recovery_codes" WHERE "user_id" = $1`,
        [userId],
      );
      await manager.query(`DELETE FROM "mfa_challenges" WHERE "user_id" = $1`, [
        userId,
      ]);
    });
  }

  async regenerateRecoveryCodes(
    userId: string,
    password: string,
    secondFactor: string,
    ip: string | null,
  ): Promise<string[]> {
    await this.assertPassword(userId, password);
    await this.verifySecondFactor(userId, secondFactor, ip);
    return this.replaceRecoveryCodes(userId);
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      generateRecoveryCode(),
    );
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM "user_recovery_codes" WHERE "user_id" = $1`,
        [userId],
      );
      for (const code of codes) {
        await manager.query(
          `INSERT INTO "user_recovery_codes" ("user_id", "code_hash") VALUES ($1, $2)`,
          [userId, this.recoveryHash(userId, code)],
        );
      }
    });
    return codes;
  }

  private async assertPassword(userId: string, password: string) {
    const user = await this.users.findById(userId);
    const ok =
      user !== null &&
      (await bcrypt.compare(password ?? '', user.passwordHash ?? ''));
    if (!ok) {
      throw new ApiException(
        'INVALID_CREDENTIALS',
        'The password is not correct',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  // ------------------------------------------------------------------
  // Second-factor verification
  // ------------------------------------------------------------------

  /**
   * Accepts a 6-digit authenticator code or a recovery code. Counts failures
   * against the account (progressive lock) and throws on failure.
   */
  async verifySecondFactor(
    userId: string,
    input: string,
    ip: string | null,
  ): Promise<SecondFactorKind> {
    const identity = `mfa:${userId}`;
    // Reserve-then-verify (see LoginAttemptsService): a 6-digit code is only
    // safe if parallel guesses cannot outrun the lock.
    const reservation = await this.loginAttempts.reserve(identity, ip);
    if (!reservation.allowed) {
      throw new ApiException(
        'TOO_MANY_REQUESTS',
        'Too many incorrect codes. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSeconds: reservation.retryAfterSeconds },
      );
    }
    const kind = await this.tryFactor(userId, input);
    if (!kind) {
      const outcome = reservation;
      if (outcome.lockEngaged) {
        throw new ApiException(
          'TOO_MANY_REQUESTS',
          'Too many incorrect codes. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
          { retryAfterSeconds: outcome.retryAfterSeconds },
        );
      }
      throw invalidCode();
    }
    await this.loginAttempts.recordSuccess(identity, ip);
    return kind;
  }

  private async tryFactor(
    userId: string,
    input: string,
  ): Promise<SecondFactorKind | null> {
    const digits = normalizeDigits(input);
    if (/^\d{6}$/.test(digits)) {
      const rows: Array<{ secret_enc: string }> = await this.dataSource.query(
        `SELECT "secret_enc" FROM "user_totp" WHERE "user_id" = $1 AND "confirmed_at" IS NOT NULL`,
        [userId],
      );
      if (rows.length === 0) return null;
      const step = verifyTotp(
        this.crypto.decrypt(rows[0].secret_enc, this.context(userId)),
        digits,
      );
      if (step === null) return null;
      // Atomic replay guard: only a strictly newer step wins.
      const claimed = returned<unknown[]>(
        await this.dataSource.query(
          `UPDATE "user_totp" SET "last_used_step" = $2, "updated_at" = now()
          WHERE "user_id" = $1 AND "last_used_step" < $2 RETURNING 1`,
          [userId, step],
        ),
      );
      return claimed.length > 0 ? 'totp' : null;
    }
    const code = normalizeRecoveryCode(input);
    if (code.length !== 10) return null;
    const burned = returned<unknown[]>(
      await this.dataSource.query(
        `UPDATE "user_recovery_codes" SET "used_at" = now()
        WHERE "user_id" = $1 AND "code_hash" = $2 AND "used_at" IS NULL
        RETURNING 1`,
        [userId, this.recoveryHash(userId, code)],
      ),
    );
    return burned.length > 0 ? 'recovery' : null;
  }

  // ------------------------------------------------------------------
  // Login challenge
  // ------------------------------------------------------------------

  async createChallenge(
    userId: string,
  ): Promise<{ token: string; expiresInSeconds: number }> {
    const token = this.tokens.randomToken(32);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`DELETE FROM "mfa_challenges" WHERE "user_id" = $1`, [
        userId,
      ]);
      await manager.query(
        `INSERT INTO "mfa_challenges" ("user_id", "token_hash", "expires_at")
         VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
        [
          userId,
          this.tokens.hashToken(token),
          String(MFA_CHALLENGE_TTL_SECONDS),
        ],
      );
    });
    return { token, expiresInSeconds: MFA_CHALLENGE_TTL_SECONDS };
  }

  /**
   * Exchanges a challenge + second factor for the user id. The challenge is
   * single-use: it is consumed on success and destroyed after too many wrong
   * codes.
   */
  async completeChallenge(
    token: string,
    input: string,
    ip: string | null,
  ): Promise<{ userId: string; kind: SecondFactorKind }> {
    const hash = this.tokens.hashToken(token ?? '');
    const rows: Array<{ id: string; user_id: string; attempts: number }> =
      await this.dataSource.query(
        `SELECT "id", "user_id", "attempts" FROM "mfa_challenges"
          WHERE "token_hash" = $1 AND "expires_at" > now()`,
        [hash],
      );
    const challenge = rows[0];
    if (!challenge) {
      throw new ApiException(
        'TOKEN_EXPIRED',
        'The sign-in step has expired. Sign in again.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    try {
      const kind = await this.verifySecondFactor(challenge.user_id, input, ip);
      const consumed = returned<unknown[]>(
        await this.dataSource.query(
          `DELETE FROM "mfa_challenges" WHERE "id" = $1 RETURNING 1`,
          [challenge.id],
        ),
      );
      if (consumed.length === 0) throw invalidCode(); // raced: already used
      return { userId: challenge.user_id, kind };
    } catch (error) {
      if (error instanceof ApiException && error.code === 'INVALID_MFA_CODE') {
        const next = returned<Array<{ attempts: number }>>(
          await this.dataSource.query(
            `UPDATE "mfa_challenges" SET "attempts" = "attempts" + 1
            WHERE "id" = $1 RETURNING "attempts"`,
            [challenge.id],
          ),
        );
        if ((next[0]?.attempts ?? 0) >= MFA_CHALLENGE_MAX_ATTEMPTS) {
          await this.dataSource.query(
            `DELETE FROM "mfa_challenges" WHERE "id" = $1`,
            [challenge.id],
          );
          throw new ApiException(
            'TOKEN_EXPIRED',
            'Too many incorrect codes. Sign in again.',
            HttpStatus.UNAUTHORIZED,
          );
        }
      }
      throw error;
    }
  }

  /** Housekeeping: expired challenges are useless. */
  async purgeExpiredChallenges(): Promise<number> {
    const rows = returned<unknown[]>(
      await this.dataSource.query(
        `DELETE FROM "mfa_challenges" WHERE "expires_at" < now() RETURNING 1`,
      ),
    );
    return rows.length;
  }

  private requireStorage(): void {
    if (!this.crypto.available) {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Two-step sign-in is not available on this server',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}

function invalidCode(): ApiException {
  return new ApiException(
    'INVALID_MFA_CODE',
    'The code is not correct or has already been used',
    HttpStatus.UNAUTHORIZED,
  );
}

/** "123 456" / "123-456" → "123456"; also maps Persian/Arabic-Indic digits. */
export function normalizeDigits(input: string): string {
  return String(input ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s-]/g, '');
}

export function normalizeRecoveryCode(input: string): string {
  return String(input ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

/** `ABCDE-FGHJK` — 50 bits from a CSPRNG (rejection-free: 32 symbols = 5 bits). */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (const byte of bytes) out += RECOVERY_ALPHABET[byte & 31];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}
