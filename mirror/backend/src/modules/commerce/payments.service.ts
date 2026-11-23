import {
  SALES_MILESTONES,
  milestoneKey,
} from '../../database/entities/growth/creator-milestone.entity';
import { CrmIntegrationService } from '../crm/crm-integration.service';
import type { GrowthLoopService } from '../scale/growth-loop.service';
import { toMinorUnits } from '../scale/domain/money';
import type { C4LifecycleService } from '../success/c4-lifecycle.service';
import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Payment,
  PaymentStatus,
} from '../../database/entities/commerce/payment.entity';
import {
  Order,
  OrderStatus,
} from '../../database/entities/commerce/order.entity';
import { ApiException } from '../../common/errors/api-error';
import { ensureJourney } from '../buyer-journey/contract';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { FinanceClock } from '../finance/finance-clock';
import { SaleRecorderService } from '../finance/sale-recorder.service';
import { WebhookSignatureService } from './webhook-signature.service';
import { Inject } from '@nestjs/common';
import {
  GatewayRejectedError,
  GatewayUnavailableError,
  PAYMENT_GATEWAY,
} from './gateway/payment-gateway.types';
import type {
  GatewayVerifyResult,
  PaymentGateway,
} from './gateway/payment-gateway.types';
import { businessEvent } from '../../common/logging/app-logger';
import { AnalyticsEventsService } from '../analytics/analytics-events.service';
import { EntitlementsService } from './entitlements.service';
import type { CommercialProfile } from '../../database/entities/agents/product-model';
import { ANALYTICS_EVENTS } from '../../database/entities/growth/agent-analytics-event.entity';

/** Sandbox gateway id — the development/test provider (never production). */
export const SANDBOX_GATEWAY = 'sandbox';

export interface GatewayEvent {
  gateway: string;
  event: string;
  transactionId: string;
  amount: string;
  currency: string;
  signature: string;
}

export interface CallbackResult {
  status:
    | 'confirmed'
    | 'already_confirmed'
    | 'duplicate'
    | 'cancelled'
    | 'failed'
    | 'refunded'
    | 'pending';
  orderId: string;
  orderStatus: OrderStatus;
}

/**
 * Payment lifecycle (Batch 10 — Phase 18, §5):
 *
 *   initiated ──▶ pending ──▶ successful ──▶ refunded (refund flow)
 *                   │  ▲
 *                   ▼  └── (verify code 101 = idempotent re-confirm)
 *                 failed / cancelled
 *
 * - `initiated` = order+payment rows exist, no provider session yet.
 * - `pending`   = provider session exists (authority persisted).
 * - `successful` is only ever set by `confirmSuccessful` — locked,
 *   transactional, exactly-once, with the entitlement granted atomically.
 * - Invalid transitions are rejected: a failed payment cannot become
 *   successful through the client; a successful one cannot return to
 *   pending; re-confirming a successful payment is idempotent
 *   (`duplicate`); duplicate webhooks/callbacks never duplicate business
 *   effects (§§8–10).
 * - A provider timeout leaves the payment `pending` — indeterminate, never
 *   falsely failed.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly callbackBase: string;
  private readonly nodeEnv: string;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly entitlementAuthority: EntitlementsService,
    private readonly signatureService: WebhookSignatureService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
    private readonly emails: EmailService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    config: ConfigService,
    private readonly analytics: AnalyticsEventsService,
    // Phase C1 — first sale / revenue events for the CRM funnel.
    private readonly crm: CrmIntegrationService,
    /** Phase 2 — the financial effect of a confirmed payment (ledger, holding, receipt). */
    private readonly sales: SaleRecorderService,
    private readonly clock: FinanceClock,
    /**
     * Phase C4 §26 — advances the creator-referral funnel on a real sale.
     *
     * @Optional and last: commerce's own unit tests construct this service
     * without registering SuccessModule, and a required dependency would make
     * every one of them fail for a feature they are not testing. Production
     * always provides it, because AppModule imports SuccessModule.
     */
    @Optional() private readonly c4Lifecycle?: C4LifecycleService,
    /**
     * Phase C5 §1/§6/§7/§23 — the growth loop: a confirmed payment is the
     * single event that turns a referral into attribution, a reward and an
     * affiliate commission.
     *
     * @Optional for the same reason as C4LifecycleService above, and with the
     * same guarantee: a payment must never fail because the growth loop is
     * unavailable. Attribution that cannot run is a lost reward; a lost reward
     * is recoverable by an admin, whereas a failed purchase is not.
     */
    @Optional() private readonly growthLoop?: GrowthLoopService,
  ) {
    this.callbackBase = (
      config.get<string>('paymentCallbackBase') ?? ''
    ).replace(/\/+$/, '');
    this.nodeEnv = config.get<string>('nodeEnv') ?? 'development';
  }

  /**
   * Creates the payment row and opens a provider session for it.
   *
   * The row is created INITIATED first; the provider call happens outside
   * any database transaction (a provider outage must never hold a pool
   * connection); the authority + payment URL are persisted afterwards.
   * Provider rejection/transport failure marks THIS payment failed —
   * the order can be retried with a fresh checkout.
   */
  /**
   * Creates the payment row (INITIATED). Safe to call inside the checkout
   * advisory-lock transaction; performs NO network I/O.
   */
  private async buyerEmailFor(buyerId: string): Promise<string | null> {
    const buyer = await this.usersService.findById(buyerId);
    return buyer?.email ?? null;
  }

  async initiate(
    orderId: string,
    amount: string,
    currency: string,
    manager?: EntityManager,
  ): Promise<Payment> {
    const paymentsRepo =
      manager?.getRepository(Payment) ?? this.paymentsRepository;
    return paymentsRepo.save(
      paymentsRepo.create({
        orderId,
        gateway: this.gateway.name,
        amount,
        currency,
        status: PaymentStatus.INITIATED,
      }),
    );
  }

  /**
   * Opens the provider session for an INITIATED payment and persists the
   * authority + payment URL. Runs OUTSIDE any database transaction: a slow
   * or dead provider must never hold a pool connection.
   */
  async openSession(paymentId: string): Promise<Payment> {
    const payment = await this.paymentsRepository.findOneBy({ id: paymentId });
    if (!payment) {
      throw new ApiException(
        'NOT_FOUND',
        'Payment not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (payment.status !== PaymentStatus.INITIATED) {
      return payment;
    }
    const { orderId, amount, currency } = payment;
    const order = await this.dataSource
      .getRepository(Order)
      .findOneBy({ id: orderId });
    const buyerEmail = order ? await this.buyerEmailFor(order.buyerId) : null;

    try {
      const session = await this.gateway.createPayment({
        amount,
        currency,
        callbackUrl: `${this.callbackBase}/payment/callback`,
        description: 'MESH purchase',
        metadata: {
          orderId,
          ...(buyerEmail ? { email: buyerEmail } : {}),
        },
      });

      const updated = await this.paymentsRepository.save({
        ...payment,
        gatewayTransactionId: session.authority,
        status: PaymentStatus.PENDING,
        providerPayload: {
          paymentUrl: session.paymentUrl,
          createResponse: session.raw,
        },
      });

      businessEvent.info(
        'payment.started',
        'Payment session opened with the gateway',
        {
          paymentId: payment.id,
          orderId,
          gateway: this.gateway.name,
          transactionId: session.authority,
          amount,
          currency,
          hasPaymentUrl: session.paymentUrl !== null,
        },
      );
      return updated;
    } catch (error) {
      // Definitive rejection OR transport failure during initiation: this
      // payment is dead; the buyer retries with a fresh checkout.
      const reason =
        error instanceof GatewayRejectedError
          ? `gateway rejected initiation (${error.code})`
          : error instanceof GatewayUnavailableError
            ? 'gateway unreachable during initiation'
            : 'unexpected gateway error during initiation';
      const safeDetail =
        error instanceof Error ? error.name : String(error).slice(0, 120);
      await this.markFailed(payment.id, reason, { safeDetail });
      businessEvent.warn(
        'payment.start_failed',
        'Opening the payment session failed',
        {
          paymentId: payment.id,
          orderId,
          gateway: this.gateway.name,
          reason,
          detail: safeDetail,
        },
      );
      if (error instanceof GatewayRejectedError) {
        throw new ApiException(
          'PAYMENT_FAILED',
          'The payment provider refused this payment request',
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw new ApiException(
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'The payment provider is currently unavailable. Please retry.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async findByTransaction(
    gateway: string,
    transactionId: string,
  ): Promise<Payment | null> {
    return this.paymentsRepository.findOneBy({
      gateway,
      gatewayTransactionId: transactionId,
    });
  }

  /** Verifies a signed gateway event and confirms the payment if genuine. */
  async handleWebhookEvent(event: GatewayEvent): Promise<{ status: string }> {
    businessEvent.info('payment.webhook.received', 'Gateway webhook received', {
      gateway: event.gateway,
      event: event.event,
      transactionId: event.transactionId,
      amount: event.amount,
      currency: event.currency,
    });

    if (
      event.event !== 'payment.succeeded' &&
      event.event !== 'payment.failed'
    ) {
      businessEvent.info(
        'payment.webhook.ignored',
        'Uninteresting event type',
        {
          gateway: event.gateway,
          event: event.event,
        },
      );
      return { status: 'ignored' };
    }
    if (
      !this.signatureService.verify(
        {
          gateway: event.gateway,
          event: event.event,
          transactionId: event.transactionId,
          amount: event.amount,
          currency: event.currency,
        },
        event.signature,
      )
    ) {
      // Security-relevant: rejected before any business effect (§8).
      businessEvent.warn(
        'payment.webhook.signature_invalid',
        'Webhook signature verification failed',
        { gateway: event.gateway, transactionId: event.transactionId },
      );
      throw new ApiException(
        'UNAUTHORIZED',
        'Invalid webhook signature',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (event.event === 'payment.failed') {
      const payment = await this.findByTransaction(
        event.gateway,
        event.transactionId,
      );
      if (!payment) {
        businessEvent.warn(
          'payment.webhook.transaction_unknown',
          'Webhook references a transaction we never issued',
          { gateway: event.gateway, transactionId: event.transactionId },
        );
        return { status: 'unknown' };
      }
      // Only the first failure transition notifies the buyer (idempotent
      // against repeated webhook deliveries).
      const buyerId = await this.markFailed(
        payment.id,
        'Gateway reported a failed payment',
      );
      if (buyerId) {
        await this.notifications.notifyEventSafe(
          buyerId,
          NOTIFICATION_TYPES.PAYMENT_FAILED,
        );
        // Transactional email — decoupled from business state (§21).
        await this.emails.enqueue({
          template: 'payment_failed',
          data: { orderId: payment.orderId },
          userId: buyerId,
          relatedEntityType: 'payment',
          relatedEntityId: payment.id,
        });
      }
      businessEvent.info(
        'payment.webhook.processed',
        'Failure webhook processed',
        { gateway: event.gateway, transactionId: event.transactionId },
      );
      return { status: 'processed' };
    }

    try {
      const result = await this.confirmSuccessful(
        event.gateway,
        event.transactionId,
        event.amount,
        event.currency,
        undefined,
        'webhook',
      );
      if (result === 'duplicate') {
        businessEvent.info(
          'payment.webhook.duplicate',
          'Duplicate webhook delivery — no additional business effect',
          { gateway: event.gateway, transactionId: event.transactionId },
        );
      } else {
        businessEvent.info(
          'payment.webhook.processed',
          'Success webhook finalized the payment',
          { gateway: event.gateway, transactionId: event.transactionId },
        );
      }
      return { status: result };
    } catch (error) {
      businessEvent.warn(
        'payment.webhook.failed',
        'Webhook processing ended in a rejection',
        {
          gateway: event.gateway,
          transactionId: event.transactionId,
          errorCode:
            error instanceof ApiException ? error.code : 'INTERNAL_ERROR',
        },
      );
      throw error;
    }
  }

  /**
   * Provider callback verification (Batch 10 — Phase 18, §7/§12).
   *
   * The buyer returned from the gateway to our callback page; this method
   * is what the page calls. A client landing here is NOT payment success —
   * the backend re-verifies with the provider server-to-server using the
   * PERSISTED amount, and only then finalizes. Ownership is enforced
   * (§13). Idempotent for refresh/repeated navigation.
   */
  async verifyCallback(
    userId: string,
    transactionId: string,
    status: 'OK' | 'NOK',
  ): Promise<CallbackResult> {
    businessEvent.info(
      'payment.callback.received',
      'Gateway callback verification requested',
      { transactionId, gatewayStatus: status },
    );

    const payment = await this.paymentsRepository.findOne({
      where: { gatewayTransactionId: transactionId },
      // Deterministic match even if two gateways ever shared an authority
      // string: latest payment wins (authorities are unique per gateway).
      order: { createdAt: 'DESC' },
    });
    if (!payment) {
      businessEvent.warn(
        'payment.callback.transaction_unknown',
        'Callback references an unknown transaction',
        { transactionId },
      );
      throw new ApiException(
        'NOT_FOUND',
        'Unknown payment transaction',
        HttpStatus.NOT_FOUND,
      );
    }

    const order = await this.dataSource
      .getRepository(Order)
      .findOneBy({ id: payment.orderId });
    if (!order) {
      businessEvent.warn(
        'payment.callback.order_unknown',
        'Callback payment has no order',
        { transactionId, paymentId: payment.id },
      );
      throw new ApiException(
        'NOT_FOUND',
        'Unknown payment transaction',
        HttpStatus.NOT_FOUND,
      );
    }
    if (order.buyerId !== userId) {
      // Security-relevant: IDOR attempt against another buyer's payment.
      businessEvent.warn(
        'payment.callback.forbidden',
        'User attempted to verify a payment they do not own',
        { transactionId, paymentId: payment.id, orderId: order.id },
      );
      throw new ApiException(
        'FORBIDDEN',
        'This payment does not belong to you',
        HttpStatus.FORBIDDEN,
      );
    }

    // Buyer cancelled / provider reported NOK.
    if (status === 'NOK') {
      // A NOK callback can NEVER undo a terminal payment (§3):
      //  - SUCCESSFUL: the purchase is already confirmed server-side; a
      //    replayed/edited callback URL must not make the UI claim the
      //    paid purchase failed. Truthful answer: already confirmed.
      //  - REFUNDED: terminal refunded — report the refund, not "failed".
      if (payment.status === PaymentStatus.SUCCESSFUL) {
        businessEvent.warn(
          'payment.callback.nok_after_success',
          'NOK callback arrived after the payment was already confirmed — ignored',
          { transactionId, paymentId: payment.id },
        );
        return {
          status: 'already_confirmed',
          orderId: order.id,
          orderStatus: order.status,
        };
      }
      if (payment.status === PaymentStatus.REFUNDED) {
        return {
          status: 'refunded',
          orderId: order.id,
          orderStatus: order.status,
        };
      }
      const cancelled = await this.markCancelled(
        payment.id,
        'Buyer cancelled at the gateway',
      );
      return {
        status: cancelled ? 'cancelled' : this.mapTerminal(payment.status),
        orderId: order.id,
        orderStatus: cancelled ? OrderStatus.CANCELLED : order.status,
      };
    }

    // Idempotent replays: refresh, back button, repeated navigation.
    if (payment.status === PaymentStatus.SUCCESSFUL) {
      return {
        status: 'already_confirmed',
        orderId: order.id,
        orderStatus: order.status,
      };
    }
    if (payment.status === PaymentStatus.REFUNDED) {
      // OK can never re-confirm a refunded transaction (§3: REFUNDED is
      // terminal) — report the refund instead of falling through to the
      // confirm path (which would surface as an opaque 409).
      return {
        status: 'refunded',
        orderId: order.id,
        orderStatus: order.status,
      };
    }
    if (
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.CANCELLED
    ) {
      return {
        status: this.mapTerminal(payment.status),
        orderId: order.id,
        orderStatus: order.status,
      };
    }

    if (payment.gateway === SANDBOX_GATEWAY) {
      // Development/test gateway: the server-side sandbox confirm flow is
      // the provider authority itself.
      const result = await this.confirmSuccessful(
        payment.gateway,
        transactionId,
        payment.amount,
        payment.currency,
        undefined,
        'callback',
      );
      const refreshed = await this.reloadOrder(order.id);
      return {
        status: result === 'confirmed' ? 'confirmed' : 'already_confirmed',
        orderId: order.id,
        orderStatus: refreshed.status,
      };
    }

    // Real gateway: verify SERVER-TO-SERVER with the persisted amount.
    let verification: GatewayVerifyResult;
    try {
      verification = await this.gateway.verifyPayment({
        amount: payment.amount,
        authority: transactionId,
      });
    } catch (error) {
      if (error instanceof GatewayUnavailableError) {
        // Indeterminate — the payment stays pending; the client may retry.
        businessEvent.warn(
          'payment.verify.unavailable',
          'Provider verify call failed — payment remains pending',
          {
            transactionId,
            paymentId: payment.id,
            orderId: order.id,
            gateway: payment.gateway,
            detail: error.detail ?? error.name,
          },
        );
        return {
          status: 'pending',
          orderId: order.id,
          orderStatus: order.status,
        };
      }
      throw error;
    }

    if (verification.outcome === 'unknown') {
      // The provider answered, but not in a way we can attribute to success or
      // rejection. Resolving this either way is unsafe: confirming would grant
      // access without proof of payment, and failing would close an order the
      // buyer may well have been charged for. Stay pending and let
      // reconciliation settle it against the provider's own records.
      businessEvent.warn(
        'payment.verify.indeterminate',
        'Provider verification was uninterpretable — payment remains pending for reconciliation',
        {
          transactionId,
          paymentId: payment.id,
          orderId: order.id,
          gateway: payment.gateway,
        },
      );
      return {
        status: 'pending',
        orderId: order.id,
        orderStatus: order.status,
      };
    }

    if (verification.outcome === 'failed') {
      businessEvent.warn(
        'payment.verify.rejected',
        'Provider definitively rejected the payment',
        {
          transactionId,
          paymentId: payment.id,
          orderId: order.id,
          gateway: payment.gateway,
          providerCode: verification.code,
        },
      );
      await this.markFailed(
        payment.id,
        `Gateway verification rejected the payment (code ${verification.code})`,
      );
      const refreshed = await this.reloadOrder(order.id);
      return {
        status: 'failed',
        orderId: order.id,
        orderStatus: refreshed.status,
      };
    }

    const result = await this.confirmSuccessful(
      payment.gateway,
      transactionId,
      payment.amount,
      payment.currency,
      verification.refId,
      'callback',
    );
    const refreshed = await this.reloadOrder(order.id);
    return {
      status: result === 'confirmed' ? 'confirmed' : 'already_confirmed',
      orderId: order.id,
      orderStatus: refreshed.status,
    };
  }

  /**
   * Confirms a successful payment exactly once. Locked, transactional and
   * safe against duplicate or racing webhook/callback deliveries.
   */
  async confirmSuccessful(
    gateway: string,
    transactionId: string,
    amount: string,
    currency: string,
    providerRef?: string | null,
    source: 'webhook' | 'callback' | 'sandbox' = 'webhook',
  ): Promise<'confirmed' | 'duplicate' | 'unknown'> {
    // Notification inputs are captured inside the transaction but delivered
    // only after it commits: no false-positive notifications on rollback,
    // and a notification failure can never roll back a confirmed payment
    // (PLAYBOOK Phase 8).
    const outcome: {
      buyerId?: string;
      agentId?: string | null;
      paymentId?: string;
      orderId?: string;
      orderItemId?: string;
      paidAt?: Date;
      /** A4 §24 — set only for the order that marked the first sale. */
      firstSale?: 'creator' | 'product' | null;
      /** C5 — the order's own total/currency, captured in the transaction. */
      orderTotalMajor?: string;
      currency?: string;
    } = {};
    const result = await this.dataSource.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(Payment);
      const orderRepository = manager.getRepository(Order);

      const payment = await paymentRepository
        .createQueryBuilder('payment')
        .setLock('pessimistic_write')
        .where('payment.gateway = :gateway', { gateway })
        .andWhere('payment.gateway_transaction_id = :transactionId', {
          transactionId,
        })
        .getOne();

      if (!payment) {
        // A webhook for a transaction we never issued.
        businessEvent.warn(
          'payment.webhook.transaction_unknown',
          'Confirmation references a transaction we never issued',
          { gateway, transactionId, source },
        );
        return 'unknown';
      }

      if (payment.status === PaymentStatus.SUCCESSFUL) {
        return 'duplicate';
      }
      if (payment.status === PaymentStatus.REFUNDED) {
        throw new ApiException(
          'INVALID_REFUND',
          'Payment has already been refunded',
          HttpStatus.CONFLICT,
        );
      }
      if (payment.amount !== amount) {
        // Security-relevant (§7): amount must match the persisted value.
        businessEvent.warn(
          'payment.amount_mismatch',
          'Confirmation amount does not match the persisted transaction',
          {
            gateway,
            transactionId,
            paymentId: payment.id,
            source,
            persistedAmount: payment.amount,
            presentedAmount: amount,
          },
        );
        throw new ApiException(
          'PAYMENT_FAILED',
          'Payment amount or currency does not match the order',
          HttpStatus.CONFLICT,
        );
      }
      if (payment.currency !== currency) {
        businessEvent.warn(
          'payment.currency_mismatch',
          'Confirmation currency does not match the persisted transaction',
          {
            gateway,
            transactionId,
            paymentId: payment.id,
            source,
            persistedCurrency: payment.currency,
            presentedCurrency: currency,
          },
        );
        throw new ApiException(
          'PAYMENT_FAILED',
          'Payment amount or currency does not match the order',
          HttpStatus.CONFLICT,
        );
      }

      const order = await orderRepository
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id: payment.orderId })
        .getOne();
      if (
        !order ||
        ![
          OrderStatus.PENDING_PAYMENT,
          OrderStatus.CREATED,
          OrderStatus.PAID,
        ].includes(order.status)
      ) {
        businessEvent.warn(
          'payment.order_not_payable',
          'Confirmation targets an order that is not payable',
          {
            gateway,
            transactionId,
            paymentId: payment.id,
            orderId: payment.orderId,
            orderStatus: order?.status ?? null,
            source,
          },
        );
        throw new ApiException(
          'PAYMENT_FAILED',
          'Order is not payable',
          HttpStatus.CONFLICT,
        );
      }

      // The finance clock is the single source of "now" for money rules
      // (holding end, refund window); it is the system clock in production.
      const now = this.clock.now();
      payment.status = PaymentStatus.SUCCESSFUL;
      payment.confirmedAt = now;
      if (providerRef) {
        payment.providerPayload = {
          ...payment.providerPayload,
          providerRef,
        };
      }
      await paymentRepository.save(payment);

      order.status = OrderStatus.FULFILLED;
      order.paidAt = now;
      order.fulfilledAt = now;
      await orderRepository.save(order);

      const itemRows = await manager.query<
        Array<{
          id: string;
          agent_id: string;
          agent_version_id: string | null;
          commercial_terms_snapshot: CommercialProfile | null;
        }>
      >(
        `SELECT id, agent_id, agent_version_id, commercial_terms_snapshot
         FROM order_items
         WHERE order_id = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [order.id],
      );

      if (itemRows[0]) {
        await this.entitlementAuthority.grantFromOrder(manager, {
          userId: order.buyerId,
          agentId: itemRows[0].agent_id,
          agentVersionId: itemRows[0].agent_version_id,
          orderId: order.id,
          commercialTermsSnapshot:
            itemRows[0].commercial_terms_snapshot ?? null,
          sourceId: order.id,
          actorUserId: null,
        });
        outcome.firstSale = await this.markFirstSale(
          manager,
          itemRows[0].agent_id,
          now,
        );
        outcome.orderItemId = itemRows[0].id;
      }
      outcome.paidAt = now;

      // Phase 2 — the financial effect (ledger sale, commission split,
      // holding entitlement, internal receipt) commits or rolls back WITH the
      // payment confirmation: a confirmed payment cannot exist without it.
      await this.sales.recordSale(manager, {
        paymentId: payment.id,
        occurredAt: now,
        source,
      });

      await this.audit.record({
        action: AUDIT_ACTIONS.PAYMENT_STATUS_CHANGED,
        entity: AUDIT_ENTITIES.PAYMENT,
        entityId: payment.id,
        metadata: {
          gateway,
          transactionId,
          from: 'pending',
          to: 'successful',
          source,
        },
        context: { actorId: order.buyerId },
      });

      outcome.buyerId = order.buyerId;
      outcome.orderTotalMajor = order.amount;
      outcome.currency = order.currency;
      outcome.agentId = itemRows[0]?.agent_id ?? null;
      outcome.paymentId = payment.id;
      outcome.orderId = order.id;
      return 'confirmed';
    });

    if (result === 'confirmed') {
      businessEvent.info(
        'payment.succeeded',
        'Payment confirmed — order fulfilled',
        {
          paymentId: outcome.paymentId,
          orderId: outcome.orderId,
          gateway,
          transactionId,
          amount,
          currency,
          source,
          providerRef: providerRef ?? null,
        },
      );
      if (outcome.agentId && outcome.orderItemId) {
        // A4 §15 — real purchase event (de-duplicated per order line).
        // A5 §9 — inherits the promotion its (server-validated) checkout
        // was attributed to; the client never asserts a purchase source.
        await this.analytics.recordSafe({
          agentId: outcome.agentId,
          type: ANALYTICS_EVENTS.PURCHASE_COMPLETED,
          dedupKey: `purchase:${outcome.orderItemId}`,
          userId: outcome.buyerId ?? null,
          metadata: { orderId: outcome.orderId, amount, currency },
          promotionId: await this.checkoutPromotion(outcome.orderId),
        });
      }
      if (outcome.agentId) {
        // A5 §27 — after commit (never able to break the payment); the
        // UNIQUE row makes each milestone exactly-once.
        const milestone = await this.markSalesMilestonesSafe(
          outcome.agentId,
          outcome.paidAt ?? new Date(),
        );
        if (milestone) {
          await this.notifications.notifyEventSafe(
            milestone.creatorUserId,
            NOTIFICATION_TYPES.SALES_MILESTONE,
            { count: String(milestone.count) },
            { link: '/creator/growth' },
          );
        }
      }
      if (outcome.buyerId) {
        await this.notifyPurchase(
          outcome.buyerId,
          outcome.agentId ?? null,
          outcome.orderId ?? '',
          amount,
          currency,
          { firstSale: outcome.firstSale ?? null, paidAt: outcome.paidAt },
        );
      }

      // ---- Phase C5 §1: the growth loop ---------------------------------
      // A confirmed payment is the ONLY moment at which a referral becomes
      // real money, so this is where attribution, the referral reward and the
      // affiliate commission are decided. Before C5 was wired here,
      // attributeOrder/createReward/createCommissionIfEligible had no caller
      // at all: every endpoint existed and no funnel ever ran.
      //
      // It runs AFTER the commit and is wrapped, so a growth-loop failure can
      // never roll back or fail a paid order (§6).
      if (outcome.buyerId && outcome.orderId && this.growthLoop) {
        try {
          // The reward engine works in minor units; `orders.amount` is a
          // 2-decimal major-unit numeric. The conversion is done against the
          // CURRENCY's own exponent (IRR has none) rather than assuming 100,
          // because paying out 100x the order for a zero-decimal currency
          // would be a real-money bug, not a rounding nit.
          const orderTotalMinor = toMinorUnits(
            outcome.orderTotalMajor ?? amount,
            outcome.currency ?? currency,
          );
          const loop = await this.growthLoop.onOrderPaid({
            buyerUserId: outcome.buyerId,
            orderId: outcome.orderId,
            orderTotalMinor,
          });
          if (loop.attributedTo) {
            businessEvent.info(
              'c5.growth_loop.attributed',
              'C5 attributed a paid order',
              {
                orderId: outcome.orderId,
                referrerId: loop.attributedTo,
                kind: loop.kind,
                referralReward: loop.referralReward,
                affiliateCommission: loop.affiliateCommission,
              },
            );
          }
          if (loop.errors.length > 0) {
            // Reported, never swallowed: a partially-failed loop must be
            // visible to an operator, or the money silently goes missing.
            businessEvent.warn(
              'c5.growth_loop.partial',
              'C5 growth loop reported errors',
              {
                orderId: outcome.orderId,
                errors: loop.errors,
              },
            );
          }
        } catch (error) {
          businessEvent.error(
            'c5.growth_loop.failed',
            'C5 growth loop threw after a paid order',
            {
              orderId: outcome.orderId,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }
    }
    return result;
  }

  /** Marks a payment failed (payment rejected / gateway timeout).
   * Returns the buyer's user id when the status actually transitioned, so
   * the caller can notify them without spamming on repeated webhook
   * deliveries; null when no transition happened. */
  async markFailed(
    paymentId: string,
    reason: string,
    extra?: { safeDetail?: string },
  ): Promise<string | null> {
    const transitioned: { buyerId?: string } = {};
    await this.dataSource.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(Payment);
      const payment = await paymentRepository
        .createQueryBuilder('payment')
        .setLock('pessimistic_write')
        .where('payment.id = :id', { id: paymentId })
        .getOne();
      if (!payment) return;
      if (
        payment.status === PaymentStatus.SUCCESSFUL ||
        payment.status === PaymentStatus.REFUNDED ||
        payment.status === PaymentStatus.FAILED
      ) {
        return;
      }
      const previousStatus = payment.status;
      payment.status = PaymentStatus.FAILED;
      payment.providerPayload = {
        ...payment.providerPayload,
        failureReason: reason,
        ...(extra?.safeDetail ? { failureDetail: extra.safeDetail } : {}),
      };
      await paymentRepository.save(payment);

      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOneBy({
        id: payment.orderId,
      });
      if (order) {
        transitioned.buyerId = order.buyerId;
        // A 1:1 checkout means a terminally-failed payment can never pay
        // this order — fail it in the same transaction so the buyer's
        // order history never shows a dead attempt as "awaiting payment".
        if (
          order.status === OrderStatus.PENDING_PAYMENT ||
          order.status === OrderStatus.CREATED
        ) {
          const previousOrderStatus = order.status;
          order.status = OrderStatus.FAILED;
          await orderRepository.save(order);
          await this.audit.record({
            action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
            entity: AUDIT_ENTITIES.ORDER,
            entityId: order.id,
            metadata: {
              from: previousOrderStatus,
              to: 'failed',
              reason: `payment failed: ${reason}`,
            },
            context: { actorId: null },
          });
        }
      }

      await this.audit.record({
        action: AUDIT_ACTIONS.PAYMENT_STATUS_CHANGED,
        entity: AUDIT_ENTITIES.PAYMENT,
        entityId: payment.id,
        metadata: { from: previousStatus, to: 'failed', reason },
        context: { actorId: null },
      });
    });
    if (transitioned.buyerId) {
      businessEvent.warn('payment.failed', 'Payment marked failed', {
        paymentId,
        reason,
      });
    }
    return transitioned.buyerId ?? null;
  }

  /**
   * Cancels a non-terminal payment (buyer cancelled at the gateway).
   * Idempotent; successful/refunded payments are immune. Returns true when
   * the status actually transitioned.
   */
  async markCancelled(paymentId: string, reason: string): Promise<boolean> {
    let transitioned = false;
    await this.dataSource.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(Payment);
      const payment = await paymentRepository
        .createQueryBuilder('payment')
        .setLock('pessimistic_write')
        .where('payment.id = :id', { id: paymentId })
        .getOne();
      if (!payment) return;
      if (
        payment.status !== PaymentStatus.INITIATED &&
        payment.status !== PaymentStatus.PENDING
      ) {
        return;
      }
      const previousStatus = payment.status;
      payment.status = PaymentStatus.CANCELLED;
      payment.providerPayload = {
        ...payment.providerPayload,
        cancellationReason: reason,
      };
      await paymentRepository.save(payment);

      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOneBy({ id: payment.orderId });
      if (
        order &&
        (order.status === OrderStatus.PENDING_PAYMENT ||
          order.status === OrderStatus.CREATED)
      ) {
        order.status = OrderStatus.CANCELLED;
        order.cancelledAt = new Date();
        await orderRepository.save(order);
      }

      await this.audit.record({
        action: AUDIT_ACTIONS.PAYMENT_STATUS_CHANGED,
        entity: AUDIT_ENTITIES.PAYMENT,
        entityId: payment.id,
        metadata: { from: previousStatus, to: 'cancelled', reason },
        context: { actorId: null },
      });
      transitioned = true;
    });
    if (transitioned) {
      businessEvent.info('payment.cancelled', 'Payment cancelled', {
        paymentId,
        reason,
      });
    }
    return transitioned;
  }

  private mapTerminal(status: PaymentStatus): 'failed' | 'cancelled' {
    return status === PaymentStatus.CANCELLED ? 'cancelled' : 'failed';
  }

  /**
   * A4 §24 — marks the product's first paid sale exactly once. The
   * conditional UPDATE is atomic (row lock + `first_sale_at IS NULL`), so
   * racing confirmations can never both win; it runs inside the payment
   * transaction, so a rolled-back payment never leaves a milestone behind.
   * Returns the notification variant, or null when this was not the first.
   */
  private async markFirstSale(
    manager: EntityManager,
    agentId: string,
    at: Date,
  ): Promise<'creator' | 'product' | null> {
    const updated = await manager.query<Array<{ creator_id: string }>>(
      `UPDATE agents SET first_sale_at = $2
        WHERE id = $1 AND first_sale_at IS NULL
        RETURNING creator_id`,
      [agentId, at],
    );
    const rows = this.returnedRows<{ creator_id: string }>(updated);
    if (!rows[0]) return null;
    const earlier = await manager.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM agents
          WHERE creator_id = $1 AND id <> $2 AND first_sale_at IS NOT NULL
       ) AS exists`,
      [rows[0].creator_id, agentId],
    );
    return earlier[0]?.exists ? 'product' : 'creator';
  }

  /**
   * A5 §27 — records the creator-wide sales milestones this sale reached.
   * Every milestone ≤ the creator's paid-sale count that is not stored yet
   * is inserted (ON CONFLICT DO NOTHING on UNIQUE (creator_id, key)), so a
   * replayed webhook never repeats one, and a milestone missed by two
   * racing confirmations is caught up by the next sale instead of lost.
   * The first sale is celebrated by the A4 FIRST_SALE notification, so
   * only 10/25/50/100 are returned for notification (the highest one).
   */
  private async markSalesMilestonesSafe(
    agentId: string,
    at: Date,
  ): Promise<{ creatorUserId: string; count: number } | null> {
    try {
      return await this.markSalesMilestones(agentId, at);
    } catch (error) {
      this.logger.error(
        `Failed to record sales milestones for agent ${agentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  private async markSalesMilestones(
    agentId: string,
    at: Date,
  ): Promise<{ creatorUserId: string; count: number } | null> {
    const manager = this.dataSource.manager;
    const rows = await manager.query<
      Array<{ creator_id: string; user_id: string; sales: number }>
    >(
      `SELECT a.creator_id, cp.user_id,
              (SELECT COUNT(*)::int
                 FROM order_items oi
                 JOIN orders o ON o.id = oi.order_id
                 JOIN agents a2 ON a2.id = oi.agent_id
                WHERE a2.creator_id = a.creator_id
                  AND o.status IN ('paid', 'fulfilled')
                  AND oi.is_free = false) AS sales
         FROM agents a
         JOIN creator_profiles cp ON cp.id = a.creator_id
        WHERE a.id = $1`,
      [agentId],
    );
    const creator = rows[0];
    if (!creator) return null;
    const reached = SALES_MILESTONES.filter((n) => n <= Number(creator.sales));
    if (!reached.length) return null;
    const inserted = await manager.query<Array<{ key: string }>>(
      `INSERT INTO creator_milestones (creator_id, key, achieved_at, metadata)
       SELECT $1, k, $3, jsonb_build_object('agentId', $4::text)
         FROM unnest($2::text[]) AS k
       ON CONFLICT (creator_id, key) DO NOTHING
       RETURNING key`,
      [creator.creator_id, reached.map(milestoneKey), at, agentId],
    );
    const counts = this.returnedRows<{ key: string }>(inserted)
      .map((row) => Number(row.key.replace('sales_', '')))
      .filter((n) => n >= 10);
    if (!counts.length) return null;
    return { creatorUserId: creator.user_id, count: Math.max(...counts) };
  }

  /** A5 §9 — the promotion the order's checkout event was attributed to. */
  private async checkoutPromotion(orderId?: string): Promise<string | null> {
    if (!orderId) return null;
    try {
      const rows = await this.dataSource.query<
        Array<{ promotion_id: string | null }>
      >(
        `SELECT promotion_id FROM agent_analytics_events
          WHERE dedup_key = $1`,
        [`checkout:${orderId}`],
      );
      return rows[0]?.promotion_id ?? null;
    } catch {
      return null;
    }
  }

  /** pg returns [rows, affected] for UPDATE … RETURNING through TypeORM. */
  private returnedRows<T>(result: unknown): T[] {
    if (!Array.isArray(result)) return [];
    if (result.length === 2 && Array.isArray(result[0]))
      return result[0] as T[];
    return result as T[];
  }

  private async reloadOrder(orderId: string): Promise<Order> {
    const order = await this.dataSource
      .getRepository(Order)
      .findOneBy({ id: orderId });
    if (!order) {
      throw new ApiException(
        'INTERNAL_ERROR',
        'Order disappeared during payment finalization',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return order;
  }

  /**
   * Development/test-only failure injection (§36 — automated simulation,
   * never manual URL editing): reports the given sandbox payment as
   * failed THROUGH THE REAL WEBHOOK PATH. The event is signed with the
   * server's webhook secret and processed by the same handler that
   * verifies signatures and applies effects — no bypass, no shortcut.
   *
   * Refused outright in production and for non-sandbox payments.
   */
  async sandboxFailPayment(
    userId: string,
    transactionId: string,
  ): Promise<{ status: string }> {
    if (this.nodeEnv === 'production') {
      throw new ApiException(
        'FORBIDDEN',
        'The sandbox gateway is disabled in production',
        HttpStatus.FORBIDDEN,
      );
    }
    const payment = await this.paymentsRepository.findOne({
      where: { gatewayTransactionId: transactionId },
      order: { createdAt: 'DESC' },
    });
    if (!payment || payment.gateway !== SANDBOX_GATEWAY) {
      return { status: 'unknown' };
    }
    const order = await this.dataSource
      .getRepository(Order)
      .findOneBy({ id: payment.orderId });
    if (!order || order.buyerId !== userId) {
      // Dev-only endpoint, same ownership rule as every buyer surface.
      throw new ApiException(
        'FORBIDDEN',
        'This payment does not belong to you',
        HttpStatus.FORBIDDEN,
      );
    }
    if (
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.INITIATED
    ) {
      // Terminal payments cannot be failed — same rule as production.
      return { status: 'invalid_state' };
    }

    const signature = this.signatureService.sign({
      gateway: SANDBOX_GATEWAY,
      event: 'payment.failed',
      transactionId,
      amount: payment.amount,
      currency: payment.currency,
    });
    return this.handleWebhookEvent({
      gateway: SANDBOX_GATEWAY,
      event: 'payment.failed',
      transactionId,
      amount: payment.amount,
      currency: payment.currency,
      signature,
    });
  }

  /**
   * Post-commit notifications for a confirmed purchase (PLAYBOOK Phase 8).
   * Best-effort: failures are logged by NotificationsService and never
   * affect the already-committed payment.
   */
  private async notifyPurchase(
    buyerId: string,
    agentId: string | null,
    orderId: string,
    amount: string,
    currency: string,
    sale: {
      firstSale: 'creator' | 'product' | null;
      paidAt?: Date;
    } = { firstSale: null },
  ): Promise<void> {
    // Resolve the purchased agent's name/slug (and its creator) once, up
    // front — the buyer's purchase-confirmation email carries the real
    // agent name and a deep link to the agent page.
    let agentName = '—';
    let agentSlug: string | null = null;
    let creatorUserId: string | null = null;
    let creatorProfileId: string | null = null;
    if (agentId) {
      try {
        const rows = await this.dataSource.query<
          Array<{
            user_id: string | null;
            creator_profile_id: string | null;
            name: string | null;
            slug: string | null;
          }>
        >(
          `SELECT cp.user_id, a.creator_id AS creator_profile_id, a.name, a.slug
           FROM agents a
           LEFT JOIN creator_profiles cp ON cp.id = a.creator_id
           WHERE a.id = $1
           LIMIT 1`,
          [agentId],
        );
        creatorUserId = rows[0]?.user_id ?? null;
        creatorProfileId = rows[0]?.creator_profile_id ?? null;
        agentName = rows[0]?.name ?? '—';
        agentSlug = rows[0]?.slug ?? null;
      } catch (error) {
        this.logger.error(
          'Failed to resolve agent/creator for purchase notifications',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // Sprint 2 — the purchase opens the buyer's workspace for this product:
    // create its journey (idempotent) and deep-link the notification to it.
    let link = '/buyer/products';
    let entitlementId: string | null = null;
    if (agentId) {
      try {
        const ent = await this.dataSource.query<Array<{ id: string }>>(
          `SELECT id FROM entitlements
            WHERE user_id = $1 AND agent_id = $2 AND status = 'granted'
            LIMIT 1`,
          [buyerId, agentId],
        );
        if (ent[0]) {
          entitlementId = ent[0].id;
          await ensureJourney(this.dataSource, ent[0].id);
          link = `/buyer/products/${ent[0].id}`;
        }
      } catch (error) {
        this.logger.error(
          'Failed to open the buyer journey after purchase',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // Phase C4 §26 chain #1 — a real sale advances the referral funnel for
    // whoever the buyer arrived through. Placed beside the C1 sale hook
    // because it is the same fact: the payment is already confirmed, and
    // advancing on any earlier signal would credit a referral for a sale
    // that was then refunded. Best-effort, like everything else here — a
    // purchase must never fail because a side-effect did.
    if (agentId && orderId && this.c4Lifecycle) {
      try {
        await this.c4Lifecycle.onSaleCompleted(agentId, orderId);
      } catch (error) {
        this.logger.error(
          'C4 referral sale hook failed',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // Phase C1 — the REAL revenue milestone the CRM funnel counts. Keyed on
    // the order, so a replayed webhook or a double confirmation can never
    // produce a second "first sale". Best-effort: never breaks a purchase.
    if (creatorProfileId && agentId) {
      try {
        await this.crm.onSale(
          creatorProfileId,
          {
            orderId,
            agentId,
            amount: Number.parseFloat(amount) || 0,
            currency,
          },
          { isFirst: sale.firstSale === 'creator' },
        );
      } catch (error) {
        this.logger.error(
          'Failed to record CRM sale event',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    await this.notifications.notifyEventSafe(
      buyerId,
      NOTIFICATION_TYPES.PURCHASE_SUCCESS,
      { agentName },
      {
        link,
        relatedType: entitlementId ? 'entitlement' : 'order',
        relatedId: entitlementId ?? orderId,
        dedupKey: `purchase_success:${orderId}`,
      },
    );
    // Buyer purchase-confirmation email (Batch 10 — Phase 19).
    await this.emails.enqueue({
      template: 'purchase_confirmation',
      data: {
        agentName,
        agentSlug: agentSlug ?? undefined,
        orderId,
        amount,
        currency,
      },
      userId: buyerId,
      relatedEntityType: 'order',
      relatedEntityId: orderId,
    });
    if (!agentId) return;
    try {
      if (creatorUserId) {
        const saleLink = orderId ? `/creator/sales/${orderId}` : undefined;
        if (sale.firstSale) {
          // A4 §24 — the first-sale milestone replaces the routine
          // new-sale notification for that one order (never both).
          await this.notifications.notifyEventSafe(
            creatorUserId,
            NOTIFICATION_TYPES.FIRST_SALE,
            {
              agentName,
              amount,
              currency,
              saleDate: (sale.paidAt ?? new Date()).toISOString(),
            },
            { variant: sale.firstSale, link: saleLink },
          );
        } else {
          await this.notifications.notifyEventSafe(
            creatorUserId,
            NOTIFICATION_TYPES.NEW_SALE,
            { agentName },
            { link: saleLink },
          );
        }
        // Gap closure — the creator's FIRST-EVER sale gets a dedicated email
        // instead of the routine new-sale one (never both). A first sale of
        // another product ('product' variant) stays a regular new-sale mail.
        // Dedup: (template, user, order) in the email outbox.
        const saleEmail = {
          agentName,
          agentSlug: agentSlug ?? undefined,
          agentId,
          orderId,
          amount,
          currency,
        };
        if (sale.firstSale === 'creator') {
          await this.emails.enqueue({
            template: 'creator_first_sale',
            data: saleEmail,
            userId: creatorUserId,
            relatedEntityType: 'order',
            relatedEntityId: orderId,
          });
        } else {
          await this.emails.enqueue({
            template: 'new_sale',
            data: saleEmail,
            userId: creatorUserId,
            relatedEntityType: 'order',
            relatedEntityId: orderId,
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to resolve new-sale recipient for agent ${agentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
