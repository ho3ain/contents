import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Refund,
  RefundStatus,
} from '../../database/entities/commerce/refund.entity';
import {
  Order,
  OrderStatus,
} from '../../database/entities/commerce/order.entity';
import {
  Payment,
  PaymentStatus,
} from '../../database/entities/commerce/payment.entity';
import { UserRole } from '../../database/entities/identity/user.entity';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { BuyerEventsService } from '../discovery/buyer-events.service';
import { formatMinorToMajor, parseMajorToMinor } from '../finance/domain/money';
import { FinanceClock } from '../finance/finance-clock';
import { PolicyService } from '../finance/policy.service';
import { RefundSettlementService } from '../finance/refund-settlement.service';
import { refundEligibility } from './refund-policy';
import { EntitlementsService } from './entitlements.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';

/**
 * Refunds are manually reviewed by admins (PLAYBOOK 6.10). Approving a
 * refund reverses the payment, marks the order refunded and revokes the
 * entitlement in one transaction; buyer and creator notifications are
 * delivered after that transaction commits (PLAYBOOK Phase 8).
 */
@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund)
    private readonly refundsRepository: Repository<Refund>,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailService,
    private readonly events: BuyerEventsService,
    private readonly policies: PolicyService,
    private readonly settlements: RefundSettlementService,
    private readonly clock: FinanceClock,
    private readonly entitlementAuthority: EntitlementsService,
  ) {}

  /**
   * A buyer asks for a refund. Eligibility is decided HERE (refund-policy.ts)
   * — never by the client. The order row is locked for the duration of the
   * check + insert, so two simultaneous taps can never open two requests.
   */
  async request(
    buyerId: string,
    orderId: string,
    reason: string,
  ): Promise<Refund> {
    const refund = await this.dataSource.transaction(async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.id = :orderId AND o.buyer_id = :buyerId', {
          orderId,
          buyerId,
        })
        .getOne();
      if (!order) {
        throw new ApiException(
          'NOT_FOUND',
          'Order not found',
          HttpStatus.NOT_FOUND,
        );
      }
      const existing = await manager
        .getRepository(Refund)
        .find({ where: { orderId } });
      const verdict = refundEligibility({
        order: { status: order.status, paidAt: order.paidAt },
        refunds: existing.map((r) => ({ status: r.status })),
        now: this.clock.now(),
        // The window is the versioned REFUND policy in force right now.
        windowDays: (
          await this.policies.current('REFUND', {
            manager,
            currency: order.currency,
          })
        ).params.windowDays,
      });
      if (!verdict.eligible) {
        throw new ApiException(
          verdict.reason === 'pending' ? 'CONFLICT' : 'INVALID_REFUND',
          verdict.reason === 'pending'
            ? 'A refund request is already pending'
            : verdict.reason === 'window_expired'
              ? 'The refund window for this order has ended'
              : 'Only paid orders can be refunded',
          HttpStatus.CONFLICT,
          { reason: verdict.reason },
        );
      }
      // After an earlier PARTIAL refund only the remainder can be asked for.
      const settled = await manager.query<Array<{ n: string }>>(
        `SELECT COALESCE(SUM(amount_minor), 0)::text AS n
           FROM refund_settlements WHERE order_id = $1`,
        [order.id],
      );
      const alreadyRefunded = BigInt(settled[0]?.n ?? '0');
      const remainingMinor =
        parseMajorToMinor(order.amount, order.currency) - alreadyRefunded;
      return manager.getRepository(Refund).save(
        manager.getRepository(Refund).create({
          orderId: order.id,
          amount:
            alreadyRefunded > 0n
              ? formatMinorToMajor(remainingMinor, order.currency)
              : order.amount,
          currency: order.currency,
          reason,
          requestedBy: buyerId,
          status: RefundStatus.REQUESTED,
        }),
      );
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.REFUND_REQUESTED,
      entity: AUDIT_ENTITIES.REFUND,
      entityId: refund.id,
      metadata: { orderId: refund.orderId, amount: refund.amount },
      context: { actorId: buyerId },
    });
    await this.events.recordSafe({
      type: 'refund_requested',
      userId: buyerId,
      dedupKey: `refund_requested:${refund.id}`,
      metadata: { orderId: refund.orderId, refundId: refund.id },
    });
    await this.notifications.notifyRoleEventSafe(
      UserRole.ADMIN,
      NOTIFICATION_TYPES.REFUND_REQUESTED,
      { orderId: refund.orderId.slice(0, 8) },
    );
    return refund;
  }

  /**
   * Admin opens a request: the buyer now sees «under review». Idempotent —
   * opening an already-open request changes nothing.
   */
  async startReview(adminId: string, refundId: string): Promise<Refund> {
    const refund = await this.refundsRepository.findOneBy({ id: refundId });
    if (!refund) {
      throw new ApiException(
        'NOT_FOUND',
        'Refund not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (refund.status === RefundStatus.UNDER_REVIEW) return refund;
    if (refund.status !== RefundStatus.REQUESTED) {
      throw new ApiException(
        'INVALID_REFUND',
        'Refund was already decided',
        HttpStatus.CONFLICT,
      );
    }
    const claimed = await this.refundsRepository
      .createQueryBuilder()
      .update(Refund)
      .set({
        status: RefundStatus.UNDER_REVIEW,
        reviewedBy: adminId,
        reviewStartedAt: () => 'now()',
      })
      .where('id = :id AND status = :status', {
        id: refundId,
        status: RefundStatus.REQUESTED,
      })
      .execute();
    const fresh = await this.refundsRepository.findOneByOrFail({
      id: refundId,
    });
    if (claimed.affected) {
      await this.audit.record({
        action: AUDIT_ACTIONS.REFUND_REVIEW_STARTED,
        entity: AUDIT_ENTITIES.REFUND,
        entityId: refundId,
        metadata: { orderId: fresh.orderId },
        context: { actorId: adminId },
      });
      const order = await this.ordersRepository.findOneBy({
        id: fresh.orderId,
      });
      if (order) {
        await this.notifications.notifyEventSafe(
          order.buyerId,
          NOTIFICATION_TYPES.REFUND_PROCESSED,
          { orderId: order.id.slice(0, 8) },
          {
            variant: 'under_review',
            relatedType: 'order',
            relatedId: order.id,
            dedupKey: `refund_review:${refundId}`,
          },
        );
      }
    }
    return fresh;
  }

  async decide(
    adminId: string,
    refundId: string,
    decision: 'approve' | 'reject',
    note: string,
    approvedAmount?: string,
  ): Promise<Refund> {
    // Notification inputs are captured inside the transaction but delivered
    // only after it commits (PLAYBOOK Phase 8): a notification failure must
    // never roll back a decided refund, and a rollback must never leave a
    // false-positive notification behind.
    const outcome: {
      buyerId?: string;
      orderId?: string;
      amount?: string;
    } = {};
    const refund = await this.dataSource.transaction(async (manager) => {
      const refundRepository = manager.getRepository(Refund);
      const orderRepository = manager.getRepository(Order);
      const paymentRepository = manager.getRepository(Payment);

      const refund = await refundRepository
        .createQueryBuilder('refund')
        .setLock('pessimistic_write')
        .where('refund.id = :id', { id: refundId })
        .getOne();
      if (!refund) {
        throw new ApiException(
          'NOT_FOUND',
          'Refund not found',
          HttpStatus.NOT_FOUND,
        );
      }
      if (
        refund.status !== RefundStatus.REQUESTED &&
        refund.status !== RefundStatus.UNDER_REVIEW
      ) {
        throw new ApiException(
          'INVALID_REFUND',
          'Refund was already decided',
          HttpStatus.CONFLICT,
        );
      }

      refund.reviewedBy = adminId;
      refund.reviewNote = note || null;

      const order = await orderRepository.findOneBy({ id: refund.orderId });
      if (!order) {
        throw new ApiException(
          'NOT_FOUND',
          'Order not found',
          HttpStatus.NOT_FOUND,
        );
      }

      if (decision === 'reject') {
        refund.status = RefundStatus.REJECTED;
        await refundRepository.save(refund);
      } else {
        const successfulPayment = refund.paymentId
          ? await paymentRepository.findOneBy({ id: refund.paymentId })
          : await paymentRepository.findOneBy({
              orderId: order.id,
              status: PaymentStatus.SUCCESSFUL,
            });
        const requestedMinor = parseMajorToMinor(
          refund.amount,
          refund.currency,
        );
        const amountMinor = approvedAmount
          ? parseMajorToMinor(approvedAmount, refund.currency)
          : requestedMinor;
        if (amountMinor <= 0n || amountMinor > requestedMinor) {
          throw new ApiException(
            'INVALID_REFUND',
            'The approved amount must be positive and not exceed the requested amount',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }

        // Phase 2 — the financial effect, in THIS transaction: ledger REFUND
        // (held / available / recovery), entitlement progress, receipt and
        // audit. Exactly once per refund.
        const settlement = await this.settlements.settle(manager, {
          refundId: refund.id,
          orderId: order.id,
          paymentId: successfulPayment?.id ?? refund.paymentId ?? null,
          currency: refund.currency,
          amountMinor,
          actor: { type: 'admin', id: adminId, role: 'admin' },
        });

        if (successfulPayment) refund.paymentId = successfulPayment.id;
        refund.status = RefundStatus.PROCESSED;
        refund.processedAt = this.clock.now();

        if (!settlement.fullyRefunded) {
          // Partial refund: the buyer keeps the product, the order stays paid.
          refund.amount = formatMinorToMajor(amountMinor, refund.currency);
          await refundRepository.save(refund);
        } else {
          if (amountMinor !== requestedMinor) {
            refund.amount = formatMinorToMajor(amountMinor, refund.currency);
          }
          await refundRepository.save(refund);
          if (successfulPayment) {
            successfulPayment.status = PaymentStatus.REFUNDED;
            await paymentRepository.save(successfulPayment);
          }

          order.status = OrderStatus.REFUNDED;
          order.refundedAt = this.clock.now();
          await orderRepository.save(order);

          const entitlement = await this.entitlementAuthority.revokeForRefund(
            manager,
            { orderId: order.id, actorUserId: adminId },
          );
          if (entitlement) {
            await this.audit.record({
              action: AUDIT_ACTIONS.ENTITLEMENT_REVOKED,
              entity: AUDIT_ENTITIES.ENTITLEMENT,
              entityId: entitlement.id,
              metadata: { orderId: order.id, reason: 'refund' },
              context: { actorId: adminId },
            });
          }
        }
      }

      await this.audit.record({
        action: AUDIT_ACTIONS.REFUND_DECIDED,
        entity: AUDIT_ENTITIES.REFUND,
        entityId: refund.id,
        metadata: { decision, note: note || null },
        context: { actorId: adminId },
      });

      outcome.buyerId = order.buyerId;
      outcome.orderId = order.id;
      outcome.amount = refund.amount;
      return refund;
    });

    // Post-commit notifications (best-effort, never throw).
    const buyerId = outcome.buyerId;
    const orderId = outcome.orderId;
    const amount = outcome.amount;
    if (buyerId && orderId) {
      // Transactional email mirrors the in-app notification (Batch 10).
      await this.emails.enqueue({
        template: 'refund_processed',
        data: { orderId, approved: decision !== 'reject' },
        userId: buyerId,
        relatedEntityType: 'order',
        relatedEntityId: orderId,
      });
      if (decision === 'reject') {
        await this.notifications.notifyEventSafe(
          buyerId,
          NOTIFICATION_TYPES.REFUND_PROCESSED,
          { note: note || 'درخواست بازپرداخت شما تأیید نشد.' },
          { variant: 'rejected' },
        );
      } else if (orderId && amount) {
        await this.notifications.notifyEventSafe(
          buyerId,
          NOTIFICATION_TYPES.REFUND_PROCESSED,
          { amount: `${amount} IRR`, orderId: orderId.slice(0, 8) },
          { variant: 'granted' },
        );
        await this.notifyCreatorOfRefund(orderId, amount);
      }
    }
    return refund;
  }

  private async notifyCreatorOfRefund(
    orderId: string,
    amount: string,
  ): Promise<void> {
    try {
      const rows = await this.dataSource.query<Array<{ user_id: string }>>(
        `SELECT cp.user_id
       FROM order_items oi
       JOIN creator_profiles cp ON cp.id = oi.creator_id_snapshot
       WHERE oi.order_id = $1
       LIMIT 1`,
        [orderId],
      );
      const creatorUserId = rows[0]?.user_id;
      if (!creatorUserId) return;
      await this.notifications.notifyEventSafe(
        creatorUserId,
        NOTIFICATION_TYPES.REFUND_PROCESSED,
        { amount: `${amount} IRR` },
        { variant: 'creator' },
      );
    } catch {
      // Best-effort: a refund decision must never fail because the
      // creator lookup did.
    }
  }

  async listByOrder(orderId: string): Promise<Refund[]> {
    return this.refundsRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Refund | null> {
    return this.refundsRepository.findOneBy({ id });
  }

  async list(status?: RefundStatus, page = 1, pageSize = 20) {
    const [refunds, total] = await this.refundsRepository.findAndCount({
      where: status ? { status } : {},
      relations: { order: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { refunds, total };
  }

  async paymentsOfOrder(orderId: string): Promise<Payment[]> {
    return this.dataSource.getRepository(Payment).findBy({ orderId });
  }

  async attachPayment(refundId: string, paymentId: string): Promise<void> {
    await this.refundsRepository.update(refundId, { paymentId });
  }
}
