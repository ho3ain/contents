import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { EmailService } from './email.service';

/**
 * Account-security emails, sent to the account's OWN address only. They never
 * carry IPs, devices or any secret — just what happened and what to do.
 * Delivery never fails the business action (EmailService.enqueue never throws).
 */
@Injectable()
export class SecurityAlertsService {
  constructor(private readonly emails: EmailService) {}

  async passwordChanged(userId: string): Promise<void> {
    await this.emails.enqueue({
      template: 'security_password_changed',
      data: {},
      userId,
      relatedEntityType: 'user_security',
      // One alert per distinct change (to-the-minute): a retry of the same
      // request is deduplicated, two real changes are both reported.
      relatedEntityId: stableUuid(`pwd:${userId}:${minuteStamp()}`),
    });
  }

  async twoFactorEnabled(userId: string): Promise<void> {
    await this.emails.enqueue({
      template: 'security_2fa_enabled',
      data: {},
      userId,
      relatedEntityType: 'user_security',
      relatedEntityId: stableUuid(`2fa-on:${userId}:${minuteStamp()}`),
    });
  }

  async twoFactorDisabled(userId: string): Promise<void> {
    await this.emails.enqueue({
      template: 'security_2fa_disabled',
      data: {},
      userId,
      relatedEntityType: 'user_security',
      relatedEntityId: stableUuid(`2fa-off:${userId}:${minuteStamp()}`),
    });
  }

  /**
   * Lockouts can be triggered by anyone who knows a phone number, so the alert
   * is limited to one per account per day — it must not become a way to spam
   * the owner.
   */
  async loginLocked(userId: string): Promise<void> {
    await this.emails.enqueue({
      template: 'security_login_locked',
      data: {},
      userId,
      relatedEntityType: 'user_security',
      relatedEntityId: stableUuid(
        `lock:${userId}:${new Date().toISOString().slice(0, 10)}`,
      ),
    });
  }
}

function minuteStamp(): string {
  return new Date().toISOString().slice(0, 16);
}

/**
 * The delivery log's related-entity column is a UUID; a security event has no
 * row of its own, so derive a stable UUID from the event key. The same key
 * always yields the same id — that is what makes the dedupe work.
 */
export function stableUuid(key: string): string {
  const h = createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
