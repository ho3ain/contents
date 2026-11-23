import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { UserSession } from '../../database/entities/identity/user-session.entity';

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Owns user_sessions rows. Refresh tokens are stored hashed only; every
 * refresh rotates the session and logout revokes it. Reuse of a revoked
 * token revokes every session of the account (theft detection).
 */
@Injectable()
export class AuthSessionsService {
  constructor(
    @InjectRepository(UserSession)
    private readonly sessionsRepository: Repository<UserSession>,
  ) {}

  async create(
    userId: string,
    rawRefreshToken: string,
    refreshTokenHash: string,
    expiresAt: Date,
    meta: SessionMeta,
    familyId: string = randomUUID(),
  ): Promise<UserSession> {
    const session = this.sessionsRepository.create({
      userId,
      familyId,
      refreshTokenHash,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      lastUsedAt: new Date(),
    });
    return this.sessionsRepository.save(session);
  }

  findByTokenHash(refreshTokenHash: string): Promise<UserSession | null> {
    return this.sessionsRepository.findOneBy({ refreshTokenHash });
  }

  async revoke(session: UserSession): Promise<void> {
    if (session.revokedAt) return;
    session.revokedAt = new Date();
    await this.sessionsRepository.save(session);
  }

  /**
   * Rotation = revoke + timestamp. The timestamp opens a short idempotent
   * window in AuthService.refresh: a second presentation of the SAME cookie
   * within REFRESH_ROTATION_GRACE_MS (e.g. a browser whose previous document
   * had the exchange in flight while the next one already booted) is served
   * with a fresh pair instead of being treated as token theft.
   */
  async rotate(session: UserSession): Promise<void> {
    if (session.revokedAt) return;
    session.revokedAt = new Date();
    session.rotatedAt = new Date();
    await this.sessionsRepository.save(session);
  }

  /**
   * Revokes every live session of ONE login chain (refresh rotations share a
   * family). Used when a dead token is replayed: that chain may be stolen,
   * but the user's OTHER devices have nothing to do with it.
   */
  async revokeFamily(familyId: string): Promise<void> {
    await this.sessionsRepository.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Revokes every live session of the user; returns how many were live. */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.sessionsRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }

  async revokeAllForUserExcept(
    userId: string,
    keepSessionId: string,
  ): Promise<void> {
    const sessions = await this.sessionsRepository.findBy({
      userId,
      revokedAt: IsNull(),
    });
    for (const session of sessions) {
      if (session.id !== keepSessionId) {
        session.revokedAt = new Date();
        await this.sessionsRepository.save(session);
      }
    }
  }

  /** Expired sessions are tombstoned (marked revoked) and cleaned up lazily. */
  async expireOldSessions(): Promise<void> {
    await this.sessionsRepository.update(
      { expiresAt: LessThan(new Date()), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * Drops sessions that can never be used again (revoked or expired more than
   * `graceDays` ago). Run by the scheduler so the table stays small.
   */
  async purgeDead(graceDays = 30): Promise<number> {
    const result = await this.sessionsRepository
      .createQueryBuilder()
      .delete()
      .where(
        `(revoked_at IS NOT NULL AND revoked_at < now() - make_interval(days => :days))
         OR (expires_at < now() - make_interval(days => :days))`,
        { days: graceDays },
      )
      .execute();
    return result.affected ?? 0;
  }

  async touch(session: UserSession): Promise<void> {
    session.lastUsedAt = new Date();
    await this.sessionsRepository.save(session);
  }

  /** True when the login identified by `familyId` still has a usable session. */
  async familyIsActive(familyId: string): Promise<boolean> {
    return this.sessionsRepository.existsBy({
      familyId,
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });
  }

  async findActiveById(id: string): Promise<UserSession | null> {
    return this.sessionsRepository.findOneBy({
      id,
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });
  }
}
