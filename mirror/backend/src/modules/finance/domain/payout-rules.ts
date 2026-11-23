/**
 * W5 / W6 — payout eligibility, as a PURE function.
 *
 * The same function decides at request time, at approval and at settlement;
 * the service additionally re-reads every input under the creator's balance
 * lock, so this is never evaluated on stale data.
 */
export type KycState =
  | 'NOT_STARTED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export type PayoutIneligibleReason =
  | 'KYC_NOT_APPROVED'
  | 'NO_BANK_ACCOUNT'
  | 'BANK_ACCOUNT_INACTIVE'
  | 'FINANCIAL_HOLD'
  | 'OPEN_PAYOUT_EXISTS'
  | 'NOTHING_PAYABLE'
  | 'AMOUNT_EXCEEDS_PAYABLE'
  | 'COOLDOWN_ACTIVE'
  | 'AUTO_INTERVAL_NOT_ELAPSED'
  | 'INVALID_AMOUNT';

export interface PayoutEligibilityInput {
  kind: 'MANUAL' | 'AUTOMATIC';
  kycState: KycState;
  kycAllowedStates: readonly string[];
  hasActiveBankAccount: boolean;
  bankAccountExists: boolean;
  financialHold: boolean;
  openPayoutExists: boolean;
  available: bigint;
  recovery: bigint;
  /** `null` = take everything payable. */
  requested: bigint | null;
  now: Date;
  /** Time of the creator's last non-voided payout of THIS kind. */
  lastSameKindAt: Date | null;
  cooldownDays: number;
  autoIntervalDays: number;
}

export interface PayoutEligibility {
  eligible: boolean;
  reasons: PayoutIneligibleReason[];
  /** Recovery that must be offset against AVAILABLE first (never more than AVAILABLE). */
  recoveryOffset: bigint;
  /** AVAILABLE − offset: the most that may be reserved. */
  payable: bigint;
  /** The amount that would be reserved (0 when ineligible). */
  amount: bigint;
  /** When a time rule blocks, when it clears. */
  nextEligibleAt: Date | null;
}

const DAY_MS = 86_400_000;

export function evaluatePayoutEligibility(
  input: PayoutEligibilityInput,
): PayoutEligibility {
  const reasons: PayoutIneligibleReason[] = [];
  if (!input.kycAllowedStates.includes(input.kycState)) {
    reasons.push('KYC_NOT_APPROVED');
  }
  if (!input.bankAccountExists) reasons.push('NO_BANK_ACCOUNT');
  else if (!input.hasActiveBankAccount) reasons.push('BANK_ACCOUNT_INACTIVE');
  if (input.financialHold) reasons.push('FINANCIAL_HOLD');
  if (input.openPayoutExists) reasons.push('OPEN_PAYOUT_EXISTS');

  let nextEligibleAt: Date | null = null;
  if (input.lastSameKindAt) {
    const days =
      input.kind === 'MANUAL' ? input.cooldownDays : input.autoIntervalDays;
    const until = new Date(input.lastSameKindAt.getTime() + days * DAY_MS);
    if (input.now.getTime() < until.getTime()) {
      reasons.push(
        input.kind === 'MANUAL'
          ? 'COOLDOWN_ACTIVE'
          : 'AUTO_INTERVAL_NOT_ELAPSED',
      );
      nextEligibleAt = until;
    }
  }

  const recoveryOffset =
    input.recovery < input.available ? input.recovery : input.available;
  const payable = input.available - recoveryOffset;
  if (payable <= 0n) reasons.push('NOTHING_PAYABLE');

  let amount = 0n;
  if (input.requested !== null) {
    if (input.requested <= 0n) reasons.push('INVALID_AMOUNT');
    else if (input.requested > payable) reasons.push('AMOUNT_EXCEEDS_PAYABLE');
    else amount = input.requested;
  } else {
    amount = payable;
  }
  const eligible = reasons.length === 0 && amount > 0n;
  return {
    eligible,
    reasons,
    recoveryOffset,
    payable,
    amount: eligible ? amount : 0n,
    nextEligibleAt,
  };
}
