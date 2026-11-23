import { splitSale } from './commission';
import type { CommissionParams, NetSalesParams } from './policy';

export type NetSalesDeduction =
  'discounts' | 'taxes_collected' | 'direct_processing_fees';

export interface NetSalesInput {
  grossMinor: bigint;
  /** Null means the value is unknown/not recorded; it is never treated as zero. */
  discountsMinor: bigint | null;
  taxesCollectedMinor: bigint | null;
  directProcessingFeesMinor: bigint | null;
  netSalesPolicy: NetSalesParams;
  commissionPolicy: CommissionParams;
}

export type NetSalesResult =
  | {
      status: 'CALCULATED';
      grossMinor: bigint;
      netSalesMinor: bigint;
      commissionMinor: bigint;
      creatorProceedsMinor: bigint;
      applied: Record<NetSalesDeduction, bigint | null>;
    }
  | {
      status: 'BLOCKED_UNKNOWN_DEDUCTION';
      grossMinor: bigint;
      missing: NetSalesDeduction[];
      applied: Record<NetSalesDeduction, bigint | null>;
    };

/**
 * Exact net-sales calculation. A deduction can reduce the basis only when an
 * approved NET_SALES policy lists it and a recorded non-negative value exists.
 * An unknown required amount blocks calculation rather than becoming zero.
 */
export function calculateNetSales(input: NetSalesInput): NetSalesResult {
  if (input.grossMinor < 0n) throw new Error('grossMinor must be non-negative');
  const applied: Record<NetSalesDeduction, bigint | null> = {
    discounts: input.discountsMinor,
    taxes_collected: input.taxesCollectedMinor,
    direct_processing_fees: input.directProcessingFeesMinor,
  };
  for (const value of Object.values(applied)) {
    if (value !== null && value < 0n) {
      throw new Error('net-sales deductions must be non-negative');
    }
  }

  const missing = input.netSalesPolicy.allowedDeductions.filter(
    (category) => applied[category] === null,
  );
  if (missing.length) {
    return {
      status: 'BLOCKED_UNKNOWN_DEDUCTION',
      grossMinor: input.grossMinor,
      missing,
      applied,
    };
  }

  const deductions = input.netSalesPolicy.allowedDeductions.reduce(
    (total, category) => total + (applied[category] ?? 0n),
    0n,
  );
  if (deductions > input.grossMinor) {
    throw new Error('approved deductions cannot exceed gross sales');
  }
  const netSalesMinor = input.grossMinor - deductions;
  const split = splitSale(netSalesMinor, input.commissionPolicy);
  return {
    status: 'CALCULATED',
    grossMinor: input.grossMinor,
    netSalesMinor,
    commissionMinor: split.commission,
    creatorProceedsMinor: split.creatorShare,
    applied,
  };
}
