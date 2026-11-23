/**
 * Phase C5 §7, §24, §38 — the reward and commission lifecycle.
 *
 * Reward (a creator's own referral reward) and commission (an affiliate's
 * earnings) are the same lifecycle with different labels, so they share one
 * state machine. Modelling them separately would guarantee that a bug fix to
 * one was never applied to the other, and would make "can this be paid twice?"
 * two different questions with the same answer.
 *
 *   pending → approved → available → paid
 *                 ↘ reversed
 *
 * The transitions are the whole security model of the money path, so they are
 * a pure function and a transition to a state that is not legal is a `null`
 * return rather than a throw. Callers treat `null` as "already done or not
 * allowed", which is what makes a double webhook harmless.
 */

export const REWARD_STATUSES = [
  'pending',
  'approved',
  'available',
  'paid',
  'reversed',
] as const;

export type RewardStatus = (typeof REWARD_STATUSES)[number];

/** The legal edges. Anything not listed here is not a transition. */
const TRANSITIONS: Record<RewardStatus, readonly RewardStatus[]> = {
  pending: ['approved', 'reversed'],
  approved: ['available', 'reversed'],
  available: ['paid', 'reversed'],
  // `paid` is terminal. A refund after payment is handled by recording a
  // REVERSAL against the ledger, not by moving the row backwards — a paid
  // row that silently became `reversed` would destroy the record that money
  // once left the platform.
  paid: [],
  // `reversed` is terminal too, and deliberately not reversible: an
  // administrator who reverses a fraudulent reward must not be able to undo
  // that decision with a second click and re-open the claim.
  reversed: [],
};

export function canTransition(from: RewardStatus, to: RewardStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * The next status, or `null` when the transition is illegal or the reward is
 * already in the target state.
 *
 * Returning the CURRENT status when asked for itself is what makes a repeated
 * request idempotent: `approve` twice returns `approved` both times and
 * creates no second ledger entry, whereas throwing would turn a network retry
 * into a 500 and push the client toward a manual reconciliation.
 */
export function nextRewardStatus(
  from: RewardStatus,
  to: RewardStatus,
): RewardStatus | null {
  if (from === to) return from;
  return canTransition(from, to) ? to : null;
}

/** Is this reward owed money? A reversed reward owes nothing, ever. */
export function isPayable(status: RewardStatus): boolean {
  return status === 'available' || status === 'paid';
}

/**
 * A reward may only be approved when it has a positive amount. A zero or
 * negative reward is either a configuration error or an attempt to create a
 * payable row that credits nothing, and both are refused at the domain layer
 * so no caller can skip the check.
 */
export function isRewardAmountValid(amount: number, currency: string): boolean {
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    Number.isInteger(amount) &&
    currency.trim().length >= 3
  );
}

/**
 * §23 — the commission rate applied to an order.
 *
 * Expressed in basis points (1% = 100 bps) so it is an integer in the
 * database and in the API. A float percentage is where money bugs live: 3% of
 * 33,333 is 999.99, and rounding it inconsistently between the ledger and
 * the dashboard is how a creator ends up seeing two different numbers.
 */
export function commissionFor(amountMinor: number, rateBps: number): number {
  if (!Number.isInteger(amountMinor) || !Number.isInteger(rateBps)) {
    throw new Error('commission inputs must be integers (minor units / bps)');
  }
  if (amountMinor < 0) throw new Error('commission base must not be negative');
  if (rateBps < 0) throw new Error('commission rate must not be negative');
  // Round HALF UP, not banker's rounding: a systematic 0.5-cent bias across
  // many commissions becomes a real, recurring mis-credit.
  return Math.floor((amountMinor * rateBps) / 10000 + 0.5);
}

/** Why a commission was refused. Every one is a real, named failure. */
export type CommissionBlockReason =
  | 'order_not_paid'
  | 'order_refunded'
  | 'order_cancelled'
  | 'self_referral'
  | 'fraud_held'
  | 'below_minimum';

export interface CommissionEligibilityInput {
  orderStatus: string;
  orderTotalMinor: number;
  refunded: boolean;
  selfReferral: boolean;
  fraudHeld: boolean;
  minimumMinor: number;
}

/**
 * §7/§25 — a commission is created only for a real, non-refunded purchase by
 * somebody other than the referrer. Returns the amount, or the reason.
 *
 * Returning a reason rather than a boolean is deliberate: the admin console
 * has to be able to answer "why did this referral earn nothing?", and a
 * boolean would force it to guess.
 */
export function evaluateCommission(
  input: CommissionEligibilityInput,
  rateBps: number,
): { amountMinor: number } | { blocked: CommissionBlockReason } {
  // The status check runs FIRST and covers cancellation: a cancelled order is
  // not 'paid' or 'fulfilled', so it is refused as `order_not_paid` before the
  // refund check is ever reached. An explicit `=== 'cancelled'` branch here
  // would be unreachable, and the compiler is right to say so.
  if (input.orderStatus !== 'paid' && input.orderStatus !== 'fulfilled') {
    return { blocked: 'order_not_paid' };
  }
  if (input.refunded) return { blocked: 'order_refunded' };
  if (input.selfReferral) return { blocked: 'self_referral' };
  // A held reward is not rejected — it waits for a human. §47.
  if (input.fraudHeld) return { blocked: 'fraud_held' };
  if (input.orderTotalMinor < input.minimumMinor)
    return { blocked: 'below_minimum' };

  const amountMinor = commissionFor(input.orderTotalMinor, rateBps);
  // A rate that rounds to zero is "below minimum", not a free commission row.
  if (amountMinor < input.minimumMinor) return { blocked: 'below_minimum' };
  return { amountMinor };
}

/**
 * The idempotency key for a commission.
 *
 * One order, one referrer, one kind of reward. A retried payment webhook, a
 * double-click on "apply", and a replayed message all produce the same string,
 * so a unique index on it makes duplicate creation impossible at the
 * database level rather than by hoping the caller checked first.
 */
export function commissionKey(input: {
  sourceId: string;
  orderId: string;
  kind: 'buyer_referral' | 'creator_referral' | 'affiliate';
}): string {
  return `${input.kind}:${input.sourceId}:${input.orderId}`;
}

/**
 * Currencies with no minor unit. The platform prices in IRR (tomans/rials
 * integers), where "minor units" would be a fiction: dividing by 100 would
 * silently make every order a hundredth of its real value and every reward
 * a hundredth of what the creator is owed.
 */
const ZERO_DECIMAL = new Set(['IRR', 'IRT', 'JPY', 'KRW', 'VND', 'CLP']);

/**
 * Convert a major-unit amount (`orders.amount`, 2 decimals) into the minor
 * units the reward engine works in.
 *
 * Deliberately currency-aware rather than a blanket `* 100`: the rounding
 * here decides how much real money a creator is paid, so it is stated once,
 * tested, and lives next to the other money rules instead of being inlined at
 * the call site.
 */
export function toMinorUnits(
  amountMajor: string | number,
  currency: string,
): number {
  const value =
    typeof amountMajor === 'number'
      ? amountMajor
      : Number.parseFloat(amountMajor);
  if (!Number.isFinite(value)) return 0;
  if (value < 0) throw new Error('order amount must not be negative');
  const normalized = currency.toUpperCase();
  return ZERO_DECIMAL.has(normalized)
    ? Math.round(value)
    : Math.round(value * 100);
}

/**
 * Format minor units for a human, grouped in the Persian way (٬ / thousands
 * separator) with no reliance on the runtime's ICU data.
 *
 * `toLocaleString` is not used deliberately: a trimmed Node build without
 * full ICU renders "250000" as "250000" for `fa-IR`, and a creator reading an
 * ungrouped payout figure is a support ticket. The grouping is part of the
 * money rules, so it is implemented and tested here.
 */
export function formatMinor(amountMinor: number, currency: string): string {
  const digits = Math.abs(Math.trunc(amountMinor)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return `${amountMinor < 0 ? '−' : ''}${grouped} ${currency}`;
}
