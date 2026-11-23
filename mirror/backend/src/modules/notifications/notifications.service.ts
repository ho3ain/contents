import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Notification } from '../../database/entities/platform/notification.entity';
import { User, UserRole } from '../../database/entities/identity/user.entity';
import {
  PaginationMeta,
  buildPaginationMeta,
} from '../../common/dto/pagination.dto';
import {
  defaultSeverity,
  renderNotification,
  type NotificationSeverity,
} from './notification-templates';

export const NOTIFICATION_TYPES = {
  PURCHASE_SUCCESS: 'purchase_success',
  PAYMENT_FAILED: 'payment_failed',
  REFUND_REQUESTED: 'refund_requested',
  REFUND_PROCESSED: 'refund_processed',
  NEW_SALE: 'new_sale',
  AGENT_SUBMITTED: 'agent_submitted',
  AGENT_REVIEW_RESULT: 'agent_review_result',
  AGENT_PUBLISHED: 'agent_published',
  AGENT_REVIEW: 'agent_review',
  AGENT_REVIEW_QUEUE: 'agent_review_queue',
  VERIFICATION_UPDATE: 'verification_update',
  REVIEW_SUBMITTED: 'review_submitted',
  REVIEW_REPLIED: 'review_replied',
  BLOG_COMMENT_NEW: 'blog_comment_new',
  BLOG_COMMENT_REPLY: 'blog_comment_reply',
  BLOG_COMMENT_REMOVED: 'blog_comment_removed',
  REPORT_SUBMITTED: 'report_submitted',
  REPORT_STATUS: 'report_status',
  VERIFICATION_REQUEST: 'verification_request',
  SUPPORT_REQUEST: 'support_request',
  SUPPORT_REPLY: 'support_reply',
  SUPPORT_STATUS: 'support_status',
  ACCOUNT_STATUS: 'account_status',
  /** Legacy/general platform notice; producers should prefer a specific type. */
  SYSTEM: 'system',
  PASSWORD_CHANGED: 'password_changed',
  CREATOR_ASSISTANCE_RESOLVED: 'creator.assistance_resolved',
  ACTIVATION_ONBOARDING_NOT_STARTED: 'activation.onboarding_not_started',
  ACTIVATION_IDEA_SELECTED_NO_PRODUCT: 'activation.idea_selected_no_product',
  ACTIVATION_PRODUCT_INCOMPLETE: 'activation.product_incomplete',
  ACTIVATION_PRODUCT_READY_NOT_SUBMITTED:
    'activation.product_ready_not_submitted',
  CREATOR_REFERRAL_AVAILABLE: 'creator_referral_available',
  MONITORING_INCIDENT_OPENED: 'monitoring_incident_opened',
  MONITORING_INCIDENT_UPDATE: 'monitoring_incident_update',
  // Phase A4
  FIRST_SALE: 'first_sale',
  PROMOTION_UPDATE: 'promotion_update',
  PROMOTION_REQUESTED: 'promotion_requested',
  // Phase A5
  REVIEW_RESOLVED: 'review_resolved',
  SALES_MILESTONE: 'sales_milestone',
  // Phase C4 — Creator Success (REVIEW_REQUEST is shared with the Sprint 2
  // buyer journey: same event, same template, declared once below)
  REVIEW_RECEIVED: 'review_received',
  CASE_STUDY_INVITED: 'case_study_invited',
  CASE_STUDY_UPDATE: 'case_study_update',
  REFERRAL_FIRST_SALE: 'referral_first_sale',
  // ---- Phase C5: SCALE (§34) -------------------------------------------
  // Registered in notification-templates.ts with full FA/EN copy. A type that
  // is NOT in that registry renders as a generic placeholder, so these are
  // declared here and rendered there — never hardcoded at a call site.
  // Phase 3 — manual payout operations
  PAYOUT_PAID: 'payout_paid',
  C5_REFERRAL_SIGNUP: 'c5_referral_signup',
  C5_REFERRAL_CONVERSION: 'c5_referral_conversion',
  C5_REWARD_AVAILABLE: 'c5_reward_available',
  C5_REWARD_REVERSED: 'c5_reward_reversed',
  C5_AMBASSADOR_INVITED: 'c5_ambassador_invited',
  C5_AMBASSADOR_ACTIVE: 'c5_ambassador_active',
  C5_PARTNERSHIP_DECISION: 'c5_partnership_decision',
  C5_AFFILIATE_DECISION: 'c5_affiliate_decision',
  C5_COMMUNITY_INVITED: 'c5_community_invited',
  C5_COMMUNITY_JOINED: 'c5_community_joined',
  C5_COMMISSION_AVAILABLE: 'c5_commission_available',
  // Gap closure
  FIRST_PRODUCT_CREATED: 'first_product_created',
  PRODUCT_UPDATED: 'product_updated',
  FIRST_FAVORITE: 'first_favorite',
  // Buyer discovery — a followed creator / category released a new product.
  FOLLOWED_NEW_PRODUCT: 'followed_new_product',
  // Sprint 2 — buyer activation journey.
  PRODUCT_READY: 'product_ready',
  SETUP_REMINDER: 'setup_reminder',
  REVIEW_REQUEST: 'review_request',
  // Phase 10 — in-app confirmation of a server-authoritative term expiry.
  // Reminder timing/channels remain a separate policy decision.
  ENTITLEMENT_EXPIRED: 'entitlement_expired',
} as const;

/** Sprint 2 — optional metadata of one notification. */
export interface NotifyOptions {
  variant?: string;
  link?: string | null;
  severity?: NotificationSeverity;
  relatedType?: string | null;
  relatedId?: string | null;
  /** Same logical event ⇒ same key ⇒ at most ONE notification (idempotent). */
  dedupKey?: string | null;
}

export const NOTIFICATION_FILTERS = ['all', 'unread', 'read'] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

/**
 * Stored notification links are rendered by the browser, so they must be
 * application-relative paths. A notification does not grant access to its
 * target, but it also must not become an open redirect if an upstream value
 * is malformed or later becomes user-controlled.
 */
function hasAsciiControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function internalNotificationLink(
  link: string | null | undefined,
): string | null {
  if (!link) return null;
  const normalized = link.trim();
  if (
    !normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    normalized.includes('\\') ||
    hasAsciiControlCharacter(normalized) ||
    /^\/(?:%2f|%5c)/i.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
   * Writes an in-app notification for one user. With `dedupKey` the write is
   * idempotent: a second call for the same logical event returns the
   * notification that already exists instead of creating a duplicate.
   */
  async notify(
    userId: string,
    type: string,
    title: string,
    body?: string,
    link?: string | null,
    extra: Omit<NotifyOptions, 'variant' | 'link'> = {},
  ): Promise<Notification> {
    const values = {
      userId,
      type,
      title,
      body: body ?? null,
      link: internalNotificationLink(link),
      severity: extra.severity ?? defaultSeverity(type),
      relatedType: extra.relatedType ?? null,
      relatedId: extra.relatedId ?? null,
      dedupKey: extra.dedupKey ?? null,
    };
    if (values.dedupKey) {
      await this.notificationsRepository
        .createQueryBuilder()
        .insert()
        .into(Notification)
        .values(values)
        .orIgnore()
        .execute();
      return this.notificationsRepository.findOneByOrFail({
        dedupKey: values.dedupKey,
      });
    }
    return this.notificationsRepository.save(
      this.notificationsRepository.create(values),
    );
  }

  /**
   * Localized, event-driven notification (BUY upgrade): renders the title
   * and body from notification-templates in the RECIPIENT'S preferred
   * locale, with an optional in-app deep link for the CTA. This is the
   * method business flows should call; `notify`/`notifySafe` with raw
   * strings remain only for the legacy/system escape hatch.
   */
  async notifyEvent(
    userId: string,
    type: string,
    params: Record<string, string> = {},
    options: NotifyOptions = {},
  ): Promise<Notification> {
    const locale = await this.localeOf(userId);
    const template = renderNotification(
      type,
      options.variant ?? 'default',
      locale,
      params,
    );
    return this.notify(
      userId,
      type,
      template.title,
      template.body,
      options.link,
      {
        severity: options.severity ?? defaultSeverity(type, options.variant),
        relatedType: options.relatedType,
        relatedId: options.relatedId,
        dedupKey: options.dedupKey,
      },
    );
  }

  /**
   * Fire-and-forget variant for business flows (PLAYBOOK Phase 8):
   * a notification is a controlled side effect — its failure must never fail
   * the primary business operation. Failures are logged instead.
   */
  async notifySafe(
    userId: string,
    type: string,
    title: string,
    body?: string,
  ): Promise<void> {
    try {
      await this.notify(userId, type, title, body);
    } catch (error) {
      this.logger.error(
        `Failed to write ${type} notification to user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Fire-and-forget localized event notification (see notifyEvent). */
  async notifyEventSafe(
    userId: string,
    type: string,
    params: Record<string, string> = {},
    options: NotifyOptions = {},
  ): Promise<void> {
    try {
      await this.notifyEvent(userId, type, params, options);
    } catch (error) {
      this.logger.error(
        `Failed to write ${type} notification to user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Like notifySafe, fanned out to every user holding a role. */
  async notifyRoleSafe(
    role: UserRole,
    type: string,
    title: string,
    body?: string,
  ): Promise<void> {
    let members: Array<{ id: string }>;
    try {
      members = await this.usersRepository.find({
        where: { role },
        select: { id: true },
      });
    } catch (error) {
      this.logger.error(
        `Failed to list ${role} recipients for ${type} notification`,
        error instanceof Error ? error.stack : String(error),
      );
      return;
    }
    await Promise.all(
      members.map((member) => this.notifySafe(member.id, type, title, body)),
    );
  }

  /**
   * Gap closure — localized fan-out to an explicit recipient list (e.g. the
   * owners / savers of a product that shipped a new version). Rendered once
   * per locale and bulk-inserted in chunks, so a popular product does not
   * issue one query per recipient. Never throws.
   */
  async notifyManySafe(
    userIds: string[],
    type: string,
    params: Record<string, string> = {},
    options: NotifyOptions = {},
  ): Promise<number> {
    const unique = [...new Set(userIds)];
    if (!unique.length) return 0;
    try {
      const users = await this.usersRepository.find({
        where: unique.map((id) => ({ id })),
        select: { id: true, preferredLocale: true },
      });
      const rendered = new Map<string, { title: string; body: string }>();
      const rows = users.map((user) => {
        const locale = user.preferredLocale ?? 'fa';
        let template = rendered.get(locale);
        if (!template) {
          template = renderNotification(
            type,
            options.variant ?? 'default',
            locale,
            params,
          );
          rendered.set(locale, template);
        }
        return this.notificationsRepository.create({
          userId: user.id,
          type,
          title: template.title,
          body: template.body,
          link: internalNotificationLink(options.link),
          severity: options.severity ?? defaultSeverity(type, options.variant),
          // Keep a bulk notification connected to the same domain object as
          // its single-recipient counterpart. `dedupKey` is deliberately not
          // copied here: its current database uniqueness is global rather
          // than recipient-scoped (see the Phase 12 blocker register).
          relatedType: options.relatedType ?? null,
          relatedId: options.relatedId ?? null,
        });
      });
      for (let i = 0; i < rows.length; i += 200) {
        await this.notificationsRepository.insert(rows.slice(i, i + 200));
      }
      return rows.length;
    } catch (error) {
      this.logger.error(
        `Failed to fan out ${type} notification to ${unique.length} users`,
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }

  /**
   * Localized role fan-out (BUY upgrade): each recipient gets the
   * notification in their OWN preferred locale.
   */
  async notifyRoleEventSafe(
    role: UserRole,
    type: string,
    params: Record<string, string> = {},
    options: NotifyOptions = {},
  ): Promise<void> {
    let members: Array<{ id: string; preferredLocale: string }>;
    try {
      members = await this.usersRepository.find({
        where: { role },
        select: { id: true, preferredLocale: true },
      });
    } catch (error) {
      this.logger.error(
        `Failed to list ${role} recipients for ${type} notification`,
        error instanceof Error ? error.stack : String(error),
      );
      return;
    }
    await Promise.all(
      members.map((member) =>
        this.notifyEventSafe(member.id, type, params, options),
      ),
    );
  }

  private async localeOf(userId: string): Promise<string> {
    try {
      const user = await this.usersRepository.findOne({
        where: { id: userId },
        select: { preferredLocale: true },
      });
      return user?.preferredLocale ?? 'fa';
    } catch {
      return 'fa';
    }
  }

  async listForUser(
    userId: string,
    page: number,
    pageSize: number,
    filter: NotificationFilter = 'all',
    type?: string,
  ): Promise<{ items: Notification[]; meta: PaginationMeta }> {
    const where: Record<string, unknown> = { userId };
    if (filter === 'unread') where.readAt = IsNull();
    if (filter === 'read') where.readAt = Not(IsNull());
    if (type) where.type = type;
    const [items, total] = await this.notificationsRepository.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, meta: buildPaginationMeta(page, pageSize, total) };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationsRepository.countBy({ userId, readAt: IsNull() });
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.notificationsRepository.update(
      { id: notificationId, userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return result.affected !== 0;
  }

  /** Sprint 2 — undo a read (owner only). */
  async markUnread(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.notificationsRepository.update(
      { id: notificationId, userId, readAt: Not(IsNull()) },
      { readAt: null },
    );
    if (result.affected) return true;
    // Already unread is fine (idempotent) — but it must exist and be mine.
    return this.notificationsRepository.existsBy({
      id: notificationId,
      userId,
    });
  }

  /** Distinct notification types the user has (for the filter bar). */
  async typesOf(userId: string): Promise<string[]> {
    const rows = await this.notificationsRepository
      .createQueryBuilder('n')
      .select('DISTINCT n.type', 'type')
      .where('n.user_id = :userId', { userId })
      .getRawMany<{ type: string }>();
    return rows.map((row) => row.type).sort();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationsRepository.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
  }
}
