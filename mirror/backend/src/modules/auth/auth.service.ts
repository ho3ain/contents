import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { getRequestContext } from '../../common/logging/request-context';
import { SecurityAlertsService } from '../email/security-alerts.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  User,
  UserRole,
  UserStatus,
} from '../../database/entities/identity/user.entity';
import {
  UserVerification,
  UserVerificationType,
} from '../../database/entities/identity/user-verification.entity';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AdminAuditService } from '../control-plane/audit/admin-audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { ApiException } from '../../common/errors/api-error';
import { TwoFactorService } from './two-factor.service';
import { AuthTokensService } from './auth-tokens.service';
import { AuthSessionsService, SessionMeta } from './auth-sessions.service';
import { VerificationSenderService } from './verification-sender.service';
import { LoginAttemptsService } from './login-attempts.service';
import { CURRENT_TERMS_VERSION } from './legal-documents';
import { toPublicUser, PublicUser } from '../users/user-view';
import { businessEvent } from '../../common/logging/app-logger';
import { recordAuthEvent } from '../../common/observability/metrics';
import { CrmIntegrationService } from '../crm/crm-integration.service';

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * Returned INSTEAD of a session when the account has two-step sign-in on:
 * the password was right, a second factor is still required (Phase 3 / W0).
 */
export interface MfaRequiredResult {
  mfaRequired: true;
  challengeToken: string;
  expiresInSeconds: number;
}

const VERIFICATION_TTL_MS = 30 * 60 * 1000;
/**
 * Idempotent window for refresh-token ROTATION replays (AUTH upgrade): a
 * browser that reloads quickly can have two documents racing the same
 * httpOnly cookie — the second presentation arrives milliseconds after the
 * first consumed it. Outside this window a revoked-token replay is treated
 * as theft (revokes all sessions) exactly as before. Logout and password
 * reset never set rotatedAt, so they stay strictly final.
 */
const REFRESH_ROTATION_GRACE_MS = 5_000;
const MAX_VERIFICATION_ATTEMPTS = 5;
/** Bounded brute-force protection for the 6-digit reset code (AUTH upgrade). */
const MAX_RESET_ATTEMPTS = 5;
/** Characters allowed in a normalized phone number. */
const PHONE_NORMALIZE = /[^0-9+]/g;

/**
 * Normalizes a user-supplied phone number to the canonical `+<digits>`
 * form used as the primary login identifier. Beyond stripping separators,
 * common local formats are converted so users can type what they know:
 *
 *   09121234567   → +989121234567   (Iranian local mobile)
 *   00989121234567→ +989121234567   (international 00 prefix)
 *   989121234567  → +989121234567   (country code without +)
 *   +98 912 ...   → +98912...       (any formatting separators)
 */
export function normalizePhone(raw: string): string {
  let phone = raw.replace(PHONE_NORMALIZE, '');
  if (phone.startsWith('0098')) {
    phone = `+98${phone.slice(4)}`;
  } else if (/^09\d{9}$/.test(phone)) {
    // Iranian local mobile (09xxxxxxxxx, 11 digits) → +989xxxxxxxxx
    phone = `+98${phone.slice(1)}`;
  } else if (phone.startsWith('989') && !phone.startsWith('+')) {
    phone = `+${phone}`;
  }
  return phone;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtlSeconds: number;
  private readonly bcryptRounds: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly tokensService: AuthTokensService,
    private readonly sessionsService: AuthSessionsService,
    private readonly sender: VerificationSenderService,
    private readonly audit: AuditService,
    private readonly loginAttempts: LoginAttemptsService,
    private readonly securityAlerts: SecurityAlertsService,
    @InjectRepository(UserVerification)
    private readonly verificationsRepository: Repository<UserVerification>,
    private readonly crm: CrmIntegrationService,
    private readonly twoFactor: TwoFactorService,
    config: ConfigService,
    @Optional() private readonly adminAudit?: AdminAuditService,
  ) {
    // VALIDATED value: the raw env var is a string and would be interpreted
    // as milliseconds by session-expiry math.
    this.refreshTtlSeconds = config.getOrThrow<number>('jwtRefreshTtlSeconds');
    // Read the VALIDATED value (loadEnvironment): the raw BCRYPT_ROUNDS env
    // var is a string, and bcryptjs rejects a string salt ("Invalid salt version").
    this.bcryptRounds = config.getOrThrow<number>('bcryptRounds');
  }

  async register(
    input: {
      email?: string;
      password: string;
      username: string;
      fullName?: string;
      phone: string;
      acceptTerms: boolean;
      termsVersion?: string;
      locale?: string;
    },
    meta: SessionMeta,
    options: { attributionId?: string | null } = {},
  ): Promise<AuthResult> {
    // Phone-primary auth: phone is REQUIRED and unique (partial unique
    // index) — reject duplicates with a field-level error instead of a 500
    // from the DB constraint.
    const phone = normalizePhone(input.phone ?? '');
    if (!phone) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'phone is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (await this.usersService.phoneExists(phone)) {
      throw new ApiException(
        'PHONE_TAKEN',
        'That phone number is already registered',
        HttpStatus.CONFLICT,
      );
    }
    // Email is OPTIONAL — unique when provided (legacy identifier / where
    // transactional emails go).
    const email = input.email?.trim().toLowerCase() || null;
    if (email && (await this.usersService.emailExists(email))) {
      throw new ApiException(
        'EMAIL_TAKEN',
        'An account with this email already exists',
        HttpStatus.CONFLICT,
      );
    }
    const username = input.username.trim();
    if (await this.usersService.usernameExists(username)) {
      throw new ApiException(
        'USERNAME_TAKEN',
        'That username is already taken',
        HttpStatus.CONFLICT,
      );
    }

    // Legacy registration bundle: reject a stale client identifier instead
    // of silently recording a different configured bundle. This equality
    // check is not a legal-document approval or effectiveness decision.
    if (
      input.termsVersion !== undefined &&
      input.termsVersion !== CURRENT_TERMS_VERSION
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'The registration document identifier is no longer current',
        HttpStatus.BAD_REQUEST,
        { field: 'termsVersion', currentVersion: CURRENT_TERMS_VERSION },
      );
    }

    const passwordHash = await bcrypt.hash(input.password, this.bcryptRounds);
    const user = await this.usersService.create({
      email,
      username,
      fullName: input.fullName?.trim() || null,
      phone,
      passwordHash,
      role: UserRole.BUYER,
      status: UserStatus.ACTIVE,
      preferredLocale: input.locale === 'en' ? 'en' : 'fa',
      termsAcceptedAt: input.acceptTerms === true ? new Date() : null,
      termsVersion: input.acceptTerms === true ? CURRENT_TERMS_VERSION : null,
      // Without an email there is nothing to verify — the account starts
      // verified so the post-login journey (frontend gate) is not blocked.
      emailVerifiedAt: email ? null : new Date(),
      // New registrations start UNONBOARDED; the wizard is part of the
      // post-verification journey (backend-authoritative state).
      onboardingCompletedAt: null,
    });

    // Phase C1 — identity resolution + attribution persistence. The lead is
    // created (or an existing one linked) HERE, at the only moment the
    // person transitions from "unknown visitor" to "known identity", so the
    // landing → signup path can never be lost. Never throws: a CRM failure
    // must not fail a registration.
    await this.crm.onUserRegistered(
      { id: user.id, email: user.email, phone: user.phone },
      { attributionId: options.attributionId ?? null },
    );

    const tokens = await this.issueSession(user, meta);

    businessEvent.info('auth.register', 'Account registered', {
      userId: user.id,
      locale: user.preferredLocale,
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.REGISTER,
      entity: AUDIT_ENTITIES.USER,
      entityId: user.id,
      metadata: { email: email ?? null, phone },
      context: {
        actorId: user.id,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    // Only email-backed accounts receive a verification code; phone-only
    // accounts were already marked verified at creation.
    if (user.email) {
      await this.sendEmailVerificationCode(user);
    }

    return { user: toPublicUser(user), ...tokens };
  }

  async login(
    input: { phone: string; password: string },
    meta: SessionMeta,
  ): Promise<AuthResult | MfaRequiredResult> {
    // Phone + password is the ONLY sign-in path (phone-primary auth).
    const phone = normalizePhone(input.phone ?? '');
    // Lock identity: the normalized phone, or a fixed token for an empty one,
    // so malformed input is throttled exactly like a real-but-wrong account.
    const lockIdentity = phone === '' ? '(empty)' : phone;

    // Reserve-then-verify: this attempt is counted (and a lock engaged when a
    // threshold is crossed) atomically BEFORE the password is compared, so N
    // parallel guesses cannot all be evaluated. A locked identifier is refused
    // before any password work; the decision is keyed on the identifier — not
    // on whether an account exists — so known and unknown accounts answer alike.
    const reservation = await this.loginAttempts.reserve(
      lockIdentity,
      meta.ip ?? null,
    );
    if (!reservation.allowed) {
      recordAuthEvent('login_blocked');
      businessEvent.warn(
        'auth.login.blocked',
        'Login blocked by temporary lock',
        {
          retryAfterSeconds: reservation.retryAfterSeconds,
        },
      );
      throw new ApiException(
        'TOO_MANY_REQUESTS',
        'Too many failed sign-in attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSeconds: reservation.retryAfterSeconds },
      );
    }

    const user: User | null =
      phone === '' ? null : await this.usersService.findByPhone(phone);

    // Always spend one bcrypt comparison — against a real hash when the
    // account exists, a dummy hash of the same cost otherwise — so response
    // time does not reveal whether the phone number is registered.
    const passwordOk = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? this.dummyPasswordHash(),
    );
    if (!user || !passwordOk) {
      const outcome = reservation;
      recordAuthEvent('login_failure');
      if (outcome.lockEngaged) recordAuthEvent('login_locked');
      businessEvent.warn('auth.login.failure', 'Login failed', {
        // identifiers deliberately NOT included — ids/booleans only
        knownAccount: user !== null,
        lockEngaged: outcome.lockEngaged,
      });
      // Admin accounts additionally feed the tamper-evident admin audit chain
      // (§98). Only for accounts that exist AND are admins; the response is
      // identical either way, so this reveals nothing to the caller.
      if (user && String(user.role) === 'admin') {
        await this.auditAdminAuth(
          user.id,
          meta,
          'admin.login.failed',
          'DENIED',
          {
            cause: passwordOk ? 'unknown' : 'invalid_credentials',
            lockEngaged: outcome.lockEngaged,
          },
        );
      }
      if (outcome.lockEngaged) {
        await this.audit.record({
          action: AUDIT_ACTIONS.LOGIN_LOCKED,
          entity: AUDIT_ENTITIES.USER,
          // Only attributed when the account exists; an unknown identifier
          // is logged without an entity id (never reveal existence).
          entityId: user?.id ?? null,
          metadata: {
            scope: outcome.scope,
            lockSeconds: outcome.retryAfterSeconds,
          },
          context: {
            actorId: null,
            ip: meta.ip ?? null,
            userAgent: meta.userAgent ?? null,
          },
        });
        // Tell the owner (known accounts only; never reveals existence).
        if (user) await this.securityAlerts.loginLocked(user.id);
      }
      throw new ApiException(
        'INVALID_CREDENTIALS',
        'Invalid phone number or password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    // The credential was correct: hand back the reserved attempt (whatever the
    // account state), then apply the state rules.
    await this.loginAttempts.recordSuccess(lockIdentity, meta.ip ?? null);
    if (user.status === UserStatus.SUSPENDED) {
      throw new ApiException(
        'ACCOUNT_SUSPENDED',
        'This account has been suspended',
        HttpStatus.FORBIDDEN,
      );
    }

    // Two-step sign-in: the password alone does NOT open a session when the
    // account has a confirmed second factor.
    if (await this.twoFactor.isEnabled(user.id)) {
      const challenge = await this.twoFactor.createChallenge(user.id);
      return {
        mfaRequired: true,
        challengeToken: challenge.token,
        expiresInSeconds: challenge.expiresInSeconds,
      };
    }

    return this.openSession(user, meta, 'password');
  }

  /** Second leg of a two-step sign-in. */
  async completeMfaLogin(
    input: { challengeToken: string; code: string },
    meta: SessionMeta,
  ): Promise<AuthResult> {
    const { userId, kind } = await this.twoFactor.completeChallenge(
      input.challengeToken,
      input.code,
      meta.ip ?? null,
    );
    const user = await this.usersService.findById(userId);
    if (!user || user.status === UserStatus.SUSPENDED) {
      throw new ApiException(
        'ACCOUNT_SUSPENDED',
        'This account has been suspended',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.openSession(user, meta, kind);
  }

  /** Best effort: refusing a sign-in because auditing failed would only help an attacker. */
  private async auditAdminAuth(
    userId: string,
    meta: SessionMeta,
    action: string,
    result: 'SUCCESS' | 'DENIED',
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.adminAudit) return;
    await this.adminAudit.recordBestEffort({
      category: 'AUTHENTICATION',
      action,
      result,
      severity: result === 'DENIED' ? 'warning' : 'info',
      actor: {
        id: userId,
        role: 'admin',
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        requestId: getRequestContext()?.requestId ?? null,
      },
      resourceType: 'user',
      resourceId: userId,
      metadata,
    });
  }

  private async openSession(
    user: User,
    meta: SessionMeta,
    method: 'password' | 'totp' | 'recovery',
  ): Promise<AuthResult> {
    const tokens = await this.issueSession(user, meta);
    await this.usersService.markLogin(user.id);
    recordAuthEvent('login_success');

    businessEvent.info('auth.login.success', 'Login succeeded', {
      userId: user.id,
    });
    if (String(user.role) === 'admin') {
      await this.auditAdminAuth(
        user.id,
        meta,
        'admin.login.succeeded',
        'SUCCESS',
        { method },
      );
    }
    await this.audit.record({
      action: AUDIT_ACTIONS.LOGIN,
      entity: AUDIT_ENTITIES.USER,
      entityId: user.id,
      metadata: { method },
      context: {
        actorId: user.id,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    return { user: toPublicUser(user), ...tokens };
  }

  async refresh(
    rawRefreshToken: string,
    meta: SessionMeta,
  ): Promise<AuthResult> {
    const tokenHash = this.tokensService.hashToken(rawRefreshToken);
    const session = await this.sessionsService.findByTokenHash(tokenHash);

    if (!session) {
      throw new ApiException(
        'TOKEN_INVALID',
        'Refresh token is invalid',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // `!= null` (not `!== null`): a session object constructed without the
    // field (undefined) must behave like "never rotated", not crash.
    const rotationGraceActive =
      session.rotatedAt != null &&
      Date.now() - session.rotatedAt.getTime() <= REFRESH_ROTATION_GRACE_MS &&
      session.expiresAt.getTime() > Date.now();

    // A rotated predecessor may only be replayed while its login is still
    // alive: if the successor was revoked (logout / "sign out others" /
    // password change) the grace window must NOT resurrect the login.
    const graceUsable =
      rotationGraceActive &&
      (await this.sessionsService.familyIsActive(session.familyId));

    if (session.revokedAt && !graceUsable) {
      // Reuse of a revoked token means THIS login chain may have leaked:
      // kill the chain (thief and victim share it), not the user's other
      // devices.
      await this.sessionsService.revokeFamily(session.familyId);
      recordAuthEvent('refresh_reuse');
      throw new ApiException(
        'TOKEN_INVALID',
        'Refresh token has been revoked',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessionsService.revoke(session);
      throw new ApiException(
        'TOKEN_EXPIRED',
        'Refresh token has expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.usersService.findById(session.userId);
    if (!user || user.status === UserStatus.SUSPENDED) {
      await this.sessionsService.revokeAllForUser(session.userId);
      throw new ApiException(
        user ? 'ACCOUNT_SUSPENDED' : 'UNAUTHORIZED',
        user ? 'This account has been suspended' : 'Account not found',
        user ? HttpStatus.FORBIDDEN : HttpStatus.UNAUTHORIZED,
      );
    }

    // Rotate: the presented token dies (marked rotated for the grace
    // window), a fresh one is issued.
    await this.sessionsService.rotate(session);
    const next = await this.issueSession(user, meta, session.familyId);

    return { user: toPublicUser(user), ...next };
  }

  async logout(rawRefreshToken: string, meta: SessionMeta): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.tokensService.hashToken(rawRefreshToken);
    const session = await this.sessionsService.findByTokenHash(tokenHash);
    if (session && !session.revokedAt) {
      await this.sessionsService.revoke(session);
      businessEvent.info('auth.logout', 'Session revoked on logout', {
        userId: session.userId,
      });
      await this.audit.record({
        action: AUDIT_ACTIONS.LOGOUT,
        entity: AUDIT_ENTITIES.USER_SESSION,
        entityId: session.id,
        context: {
          actorId: session.userId,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });
    }
  }

  /**
   * "Sign out everywhere": revokes every live login of the user, including the
   * caller's own. Access tokens die with their login family (the guard checks
   * it), so this takes effect immediately, not at token expiry.
   */
  async logoutAll(userId: string, meta: SessionMeta): Promise<number> {
    const revoked = await this.sessionsService.revokeAllForUser(userId);
    recordAuthEvent('logout_all');
    businessEvent.info('auth.logout_all', 'All sessions revoked', {
      userId,
      revoked,
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.SESSIONS_REVOKED_ALL,
      entity: AUDIT_ENTITIES.USER,
      entityId: userId,
      metadata: { revoked },
      context: {
        actorId: userId,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
    return revoked;
  }

  /** Rotates out every session after a password change. */
  async revokeAllSessionsExcept(
    userId: string,
    keepSessionId: string | null,
  ): Promise<void> {
    if (keepSessionId) {
      await this.sessionsService.revokeAllForUserExcept(userId, keepSessionId);
    } else {
      await this.sessionsService.revokeAllForUser(userId);
    }
  }

  // ---------------- Email verification ----------------

  async requestEmailVerification(user: User, meta: SessionMeta): Promise<void> {
    // Phone-only account: there is no mailbox to send a code to (and the
    // account is already verified — see register).
    if (!user.email) return;
    businessEvent.info(
      'auth.email_verification.requested',
      'Verification code re-sent',
      { userId: user.id },
    );
    await this.sendEmailVerificationCode(user);
    await this.audit.record({
      action: AUDIT_ACTIONS.EMAIL_VERIFIED,
      entity: AUDIT_ENTITIES.USER,
      entityId: user.id,
      metadata: { requested: true },
      context: {
        actorId: user.id,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
  }

  /**
   * Spends ONE attempt of the user's newest live code — atomically.
   *
   * The attempt is counted by a single `UPDATE … WHERE attempts < max …
   * RETURNING`, so under concurrency Postgres serialises the row and at most
   * `maxAttempts` requests are ever handed the stored hash to compare. The old
   * read → increment → save sequence let N parallel guesses all read
   * `attempts = 0` and all be evaluated (a 6-digit code is only safe if the
   * budget is real). A correct guess also spends an attempt; the code is
   * consumed right after, so that is harmless.
   */
  private async spendVerificationAttempt(
    userId: string,
    type: UserVerificationType,
    maxAttempts: number,
  ): Promise<
    | { kind: 'ok'; id: string; tokenHash: string; attempts: number }
    | { kind: 'none' }
    | { kind: 'expired' }
    | { kind: 'exhausted'; id: string }
  > {
    const spent: Array<{
      id: string;
      token_hash: string;
      attempts: number;
    }> = await this.verificationsRepository.query(
      // The CTE makes the driver return plain rows: TypeORM's Postgres driver
      // returns `[rows, affectedCount]` for a bare UPDATE … RETURNING.
      `WITH spent AS (
         UPDATE "user_verifications" v
            SET "attempts" = v."attempts" + 1
           FROM (SELECT "id" FROM "user_verifications"
                  WHERE "user_id" = $1 AND "type" = $2 AND "consumed_at" IS NULL
                  ORDER BY "created_at" DESC LIMIT 1) latest
          WHERE v."id" = latest."id"
            AND v."consumed_at" IS NULL
            AND v."expires_at" > now()
            AND v."attempts" < $3
         RETURNING v."id", v."token_hash", v."attempts")
       SELECT * FROM spent`,
      [userId, type, maxAttempts],
    );
    if (spent.length > 0) {
      return {
        kind: 'ok',
        id: spent[0].id,
        tokenHash: spent[0].token_hash,
        attempts: spent[0].attempts,
      };
    }
    const latest: Array<{ id: string; live: boolean }> =
      await this.verificationsRepository.query(
        `SELECT "id", ("expires_at" > now()) AS live FROM "user_verifications"
          WHERE "user_id" = $1 AND "type" = $2 AND "consumed_at" IS NULL
          ORDER BY "created_at" DESC LIMIT 1`,
        [userId, type],
      );
    if (latest.length === 0) return { kind: 'none' };
    return latest[0].live
      ? { kind: 'exhausted', id: latest[0].id }
      : { kind: 'expired' };
  }

  /** Marks a code used; false when a concurrent request already consumed it. */
  private async consumeVerification(id: string): Promise<boolean> {
    const rows: unknown[] = await this.verificationsRepository.query(
      `WITH done AS (
         UPDATE "user_verifications" SET "consumed_at" = now()
          WHERE "id" = $1 AND "consumed_at" IS NULL RETURNING "id")
       SELECT * FROM done`,
      [id],
    );
    return rows.length > 0;
  }

  async verifyEmail(userId: string, code: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new ApiException(
        'UNAUTHORIZED',
        'User no longer exists',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (user.emailVerifiedAt) {
      throw new ApiException(
        'CONFLICT',
        'Email is already verified',
        HttpStatus.CONFLICT,
      );
    }

    const attempt = await this.spendVerificationAttempt(
      user.id,
      UserVerificationType.EMAIL,
      MAX_VERIFICATION_ATTEMPTS,
    );
    if (attempt.kind === 'none' || attempt.kind === 'expired') {
      throw new ApiException(
        'TOKEN_EXPIRED',
        'Verification code has expired',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (attempt.kind === 'exhausted') {
      recordAuthEvent('code_exhausted');
      throw new ApiException(
        'TOKEN_INVALID',
        'Too many attempts — request a new code',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (this.tokensService.hashToken(code) !== attempt.tokenHash) {
      throw new ApiException(
        'TOKEN_INVALID',
        'Incorrect verification code',
        HttpStatus.BAD_REQUEST,
      );
    }
    // Single use: only the request that flips consumed_at wins.
    if (!(await this.consumeVerification(attempt.id))) {
      throw new ApiException(
        'TOKEN_EXPIRED',
        'Verification code has expired',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.usersService.markEmailVerified(user.id);
    businessEvent.info('auth.email_verification.completed', 'Email verified', {
      userId: user.id,
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.EMAIL_VERIFIED,
      entity: AUDIT_ENTITIES.USER,
      entityId: user.id,
      metadata: { type: 'email' },
      context: { actorId: user.id },
    });

    const updated = await this.usersService.findById(user.id);
    return toPublicUser(updated ?? user);
  }

  // ---------------- Password reset (6-digit code — AUTH upgrade) ----------------

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // No user: still report success to avoid account enumeration.
      return;
    }
    // Lookup was by email, so a mailbox is present — guard keeps the
    // phone-primary schema (nullable email) type-safe regardless.
    if (!user.email) return;
    // Sprint 2 (P2-03): only a VERIFIED mailbox is a recovery channel. An
    // address that was typed at registration but never confirmed proves
    // nothing about who controls it, so no code is issued — the response
    // stays identical (enumeration-safe) and the UI says "if this address
    // is linked and verified".
    if (!user.emailVerifiedAt) {
      businessEvent.info(
        'auth.password_reset.skipped_unverified_email',
        'Password reset requested for an unverified email — no code issued',
        { userId: user.id },
      );
      return;
    }

    const code = this.tokensService.randomVerificationCode();
    await this.saveVerification(
      user.id,
      UserVerificationType.PASSWORD_RESET,
      code,
    );
    await this.sender.sendPasswordResetCode(user.id, user.email, code);
    businessEvent.info(
      'auth.password_reset.requested',
      'Password reset code sent',
      { userId: user.id },
    );
    this.logger.debug(`Password reset requested for ${user.id}`);
  }

  async resetPassword(input: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<void> {
    const user = await this.usersService.findByEmail(input.email);
    // Sprint 2 (P2-03): an unverified mailbox can never confirm a reset
    // (no code is ever issued for it) — same opaque answer as an unknown
    // address so the confirm step reveals nothing about the account.
    if (!user || !user.emailVerifiedAt) {
      throw new ApiException(
        'TOKEN_INVALID',
        'Reset code is invalid',
        HttpStatus.BAD_REQUEST,
      );
    }
    // A suspended account must not rotate its credentials (AUTH upgrade:
    // reset-after-suspension check). The request step above stays
    // enumeration-safe — only the code confirmation reveals this.
    if (user.status === UserStatus.SUSPENDED) {
      throw new ApiException(
        'ACCOUNT_SUSPENDED',
        'This account is suspended',
        HttpStatus.FORBIDDEN,
      );
    }

    const attempt = await this.spendVerificationAttempt(
      user.id,
      UserVerificationType.PASSWORD_RESET,
      MAX_RESET_ATTEMPTS,
    );
    if (attempt.kind === 'none' || attempt.kind === 'expired') {
      throw new ApiException(
        'TOKEN_EXPIRED',
        'Reset code has expired',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (attempt.kind === 'exhausted') {
      // Bounded brute force: a 6-digit code must not be guessable forever.
      recordAuthEvent('code_exhausted');
      await this.consumeVerification(attempt.id);
      throw new ApiException(
        'TOKEN_INVALID',
        'Too many attempts — request a new code',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (this.tokensService.hashToken(input.code) !== attempt.tokenHash) {
      businessEvent.warn(
        'auth.password_reset.failed',
        'Password reset code mismatch',
        { userId: user.id, attempts: attempt.attempts },
      );
      throw new ApiException(
        'TOKEN_INVALID',
        'Reset code is invalid',
        HttpStatus.BAD_REQUEST,
      );
    }
    // Single use: only the request that flips consumed_at wins.
    if (!(await this.consumeVerification(attempt.id))) {
      throw new ApiException(
        'TOKEN_EXPIRED',
        'Reset code has expired',
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordHash = await bcrypt.hash(
      input.newPassword,
      this.bcryptRounds,
    );
    await this.usersService.setPassword(user.id, passwordHash);
    await this.sessionsService.revokeAllForUser(user.id);
    await this.securityAlerts.passwordChanged(user.id);
    recordAuthEvent('password_reset_completed');

    businessEvent.info(
      'auth.password_reset.completed',
      'Password reset completed',
      { userId: user.id },
    );
    await this.audit.record({
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      entity: AUDIT_ENTITIES.USER,
      entityId: user.id,
      metadata: {},
      context: { actorId: user.id },
    });
  }

  // ---------------- Username availability (registration UX) ----------------

  /**
   * Cheap availability probe for the registration form. Purely advisory:
   * uniqueness is STILL enforced authoritatively at register/update time
   * (race-safe) — this only powers the live ✓/✕ hint.
   */
  async usernameAvailable(rawUsername: string): Promise<boolean> {
    const username = rawUsername.trim();
    if (username.length < 3 || username.length > 30) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'username must be 3–30 characters',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(username)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'username may only contain lowercase letters, digits, "-" and "_"',
        HttpStatus.BAD_REQUEST,
      );
    }
    return !(await this.usersService.usernameExists(username));
  }

  // ---------------- Resend verification code ----------------

  /**
   * Re-sends the email verification code. Generic response — never reveals
   * whether the account is already verified (that is what verify does).
   */
  async resendEmailVerification(user: User): Promise<void> {
    if (user.emailVerifiedAt) {
      // Already verified: still 200 — no state leak through this endpoint.
      return;
    }
    if (!user.email) {
      // No mailbox (phone-only account): nothing to resend.
      return;
    }
    await this.sendEmailVerificationCode(user);
  }

  // ---------------- Onboarding (AUTH upgrade) ----------------

  /**
   * Persists onboarding wizard data and (when `complete`) marks the wizard
   * finished. Every field is optional; completion is idempotent.
   */
  async saveOnboarding(
    userId: string,
    dto: {
      username?: string;
      fullName?: string;
      phone?: string;
      country?: string;
      interests?: string[];
      complete?: boolean;
    },
  ): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new ApiException(
        'UNAUTHORIZED',
        'User no longer exists',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (
      dto.username !== undefined &&
      dto.username !== user.username &&
      (await this.usersService.usernameExists(dto.username))
    ) {
      throw new ApiException(
        'USERNAME_TAKEN',
        'That username is already taken',
        HttpStatus.CONFLICT,
      );
    }
    if (
      dto.phone !== undefined &&
      dto.phone &&
      dto.phone !== user.phone &&
      (await this.usersService.phoneExists(normalizePhone(dto.phone)))
    ) {
      throw new ApiException(
        'PHONE_TAKEN',
        'That phone number is already registered',
        HttpStatus.CONFLICT,
      );
    }

    const patch: {
      username?: string;
      fullName?: string | null;
      phone?: string | null;
      country?: string | null;
    } = {};
    if (dto.username !== undefined) {
      patch.username = dto.username.trim();
    }
    if (dto.fullName !== undefined) {
      patch.fullName = dto.fullName.trim() || null;
    }
    if (dto.phone !== undefined) {
      patch.phone = dto.phone ? normalizePhone(dto.phone) : null;
    }
    if (dto.country !== undefined) {
      patch.country = dto.country ? dto.country.trim().toUpperCase() : null;
    }

    if (Object.keys(patch).length > 0) {
      await this.usersService.update(user.id, patch);
    }

    if (dto.interests !== undefined) {
      await this.usersService.setInterestSlugs(userId, dto.interests);
    }

    if (dto.complete) {
      await this.usersService.markOnboardingCompleted(userId);
      businessEvent.info('auth.onboarding.completed', 'Onboarding completed', {
        userId,
      });
      await this.audit.record({
        action: AUDIT_ACTIONS.ONBOARDING_COMPLETED,
        entity: AUDIT_ENTITIES.USER,
        entityId: userId,
        metadata: { onboardingCompleted: true },
        context: { actorId: userId },
      });
    }

    const updated = (await this.usersService.findById(userId)) ?? user;
    const interests = await this.usersService.getInterestSlugs(updated.id);
    return toPublicUser(updated, interests);
  }

  // ---------------- Internals ----------------

  private async issueSession(
    user: User,
    meta: SessionMeta,
    familyId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const rawRefreshToken = this.tokensService.randomToken(32);
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);
    const session = await this.sessionsService.create(
      user.id,
      rawRefreshToken,
      this.tokensService.hashToken(rawRefreshToken),
      expiresAt,
      meta,
      familyId,
    );
    const accessToken = this.tokensService.signAccessToken(
      user,
      session.familyId,
    );
    return { accessToken, refreshToken: rawRefreshToken };
  }

  private dummyHash: string | null = null;

  /** Hash of a throw-away value at the platform cost, built once. */
  private dummyPasswordHash(): string {
    this.dummyHash ??= bcrypt.hashSync(
      this.tokensService.randomToken(16),
      this.bcryptRounds,
    );
    return this.dummyHash;
  }

  private async saveVerification(
    userId: string,
    type: UserVerificationType,
    rawToken: string,
  ): Promise<void> {
    await this.verificationsRepository.update(
      { userId, type, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    const record = this.verificationsRepository.create({
      userId,
      type,
      tokenHash: this.tokensService.hashToken(rawToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });
    await this.verificationsRepository.save(record);
  }

  private async sendEmailVerificationCode(user: User): Promise<void> {
    if (!user.email) return;
    const code = this.tokensService.randomVerificationCode();
    await this.saveVerification(user.id, UserVerificationType.EMAIL, code);
    await this.sender.sendEmailVerificationCode(user.id, user.email, code);
  }
}
