import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { businessEvent } from '../../common/logging/app-logger';
import { BalanceService } from './balance.service';
import { splitRefund } from './domain/commission';
import { PostingLine } from './domain/ledger';
import { MoneyError, parseMinorText } from './domain/money';
import { planRefund } from './domain/refund-rules';
import { FinanceActor } from './finance-actor';
import { FinanceClock } from './finance-clock';
import { FinanceExceptionsService } from './finance-exceptions.service';
import { refundsTotal } from './finance-metrics';
import { FinancialAuditService } from './financial-audit.service';
import { FinancialCalculationsService } from './financial-calculations.service';
import { LedgerService } from './ledger.service';
import { PolicyService } from './policy.service';
import { ReceiptsService } from './receipts.service';

interface EntitlementRow {
  id: string;
  creator_id: string;
  status: 'HELD' | 'RELEASED' | 'REFUNDED';
  gross_minor: string;
  commission_minor: string;
  creator_share_minor: string;
  refunded_gross_minor: string;
  refunded_commission_minor: string;
  refunded_creator_minor: string;
}

export interface SettleRefundInput {
  refundId: string;
  orderId: string;
  paymentId: string | null;
  currency: string;
  /** Minor units to refund now. */
  amountMinor: bigint;
  actor: FinanceActor;
}

export interface SettleRefundResult {
  outcome: 'POSTED' | 'LEGACY_NO_LEDGER' | 'ALREADY_SETTLED';
  settlementId: string;
  ledgerTransactionId: string | null;
  /** True when, after this refund, nothing of the order remains refundable. */
  fullyRefunded: boolean;
  amountMinor: bigint;
  toRecoveryMinor: bigint;
}

const violation = (message: string) =>
  new ApiException(
    'FINANCE_RULE_VIOLATION',
    message,
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

/**
 * W4 — the financial effect of an approved refund, inside the same database
 * transaction as the refund decision.
 *
 *  - Exactly once: `refund_settlements.refund_id` is UNIQUE and is checked
 *    first; the ledger key `refund:{refundId}` is the second line of defence.
 *  - Never refunds more than was sold: cumulative per-entitlement bounds,
 *    enforced here and by CHECK constraints.
 *  - After a payout: the creator part that AVAILABLE can no longer cover
 *    becomes an explicit RECOVERY receivable. The payout is never touched.
 *  - Known limitation: a PARTIAL refund is only supported for single-item
 *    orders (the existing order model has no per-item refund selection).
 */
@Injectable()
export class RefundSettlementService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly balances: BalanceService,
    private readonly policies: PolicyService,
    private readonly audit: FinancialAuditService,
    private readonly calculations: FinancialCalculationsService,
    private readonly exceptions: FinanceExceptionsService,
    private readonly receipts: ReceiptsService,
    private readonly clock: FinanceClock,
  ) {}

  async settle(
    manager: EntityManager,
    input: SettleRefundInput,
  ): Promise<SettleRefundResult> {
    const existing = await manager.query<
      Array<{
        id: string;
        outcome: string;
        ledger_transaction_id: string | null;
        amount_minor: string;
        to_recovery_minor: string;
      }>
    >(
      `SELECT id, outcome, ledger_transaction_id, amount_minor::text, to_recovery_minor::text
         FROM refund_settlements WHERE refund_id = $1`,
      [input.refundId],
    );
    if (existing[0]) {
      refundsTotal.inc({ outcome: 'duplicate', kind: 'any' });
      return {
        outcome: 'ALREADY_SETTLED',
        settlementId: existing[0].id,
        ledgerTransactionId: existing[0].ledger_transaction_id,
        fullyRefunded: true,
        amountMinor: parseMinorText(existing[0].amount_minor),
        toRecoveryMinor: parseMinorText(existing[0].to_recovery_minor),
      };
    }
    if (input.amountMinor <= 0n)
      throw violation('Refund amount must be positive');

    const now = this.clock.now();
    const entitlements = await manager.query<EntitlementRow[]>(
      `SELECT id, creator_id, status, gross_minor::text, commission_minor::text,
              creator_share_minor::text, refunded_gross_minor::text,
              refunded_commission_minor::text, refunded_creator_minor::text
         FROM creator_entitlements WHERE order_id = $1 ORDER BY id FOR UPDATE`,
      [input.orderId],
    );

    if (entitlements.length === 0) return this.legacy(manager, input);

    const refundPolicy = await this.policies
      .resolve('REFUND', now, { manager, currency: input.currency })
      .catch(() => null);

    const remaining = entitlements.map((e) => ({
      e,
      gross: parseMinorText(e.gross_minor),
      refunded: parseMinorText(e.refunded_gross_minor),
    }));
    const totalRemaining = remaining.reduce(
      (sum, r) => sum + (r.gross - r.refunded),
      0n,
    );
    if (totalRemaining <= 0n)
      throw violation('This order is already fully refunded');
    if (input.amountMinor > totalRemaining) {
      throw violation(
        'Refund exceeds the amount still refundable for this order',
      );
    }
    if (entitlements.length > 1 && input.amountMinor !== totalRemaining) {
      throw violation(
        'Partial refunds are not supported for multi-item orders (the order model has no per-item refund selection)',
      );
    }

    const lines: PostingLine[] = [];
    const localAvailable = new Map<string, bigint>();
    let creatorTotal = 0n;
    let commissionTotal = 0n;
    let fromHeld = 0n;
    let fromAvailable = 0n;
    let toRecovery = 0n;
    const updates: Array<{
      id: string;
      gross: bigint;
      commission: bigint;
      creator: bigint;
      becomesRefunded: boolean;
    }> = [];

    for (const { e, gross, refunded } of remaining) {
      const piece =
        entitlements.length === 1 ? input.amountMinor : gross - refunded;
      if (piece <= 0n) continue;
      const split = splitRefund(
        {
          gross,
          commission: parseMinorText(e.commission_minor),
          creatorShare: parseMinorText(e.creator_share_minor),
        },
        refunded,
        piece,
      );
      let available = localAvailable.get(e.creator_id);
      if (available === undefined) {
        available = (
          await this.balances.lock(manager, e.creator_id, input.currency)
        ).available;
      }
      let plan: ReturnType<typeof planRefund>;
      try {
        plan = planRefund({
          entitlementStatus: e.status,
          split,
          creatorId: e.creator_id,
          heldRemaining:
            parseMinorText(e.creator_share_minor) -
            parseMinorText(e.refunded_creator_minor),
          availableBalance: available,
        });
      } catch (error) {
        if (error instanceof MoneyError) throw violation(error.message);
        throw error;
      }
      localAvailable.set(e.creator_id, available - plan.fromAvailable);
      lines.push(...plan.lines);
      creatorTotal += split.creatorPart;
      commissionTotal += split.commissionPart;
      fromHeld += plan.fromHeld;
      fromAvailable += plan.fromAvailable;
      toRecovery += plan.toRecovery;
      updates.push({
        id: e.id,
        gross: piece,
        commission: split.commissionPart,
        creator: split.creatorPart,
        becomesRefunded: refunded + piece === gross,
      });
    }

    const posted = await this.ledger.post(manager, {
      type: 'REFUND',
      currency: input.currency,
      occurredAt: now,
      referenceType: 'refund',
      referenceId: input.refundId,
      idempotencyKey: `refund:${input.refundId}`,
      actorType: input.actor.type,
      actorId: input.actor.id,
      description: `Refund ${input.refundId} for order ${input.orderId}`,
      policyVersions: refundPolicy ? { refund: refundPolicy.id } : {},
      metadata: { orderId: input.orderId, paymentId: input.paymentId },
      lines,
    });

    for (const u of updates) {
      await manager.query(
        `UPDATE creator_entitlements
            SET refunded_gross_minor = refunded_gross_minor + $2,
                refunded_commission_minor = refunded_commission_minor + $3,
                refunded_creator_minor = refunded_creator_minor + $4,
                status = CASE WHEN $5 THEN 'REFUNDED' ELSE status END,
                version = version + 1, updated_at = now()
          WHERE id = $1`,
        [
          u.id,
          u.gross.toString(),
          u.commission.toString(),
          u.creator.toString(),
          u.becomesRefunded,
        ],
      );
    }

    const inserted = await manager.query<Array<{ id: string }>>(
      `INSERT INTO refund_settlements
         (refund_id, order_id, payment_id, currency, amount_minor, outcome, ledger_transaction_id,
          commission_part_minor, creator_part_minor, from_held_minor, from_available_minor,
          to_recovery_minor, decided_by)
       VALUES ($1,$2,$3,$4,$5,'POSTED',$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        input.refundId,
        input.orderId,
        input.paymentId,
        input.currency,
        input.amountMinor.toString(),
        posted.id,
        commissionTotal.toString(),
        creatorTotal.toString(),
        fromHeld.toString(),
        fromAvailable.toString(),
        toRecovery.toString(),
        input.actor.id,
      ],
    );

    await this.receipts.issueRefund(manager, input.refundId, input.amountMinor);
    await this.calculations.recordRefundAdjustment(manager, {
      refundId: input.refundId,
      orderId: input.orderId,
      currency: input.currency,
      grossEffectMinor: input.amountMinor,
      commissionEffectMinor: commissionTotal,
      creatorEffectMinor: creatorTotal,
      // Recovery is explicit and is never an automatic payout/history edit.
      settlementEffectMinor: toRecovery,
      recordedBy: input.actor.id,
    });
    await this.audit.record(manager, {
      actor: input.actor,
      action: 'finance.refund.settled',
      targetType: 'refund',
      targetId: input.refundId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      after: {
        fromHeld: fromHeld.toString(),
        fromAvailable: fromAvailable.toString(),
        toRecovery: toRecovery.toString(),
        commissionPart: commissionTotal.toString(),
      },
      reference: `refund:${input.refundId}`,
      ledgerTransactionId: posted.id,
    });
    refundsTotal.inc({
      outcome: toRecovery > 0n ? 'posted_with_recovery' : 'posted',
      kind: updates.every((u) => u.becomesRefunded) ? 'full' : 'partial',
    });
    if (toRecovery > 0n) {
      businessEvent.warn(
        'finance.refund.recovery_created',
        'Refund exceeded creator available balance; recovery recorded',
        {
          refundId: input.refundId,
          toRecovery: toRecovery.toString(),
        },
      );
    }
    return {
      outcome: 'POSTED',
      settlementId: inserted[0].id,
      ledgerTransactionId: posted.id,
      fullyRefunded: input.amountMinor === totalRemaining,
      amountMinor: input.amountMinor,
      toRecoveryMinor: toRecovery,
    };
  }

  /**
   * An order that predates the ledger has no sale to reverse. The refund
   * proceeds exactly as it always did (it is a real decision about real
   * money), and the gap is recorded as an exception — no entry is invented.
   */
  private async legacy(
    manager: EntityManager,
    input: SettleRefundInput,
  ): Promise<SettleRefundResult> {
    const sale = await this.ledger.findByKey(
      manager,
      `sale:${input.paymentId ?? 'none'}`,
    );
    if (sale) {
      throw violation(
        'The order has a ledger sale but no creator entitlement; refund blocked for investigation',
      );
    }
    const order = await manager.query<Array<{ amount: string }>>(
      `SELECT amount::text AS amount FROM orders WHERE id = $1`,
      [input.orderId],
    );
    await this.exceptions.record(manager, {
      kind: 'REFUND_WITHOUT_LEDGER_SALE',
      severity: 'P2',
      referenceType: 'refund',
      referenceId: input.refundId,
      detail: { orderId: input.orderId, orderAmount: order[0]?.amount ?? null },
    });
    const inserted = await manager.query<Array<{ id: string }>>(
      `INSERT INTO refund_settlements
         (refund_id, order_id, payment_id, currency, amount_minor, outcome, decided_by)
       VALUES ($1,$2,$3,$4,$5,'LEGACY_NO_LEDGER',$6) RETURNING id`,
      [
        input.refundId,
        input.orderId,
        input.paymentId,
        input.currency,
        input.amountMinor.toString(),
        input.actor.id,
      ],
    );
    await this.audit.record(manager, {
      actor: input.actor,
      action: 'finance.refund.settled_legacy',
      targetType: 'refund',
      targetId: input.refundId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      reason:
        'Order has no ledger sale; refund processed without ledger effect',
    });
    refundsTotal.inc({ outcome: 'legacy_no_ledger', kind: 'full' });
    return {
      outcome: 'LEGACY_NO_LEDGER',
      settlementId: inserted[0].id,
      ledgerTransactionId: null,
      fullyRefunded: true,
      amountMinor: input.amountMinor,
      toRecoveryMinor: 0n,
    };
  }

  /**
   * The buyer is paid back outside the platform; this records that — once
   * per refund, with a unique bank reference — as REFUND_DISBURSEMENT.
   */
  async recordDisbursement(
    manager: EntityManager,
    input: { refundId: string; reference: string; actor: FinanceActor },
  ): Promise<{ ledgerTransactionId: string; amountMinor: bigint }> {
    const rows = await manager.query<
      Array<{
        id: string;
        order_id: string;
        currency: string;
        amount_minor: string;
        creator_id: string | null;
        ledger_transaction_id: string | null;
      }>
    >(
      `SELECT s.id, s.order_id, s.currency, s.amount_minor::text, s.ledger_transaction_id,
              (SELECT e.creator_id FROM creator_entitlements e WHERE e.order_id = s.order_id ORDER BY e.id LIMIT 1) AS creator_id
         FROM refund_settlements s WHERE s.refund_id = $1 FOR UPDATE`,
      [input.refundId],
    );
    const s = rows[0];
    if (!s)
      throw new ApiException(
        'NOT_FOUND',
        'Refund has not been settled',
        HttpStatus.NOT_FOUND,
      );
    if (!s.ledger_transaction_id) {
      throw violation(
        'This refund predates the ledger; there is no payable to disburse against',
      );
    }
    const prior = await manager.query<
      Array<{ ledger_transaction_id: string; amount_minor: string }>
    >(
      `SELECT ledger_transaction_id, amount_minor::text FROM refund_disbursements WHERE refund_id = $1`,
      [input.refundId],
    );
    if (prior[0]) {
      return {
        ledgerTransactionId: prior[0].ledger_transaction_id,
        amountMinor: parseMinorText(prior[0].amount_minor),
      };
    }
    const amount = parseMinorText(s.amount_minor);
    const posted = await this.ledger.post(manager, {
      type: 'REFUND_DISBURSEMENT',
      currency: s.currency,
      occurredAt: this.clock.now(),
      referenceType: 'refund',
      referenceId: input.refundId,
      idempotencyKey: `refund_disbursement:${input.refundId}`,
      actorType: input.actor.type,
      actorId: input.actor.id,
      description: `Buyer refund paid out (ref ${input.reference})`,
      lines: [
        { account: 'BUYER_REFUNDS_PAYABLE', side: 'D', amount },
        { account: 'PLATFORM_CASH', side: 'C', amount },
      ],
    });
    try {
      await manager.query(
        `INSERT INTO refund_disbursements (refund_id, currency, amount_minor, reference, ledger_transaction_id, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          input.refundId,
          s.currency,
          amount.toString(),
          input.reference,
          posted.id,
          input.actor.id,
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiException(
          'CONFLICT',
          'This bank reference was already used for another disbursement',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
    await this.audit.record(manager, {
      actor: input.actor,
      action: 'finance.refund.disbursed',
      targetType: 'refund',
      targetId: input.refundId,
      amountMinor: amount,
      currency: s.currency,
      reference: input.reference,
      ledgerTransactionId: posted.id,
    });
    return { ledgerTransactionId: posted.id, amountMinor: amount };
  }
}
