import { MoneyError } from './money';
import { PostingLine } from './ledger';
import { RefundSplit } from './commission';

export type EntitlementStatus = 'HELD' | 'RELEASED' | 'REFUNDED';

export interface RefundPlanInput {
  entitlementStatus: EntitlementStatus;
  split: RefundSplit;
  creatorId: string;
  /**
   * HELD only: what is still held for THIS sale (creator share minus the
   * creator part of earlier partial refunds). Reversal beyond it is a bug.
   */
  heldRemaining: bigint;
  /** RELEASED only: the creator's AVAILABLE balance, read under the balance lock. */
  availableBalance: bigint;
}

export interface RefundPlan {
  fromHeld: bigint;
  fromAvailable: bigint;
  /** Shortfall that becomes an explicit creator recovery (negative balance). */
  toRecovery: bigint;
  lines: PostingLine[];
}

/**
 * W4 — where the creator's part of a refund is taken from.
 *
 *  - Sale still HELD: the creator part leaves HELD (before it ever became
 *    available).
 *  - Sale RELEASED: the creator part leaves AVAILABLE, as far as AVAILABLE
 *    reaches. Whatever AVAILABLE cannot cover has already been paid out (or is
 *    reserved by an open payout), so it becomes an explicit RECOVERY receivable
 *    — never a negative AVAILABLE, never a mutated payout.
 *
 * The buyer side is credited to BUYER_REFUNDS_PAYABLE (money is handed back by
 * a separate, auditable disbursement: no PSP refund capability is assumed).
 */
export function planRefund(input: RefundPlanInput): RefundPlan {
  const { split, creatorId } = input;
  if (input.entitlementStatus === 'REFUNDED') {
    throw new MoneyError(
      'INVALID_AMOUNT',
      'The sale is already fully refunded',
    );
  }
  let fromHeld = 0n;
  let fromAvailable = 0n;
  let toRecovery = 0n;
  if (input.entitlementStatus === 'HELD') {
    if (split.creatorPart > input.heldRemaining) {
      throw new MoneyError(
        'INVALID_AMOUNT',
        'Refund would take more than is held for this sale',
      );
    }
    fromHeld = split.creatorPart;
  } else {
    fromAvailable =
      split.creatorPart < input.availableBalance
        ? split.creatorPart
        : input.availableBalance;
    toRecovery = split.creatorPart - fromAvailable;
  }
  const lines: PostingLine[] = [];
  if (fromHeld > 0n) {
    lines.push({
      account: 'CREATOR_HELD',
      side: 'D',
      amount: fromHeld,
      creatorId,
    });
  }
  if (fromAvailable > 0n) {
    lines.push({
      account: 'CREATOR_AVAILABLE',
      side: 'D',
      amount: fromAvailable,
      creatorId,
    });
  }
  if (toRecovery > 0n) {
    lines.push({
      account: 'CREATOR_RECOVERY',
      side: 'D',
      amount: toRecovery,
      creatorId,
      memo: 'refund exceeded the creator available balance',
    });
  }
  if (split.commissionPart > 0n) {
    lines.push({
      account: 'PLATFORM_COMMISSION',
      side: 'D',
      amount: split.commissionPart,
      creatorId,
    });
  }
  lines.push({
    account: 'BUYER_REFUNDS_PAYABLE',
    side: 'C',
    amount: split.refund,
    creatorId,
  });
  return { fromHeld, fromAvailable, toRecovery, lines };
}
