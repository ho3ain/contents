/**
 * Buyer Account & Commerce UX — PURE helpers behind `GET /me/orders` and
 * `GET /me/orders/:id`.
 *
 * Order, payment, delivery (entitlement) and refund are FOUR different
 * states with four different tables; nothing here merges them. The list
 * filter groups ORDER statuses only, and the timeline is built from real
 * timestamps only — an event without a timestamp is not an event.
 */
import { OrderStatus } from '../../database/entities/commerce/order.entity';
import {
  refundTimeline,
  type RefundStatusValue,
  type RefundTimeline,
} from './refund-policy';

/** Buyer-facing filter groups of `orders.status` (frozen UX mapping). */
export const ORDER_STATUS_GROUPS = [
  'pending',
  'paid',
  'failed',
  'refunded',
] as const;
export type OrderStatusGroup = (typeof ORDER_STATUS_GROUPS)[number];

export const ORDER_STATUS_GROUP_MEMBERS: Record<
  OrderStatusGroup,
  OrderStatus[]
> = {
  pending: [OrderStatus.CREATED, OrderStatus.PENDING_PAYMENT],
  paid: [OrderStatus.PAID, OrderStatus.FULFILLED],
  failed: [OrderStatus.FAILED, OrderStatus.CANCELLED],
  refunded: [OrderStatus.REFUNDED],
};

export function orderStatusesOfGroup(
  group: OrderStatusGroup | undefined,
): OrderStatus[] | undefined {
  return group ? ORDER_STATUS_GROUP_MEMBERS[group] : undefined;
}

// ---------------------------------------------------------------- views --

export interface OrderPaymentView {
  id: string;
  gateway: string;
  /** Gateway reference the buyer can quote to support. */
  reference: string;
  status: string;
  amount: string;
  currencyCode: string;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface OrderRefundView {
  id: string;
  status: RefundStatusValue;
  reason: string;
  amount: string;
  currencyCode: string;
  requestedAt: Date;
  reviewStartedAt: Date | null;
  decidedAt: Date | null;
  /** Reviewer note shown to the buyer (approval / rejection explanation). */
  response: string | null;
  timeline: RefundTimeline;
}

export interface OrderEntitlementView {
  id: string;
  agentId: string;
  status: 'granted' | 'revoked';
  grantedAt: Date | null;
  revokedAt: Date | null;
}

export interface OrderReceiptView {
  id: string;
  receiptNumber: string;
  kind: 'PAYMENT' | 'REFUND';
  amount: string;
  currencyCode: string;
  issuedAt: Date;
  /** Always false — internal receipts are not tax invoices. */
  isTaxInvoice: false;
}

export type OrderTimelineEvent =
  | 'created'
  | 'paid'
  | 'fulfilled'
  | 'cancelled'
  | 'refund_requested'
  | 'refund_under_review'
  | 'refund_approved'
  | 'refund_rejected'
  | 'refund_processed'
  | 'refunded';

export interface OrderTimelineEntry {
  event: OrderTimelineEvent;
  at: Date;
  /** The refund the event belongs to, when it does. */
  refundId?: string;
}

export interface OrderTimelineInput {
  createdAt: Date;
  paidAt: Date | null;
  fulfilledAt: Date | null;
  cancelledAt: Date | null;
  refundedAt: Date | null;
  refunds: Array<{
    id: string;
    status: RefundStatusValue;
    requestedAt: Date;
    reviewStartedAt: Date | null;
    decidedAt: Date | null;
  }>;
}

/** Chronological, real-timestamp-only history of an order. */
export function buildOrderTimeline(
  input: OrderTimelineInput,
): OrderTimelineEntry[] {
  const entries: OrderTimelineEntry[] = [
    { event: 'created', at: input.createdAt },
  ];
  if (input.paidAt) entries.push({ event: 'paid', at: input.paidAt });
  if (input.fulfilledAt)
    entries.push({ event: 'fulfilled', at: input.fulfilledAt });
  if (input.cancelledAt)
    entries.push({ event: 'cancelled', at: input.cancelledAt });
  for (const refund of input.refunds) {
    entries.push({
      event: 'refund_requested',
      at: refund.requestedAt,
      refundId: refund.id,
    });
    if (refund.reviewStartedAt) {
      entries.push({
        event: 'refund_under_review',
        at: refund.reviewStartedAt,
        refundId: refund.id,
      });
    }
    if (refund.decidedAt) {
      entries.push({
        event:
          refund.status === 'rejected'
            ? 'refund_rejected'
            : refund.status === 'processed'
              ? 'refund_processed'
              : 'refund_approved',
        at: refund.decidedAt,
        refundId: refund.id,
      });
    }
  }
  if (input.refundedAt)
    entries.push({ event: 'refunded', at: input.refundedAt });
  // `created` is the origin of the order and always leads, whatever the
  // clock said (fixtures / imported orders may carry a later created_at).
  const [created, ...rest] = entries;
  return [created, ...rest.sort((a, b) => a.at.getTime() - b.at.getTime())];
}

export function toOrderRefundView(row: {
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
}): OrderRefundView {
  const decidedAt =
    row.processed_at ??
    (row.status === 'rejected' || row.status === 'approved'
      ? row.updated_at
      : null);
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    amount: row.amount,
    currencyCode: row.currency_code,
    requestedAt: row.created_at,
    reviewStartedAt: row.review_started_at,
    decidedAt,
    response: row.review_note,
    timeline: refundTimeline(row.status),
  };
}

/** Sum of decimal strings (amounts are `numeric(20,2)` text). */
export function sumAmounts(values: string[]): string {
  const totalMinor = values.reduce((acc, value) => {
    const [whole, fraction = ''] = value.split('.');
    const minor =
      BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2));
    return acc + minor;
  }, 0n);
  const whole = totalMinor / 100n;
  const fraction = (totalMinor % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}
