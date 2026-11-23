import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { formatMinorToMajor, parseMajorToMinor } from './domain/money';

export const RECEIPT_DISCLAIMER_EN =
  'This is an internal payment receipt issued by Mesh. It is NOT a tax invoice (فاکتور رسمی / صورت‌حساب مالیاتی) and has no tax or legal effect.';
export const RECEIPT_DISCLAIMER_FA =
  'این سند «رسید داخلی پرداخت» میش است و فاکتور رسمی یا صورت‌حساب مالیاتی نیست و اعتبار مالیاتی یا قانونی ندارد.';

interface ReceiptRow {
  id: string;
  receipt_number: string;
  kind: 'PAYMENT' | 'REFUND';
  order_id: string;
  payment_id: string | null;
  refund_id: string | null;
  currency: string;
  amount_minor: string;
  snapshot: Record<string, unknown>;
  disclaimer: string;
  issued_at: Date;
}

/**
 * W8.4 — internal receipts. Immutable (database trigger), sequence-numbered,
 * and explicitly NOT a tax invoice.
 */
@Injectable()
export class ReceiptsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async issuePayment(manager: EntityManager, paymentId: string): Promise<void> {
    const rows = await manager.query<
      Array<{
        id: string;
        order_id: string;
        buyer_id: string;
        amount: string;
        currency_code: string;
        gateway: string;
        confirmed_at: Date;
        provider_payload: Record<string, unknown>;
      }>
    >(
      `SELECT p.id, p.order_id, o.buyer_id, p.amount::text AS amount, p.currency_code,
              p.gateway, p.confirmed_at, p.provider_payload
         FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1`,
      [paymentId],
    );
    const p = rows[0];
    if (!p) return;
    const minor = parseMajorToMinor(p.amount, p.currency_code);
    if (minor <= 0n) return;
    const items = await manager.query<
      Array<{
        agent_name_snapshot: string;
        agent_version_snapshot: string;
        quantity: number;
        unit_price: string;
        total: string;
      }>
    >(
      `SELECT agent_name_snapshot, agent_version_snapshot, quantity,
              unit_price::text AS unit_price, total::text AS total
         FROM order_items WHERE order_id = $1 ORDER BY created_at, id`,
      [p.order_id],
    );
    const snapshot = {
      orderId: p.order_id,
      paymentId: p.id,
      gateway: p.gateway,
      providerRef:
        typeof p.provider_payload?.providerRef === 'string'
          ? p.provider_payload.providerRef
          : null,
      paidAt: p.confirmed_at,
      total: formatMinorToMajor(minor, p.currency_code),
      items: items.map((i) => ({
        title: i.agent_name_snapshot,
        version: i.agent_version_snapshot,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        total: i.total,
      })),
    };
    await manager.query(
      `INSERT INTO internal_receipts
         (kind, order_id, payment_id, buyer_id, currency, amount_minor, snapshot, disclaimer)
       VALUES ('PAYMENT',$1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (payment_id) WHERE kind = 'PAYMENT' DO NOTHING`,
      [
        p.order_id,
        p.id,
        p.buyer_id,
        p.currency_code,
        minor.toString(),
        JSON.stringify(snapshot),
        `${RECEIPT_DISCLAIMER_FA}\n${RECEIPT_DISCLAIMER_EN}`,
      ],
    );
  }

  async issueRefund(
    manager: EntityManager,
    refundId: string,
    amountMinor: bigint,
  ): Promise<void> {
    const rows = await manager.query<
      Array<{
        id: string;
        order_id: string;
        payment_id: string | null;
        buyer_id: string;
        currency_code: string;
        reason: string;
        processed_at: Date | null;
      }>
    >(
      `SELECT r.id, r.order_id, r.payment_id, o.buyer_id, r.currency_code, r.reason, r.processed_at
         FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.id = $1`,
      [refundId],
    );
    const r = rows[0];
    if (!r || amountMinor <= 0n) return;
    await manager.query(
      `INSERT INTO internal_receipts
         (kind, order_id, payment_id, refund_id, buyer_id, currency, amount_minor, snapshot, disclaimer)
       VALUES ('REFUND',$1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (refund_id) WHERE kind = 'REFUND' DO NOTHING`,
      [
        r.order_id,
        r.payment_id,
        r.id,
        r.buyer_id,
        r.currency_code,
        amountMinor.toString(),
        JSON.stringify({
          orderId: r.order_id,
          refundId: r.id,
          refundedAmount: formatMinorToMajor(amountMinor, r.currency_code),
          processedAt: r.processed_at,
        }),
        `${RECEIPT_DISCLAIMER_FA}\n${RECEIPT_DISCLAIMER_EN}`,
      ],
    );
  }

  private view(row: ReceiptRow) {
    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      kind: row.kind,
      orderId: row.order_id,
      paymentId: row.payment_id,
      refundId: row.refund_id,
      currency: row.currency,
      amount: formatMinorToMajor(BigInt(row.amount_minor), row.currency),
      issuedAt: row.issued_at,
      isTaxInvoice: false,
      disclaimer: row.disclaimer,
      details: row.snapshot,
    };
  }

  async listForBuyer(buyerId: string) {
    const rows = await this.dataSource.query<ReceiptRow[]>(
      `SELECT id, receipt_number::text, kind, order_id, payment_id, refund_id, currency,
              amount_minor::text, snapshot, disclaimer, issued_at
         FROM internal_receipts WHERE buyer_id = $1
        ORDER BY issued_at DESC, id LIMIT 200`,
      [buyerId],
    );
    return rows.map((r) => this.view(r));
  }

  /** Ownership enforced in SQL: a receipt of someone else is "not found". */
  async getForBuyer(buyerId: string, receiptId: string) {
    const rows = await this.dataSource.query<ReceiptRow[]>(
      `SELECT id, receipt_number::text, kind, order_id, payment_id, refund_id, currency,
              amount_minor::text, snapshot, disclaimer, issued_at
         FROM internal_receipts WHERE id = $1 AND buyer_id = $2`,
      [receiptId, buyerId],
    );
    if (rows.length === 0) {
      throw new ApiException('NOT_FOUND', 'Receipt not found', 404);
    }
    return this.view(rows[0]);
  }

  async getForAdmin(receiptId: string) {
    const rows = await this.dataSource.query<ReceiptRow[]>(
      `SELECT id, receipt_number::text, kind, order_id, payment_id, refund_id, currency,
              amount_minor::text, snapshot, disclaimer, issued_at
         FROM internal_receipts WHERE id = $1`,
      [receiptId],
    );
    if (rows.length === 0) {
      throw new ApiException('NOT_FOUND', 'Receipt not found', 404);
    }
    return this.view(rows[0]);
  }
}
