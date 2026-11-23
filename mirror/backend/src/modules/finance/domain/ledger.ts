import { createHash } from 'crypto';
import { MAX_MINOR, MoneyError, isSupportedCurrency } from './money';

/**
 * W1 — the chart of accounts and the pure ledger rules.
 *
 * One chart of accounts per currency. A CREATOR dimension on an entry
 * (`creatorId`) attributes the entry to a creator's sub-ledger: the creator
 * buckets are the balances of the CREATOR_* accounts filtered by that
 * dimension, so they are always derivable from the ledger and never need a
 * per-creator account row.
 */
export const ACCOUNT_CODES = [
  'PSP_CLEARING',
  'PLATFORM_CASH',
  'PLATFORM_COMMISSION',
  'GATEWAY_FEE_EXPENSE',
  'CREATOR_HELD',
  'CREATOR_AVAILABLE',
  'CREATOR_PAYOUT_PENDING',
  'CREATOR_RECOVERY',
  'BUYER_REFUNDS_PAYABLE',
] as const;
export type AccountCode = (typeof ACCOUNT_CODES)[number];

export type AccountType =
  'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type Side = 'D' | 'C';

export interface AccountDefinition {
  code: AccountCode;
  type: AccountType;
  normalSide: Side;
  title: string;
  /** The entry MUST carry a creator dimension. */
  requiresCreator: boolean;
  /**
   * May the derived balance be below zero? Only the cash account (money
   * leaves before provider settlements are imported) may.
   */
  allowNegative: boolean;
}

export const CHART_OF_ACCOUNTS: Readonly<
  Record<AccountCode, AccountDefinition>
> = Object.freeze({
  PSP_CLEARING: {
    code: 'PSP_CLEARING',
    type: 'ASSET',
    normalSide: 'D',
    title: 'Funds captured by the payment provider, due to Mesh',
    requiresCreator: false,
    allowNegative: false,
  },
  PLATFORM_CASH: {
    code: 'PLATFORM_CASH',
    type: 'ASSET',
    normalSide: 'D',
    title: 'Platform bank / cash (net external movements)',
    requiresCreator: false,
    allowNegative: true,
  },
  PLATFORM_COMMISSION: {
    code: 'PLATFORM_COMMISSION',
    type: 'REVENUE',
    normalSide: 'C',
    title:
      'Platform commission (accounting classification pending — see BLOCKERS)',
    requiresCreator: false,
    allowNegative: false,
  },
  GATEWAY_FEE_EXPENSE: {
    code: 'GATEWAY_FEE_EXPENSE',
    type: 'EXPENSE',
    normalSide: 'D',
    title: 'Payment gateway fees borne by Mesh',
    requiresCreator: false,
    allowNegative: false,
  },
  CREATOR_HELD: {
    code: 'CREATOR_HELD',
    type: 'LIABILITY',
    normalSide: 'C',
    title: 'Owed to creators — in the holding period',
    requiresCreator: true,
    allowNegative: false,
  },
  CREATOR_AVAILABLE: {
    code: 'CREATOR_AVAILABLE',
    type: 'LIABILITY',
    normalSide: 'C',
    title: 'Owed to creators — available for payout',
    requiresCreator: true,
    allowNegative: false,
  },
  CREATOR_PAYOUT_PENDING: {
    code: 'CREATOR_PAYOUT_PENDING',
    type: 'LIABILITY',
    normalSide: 'C',
    title: 'Owed to creators — reserved by an open payout',
    requiresCreator: true,
    allowNegative: false,
  },
  CREATOR_RECOVERY: {
    code: 'CREATOR_RECOVERY',
    type: 'ASSET',
    normalSide: 'D',
    title: 'Receivable from creators (refund after payout) — recovery payable',
    requiresCreator: true,
    allowNegative: false,
  },
  BUYER_REFUNDS_PAYABLE: {
    code: 'BUYER_REFUNDS_PAYABLE',
    type: 'LIABILITY',
    normalSide: 'C',
    title: 'Approved refunds not yet handed back to buyers',
    requiresCreator: false,
    allowNegative: false,
  },
});

export const TRANSACTION_TYPES = [
  'SALE',
  'GATEWAY_FEE',
  'RELEASE',
  'REFUND',
  'REFUND_DISBURSEMENT',
  'RECOVERY_OFFSET',
  'PAYOUT_RESERVE',
  'PAYOUT_RELEASE',
  'PAYOUT_PAID',
  'PSP_SETTLEMENT',
  'REVERSAL',
  'CORRECTION',
  'MIGRATION_OPENING',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export type ActorType = 'user' | 'admin' | 'system' | 'webhook';

export interface PostingLine {
  account: AccountCode;
  side: Side;
  /** Strictly positive minor units. */
  amount: bigint;
  /** Required for CREATOR_* accounts; allowed (and used for statements) elsewhere. */
  creatorId?: string | null;
  memo?: string;
}

export interface PostingRequest {
  type: TransactionType;
  currency: string;
  /** Business time (e.g. payment confirmation), not the insert time. */
  occurredAt: Date;
  referenceType: string;
  referenceId: string;
  /** The canonical identity of the financial event. Same key ⇒ same effect, once. */
  idempotencyKey: string;
  actorType: ActorType;
  actorId?: string | null;
  description: string;
  /** Ids of the policy versions used, by kind. */
  policyVersions?: Record<string, string>;
  metadata?: Record<string, unknown>;
  reversesTransactionId?: string | null;
  lines: PostingLine[];
}

export class LedgerRuleError extends Error {
  constructor(
    readonly code:
      | 'UNBALANCED'
      | 'TOO_FEW_LINES'
      | 'BAD_AMOUNT'
      | 'BAD_CURRENCY'
      | 'MISSING_CREATOR'
      | 'BAD_KEY'
      | 'UNKNOWN_ACCOUNT',
    message: string,
  ) {
    super(message);
    this.name = 'LedgerRuleError';
  }
}

/**
 * Validates everything about a posting that can be decided without the
 * database. The database re-checks the double-entry rule at commit with a
 * deferred constraint trigger, so a bug here cannot persist an unbalanced
 * transaction either.
 */
export function validatePosting(request: PostingRequest): void {
  if (!isSupportedCurrency(request.currency)) {
    throw new LedgerRuleError(
      'BAD_CURRENCY',
      `Unsupported currency "${request.currency}"`,
    );
  }
  if (!/^[A-Za-z0-9:_.-]{3,190}$/.test(request.idempotencyKey)) {
    throw new LedgerRuleError(
      'BAD_KEY',
      'idempotencyKey must be 3..190 characters of [A-Za-z0-9:_.-]',
    );
  }
  if (request.lines.length < 2) {
    throw new LedgerRuleError(
      'TOO_FEW_LINES',
      'A transaction needs at least two entries',
    );
  }
  let debit = 0n;
  let credit = 0n;
  for (const line of request.lines) {
    const definition = CHART_OF_ACCOUNTS[line.account] as
      AccountDefinition | undefined;
    if (!definition) {
      throw new LedgerRuleError(
        'UNKNOWN_ACCOUNT',
        `Unknown account ${line.account}`,
      );
    }
    if (
      typeof line.amount !== 'bigint' ||
      line.amount <= 0n ||
      line.amount > MAX_MINOR
    ) {
      throw new LedgerRuleError(
        'BAD_AMOUNT',
        'Every entry amount must be a positive bigint',
      );
    }
    if (definition.requiresCreator && !line.creatorId) {
      throw new LedgerRuleError(
        'MISSING_CREATOR',
        `${line.account} entries must carry a creator`,
      );
    }
    if (line.side === 'D') debit += line.amount;
    else if (line.side === 'C') credit += line.amount;
    else throw new LedgerRuleError('BAD_AMOUNT', 'Side must be D or C');
  }
  if (debit !== credit) {
    throw new LedgerRuleError(
      'UNBALANCED',
      `Σ debits (${debit}) ≠ Σ credits (${credit})`,
    );
  }
}

/** Stable digest of the economic content of a request (idempotency conflict detection). */
export function postingFingerprint(request: PostingRequest): string {
  const canonical = JSON.stringify({
    type: request.type,
    currency: request.currency,
    referenceType: request.referenceType,
    referenceId: request.referenceId,
    reverses: request.reversesTransactionId ?? null,
    lines: request.lines
      .map((l) => [l.account, l.side, l.amount.toString(), l.creatorId ?? null])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** The exact mirror of a posting: every entry on the opposite side. */
export function mirrorLines(lines: readonly PostingLine[]): PostingLine[] {
  return lines.map((line) => ({
    ...line,
    side: line.side === 'D' ? 'C' : 'D',
  }));
}

export interface EntryFact {
  account: AccountCode;
  side: Side;
  amount: bigint;
  creatorId: string | null;
}

/** Signed balance of a set of entries in the account's NORMAL direction. */
export function signedBalance(
  account: AccountCode,
  entries: readonly EntryFact[],
): bigint {
  const normal = CHART_OF_ACCOUNTS[account].normalSide;
  let total = 0n;
  for (const entry of entries) {
    if (entry.account !== account) continue;
    total += entry.side === normal ? entry.amount : -entry.amount;
  }
  return total;
}

export interface CreatorBuckets {
  held: bigint;
  available: bigint;
  payoutPending: bigint;
  /** Cumulative cash paid out to the creator (credits to PLATFORM_CASH tagged with the creator). */
  paid: bigint;
  /** Outstanding recovery payable (creator owes Mesh). */
  recovery: bigint;
}

/**
 * REPLAY: the creator's buckets recomputed from ledger entries alone. This is
 * the definition the projection is held against (W1.5 / W3.4).
 */
export function replayCreatorBuckets(
  creatorId: string,
  entries: readonly EntryFact[],
): CreatorBuckets {
  const mine = entries.filter((e) => e.creatorId === creatorId);
  const cashOut = mine.filter((e) => e.account === 'PLATFORM_CASH');
  // PLATFORM_CASH is an asset (debit-normal); money leaving is a CREDIT.
  const paid = -signedBalance('PLATFORM_CASH', cashOut);
  return {
    held: signedBalance('CREATOR_HELD', mine),
    available: signedBalance('CREATOR_AVAILABLE', mine),
    payoutPending: signedBalance('CREATOR_PAYOUT_PENDING', mine),
    paid,
    recovery: signedBalance('CREATOR_RECOVERY', mine),
  };
}

/** Σ debits and Σ credits of a set of entries (for the integrity checker). */
export function totals(
  entries: readonly Pick<EntryFact, 'side' | 'amount'>[],
): {
  debit: bigint;
  credit: bigint;
} {
  let debit = 0n;
  let credit = 0n;
  for (const entry of entries) {
    if (entry.side === 'D') debit += entry.amount;
    else credit += entry.amount;
  }
  return { debit, credit };
}

export { MoneyError };
