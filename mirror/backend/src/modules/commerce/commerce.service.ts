import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import {
  AgentVersion,
  AgentVersionStatus,
} from '../../database/entities/agents/agent-version.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { ApiException } from '../../common/errors/api-error';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { EntitlementsService } from './entitlements.service';
import { CURRENCY_CODE } from './orders.service';
import { businessEvent } from '../../common/logging/app-logger';
import { AnalyticsEventsService } from '../analytics/analytics-events.service';
import { ANALYTICS_EVENTS } from '../../database/entities/growth/agent-analytics-event.entity';
import { supportsCurrentCheckout } from '../../database/entities/agents/product-model';

/**
 * Exact decimal-string equality (no float): "1500000" == "1500000.00".
 * Non-numeric input never matches.
 */
export function sameDecimal(a: string, b: string): boolean {
  const norm = (value: string): string | null => {
    const text = String(value).trim();
    if (!/^\d+(\.\d+)?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    const f = fraction.replace(/0+$/, '');
    return `${whole.replace(/^0+(?=\d)/, '')}${f ? `.${f}` : ''}`;
  };
  const x = norm(a);
  const y = norm(b);
  return x !== null && y !== null && x === y;
}

export interface CheckoutResult {
  orderId: string;
  paymentId: string;
  gatewayTransactionId: string;
  /** Where the buyer must be redirected (null for the sandbox gateway). */
  paymentUrl: string | null;
  amount: string;
  currencyCode: string;
  status: string;
}

interface OpenPaymentRow {
  order_id: string;
  order_status: string;
  payment_id: string | null;
  payment_status: string | null;
  txid: string | null;
  payment_url: string | null;
  payment_amount: string | null;
}

/**
 * Purchase entry points for buyers. Checkout creates the order (with the
 * immutable listing snapshot) plus an initiated payment, then opens a
 * provider session; free agents are acquired directly as an entitlement.
 * Self-purchase and double purchase are rejected server-side.
 *
 * Batch 10 — Phase 18 (§9/§10): payment initiation is idempotent. A
 * repeated checkout for the same buyer+agent reuses the still-pending
 * provider session (no second payable transaction); concurrent duplicate
 * submissions serialize on a per-(buyer, agent) advisory lock, with the
 * loser waiting for the winner's session to resolve. Failed/cancelled
 * sessions retire their order and a fresh one is created on retry.
 */
@Injectable()
export class CommerceService {
  private readonly nodeEnv: string;

  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepository: Repository<Agent>,
    @InjectRepository(AgentVersion)
    private readonly versionsRepository: Repository<AgentVersion>,
    @InjectRepository(CreatorProfile)
    private readonly profilesRepository: Repository<CreatorProfile>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly entitlementsService: EntitlementsService,
    config: ConfigService,
    private readonly analytics: AnalyticsEventsService,
  ) {
    this.nodeEnv = config.getOrThrow<string>('nodeEnv');
  }

  async checkout(
    buyerId: string,
    agentSlug: string,
    promotionId?: string | null,
    expectedAmount?: string | null,
  ): Promise<CheckoutResult> {
    const agent = await this.agentsRepository.findOneBy({
      slug: agentSlug,
      status: AgentStatus.PUBLISHED,
    });
    if (!agent) {
      throw new ApiException(
        'AGENT_NOT_FOUND',
        'Agent not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (agent.isFree) {
      throw new ApiException(
        'CONFLICT',
        'This agent is free — use acquire instead of checkout',
        HttpStatus.CONFLICT,
      );
    }
    // Phase 1 deliberately models recurring / metered terms without
    // pretending this one-time PSP flow can collect them. Legacy listings
    // (no profile) retain their existing checkout behavior unchanged.
    if (
      agent.commercialProfile &&
      !supportsCurrentCheckout(agent.commercialProfile)
    ) {
      throw new ApiException(
        'PAYMENT_MODEL_NOT_SUPPORTED',
        'This commercial payment model is not available through checkout yet',
        HttpStatus.CONFLICT,
        { paymentModel: agent.commercialProfile.payment?.model ?? null },
      );
    }
    await this.assertNotOwnAndNotOwned(buyerId, agent);
    if (await this.entitlementsService.hasGranted(buyerId, agent.id)) {
      throw new ApiException(
        'ALREADY_PURCHASED',
        'You already own this agent',
        HttpStatus.CONFLICT,
      );
    }
    // Sprint 2 (P2-01): the buyer reviewed a specific amount. If the listing
    // price moved since, refuse BEFORE any order/payment row exists — the
    // review page re-renders the current price and asks again. The listing
    // price stays the only amount ever charged (expectedAmount is a check,
    // never an input to the order).
    if (
      expectedAmount !== null &&
      expectedAmount !== undefined &&
      !sameDecimal(expectedAmount, agent.price)
    ) {
      throw new ApiException(
        'PRICE_CHANGED',
        'The price of this agent changed since it was reviewed',
        HttpStatus.CONFLICT,
        { currentAmount: agent.price, currencyCode: CURRENCY_CODE },
      );
    }

    // Idempotent initiation: at most one payable transaction per logical
    // checkout, even under concurrent duplicate submissions.
    for (let attempt = 0; attempt < 2; attempt++) {
      const resolution = await this.dataSource.transaction(async (manager) => {
        // Serialize checkouts for the same buyer+agent.
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `checkout:${buyerId}:${agent.id}`,
        ]);

        const open = await this.findOpenPayment(manager, buyerId, agent.id);

        if (open?.payment_status === 'pending') {
          const samePrice = Number(open.payment_amount) === Number(agent.price);
          if (samePrice && open.txid) {
            return { kind: 'reuse' as const, row: open };
          }
        }

        if (open?.payment_status === 'initiated' && attempt === 0) {
          // Another request just started a session — wait for it outside
          // the transaction (no network calls while holding the lock).
          return { kind: 'wait' as const, row: open };
        }

        // Retire stale open orders (failed/cancelled payment, price
        // change) so exactly one live checkout remains.
        await this.cancelStaleOrders(manager, buyerId, agent.id);

        // Create the order AND the initiated payment INSIDE the locked
        // section: a concurrent duplicate checkout serialized behind us
        // observes this initiated payment and waits/reuses instead of
        // creating a second payable transaction.
        const version = await this.publishedVersion(agent.id);
        const order = await this.ordersService.createCheckoutOrder(
          buyerId,
          agent,
          version,
          manager,
        );
        const payment = await this.paymentsService.initiate(
          order.id,
          agent.price,
          agent.currency,
          manager,
        );
        return { kind: 'created' as const, order, payment };
      });

      if (resolution.kind === 'reuse') {
        const row = resolution.row;
        await this.recordCheckout(agent.id, buyerId, row.order_id, promotionId);
        businessEvent.info(
          'order.checkout.reused',
          'Reusing the still-pending payment session',
          { orderId: row.order_id, paymentId: row.payment_id ?? undefined },
        );
        return {
          orderId: row.order_id,
          paymentId: row.payment_id ?? '',
          gatewayTransactionId: row.txid ?? '',
          paymentUrl: row.payment_url,
          amount: row.payment_amount ?? agent.price,
          currencyCode: CURRENCY_CODE,
          status: row.order_status,
        };
      }

      if (resolution.kind === 'wait') {
        const resolved = await this.waitForResolution(
          resolution.row.payment_id ?? '',
        );
        if (resolved === 'pending') {
          // The other request's session is now pending — reuse it.
          continue; // next loop iteration re-reads state under the lock
        }
        // failed/cancelled/still-initiated: fall through and create fresh.
        if (resolved === 'timeout') {
          throw new ApiException(
            'PAYMENT_PROVIDER_UNAVAILABLE',
            'A payment initiation is still in progress. Please retry.',
            HttpStatus.BAD_GATEWAY,
          );
        }
        // failed → create a fresh order+payment on the next iteration.
        continue;
      }

      // kind === 'created': the order + initiated payment row exist; open
      // the provider session OUTSIDE any database transaction (a provider
      // outage must never hold a pool connection).
      const payment = await this.paymentsService.openSession(
        resolution.payment.id,
      );
      const order = resolution.order;
      await this.recordCheckout(agent.id, buyerId, order.id, promotionId);

      const paymentUrl =
        typeof payment.providerPayload?.paymentUrl === 'string'
          ? payment.providerPayload.paymentUrl
          : null;

      return {
        orderId: order.id,
        paymentId: payment.id,
        gatewayTransactionId: payment.gatewayTransactionId ?? '',
        paymentUrl,
        amount: order.amount,
        currencyCode: order.currency,
        status: order.status,
      };
    }

    // Unreachable in practice: the loop resolves or throws.
    throw new ApiException(
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'Could not start a payment session. Please retry.',
      HttpStatus.BAD_GATEWAY,
    );
  }

  /** A4 §15 — real checkout event, once per order (de-duplicated). */
  private async recordCheckout(
    agentId: string,
    buyerId: string,
    orderId: string,
    claimedPromotionId?: string | null,
  ): Promise<void> {
    // A5 §9 — attribution only to an ACTIVE promotion of this product.
    let promotionId: string | null = null;
    try {
      promotionId = await this.analytics.activePromotionFor(
        agentId,
        claimedPromotionId,
      );
    } catch {
      promotionId = null;
    }
    await this.analytics.recordSafe({
      agentId,
      type: ANALYTICS_EVENTS.CHECKOUT_STARTED,
      dedupKey: `checkout:${orderId}`,
      userId: buyerId,
      // checkout rejects free products; preserve the offer type at event time.
      metadata: { orderId, isFree: false },
      promotionId,
    });
  }

  async acquireFree(
    userId: string,
    agentSlug: string,
  ): Promise<{ entitlementId: string }> {
    const agent = await this.agentsRepository.findOneBy({
      slug: agentSlug,
      status: AgentStatus.PUBLISHED,
    });
    if (!agent) {
      throw new ApiException(
        'AGENT_NOT_FOUND',
        'Agent not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!agent.isFree) {
      throw new ApiException(
        'CONFLICT',
        'This agent is not free — use checkout',
        HttpStatus.CONFLICT,
      );
    }
    if (
      agent.commercialProfile &&
      agent.commercialProfile.payment?.model !== 'free'
    ) {
      throw new ApiException(
        'PAYMENT_MODEL_NOT_SUPPORTED',
        'The commercial payment declaration is not available for free acquisition',
        HttpStatus.CONFLICT,
        { paymentModel: agent.commercialProfile.payment?.model ?? null },
      );
    }
    await this.assertNotOwnAndNotOwned(userId, agent);

    const version = await this.publishedVersion(agent.id);
    const entitlement = await this.entitlementsService.acquireFree(
      userId,
      agent,
      version,
    );
    return { entitlementId: entitlement.id };
  }

  /** Dev-only sandbox: server-side re-signs and confirms a sandbox payment. */
  async sandboxConfirm(
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
    const result = await this.paymentsService.verifyCallback(
      userId,
      transactionId,
      'OK',
    );
    // Preserve the historical response values of this dev-only endpoint.
    return {
      status: result.status === 'confirmed' ? 'confirmed' : 'duplicate',
    };
  }

  /**
   * Waits (bounded) for a just-started payment session of a concurrent
   * checkout to reach a terminal-or-pending state. Never holds a database
   * transaction while waiting.
   */
  private async waitForResolution(
    paymentId: string,
  ): Promise<'pending' | 'failed' | 'cancelled' | 'timeout'> {
    if (!paymentId) return 'timeout';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const rows = await this.dataSource.query<Array<{ status: string }>>(
        `SELECT status FROM payments WHERE id = $1`,
        [paymentId],
      );
      const status = rows[0]?.status;
      if (status === 'pending') return 'pending';
      if (status === 'failed' || status === 'cancelled') return status;
    }
    return 'timeout';
  }

  private async findOpenPayment(
    manager: EntityManager,
    buyerId: string,
    agentId: string,
  ): Promise<OpenPaymentRow | null> {
    const rows = await manager.query<OpenPaymentRow[]>(
      `SELECT o.id AS order_id,
              o.status::text AS order_status,
              p.id AS payment_id,
              p.status::text AS payment_status,
              p.gateway_transaction_id AS txid,
              p.provider_payload ->> 'paymentUrl' AS payment_url,
              p.amount::text AS payment_amount
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id AND oi.agent_id = $2
       LEFT JOIN LATERAL (
         SELECT * FROM payments pp
         WHERE pp.order_id = o.id
         ORDER BY pp.created_at DESC
         LIMIT 1
       ) p ON true
       WHERE o.buyer_id = $1
         AND o.status IN ('created', 'pending_payment')
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [buyerId, agentId],
    );
    return rows[0] ?? null;
  }

  private async cancelStaleOrders(
    manager: EntityManager,
    buyerId: string,
    agentId: string,
  ): Promise<void> {
    const stale = await manager.query<Array<{ id: string }>>(
      `SELECT o.id
       FROM orders o
       WHERE o.buyer_id = $1 AND o.status IN ('created', 'pending_payment')
         AND EXISTS (
           SELECT 1 FROM order_items oi
           WHERE oi.order_id = o.id AND oi.agent_id = $2
         )`,
      [buyerId, agentId],
    );
    if (stale.length === 0) return;
    await manager.query(
      `UPDATE orders
       SET status = 'cancelled', cancelled_at = now(), updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [stale.map((row) => row.id)],
    );
    businessEvent.info(
      'order.checkout.stale_cancelled',
      'Retired stale open orders before creating a fresh checkout',
      { buyerId, agentId, count: stale.length },
    );
  }

  private async assertNotOwnAndNotOwned(
    userId: string,
    agent: Agent,
  ): Promise<void> {
    const profile = await this.profilesRepository.findOneBy({ userId });
    if (profile && profile.id === agent.creatorId) {
      throw new ApiException(
        'FORBIDDEN',
        'Creators cannot purchase their own agents',
        HttpStatus.FORBIDDEN,
      );
    }
    if (agent.currency !== CURRENCY_CODE) {
      throw new ApiException(
        'PAYMENT_FAILED',
        `Unsupported currency ${agent.currency}`,
        HttpStatus.CONFLICT,
      );
    }
  }

  private async publishedVersion(
    agentId: string,
  ): Promise<AgentVersion | null> {
    if (!agentId) return null;
    // The CURRENT published version is the newest one — a published agent
    // accumulates version history and purchases must snapshot what buyers
    // actually see now.
    return this.versionsRepository.findOne({
      where: { agentId, status: AgentVersionStatus.PUBLISHED },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
    });
  }
}
