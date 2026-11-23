import { RoundingMode } from './money';

/**
 * W2 / §28-29 — versioned financial policy.
 *
 * No financial constant (15 %, 14 days, 7 days …) is written in business
 * code. Each lives in a `finance_policies` row; every ledger transaction
 * stores the ids of the policy versions it used, so history is reproducible
 * after a policy changes.
 */
export const POLICY_KINDS = [
  'COMMISSION',
  'NET_SALES',
  'USAGE_CAP',
  'HOLDING',
  'REFUND',
  'PAYOUT',
  'KYC_ELIGIBILITY',
] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

export interface CommissionParams {
  rateBps: number;
  rounding: RoundingMode;
}

/**
 * Approved deductions from a sale's explicit net-sales basis. This is not a
 * tax engine and it intentionally has no rate/price defaults: a value may be
 * deducted only when a separately published policy permits the category and
 * the payment supplies an actual recorded amount.
 */
export interface NetSalesParams {
  allowedDeductions: Array<
    'discounts' | 'taxes_collected' | 'direct_processing_fees'
  >;
}
/** Optional platform safety ceilings. No row means no platform cap is declared. */
export interface UsageCapParams {
  maxExecutionsPerBuyer?: number;
  periodDays?: number;
  maxInputBytes?: number;
}
export interface HoldingParams {
  days: number;
}
export interface RefundParams {
  windowDays: number;
}
export interface PayoutParams {
  /** Automatic settlement: at most one automatic payout per this many days. */
  autoIntervalDays: number;
  /** A creator may request a payout at most once per this many days. */
  requestCooldownDays: number;
  /**
   * Automatic payouts are CREATED automatically but an admin still approves
   * them while the only payout rail is a manual bank transfer. Turning this
   * off is an explicit, versioned decision.
   */
  autoRequiresAdminApproval: boolean;
}
export interface KycEligibilityParams {
  payoutAllowedStates: string[];
}

export interface PolicyParamsByKind {
  COMMISSION: CommissionParams;
  NET_SALES: NetSalesParams;
  USAGE_CAP: UsageCapParams;
  HOLDING: HoldingParams;
  REFUND: RefundParams;
  PAYOUT: PayoutParams;
  KYC_ELIGIBILITY: KycEligibilityParams;
}

export interface PolicyRow<K extends PolicyKind = PolicyKind> {
  id: string;
  kind: K;
  version: number;
  scopeCurrency: string | null;
  params: PolicyParamsByKind[K];
  priority: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  status: 'ACTIVE' | 'RETIRED';
}

export class PolicyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyValidationError';
  }
}

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

/** Validates policy parameters. Throws PolicyValidationError. */
export function validatePolicyParams(
  kind: PolicyKind,
  params: unknown,
): PolicyParamsByKind[PolicyKind] {
  const p = (params ?? {}) as Record<string, unknown>;
  switch (kind) {
    case 'COMMISSION': {
      if (!isInt(p.rateBps, 0, 10_000)) {
        throw new PolicyValidationError('rateBps must be an integer 0..10000');
      }
      if (
        p.rounding !== 'HALF_UP' &&
        p.rounding !== 'DOWN' &&
        p.rounding !== 'UP'
      ) {
        throw new PolicyValidationError('rounding must be HALF_UP, DOWN or UP');
      }
      return { rateBps: p.rateBps, rounding: p.rounding };
    }
    case 'NET_SALES': {
      const allowed = p.allowedDeductions;
      const supported = [
        'discounts',
        'taxes_collected',
        'direct_processing_fees',
      ];
      if (
        !Array.isArray(allowed) ||
        !allowed.every(
          (entry) => typeof entry === 'string' && supported.includes(entry),
        )
      ) {
        throw new PolicyValidationError(
          'allowedDeductions must be an array containing only discounts, taxes_collected, or direct_processing_fees',
        );
      }
      return {
        allowedDeductions: [
          ...new Set(allowed),
        ] as NetSalesParams['allowedDeductions'],
      };
    }
    case 'USAGE_CAP': {
      const executions = p.maxExecutionsPerBuyer;
      const period = p.periodDays;
      const inputBytes = p.maxInputBytes;
      const hasExecution = executions !== undefined;
      if (!hasExecution && inputBytes === undefined) {
        throw new PolicyValidationError(
          'USAGE_CAP needs maxExecutionsPerBuyer or maxInputBytes',
        );
      }
      if (
        (hasExecution && !isInt(executions, 1, 1_000_000)) ||
        (!hasExecution && period !== undefined) ||
        (hasExecution && !isInt(period, 1, 366)) ||
        (inputBytes !== undefined && !isInt(inputBytes, 1, 1_048_576))
      ) {
        throw new PolicyValidationError(
          'USAGE_CAP limits must be positive integers; periodDays is required only with maxExecutionsPerBuyer',
        );
      }
      return {
        ...(hasExecution
          ? { maxExecutionsPerBuyer: executions, periodDays: period as number }
          : {}),
        ...(inputBytes !== undefined ? { maxInputBytes: inputBytes } : {}),
      };
    }
    case 'HOLDING': {
      if (!isInt(p.days, 0, 3650)) {
        throw new PolicyValidationError('days must be an integer 0..3650');
      }
      return { days: p.days };
    }
    case 'REFUND': {
      if (!isInt(p.windowDays, 0, 3650)) {
        throw new PolicyValidationError(
          'windowDays must be an integer 0..3650',
        );
      }
      return { windowDays: p.windowDays };
    }
    case 'PAYOUT': {
      if (!isInt(p.autoIntervalDays, 1, 3650)) {
        throw new PolicyValidationError(
          'autoIntervalDays must be an integer 1..3650',
        );
      }
      if (!isInt(p.requestCooldownDays, 0, 3650)) {
        throw new PolicyValidationError(
          'requestCooldownDays must be an integer 0..3650',
        );
      }
      if (typeof p.autoRequiresAdminApproval !== 'boolean') {
        throw new PolicyValidationError(
          'autoRequiresAdminApproval must be a boolean',
        );
      }
      return {
        autoIntervalDays: p.autoIntervalDays,
        requestCooldownDays: p.requestCooldownDays,
        autoRequiresAdminApproval: p.autoRequiresAdminApproval,
      };
    }
    case 'KYC_ELIGIBILITY': {
      const states = p.payoutAllowedStates;
      const known = [
        'NOT_STARTED',
        'SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
        'REJECTED',
        'SUSPENDED',
      ];
      if (
        !Array.isArray(states) ||
        states.length === 0 ||
        !states.every((s) => typeof s === 'string' && known.includes(s))
      ) {
        throw new PolicyValidationError(
          'payoutAllowedStates must be a non-empty list of KYC states',
        );
      }
      return { payoutAllowedStates: [...new Set(states as string[])] };
    }
  }
}

/**
 * The policy version in force at `at` for `kind` (and, when given, a
 * currency scope). Deterministic: highest priority, then latest
 * `effectiveFrom`, then highest version. A currency-specific rule beats the
 * unscoped one only through its priority — never implicitly.
 */
export function resolvePolicy<K extends PolicyKind>(
  rows: ReadonlyArray<PolicyRow>,
  kind: K,
  at: Date,
  currency?: string,
): PolicyRow<K> | null {
  const time = at.getTime();
  const candidates = rows.filter(
    (row) =>
      row.kind === kind &&
      row.status === 'ACTIVE' &&
      row.effectiveFrom.getTime() <= time &&
      (row.effectiveUntil === null || time < row.effectiveUntil.getTime()) &&
      (row.scopeCurrency === null ||
        (currency !== undefined && row.scopeCurrency === currency)),
  );
  candidates.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
      b.version - a.version,
  );
  return (candidates[0] as PolicyRow<K> | undefined) ?? null;
}
