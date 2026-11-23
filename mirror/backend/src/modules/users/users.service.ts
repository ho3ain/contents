import { HttpStatus, Injectable } from '@nestjs/common';
import { SecurityAlertsService } from '../email/security-alerts.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  User,
  UserRole,
  UserStatus,
} from '../../database/entities/identity/user.entity';
import { UserInterest } from '../../database/entities/identity/user-interest.entity';
import { UserSession } from '../../database/entities/identity/user-session.entity';
import { Category } from '../../database/entities/catalog/category.entity';
import { ApiException } from '../../common/errors/api-error';
import { describeUserAgent, DeviceInfo } from '../../common/utils/user-agent';
import {
  NotificationsService,
  NOTIFICATION_TYPES,
} from '../notifications/notifications.service';

export type ProfilePatch = Partial<
  Pick<User, 'username' | 'fullName' | 'phone' | 'country' | 'preferredLocale'>
>;

/** One row of the Account Center "active sessions" list. */
export interface SessionView {
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  /** Raw User-Agent, kept for older clients (the user's OWN session). */
  userAgent: string | null;
  /** Coarse family names, preferred for display. */
  device: DeviceInfo;
  ip: string | null;
  current: boolean;
}

@Injectable()
export class UsersService {
  private readonly bcryptRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserInterest)
    private readonly interestsRepository: Repository<UserInterest>,
    @InjectRepository(UserSession)
    private readonly sessionsRepository: Repository<UserSession>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly notifications: NotificationsService,
    private readonly securityAlerts: SecurityAlertsService,
    config: ConfigService,
  ) {
    this.bcryptRounds = config.getOrThrow<number>('bcryptRounds');
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOneBy({
      email: email.toLowerCase().trim(),
    });
  }

  /** Primary login lookup (phone-primary auth). Expects a normalized phone. */
  findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ phone });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ username });
  }

  emailExists(email: string): Promise<boolean> {
    return this.usersRepository.existsBy({ email: email.toLowerCase().trim() });
  }

  usernameExists(username: string): Promise<boolean> {
    return this.usersRepository.existsBy({ username });
  }

  phoneExists(phone: string): Promise<boolean> {
    return this.usersRepository.existsBy({ phone });
  }

  create(input: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(input);
    return this.usersRepository.save(user);
  }

  async update(id: string, patch: Partial<User>): Promise<User | null> {
    await this.usersRepository.update(id, patch);
    return this.findById(id);
  }

  async setRole(id: string, role: UserRole): Promise<User | null> {
    await this.usersRepository.update(id, { role });
    return this.findById(id);
  }

  async setStatus(id: string, status: UserStatus): Promise<User | null> {
    await this.usersRepository.update(id, { status });
    return this.findById(id);
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.usersRepository.update(id, { emailVerifiedAt: new Date() });
  }

  async markLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.usersRepository.update(id, { passwordHash });
  }

  async markOnboardingCompleted(id: string): Promise<void> {
    // Idempotent: only set when still open, so re-completing never rewrites
    // the original completion time.
    await this.usersRepository.update(id, {
      onboardingCompletedAt: () => `COALESCE("onboarding_completed_at", now())`,
    });
  }

  /**
   * Current interests of a user as marketplace category slugs.
   * The category relation is loaded for the slug (no N+1: one query).
   */
  async getInterestSlugs(userId: string): Promise<string[]> {
    const rows = await this.interestsRepository.find({
      where: { userId },
      relations: { category: true },
    });
    return rows
      .map((row) => row.category?.slug)
      .filter((slug): slug is string => !!slug);
  }

  /**
   * Replaces the user's interest set with the given category slugs.
   * Unknown slugs are rejected (validation, not silent skip) so the client
   * can surface a real error instead of losing selections.
   * Returns the effective slugs after the write.
   */
  async setInterestSlugs(userId: string, slugs: string[]): Promise<string[]> {
    const uniqueSlugs = [
      ...new Set(slugs.map((slug) => slug.trim().toLowerCase())),
    ].filter(Boolean);
    if (uniqueSlugs.length === 0) {
      await this.interestsRepository.delete({ userId });
      return [];
    }
    const categories = await this.categoriesRepository.find({
      where: { slug: In(uniqueSlugs) },
    });
    const foundSlugs = new Set(categories.map((category) => category.slug));
    const missing = uniqueSlugs.filter((slug) => !foundSlugs.has(slug));
    if (missing.length > 0) {
      throw new ApiException(
        'VALIDATION_ERROR',
        `Unknown interest categories: ${missing.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.interestsRepository.delete({ userId });
    await this.interestsRepository.save(
      categories.map((category) =>
        this.interestsRepository.create({ userId, categoryId: category.id }),
      ),
    );
    return categories.map((category) => category.slug);
  }

  // ---- Account Center (BUY upgrade §34): sessions + password change ----

  /**
   * Active (non-revoked, unexpired) login sessions, newest activity first,
   * with the session presented by THIS request flagged `current`.
   */
  async listActiveSessions(
    userId: string,
    currentRefreshToken: string | null,
  ): Promise<SessionView[]> {
    const currentHash = currentRefreshToken
      ? createHash('sha256').update(currentRefreshToken).digest('hex')
      : null;
    const sessions = await this.sessionsRepository.find({
      where: { userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    const now = Date.now();
    return sessions
      .filter((session) => session.expiresAt.getTime() > now)
      .map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt ?? session.createdAt,
        userAgent: session.userAgent,
        device: describeUserAgent(session.userAgent),
        ip: session.ip,
        current:
          currentHash !== null && session.refreshTokenHash === currentHash,
      }));
  }

  /** True when the login `familyId` of this user still has a usable session. */
  hasActiveSessionFamily(userId: string, familyId: string): Promise<boolean> {
    return this.sessionsRepository.existsBy({
      userId,
      familyId,
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });
  }

  /**
   * Signs out ONE session of the user. Returns false when the session does
   * not exist OR belongs to someone else — callers answer 404 either way, so
   * session ids cannot be probed.
   */
  /**
   * Is `sessionId` the session that presented `currentRefreshToken`? Used so
   * «sign out this device» cannot silently end the session doing the asking
   * (the explicit logout route exists for that).
   */
  async isCurrentSession(
    userId: string,
    sessionId: string,
    currentRefreshToken: string | null,
  ): Promise<boolean> {
    if (!currentRefreshToken) return false;
    const currentHash = createHash('sha256')
      .update(currentRefreshToken)
      .digest('hex');
    return this.sessionsRepository.existsBy({
      id: sessionId,
      userId,
      refreshTokenHash: currentHash,
      revokedAt: IsNull(),
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.sessionsRepository.update(
      { id: sessionId, userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  /** Revokes every session except the one presented by this request. */
  async revokeOtherSessions(
    userId: string,
    currentRefreshToken: string | null,
  ): Promise<number> {
    const currentHash = currentRefreshToken
      ? createHash('sha256').update(currentRefreshToken).digest('hex')
      : null;
    const result = await this.sessionsRepository.update(
      {
        userId,
        revokedAt: IsNull(),
        ...(currentHash ? { refreshTokenHash: Not(currentHash) } : {}),
      },
      { revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }

  /**
   * Changes the account password: verifies the CURRENT password first (a
   * logged-in session must not be enough to silently take over the
   * account), then re-hashes with the platform bcrypt rounds and signs out
   * every OTHER session.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentRefreshToken: string | null,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new ApiException(
        'UNAUTHORIZED',
        'User no longer exists',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new ApiException(
        'INVALID_CREDENTIALS',
        'The current password is incorrect',
        HttpStatus.BAD_REQUEST,
      );
    }
    const newHash = await bcrypt.hash(newPassword, this.bcryptRounds);
    await this.usersRepository.update(userId, { passwordHash: newHash });
    await this.revokeOtherSessions(userId, currentRefreshToken);
    await this.notifications.notifyEventSafe(
      userId,
      NOTIFICATION_TYPES.PASSWORD_CHANGED,
    );
    await this.securityAlerts.passwordChanged(userId);
  }
}
