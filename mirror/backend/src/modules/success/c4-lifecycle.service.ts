import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReferralService } from './referral.service';
import { ReviewSuccessService } from './review-success.service';
import { CrmEventsService } from '../crm/crm-events.service';
import { CREATOR_EVENTS } from '../crm/domain/events';
import {
  NotificationsService,
  NOTIFICATION_TYPES,
} from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import type { ReferralStage } from './domain/referral';

/**
 * Phase C4 §26 — the automation engine.
 *
 * This project has NO queue and NO job runner (`@Cron`, `BullModule` and
 * `@Processor` appear nowhere), and §26 says to use an existing one "if it
 * exists". So C4 triggers off the events the system already emits, through
 * the same synchronous hooks A5 uses for milestones — and the time-based
 * work (review requests after N days) is an explicit, idempotent admin-callable
 * sweep, exactly as C3 did for reminders.
 *
 * Adding a cron without a decided background runtime would have been a fake
 * capability: a scheduler that never fires is worse than no scheduler, because
 * the code reads as though something is running.
 *
 * EVERY method here is safe to call twice. That is not a nice property, it is
 * the requirement — §27 lists "queue retry", "duplicate webhook" and
 * "concurrent request" as the things that must not produce a duplicate
 * notification, email, reward or milestone, and every guard below is a
 * database uniqueness constraint rather than a check-then-act race.
 */
@Injectable()
export class C4LifecycleService {
  private readonly logger = new Logger(C4LifecycleService.name);

  constructor(
    private readonly referrals: ReferralService,
    private readonly reviews: ReviewSuccessService,
    private readonly events: CrmEventsService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * §26 chain #1 — a real sale advances the referred creator's funnel.
   *
   * Called from the payment hook alongside the existing first-sale milestone.
   * A creator who arrived through a referral and then made a sale is the only
   * outcome that proves the referral was worth anything, so `first_sale` is
   * the stage that matters and the one that can eventually become a reward.
   */
  async onSaleCompleted(agentId: string, orderId: string): Promise<void> {
    try {
      const rows = await this.dataSource.query<Array<{ creator_id: string }>>(
        `SELECT creator_id FROM agents WHERE id = $1`,
        [agentId],
      );
      if (!rows[0]) return;
      await this.referrals.advanceForReferredCreator(
        rows[0].creator_id,
        'first_sale',
        {
          orderId,
        },
      );
    } catch (error) {
      this.logger.error(
        `C4 referral first-sale hook failed for agent ${agentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * §26 chain #1b — a product submitted/published by a referred creator.
   *
   * The same trigger C1 already records (`creator.product_submitted` and
   * `creator.product_published`), read straight from the ledger so C4 adds no
   * second source of truth about a product's state.
   */
  async onProductMilestone(
    creatorProfileId: string,
    stage: Extract<
      ReferralStage,
      'product_submitted' | 'approved' | 'published'
    >,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.referrals.advanceForReferredCreator(
        creatorProfileId,
        stage,
        metadata,
      );
    } catch (error) {
      this.logger.error(
        `C4 referral product hook failed for creator ${creatorProfileId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * §26 chain #2 — a published review updates the creator's metrics and
   * produces an insight.
   *
   * The metric update is implicit: every read in C4 derives from `reviews`, so
   * there is no counter to keep in sync. What this DOES is record the
   * §29 event and notify the creator, both exactly once.
   */
  async onReviewPublished(review: {
    id: string;
    agentId: string;
    userId: string;
  }): Promise<void> {
    await this.reviews.onReviewPublished(review);
  }

  /**
   * §25 — the case-study invitation email, once.
   *
   * `dedupKey` is scoped to the CASE STUDY ELIGIBILITY MOMENT, not to the
   * creator, so a creator who somehow crosses the threshold twice (a
   * threshold change, say) is invited again for the new reason rather than
   * silently never being invited at all.
   */
  async inviteToCaseStudy(
    creatorProfileId: string,
    creatorUserId: string,
    criteriaKey: string,
  ): Promise<boolean> {
    try {
      const created = await this.events.recordSafe({
        eventName: CREATOR_EVENTS.CASE_STUDY_INVITED,
        userId: creatorUserId,
        creatorProfileId,
        entityType: 'case_study',
        entityId: criteriaKey,
        dedupKey: `c4.case_study_invited:${creatorProfileId}:${criteriaKey}`,
      });
      if (!created) return false;

      await this.notifications.notifyEventSafe(
        creatorUserId,
        NOTIFICATION_TYPES.CASE_STUDY_INVITED,
        {},
        { link: '/creator/success/case-study' },
      );
      // The email outbox dedups on (template, user, relatedEntity), so this
      // cannot produce a second copy even if the event insert were retried.
      await this.emails.enqueue({
        template: 'creator_case_study_invite',
        data: {},
        userId: creatorUserId,
        relatedEntityType: 'case_study',
        relatedEntityId: criteriaKey,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `C4 case study invite failed for ${creatorProfileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * §25 — the "you can now invite creators" email, once.
   *
   * Gated on the creator having actually reached a first sale, because §24
   * asks for a referral invitation at the moment the program becomes relevant
   * to them — not on signup, where it would be noise from a creator with
   * nothing to share yet.
   */
  async notifyReferralAvailable(
    creatorProfileId: string,
    creatorUserId: string,
  ): Promise<boolean> {
    try {
      const created = await this.events.recordSafe({
        eventName: CREATOR_EVENTS.REFERRAL_LINK_CREATED,
        userId: creatorUserId,
        creatorProfileId,
        entityType: 'referral',
        entityId: 'availability',
        dedupKey: `c4.referral_available:${creatorProfileId}`,
      });
      if (!created) return false;
      await this.notifications.notifyEventSafe(
        creatorUserId,
        NOTIFICATION_TYPES.CREATOR_REFERRAL_AVAILABLE,
        {},
        { link: '/creator/success/referral' },
      );
      return true;
    } catch (error) {
      this.logger.error(
        `C4 referral availability notice failed for ${creatorProfileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * §16 — public click tracking on a shared link.
   *
   * Public, unauthenticated and therefore the most attacked surface in C4. It
   * advances at most one stage, only forward, and a repeat click is a no-op
   * because the stage UNIQUE index rejects it.
   */
  async onReferralVisited(code: string): Promise<boolean> {
    try {
      return await this.referrals.markVisited(code);
    } catch (error) {
      this.logger.error(
        `C4 referral visit failed for code`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}
