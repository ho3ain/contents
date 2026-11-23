import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import { DataSource } from 'typeorm';

/**
 * Progressive lock duration for the N-th consecutive failure.
 *
 *   failures <  threshold → 0 (no lock)
 *   failures >= threshold → base · 2^(failures − threshold), capped at max
 *
 * Pure so the policy is unit-tested without a database.
 */
export function lockSecondsFor(
  failures: number,
  threshold: number,
  baseSeconds: number,
  maxSeconds: number,
): number {
  if (failures < threshold) return 0;
  const exponent = Math.min(failures - threshold, 30);
  return Math.min(maxSeconds, baseSeconds * 2 ** exponent);
}

export interface LockStatus {
  locked: boolean;
  /** Seconds until the lock expires (0 when not locked). */
  retryAfterSeconds: number;
}

export interface Reservation {
  /** False when a lock was already active: do NOT evaluate the credential. */
  allowed: boolean;
  /** True when THIS attempt engaged (or extended) a lock. */
  lockEngaged: boolean;
  scope: 'pair' | 'account' | null;
  /** Seconds of the active (refused) lock or of the lock this attempt engaged. */
  retryAfterSeconds: number;
}

interface CounterRow {
  key_hash: string;
  failures: number;
  locked: boolean;
  stale: boolean;
  remaining: number;
}

/**
 * Brute-force resistance for the sign-in endpoint.
 *
 * Two counters protect each identifier:
 *   - (account, ip): low threshold — stops a single attacker quickly and
 *     cannot be used to lock the legitimate owner out from another address;
 *   - account (any ip): higher threshold — stops distributed guessing.
 *
 * Properties:
 *   - Keys are HMAC-SHA256 hashes: the table holds no phone number and no IP.
 *   - Counters are kept for identifiers that do NOT belong to an account, so
 *     the lock behaves identically for existing and unknown accounts (no
 *     enumeration oracle).
 *   - Reserve-then-verify: an attempt is COUNTED (and any lock engaged)
 *     inside one row-locked transaction BEFORE the password/code is compared.
 *     N parallel guesses therefore observe N distinct counter values and at most
 *     `threshold` of them are ever evaluated — a check-then-act race cannot buy
 *     extra guesses. A success deletes the counters, so a correct credential
 *     "refunds" its own reservation.
 *   - The counter restarts after `windowSeconds` of inactivity and on success.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly key: string;
  private readonly pairThreshold: number;
  private readonly accountThreshold: number;
  private readonly baseSeconds: number;
  private readonly maxSeconds: number;
  private readonly windowSeconds: number;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.key = config.getOrThrow<string>('jwtAccessSecret');
    this.pairThreshold = config.get<number>('loginLockPairThreshold') ?? 5;
    this.accountThreshold =
      config.get<number>('loginLockAccountThreshold') ?? 10;
    this.baseSeconds = config.get<number>('loginLockBaseSeconds') ?? 30;
    this.maxSeconds = config.get<number>('loginLockMaxSeconds') ?? 900;
    this.windowSeconds = config.get<number>('loginAttemptWindowSeconds') ?? 900;
  }

  private hash(scope: 'acct' | 'pair', ...parts: string[]): string {
    return createHmac('sha256', this.key)
      .update(`login-attempts:${scope}:${parts.join('|')}`)
      .digest('hex');
  }

  private keys(identifier: string, ip: string | null) {
    return {
      account: this.hash('acct', identifier),
      pair: this.hash('pair', identifier, ip ?? 'unknown'),
    };
  }

  /** Is any lock active for this attempt? Checked BEFORE verifying the password. */
  async status(identifier: string, ip: string | null): Promise<LockStatus> {
    const { account, pair } = this.keys(identifier, ip);
    const rows: Array<{ remaining: string | null }> =
      await this.dataSource.query(
        `SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (MAX("locked_until") - now()))))::text AS remaining
         FROM "auth_login_attempts"
        WHERE "key_hash" = ANY($1::char(64)[]) AND "locked_until" > now()`,
        [[account, pair]],
      );
    const remaining = Number(rows[0]?.remaining ?? 0);
    return remaining > 0
      ? { locked: true, retryAfterSeconds: remaining }
      : { locked: false, retryAfterSeconds: 0 };
  }

  /**
   * Counts this attempt as a failure up front and decides — atomically —
   * whether it may be evaluated. Call BEFORE comparing the credential and call
   * {@link recordSuccess} when the credential turns out to be correct.
   *
   * Both counters are updated in one transaction with the rows locked in a
   * fixed (sorted) order, so concurrent attempts serialize per identifier and
   * cannot deadlock.
   */
  async reserve(identifier: string, ip: string | null): Promise<Reservation> {
    const { account, pair } = this.keys(identifier, ip);
    const ordered = [account, pair].sort();
    return this.dataSource.transaction(async (tx) => {
      for (const keyHash of ordered) {
        await tx.query(
          `INSERT INTO "auth_login_attempts" ("key_hash", "failures", "updated_at")
                VALUES ($1, 0, now())
           ON CONFLICT ("key_hash") DO NOTHING`,
          [keyHash],
        );
      }
      const rows: CounterRow[] = await tx.query(
        `SELECT "key_hash",
                "failures",
                COALESCE("locked_until" > now(), false) AS locked,
                ("updated_at" < now() - make_interval(secs => $2::int)) AS stale,
                GREATEST(0, CEIL(EXTRACT(EPOCH FROM (COALESCE("locked_until", now()) - now()))))::int AS remaining
           FROM "auth_login_attempts"
          WHERE "key_hash" = ANY($1::char(64)[])
          ORDER BY "key_hash"
            FOR UPDATE`,
        [ordered, this.windowSeconds],
      );

      const active = rows.filter((row) => row.locked);
      if (active.length > 0) {
        // Refused attempts are not counted: a lock cannot be prolonged (and a
        // victim cannot be kept locked) merely by hammering the endpoint.
        return {
          allowed: false,
          lockEngaged: false,
          scope: null,
          retryAfterSeconds: Math.max(...active.map((row) => row.remaining)),
        };
      }

      let engaged = 0;
      let scope: 'pair' | 'account' | null = null;
      for (const row of rows) {
        const isPair = row.key_hash === pair;
        const failures = row.stale ? 1 : row.failures + 1;
        const lockSeconds = lockSecondsFor(
          failures,
          isPair ? this.pairThreshold : this.accountThreshold,
          this.baseSeconds,
          this.maxSeconds,
        );
        await tx.query(
          `UPDATE "auth_login_attempts"
              SET "failures" = $2,
                  "updated_at" = now(),
                  "locked_until" = CASE WHEN $3::int > 0
                    THEN now() + make_interval(secs => $3::int)
                    ELSE "locked_until" END
            WHERE "key_hash" = $1`,
          [row.key_hash, failures, lockSeconds],
        );
        if (lockSeconds > 0 && lockSeconds >= engaged) {
          engaged = lockSeconds;
          scope = isPair ? 'pair' : 'account';
        }
      }
      return {
        allowed: true,
        lockEngaged: engaged > 0,
        scope,
        retryAfterSeconds: engaged,
      };
    });
  }

  /** A successful sign-in clears the (account, ip) counter and the account counter. */
  async recordSuccess(identifier: string, ip: string | null): Promise<void> {
    const { account, pair } = this.keys(identifier, ip);
    await this.dataSource.query(
      `DELETE FROM "auth_login_attempts" WHERE "key_hash" = ANY($1::char(64)[])`,
      [[account, pair]],
    );
  }

  /** Housekeeping (run by the scheduler): drops idle, unlocked counters. */
  async purgeStale(): Promise<number> {
    const result: Array<{ count: string }> = await this.dataSource.query(
      `WITH gone AS (
         DELETE FROM "auth_login_attempts"
          WHERE "updated_at" < now() - make_interval(secs => $1::int)
            AND ("locked_until" IS NULL OR "locked_until" < now())
          RETURNING 1)
       SELECT count(*)::text AS count FROM gone`,
      [this.windowSeconds * 4],
    );
    return Number(result[0]?.count ?? 0);
  }
}
