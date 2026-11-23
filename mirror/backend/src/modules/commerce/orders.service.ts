import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Order,
  OrderStatus,
} from '../../database/entities/commerce/order.entity';
import { OrderItem } from '../../database/entities/commerce/order-item.entity';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import { AgentVersion } from '../../database/entities/agents/agent-version.entity';
import {
  Entitlement,
  EntitlementStatus,
} from '../../database/entities/commerce/entitlement.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { AgentVersionStatus } from '../../database/entities/agents/agent-version.entity';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { businessEvent } from '../../common/logging/app-logger';
import { PolicyService } from '../finance/policy.service';
import { FinanceClock } from '../finance/finance-clock';
import { formatMinorToMajor } from '../finance/domain/money';
import {
  refundEligibility,
  type RefundEligibility,
  type RefundStatusValue,
} from './refund-policy';
import {
  buildOrderTimeline,
  orderStatusesOfGroup,
  sumAmounts,
  toOrderRefundView,
  type OrderEntitlementView,
  type OrderPaymentView,
  type OrderReceiptView,
  type OrderRefundView,
  type OrderStatusGroup,
  type OrderTimelineEntry,
} from './order-detail';
import { In } from 'typeorm';
import type { CommercialProfile } from '../../database/entities/agents/product-model';

export const CURRENCY_CODE = 'IRR';

/**
 * The purchase snapshot intentionally prefers an immutable published version
 * snapshot when one exists. Older first-release versions had no JSON snapshot,
 * so their already-approved live profile is the safe compatibility fallback.
 */
export function immutableCommercialTermsSnapshot(
  agent: Agent,
  version: AgentVersion | null,
): CommercialProfile | null {
  const source =
    version?.snapshot?.commercialProfile ?? agent.commercialProfile;
  return source
    ? (JSON.parse(JSON.stringify(source)) as CommercialProfile)
    : null;
}

export interface OrderItemView {
  id: string;
  agentId: string;
  agentNameSnapshot: string;
  agentSlugSnapshot: string;
  agentVersionSnapshot: string;
  /** Listing picture at purchase time; null for orders that predate the snapshot. */
  agentLogoUrlSnapshot: string | null;
  creatorIdSnapshot: string | null;
  unitPrice: string;
  currencyCode: string;
  quantity: number;
  total: string;
  isFree: boolean;
  /** Frozen purchase-time commercial commitment; null on legacy orders. */
  commercialTermsSnapshot: CommercialProfile | null;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  amount: string;
  currencyCode: string;
  paidAt: Date | null;
  fulfilledAt: Date | null;
  createdAt: Date;
  items: OrderItemView[];
}

/**
 * `GET /me/orders/:id` — the order plus everything the buyer needs to
 * understand it, each from its own table and never merged into one status.
 */
export interface OrderDetailView extends OrderView {
  cancelledAt: Date | null;
  refundedAt: Date | null;
  summary: {
    subtotal: string;
    total: string;
    /** Sum of refunds that were actually processed (0.00 when none). */
    refundedAmount: string;
    currencyCode: string;
  };
  /** Latest payment attempt for the order, null when checkout never reached the gateway. */
  payment: OrderPaymentView | null;
  entitlements: OrderEntitlementView[];
  refunds: OrderRefundView[];
  refundEligibility: RefundEligibility;
  receipts: OrderReceiptView[];
  timeline: OrderTimelineEntry[];
}

/**
 * Owns orders and order items. Order items carry an immutable snapshot of
 * the listing at purchase time (name/slug/version/creator/price/currency)
 * so history stays accurate no matter how the agent changes later.
 */
@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(Agent)
    private readonly agentsRepository: Repository<Agent>,
    @InjectRepository(AgentVersion)
    private readonly versionsRepository: Repository<AgentVersion>,
    @InjectRepository(Entitlement)
    private readonly entitlementsRepository: Repository<Entitlement>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly policies: PolicyService,
    private readonly clock: FinanceClock,
  ) {}

  /**
   * Creates the order (pending payment) with snapshot item for one agent.
   * An optional transactional manager lets the caller create the order
   * INSIDE the checkout advisory-lock section (Batch 10 — §9/§10).
   */
  async createCheckoutOrder(
    buyerId: string,
    agent: Agent,
    version: AgentVersion | null,
    manager?: EntityManager,
  ): Promise<Order> {
    if (agent.isFree) {
      throw new ApiException(
        'CONFLICT',
        'Free agents do not require checkout',
        HttpStatus.CONFLICT,
      );
    }

    const ordersRepo = manager?.getRepository(Order) ?? this.ordersRepository;
    const itemsRepo =
      manager?.getRepository(OrderItem) ?? this.orderItemsRepository;

    const creator = await this.dataSource
      .getRepository(CreatorProfile)
      .findOneBy({ id: agent.creatorId });

    const order = ordersRepo.create({
      buyerId,
      status: OrderStatus.PENDING_PAYMENT,
      amount: agent.price,
      currency: CURRENCY_CODE,
    });
    const savedOrder = await ordersRepo.save(order);

    const item = itemsRepo.create({
      orderId: savedOrder.id,
      agentId: agent.id,
      agentVersionId: version?.id ?? null,
      agentNameSnapshot: agent.name,
      agentSlugSnapshot: agent.slug,
      agentVersionSnapshot: version?.versionNumber ?? '—',
      agentLogoUrlSnapshot: agent.logoUrl ?? null,
      creatorIdSnapshot: creator?.id ?? null,
      unitPrice: agent.price,
      currencyCode: CURRENCY_CODE,
      quantity: 1,
      total: agent.price,
      isFree: false,
      // Copy only the approved commercial terms. A JSON round-trip prevents
      // a later in-memory mutation from sharing an object with this order.
      commercialTermsSnapshot: immutableCommercialTermsSnapshot(agent, version),
    });
    await itemsRepo.save(item);

    businessEvent.info('order.created', 'Checkout order created', {
      orderId: savedOrder.id,
      buyerId,
      agentId: agent.id,
      amount: agent.price,
      currency: CURRENCY_CODE,
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.ORDER_CREATED,
      entity: AUDIT_ENTITIES.ORDER,
      entityId: savedOrder.id,
      metadata: {
        agentId: agent.id,
        amount: agent.price,
        currency: CURRENCY_CODE,
      },
      context: { actorId: buyerId },
    });

    return savedOrder;
  }

  async findById(id: string): Promise<Order | null> {
    return this.ordersRepository.findOneBy({ id });
  }

  async listMine(
    buyerId: string,
    page: number,
    pageSize: number,
    group?: OrderStatusGroup,
  ) {
    const statuses = orderStatusesOfGroup(group);
    const [orders, total] = await this.ordersRepository.findAndCount({
      where: statuses ? { buyerId, status: In(statuses) } : { buyerId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const items = await Promise.all(orders.map((order) => this.toView(order)));
    return { items, meta: buildPaginationMeta(page, pageSize, total) };
  }

  async getMine(buyerId: string, orderId: string): Promise<OrderView> {
    const order = await this.ordersRepository.findOneBy({
      id: orderId,
      buyerId,
    });
    if (!order) {
      throw new ApiException(
        'NOT_FOUND',
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toView(order);
  }

  async toView(order: Order): Promise<OrderView> {
    const orderItems = await this.orderItemsRepository.findBy({
      orderId: order.id,
    });
    return {
      id: order.id,
      status: order.status,
      amount: order.amount,
      currencyCode: order.currency,
      paidAt: order.paidAt,
      fulfilledAt: order.fulfilledAt,
      createdAt: order.createdAt,
      items: orderItems.map((item): OrderItemView => ({
        id: item.id,
        agentId: item.agentId,
        agentNameSnapshot: item.agentNameSnapshot,
        agentSlugSnapshot: item.agentSlugSnapshot,
        agentVersionSnapshot: item.agentVersionSnapshot,
        agentLogoUrlSnapshot: item.agentLogoUrlSnapshot ?? null,
        creatorIdSnapshot: item.creatorIdSnapshot,
        unitPrice: item.unitPrice,
        currencyCode: item.currencyCode,
        quantity: item.quantity,
        total: item.total,
        isFree: item.isFree,
        commercialTermsSnapshot: item.commercialTermsSnapshot ?? null,
      })),
    };
  }

  /**
   * Order detail for its buyer. Ownership is part of the lookup, so a
   * foreign id is indistinguishable from an unknown one (404).
   */
  async getMineDetail(
    buyerId: string,
    orderId: string,
  ): Promise<OrderDetailView> {
    const order = await this.ordersRepository.findOneBy({
      id: orderId,
      buyerId,
    });
    if (!order) {
      throw new ApiException(
        'NOT_FOUND',
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const view = await this.toView(order);

    const [paymentRows, refundRows, entitlementRows, receiptRows, policy] =
      await Promise.all([
        this.dataSource.query<
          Array<{
            id: string;
            gateway: string;
            gateway_transaction_id: string;
            status: string;
            amount: string;
            currency_code: string;
            created_at: Date;
            confirmed_at: Date | null;
          }>
        >(
          `SELECT id, gateway, gateway_transaction_id, status, amount::text AS amount,
                  currency_code, created_at, confirmed_at
             FROM payments WHERE order_id = $1
            ORDER BY created_at DESC LIMIT 1`,
          [order.id],
        ),
        this.dataSource.query<
          Array<{
            id: string;
            status: RefundStatusValue;
            reason: string;
            amount: string;
            currency_code: string;
            created_at: Date;
            review_started_at: Date | null;
            processed_at: Date | null;
            review_note: string | null;
            updated_at: Date;
          }>
        >(
          `SELECT id, status, reason, amount::text AS amount, currency_code, created_at,
                  review_started_at, processed_at, review_note, updated_at
             FROM refunds WHERE order_id = $1 ORDER BY created_at DESC`,
          [order.id],
        ),
        this.entitlementsRepository.find({
          where: { orderId: order.id },
          order: { grantedAt: 'ASC' },
        }),
        this.dataSource.query<
          Array<{
            id: string;
            receipt_number: string;
            kind: 'PAYMENT' | 'REFUND';
            amount_minor: string;
            currency: string;
            issued_at: Date;
          }>
        >(
          `SELECT id, receipt_number::text, kind, amount_minor::text, currency, issued_at
             FROM internal_receipts WHERE order_id = $1 AND buyer_id = $2
            ORDER BY issued_at ASC, id`,
          [order.id, buyerId],
        ),
        this.policies.current('REFUND', { currency: order.currency }),
      ]);

    const refunds = refundRows.map(toOrderRefundView);
    const payment = paymentRows[0];
    return {
      ...view,
      cancelledAt: order.cancelledAt,
      refundedAt: order.refundedAt,
      summary: {
        subtotal: sumAmounts(view.items.map((item) => item.total)),
        total: order.amount,
        refundedAmount: sumAmounts(
          refunds
            .filter((refund) => refund.status === 'processed')
            .map((refund) => refund.amount),
        ),
        currencyCode: order.currency,
      },
      payment: payment
        ? {
            id: payment.id,
            gateway: payment.gateway,
            reference: payment.gateway_transaction_id,
            status: payment.status,
            amount: payment.amount,
            currencyCode: payment.currency_code,
            createdAt: payment.created_at,
            confirmedAt: payment.confirmed_at,
          }
        : null,
      entitlements: entitlementRows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        status:
          row.status === EntitlementStatus.GRANTED ? 'granted' : 'revoked',
        grantedAt: row.grantedAt,
        revokedAt: row.revokedAt,
      })),
      refunds,
      refundEligibility: refundEligibility({
        order: { status: order.status, paidAt: order.paidAt },
        refunds: refunds.map((refund) => ({ status: refund.status })),
        windowDays: policy.params.windowDays,
        now: this.clock.now(),
      }),
      receipts: receiptRows.map((row) => ({
        id: row.id,
        receiptNumber: row.receipt_number,
        kind: row.kind,
        amount: formatMinorToMajor(BigInt(row.amount_minor), row.currency),
        currencyCode: row.currency,
        issuedAt: row.issued_at,
        isTaxInvoice: false as const,
      })),
      timeline: buildOrderTimeline({
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        fulfilledAt: order.fulfilledAt,
        cancelledAt: order.cancelledAt,
        refundedAt: order.refundedAt,
        refunds,
      }),
    };
  }

  async hasGrantedEntitlement(
    userId: string,
    agentId: string,
  ): Promise<boolean> {
    return this.entitlementsRepository.existsBy({
      userId,
      agentId,
      status: EntitlementStatus.GRANTED,
    });
  }

  async findPublishedAgentBySlug(slug: string): Promise<Agent | null> {
    return this.agentsRepository.findOneBy({
      slug,
      status: AgentStatus.PUBLISHED,
    });
  }

  async findPublishedVersion(agentId: string): Promise<AgentVersion | null> {
    return this.versionsRepository.findOneBy({
      agentId,
      status: AgentVersionStatus.PUBLISHED,
    });
  }
}
