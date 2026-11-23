import type { PolicyRow } from './domain/policy';
import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { businessEvent } from '../../common/logging/app-logger';
import { splitSale } from './domain/commission';
import { PostingLine } from './domain/ledger';
import {
  MoneyError,
  isSupportedCurrency,
  parseMajorToMinor,
} from './domain/money';
import { FinanceClock } from './finance-clock';
import { FinanceExceptionsService } from './finance-exceptions.service';
import { paymentsTotal } from './finance-metrics';
import { FinancialAuditService } from './financial-audit.service';
import { FinancialCalculationsService } from './financial-calculations.service';
import { LedgerService } from './ledger.service';
import { PolicyMissingError, PolicyService } from './policy.service';
import { ReceiptsService } from './receipts.service';
import { SYSTEM_ACTOR } from './finance-actor';

export interface RecordSaleInput {
  paymentId: string;
  occurredAt: Date;
  source: 'webhook' | 'callback' | 'sandbox';
  /** Fee charged by the PSP, in minor units, only when the PSP told us. */
  providerFeeMinor?: bigint | null;
}

export type RecordSaleOutcome =
  | { status: 'POSTED'; saleTransactionId: string; entitlements: number }
  | { status: 'ALREADY_POSTED'; saleTransactionId: string }
  | { status: 'SKIPPED'; reason: string };

interface ItemRow {
  id: string;
  creator_id_snapshot: string | null;
  total: string;
  is_free: boolean;
}

/**
 * W2 / W3 — the financial effect of a confirmed payment.
 *
 * Called from `PaymentsService.confirmSuccessful` INSIDE its transaction, so
 * the sale cannot be confirmed without its ledger entries and cannot be
 * rolled back without them. Mapping problems (an order whose items do not
 * add up, a missing creator snapshot, no policy in force) never block a
 * payment the PSP has already taken: they are recorded as finance
 * exceptions and the ledger is left WITHOUT fabricated entries.
 */
@Injectable()
export class SaleRecorderService {
  private readonly logger = new Logger(SaleRecorderService.name);

  constructor(
    private readonly ledger: LedgerService,
    private readonly policies: PolicyService,
    private readonly audit: FinancialAuditService,
    private readonly calculations: FinancialCalculationsService,
    private readonly exceptions: FinanceExceptionsService,
    private readonly receipts: ReceiptsService,
    private readonly clock: FinanceClock,
  ) {}

  /** `enforce` (default): any unexpected failure aborts the payment transaction. `shadow`: it is isolated in a savepoint and recorded. */
  private mode(): 'enforce' | 'shadow' {
    return process.env.FINANCE_LEDGER_MODE === 'shadow' ? 'shadow' : 'enforce';
  }

  async recordSale(
    manager: EntityManager,
    input: RecordSaleInput,
  ): Promise<RecordSaleOutcome> {
    if (this.mode() === 'enforce') return this.doRecord(manager, input);
    try {
      return await manager.transaction((savepoint) =>
        this.doRecord(savepoint, input),
      );
    } catch (error) {
      await this.exceptions.record(manager, {
        kind: 'LEDGER_POSTING_FAILED',
        severity: 'P1',
        referenceType: 'payment',
        referenceId: input.paymentId,
        detail: {
          message: error instanceof Error ? error.message : String(error),
          mode: 'shadow',
        },
      });
      return { status: 'SKIPPED', reason: 'LEDGER_POSTING_FAILED' };
    }
  }

  private async skip(
    manager: EntityManager,
    paymentId: string,
    reason: string,
    kind: Parameters<FinanceExceptionsService['record']>[1]['kind'] | null,
    detail: Record<string, unknown>,
  ): Promise<RecordSaleOutcome> {
    paymentsTotal.inc({ outcome: `skipped_${reason.toLowerCase()}` });
    if (kind) {
      await this.exceptions.record(manager, {
        kind,
        severity: 'P1',
        referenceType: 'payment',
        referenceId: paymentId,
        detail,
      });
    }
    return { status: 'SKIPPED', reason };
  }

  private async doRecord(
    manager: EntityManager,
    input: RecordSaleInput,
  ): Promise<RecordSaleOutcome> {
    const payments = await manager.query<
      Array<{
        id: string;
        order_id: string;
        amount: string;
        currency_code: string;
        status: string;
      }>
    >(
      `SELECT id, order_id, amount::text AS amount, currency_code, status
         FROM payments WHERE id = $1`,
      [input.paymentId],
    );
    const payment = payments[0];
    if (!payment) return { status: 'SKIPPED', reason: 'PAYMENT_NOT_FOUND' };

    const currency = payment.currency_code;
    if (!isSupportedCurrency(currency)) {
      return this.skip(
        manager,
        payment.id,
        'UNSUPPORTED_CURRENCY',
        'UNSUPPORTED_CURRENCY',
        { currency },
      );
    }
    let gross: bigint;
    try {
      gross = parseMajorToMinor(payment.amount, currency);
    } catch (error) {
      return this.skip(
        manager,
        payment.id,
        'INVALID_AMOUNT',
        'INVALID_AMOUNT',
        {
          amount: payment.amount,
          message: error instanceof MoneyError ? error.message : 'invalid',
        },
      );
    }
    if (gross === 0n) {
      // A free order moves no money: there is nothing to post.
      return { status: 'SKIPPED', reason: 'ZERO_AMOUNT' };
    }

    const items = await manager.query<ItemRow[]>(
      `SELECT id, creator_id_snapshot, total::text AS total, is_free
         FROM order_items WHERE order_id = $1 ORDER BY created_at, id`,
      [payment.order_id],
    );
    const paid = items.filter((i) => !i.is_free);
    let itemsTotal = 0n;
    const itemMinor = new Map<string, bigint>();
    try {
      for (const item of paid) {
        const minor = parseMajorToMinor(item.total, currency);
        itemMinor.set(item.id, minor);
        itemsTotal += minor;
      }
    } catch (error) {
      return this.skip(
        manager,
        payment.id,
        'INVALID_AMOUNT',
        'INVALID_AMOUNT',
        {
          message: error instanceof MoneyError ? error.message : 'invalid',
        },
      );
    }
    if (itemsTotal !== gross) {
      return this.skip(
        manager,
        payment.id,
        'ITEMS_TOTAL_MISMATCH',
        'ORDER_ITEMS_TOTAL_MISMATCH',
        {
          paymentAmountMinor: gross.toString(),
          itemsTotalMinor: itemsTotal.toString(),
          orderId: payment.order_id,
        },
      );
    }
    if (paid.some((i) => !i.creator_id_snapshot)) {
      return this.skip(
        manager,
        payment.id,
        'MISSING_CREATOR',
        'MISSING_CREATOR_SNAPSHOT',
        {
          orderId: payment.order_id,
          itemIds: paid.filter((i) => !i.creator_id_snapshot).map((i) => i.id),
        },
      );
    }

    let commissionPolicy: PolicyRow<'COMMISSION'>;
    let holdingPolicy: PolicyRow<'HOLDING'>;
    try {
      commissionPolicy = await this.policies.resolve(
        'COMMISSION',
        input.occurredAt,
        { manager, currency },
      );
      holdingPolicy = await this.policies.resolve('HOLDING', input.occurredAt, {
        manager,
        currency,
      });
    } catch (error) {
      if (error instanceof PolicyMissingError) {
        return this.skip(
          manager,
          payment.id,
          'POLICY_MISSING',
          'POLICY_MISSING',
          {
            message: error.message,
            occurredAt: input.occurredAt.toISOString(),
          },
        );
      }
      throw error;
    }

    const lines: PostingLine[] = [
      { account: 'PSP_CLEARING', side: 'D', amount: gross },
    ];
    const splits = new Map<string, ReturnType<typeof splitSale>>();
    for (const item of paid) {
      const split = splitSale(
        itemMinor.get(item.id) as bigint,
        commissionPolicy.params,
      );
      splits.set(item.id, split);
      const creatorId = item.creator_id_snapshot as string;
      if (split.commission > 0n) {
        lines.push({
          account: 'PLATFORM_COMMISSION',
          side: 'C',
          amount: split.commission,
          creatorId,
          memo: `item ${item.id}`,
        });
      }
      if (split.creatorShare > 0n) {
        lines.push({
          account: 'CREATOR_HELD',
          side: 'C',
          amount: split.creatorShare,
          creatorId,
          memo: `item ${item.id}`,
        });
      }
    }

    const posted = await this.ledger.post(manager, {
      type: 'SALE',
      currency,
      occurredAt: input.occurredAt,
      referenceType: 'payment',
      referenceId: payment.id,
      idempotencyKey: `sale:${payment.id}`,
      actorType: 'system',
      description: `Sale: payment ${payment.id} for order ${payment.order_id}`,
      policyVersions: {
        commission: commissionPolicy.id,
        holding: holdingPolicy.id,
      },
      metadata: { source: input.source, orderId: payment.order_id },
      lines,
    });
    if (posted.replayed) {
      paymentsTotal.inc({ outcome: 'already_posted' });
      return { status: 'ALREADY_POSTED', saleTransactionId: posted.id };
    }

    const heldUntil = new Date(
      input.occurredAt.getTime() + holdingPolicy.params.days * 86_400_000,
    );
    let entitlementCount = 0;
    for (const item of paid) {
      const split = splits.get(item.id) as ReturnType<typeof splitSale>;
      await manager.query(
        `INSERT INTO creator_entitlements
           (order_item_id, order_id, payment_id, creator_id, currency, gross_minor,
            commission_minor, creator_share_minor, held_until, sale_transaction_id,
            commission_policy_id, holding_policy_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (order_item_id) DO NOTHING`,
        [
          item.id,
          payment.order_id,
          payment.id,
          item.creator_id_snapshot,
          currency,
          split.gross.toString(),
          split.commission.toString(),
          split.creatorShare.toString(),
          heldUntil,
          posted.id,
          commissionPolicy.id,
          holdingPolicy.id,
        ],
      );
      entitlementCount += 1;
    }

    // Phase 4 calculation evidence is deliberately non-blocking for an
    // already-confirmed PSP payment. If its own optional policy/evidence
    // path fails, the Phase 2 sale ledger and entitlement stay authoritative
    // and the gap is made visible to finance operations.
    const calculationFee =
      input.providerFeeMinor !== null &&
      input.providerFeeMinor !== undefined &&
      input.providerFeeMinor >= 0n &&
      input.providerFeeMinor <= gross
        ? input.providerFeeMinor
        : null;
    try {
      await this.calculations.recordSale(manager, {
        paymentId: payment.id,
        orderId: payment.order_id,
        currency,
        occurredAt: input.occurredAt,
        providerFeeMinor: calculationFee,
        items: paid.map((item) => ({
          id: item.id,
          creatorId: item.creator_id_snapshot as string,
          total: item.total,
        })),
      });
    } catch (error) {
      await this.exceptions.record(manager, {
        kind: 'FINANCIAL_CALCULATION_EVIDENCE_FAILED',
        severity: 'P2',
        referenceType: 'payment',
        referenceId: payment.id,
        detail: {
          message: error instanceof Error ? error.message : 'unknown',
          phase: 'phase_4_calculation_evidence',
        },
      });
    }

    const fee = input.providerFeeMinor ?? null;
    if (fee === null) {
      businessEvent.info(
        'finance.gateway_fee.unknown',
        'Provider did not report a fee; none posted',
        { paymentId: payment.id },
      );
    } else if (fee < 0n || fee > gross) {
      await this.exceptions.record(manager, {
        kind: 'GATEWAY_FEE_INVALID',
        severity: 'P2',
        referenceType: 'payment',
        referenceId: payment.id,
        detail: { feeMinor: fee.toString(), grossMinor: gross.toString() },
      });
    } else if (fee > 0n) {
      await this.ledger.post(manager, {
        type: 'GATEWAY_FEE',
        currency,
        occurredAt: input.occurredAt,
        referenceType: 'payment',
        referenceId: payment.id,
        idempotencyKey: `gateway_fee:${payment.id}`,
        actorType: 'system',
        description: `Gateway fee borne by Mesh for payment ${payment.id}`,
        lines: [
          { account: 'GATEWAY_FEE_EXPENSE', side: 'D', amount: fee },
          { account: 'PSP_CLEARING', side: 'C', amount: fee },
        ],
      });
    }

    await this.receipts.issuePayment(manager, payment.id);
    await this.audit.record(manager, {
      actor: SYSTEM_ACTOR,
      action: 'finance.sale.posted',
      targetType: 'payment',
      targetId: payment.id,
      amountMinor: gross,
      currency,
      after: {
        commissionPolicy: commissionPolicy.id,
        holdingPolicy: holdingPolicy.id,
        entitlements: entitlementCount,
      },
      reference: `sale:${payment.id}`,
      ledgerTransactionId: posted.id,
    });
    paymentsTotal.inc({ outcome: 'posted' });
    return {
      status: 'POSTED',
      saleTransactionId: posted.id,
      entitlements: entitlementCount,
    };
  }
}
