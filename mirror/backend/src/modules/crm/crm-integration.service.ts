import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CrmEventsService } from './crm-events.service';
import { CrmAttributionService } from './crm-attribution.service';
import { CREATOR_EVENTS } from './domain/events';

/**
 * Phase C1 — the bridge between the EXISTING product systems and the CRM.
 *
 * "Timeline باید Eventهای مهم را از سیستم‌های موجود جمع کند. نباید فقط
 *  Eventهای مصنوعی frontend باشند."
 *
 * This service is the single place those real transitions are reported, so
 * every call site uses the SAME event name and the SAME idempotency key
 * format. It is a thin façade on purpose: the CRM never re-implements
 * product logic, it only records what already happened.
 *
 * Every method is safe to call twice (dedup keys) and never throws into the
 * caller — a CRM write must never break a signup, a publish or a payment.
 */
@Injectable()
export class CrmIntegrationService {
  private readonly logger = new Logger(CrmIntegrationService.name);

  constructor(
    private readonly events: CrmEventsService,
    private readonly attribution: CrmAttributionService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * A user registered. This is also where identity resolution runs: the
   * registration payload may carry the attribution id captured on the
   * landing page, and the lead is created/linked here rather than in a
   * second, possibly-racing place later.
   */
  async onUserRegistered(
    user: { id: string; email: string | null; phone: string | null },
    options: { attributionId?: string | null } = {},
    manager?: EntityManager,
  ): Promise<{ leadId: string | null }> {
    try {
      if (options.attributionId) {
        const { leadId } = await this.attribution.linkToUser(
          options.attributionId,
          user,
        );
        if (leadId) {
          await this.events.recordSafe(
            {
              eventName: CREATOR_EVENTS.SIGNUP,
              leadId,
              userId: user.id,
              entityType: 'user',
              entityId: user.id,
              dedupKey: CrmEventsService.dedupKey(
                'creator.registered',
                user.id,
              ),
              metadata: {
                email: Boolean(user.email),
                phone: Boolean(user.phone),
              },
            },
            manager,
          );
        }
        return { leadId };
      }

      const lead = await this.attribution.resolveOrCreateLeadForUser(
        user,
        manager ?? this.dataSource.manager,
      );
      if (!lead) return { leadId: null };
      await this.events.recordSafe(
        {
          eventName: CREATOR_EVENTS.SIGNUP,
          leadId: lead.id,
          userId: user.id,
          creatorProfileId: lead.creatorProfileId,
          entityType: 'user',
          entityId: user.id,
          dedupKey: CrmEventsService.dedupKey('creator.registered', user.id),
          metadata: { email: Boolean(user.email), phone: Boolean(user.phone) },
        },
        manager,
      );
      return { leadId: lead.id };
    } catch (error) {
      this.logger.error(
        'CRM signup integration failed',
        error instanceof Error ? error.stack : String(error),
      );
      return { leadId: null };
    }
  }

  /** A signed-in user came back — a real engagement signal. */
  async onUserLogin(userId: string, manager?: EntityManager): Promise<void> {
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.LOGIN,
        userId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.login',
          userId,
          this.dayKey(),
        ),
        metadata: {},
      },
      manager,
    );
    await this.touchByUser(userId, manager);
  }

  /** The person became a creator (profile created). */
  async onCreatorProfileCreated(
    userId: string,
    creatorProfileId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.attribution.linkCreatorProfile(
      userId,
      creatorProfileId,
      manager,
    );
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.CREATOR_PROFILE_CREATED,
        leadId: lead?.id ?? null,
        userId,
        creatorProfileId,
        entityType: 'creator_profile',
        entityId: creatorProfileId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.profile_created',
          creatorProfileId,
        ),
      },
      manager,
    );
  }

  /** The guided creator onboarding finished — the "activated" milestone. */
  async onCreatorActivated(
    userId: string,
    creatorProfileId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.attribution.linkCreatorProfile(
      userId,
      creatorProfileId,
      manager,
    );
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.ONBOARDING_COMPLETED,
        leadId: lead?.id ?? null,
        userId,
        creatorProfileId,
        entityType: 'creator_profile',
        entityId: creatorProfileId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.onboarding_completed',
          creatorProfileId,
        ),
      },
      manager,
    );
  }

  /**
   * A product was created. The SECOND one is a distinct, named event
   * because "did this creator build a second thing?" is the single best
   * predictor of a real, growing creator.
   */
  async onProductStarted(
    creatorProfileId: string,
    agentId: string,
    productIndex: number,
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.leadForCreator(creatorProfileId);
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.PRODUCT_STARTED,
        leadId: lead?.id ?? null,
        creatorProfileId,
        entityType: 'agent',
        entityId: agentId,
        dedupKey: CrmEventsService.dedupKey('creator.product_started', agentId),
        metadata: { productIndex },
      },
      manager,
    );
    if (productIndex >= 2) {
      await this.events.recordSafe(
        {
          eventName: CREATOR_EVENTS.SECOND_PRODUCT_STARTED,
          leadId: lead?.id ?? null,
          creatorProfileId,
          entityType: 'agent',
          entityId: agentId,
          dedupKey: CrmEventsService.dedupKey(
            'creator.second_product_started',
            creatorProfileId,
          ),
          metadata: { productIndex },
        },
        manager,
      );
    }
  }

  async onProductSubmitted(
    creatorProfileId: string,
    agentId: string,
    submissionId: string,
    revisionNumber: number,
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.leadForCreator(creatorProfileId);
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.PRODUCT_SUBMITTED,
        leadId: lead?.id ?? null,
        creatorProfileId,
        entityType: 'agent_review_submission',
        entityId: submissionId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.product_submitted',
          submissionId,
        ),
        metadata: { agentId, revisionNumber },
      },
      manager,
    );
  }

  async onRevisionRequested(
    creatorProfileId: string,
    agentId: string,
    submissionId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.leadForCreator(creatorProfileId);
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.REVISION_REQUESTED,
        leadId: lead?.id ?? null,
        creatorProfileId,
        entityType: 'agent_review_submission',
        entityId: submissionId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.revision_requested',
          submissionId,
        ),
        metadata: { agentId },
      },
      manager,
    );
  }

  async onResubmitted(
    creatorProfileId: string,
    agentId: string,
    submissionId: string,
    revisionNumber: number,
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.leadForCreator(creatorProfileId);
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.RESUBMITTED,
        leadId: lead?.id ?? null,
        creatorProfileId,
        entityType: 'agent_review_submission',
        entityId: submissionId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.resubmitted',
          submissionId,
          revisionNumber,
        ),
        metadata: { agentId, revisionNumber },
      },
      manager,
    );
  }

  async onProductApproved(
    creatorProfileId: string,
    agentId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.leadForCreator(creatorProfileId);
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.PRODUCT_APPROVED,
        leadId: lead?.id ?? null,
        creatorProfileId,
        entityType: 'agent',
        entityId: agentId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.product_approved',
          agentId,
        ),
      },
      manager,
    );
  }

  async onProductPublished(
    creatorProfileId: string,
    agentId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.leadForCreator(creatorProfileId);
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.PRODUCT_PUBLISHED,
        leadId: lead?.id ?? null,
        creatorProfileId,
        entityType: 'agent',
        entityId: agentId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.product_published',
          agentId,
        ),
      },
      manager,
    );
  }

  /** A share beacon (channel + product). */
  async onProductShared(
    creatorProfileId: string,
    agentId: string,
    channel: string,
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.leadForCreator(creatorProfileId);
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.PRODUCT_SHARED,
        leadId: lead?.id ?? null,
        creatorProfileId,
        entityType: 'agent',
        entityId: agentId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.product_shared',
          agentId,
          channel,
          this.hourKey(),
        ),
        metadata: { channel },
      },
      manager,
    );
  }

  /**
   * A confirmed transaction. `isFirst` decides between the named
   * `first.sale` event and the generic revenue event — both are real, but
   * "first sale" is the milestone the growth team watches.
   */
  async onSale(
    creatorProfileId: string,
    payload: {
      orderId: string;
      agentId: string;
      amount: number;
      currency: string;
    },
    options: { isFirst: boolean; isRefund?: boolean } = { isFirst: false },
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.leadForCreator(creatorProfileId);
    if (options.isFirst) {
      await this.events.recordSafe(
        {
          eventName: CREATOR_EVENTS.FIRST_SALE,
          leadId: lead?.id ?? null,
          creatorProfileId,
          entityType: 'order',
          entityId: payload.orderId,
          dedupKey: CrmEventsService.dedupKey(
            'creator.first_sale',
            payload.orderId,
          ),
          metadata: {
            agentId: payload.agentId,
            amount: payload.amount,
            currency: payload.currency,
          },
        },
        manager,
      );
    }
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.REVENUE_EVENT,
        leadId: lead?.id ?? null,
        creatorProfileId,
        entityType: options.isRefund ? 'refund' : 'order',
        entityId: payload.orderId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.revenue_event',
          options.isRefund ? 'refund' : 'order',
          payload.orderId,
        ),
        metadata: {
          agentId: payload.agentId,
          amount: payload.amount,
          currency: payload.currency,
          refunded: Boolean(options.isRefund),
        },
      },
      manager,
    );
  }

  /**
   * A transactional email was actually delivered (§16 "reuse the existing
   * email system"). The CRM records the fact; it never sends anything.
   */
  async onEmailSent(
    payload: { template: string; userId: string | null; to: string | null },
    manager?: EntityManager,
  ): Promise<void> {
    // The recipient address is PII and is deliberately NOT recorded — the
    // template + user id are enough to answer "was this creator onboarded?".
    await this.events.recordSafe(
      {
        eventName: CREATOR_EVENTS.EMAIL_SENT,
        userId: payload.userId,
        entityType: 'email',
        entityId: null,
        dedupKey: CrmEventsService.dedupKey(
          'creator.email_sent',
          payload.template,
          payload.userId ?? 'anonymous',
        ),
        metadata: { template: payload.template },
      },
      manager,
    );
    if (payload.userId) await this.touchByUser(payload.userId, manager);
  }

  /**
   * The "growing" measurement of §8. Written as a discrete event so the
   * funnel's top stage is a recorded fact, not a live guess.
   */
  async onGrowthSignal(
    creatorProfileId: string,
    payload: { views7d: number; previousViews7d: number; salesDelta: number },
    manager?: EntityManager,
  ): Promise<void> {
    const lead = await this.leadForCreator(creatorProfileId);
    await this.events.recordSafe(
      {
        eventName: 'creator.growing_signal',
        leadId: lead?.id ?? null,
        creatorProfileId,
        entityType: 'creator_profile',
        entityId: creatorProfileId,
        dedupKey: CrmEventsService.dedupKey(
          'creator.growing_signal',
          creatorProfileId,
          this.dayKey(),
        ),
        metadata: {
          views7d: payload.views7d,
          previousViews7d: payload.previousViews7d,
          salesDelta: payload.salesDelta,
        },
      },
      manager,
    );
  }

  // ---- internals ---------------------------------------------------------

  private async leadForCreator(creatorProfileId: string) {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM creator_leads
        WHERE merged_into_id IS NULL AND creator_profile_id = $1
        LIMIT 1`,
      [creatorProfileId],
    );
    return rows[0]?.id ? { id: rows[0].id } : null;
  }

  /** Keeps `last_activity_at` honest without a write per read. */
  private async touchByUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.dataSource.manager;
    await runner.query(
      `UPDATE creator_leads
          SET last_activity_at = GREATEST(COALESCE(last_activity_at, now()), now())
        WHERE merged_into_id IS NULL AND user_id = $1`,
      [userId],
    );
  }

  private dayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private hourKey(): string {
    return new Date().toISOString().slice(0, 13);
  }
}
