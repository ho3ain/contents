import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { UserRole } from '../../database/entities/identity/user.entity';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  /** Login (session family) this token belongs to; absent on legacy tokens. */
  sid?: string;
  /** Impersonation session id (Phase 3). The token's `sub` is the target user. */
  imp?: string;
  /** Acting admin of an impersonation token. */
  act?: string;
}

export interface AccessTokenClaims extends AccessTokenPayload {
  iss: string;
  iat: number;
  exp: number;
}

/**
 * Issues and verifies short-lived access JWTs and produces the opaque
 * random values backing refresh tokens and verification codes. Secrets and
 * TTLs come from validated configuration.
 */
@Injectable()
export class AuthTokensService {
  private readonly accessSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly issuer: string;

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('jwtAccessSecret');
    // VALIDATED value: the raw env var is the string "900", which jsonwebtoken
    // would interpret as 900 milliseconds (tokens expiring instantly).
    this.accessTtlSeconds = config.getOrThrow<number>('jwtAccessTtlSeconds');
    this.issuer = config.getOrThrow<string>('jwtIssuer');
  }

  /**
   * Short-lived token for an impersonation session. Never refreshable, never
   * outlives the session (`ttlSeconds` is the REMAINING session time).
   */
  signImpersonationToken(
    target: { id: string; role: UserRole },
    sessionId: string,
    actingAdminId: string,
    ttlSeconds: number,
  ): string {
    return this.jwtService.sign(
      {
        sub: target.id,
        role: target.role,
        imp: sessionId,
        act: actingAdminId,
      } satisfies AccessTokenPayload,
      {
        secret: this.accessSecret,
        expiresIn: Math.max(1, Math.floor(ttlSeconds)),
        issuer: this.issuer,
        audience: 'agent-hub-api',
      },
    );
  }

  signAccessToken(
    user: { id: string; role: UserRole },
    sessionFamilyId?: string,
  ): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        role: user.role,
        ...(sessionFamilyId ? { sid: sessionFamilyId } : {}),
      } satisfies AccessTokenPayload,
      {
        secret: this.accessSecret,
        expiresIn: this.accessTtlSeconds,
        issuer: this.issuer,
        audience: 'agent-hub-api',
      },
    );
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const claims = this.jwtService.verify<AccessTokenClaims>(token, {
        secret: this.accessSecret,
        issuer: this.issuer,
        audience: 'agent-hub-api',
      });
      if (!claims.sub) {
        throw new Error('missing subject');
      }
      return claims;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /** Opaque high-entropy token, URL-safe. */
  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /** Six-digit numeric verification code. */
  randomVerificationCode(): string {
    return String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, '0');
  }
}
