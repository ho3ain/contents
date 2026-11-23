import { MoneyError, RoundingMode, mulDivRound } from './money';

/** Basis points: 1% = 100, so the frozen 15% policy is 1500. */
export const BPS_DENOMINATOR = 10_000n;

export interface CommissionTerms {
  /** Platform commission in basis points (an integer in [0, 10000]). */
  rateBps: number;
  rounding: RoundingMode;
}

function assertTerms(terms: CommissionTerms): void {
  if (
    !Number.isInteger(terms.rateBps) ||
    terms.rateBps < 0 ||
    terms.rateBps > 10_000
  ) {
    throw new MoneyError(
      'INVALID_AMOUNT',
      'Commission rate must be an integer number of basis points in [0, 10000]',
    );
  }
}

export interface SaleSplit {
  gross: bigint;
  /** Platform commission (what Mesh keeps from the sale). */
  commission: bigint;
  /** Creator entitlement = gross − commission (the remainder, so nothing is lost). */
  creatorShare: bigint;
}

/**
 * Gross → commission + creator entitlement. The gateway fee is NOT part of
 * this split: by frozen policy Mesh pays it, so it never reduces the
 * creator's entitlement (it is a platform cost, recorded separately).
 */
export function splitSale(gross: bigint, terms: CommissionTerms): SaleSplit {
  assertTerms(terms);
  if (gross < 0n)
    throw new MoneyError('NEGATIVE', 'Gross must not be negative');
  const commission = mulDivRound(
    gross,
    BigInt(terms.rateBps),
    BPS_DENOMINATOR,
    terms.rounding,
  );
  return { gross, commission, creatorShare: gross - commission };
}

/**
 * Cumulative commission that has been reversed once `refundedCumulative` of
 * the sale's gross has been refunded. Defined on the CUMULATIVE amount so a
 * sequence of partial refunds can never drift from a single refund of the
 * same total, and a full refund reverses the commission exactly.
 */
function commissionReversedAt(
  sale: SaleSplit,
  refundedCumulative: bigint,
): bigint {
  if (sale.gross === 0n) return 0n;
  if (refundedCumulative === sale.gross) return sale.commission;
  return mulDivRound(
    sale.commission,
    refundedCumulative,
    sale.gross,
    'HALF_UP',
  );
}

export interface RefundSplit {
  /** Gross handed back to the buyer by this refund. */
  refund: bigint;
  /** Part of the refund borne by the platform commission. */
  commissionPart: bigint;
  /** Part of the refund borne by the creator's entitlement. */
  creatorPart: bigint;
}

/**
 * How one refund of `refund` splits between platform and creator, given what
 * has already been refunded for the same sale. Deterministic; the parts add
 * up to the refund; over a whole sale they add up to the original split.
 */
export function splitRefund(
  sale: SaleSplit,
  alreadyRefunded: bigint,
  refund: bigint,
): RefundSplit {
  if (refund <= 0n) {
    throw new MoneyError('INVALID_AMOUNT', 'A refund must be positive');
  }
  if (alreadyRefunded < 0n) {
    throw new MoneyError('NEGATIVE', 'Already-refunded must not be negative');
  }
  const after = alreadyRefunded + refund;
  if (after > sale.gross) {
    throw new MoneyError(
      'INVALID_AMOUNT',
      'Refund exceeds the refundable amount of the sale',
    );
  }
  const commissionPart =
    commissionReversedAt(sale, after) -
    commissionReversedAt(sale, alreadyRefunded);
  return { refund, commissionPart, creatorPart: refund - commissionPart };
}
