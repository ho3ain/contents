import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RefundRequestDto {
  @IsString()
  @MinLength(5, { message: 'reason must describe the problem' })
  @MaxLength(1000)
  reason: string;
}

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Signed gateway event as delivered by a payment provider (or the dev sandbox). */
export class GatewayEventDto {
  @IsString()
  @MaxLength(40)
  gateway: string;

  @IsString()
  @MaxLength(40)
  event: string;

  @IsString()
  @MaxLength(128)
  transactionId: string;

  @IsString()
  @Matches(AMOUNT_PATTERN, { message: 'amount must be a non-negative number' })
  amount: string;

  @IsString()
  @MaxLength(8)
  currency: string;

  @IsString()
  @MaxLength(128)
  signature: string;
}

export class SandboxConfirmDto {
  @IsString()
  @MaxLength(128)
  transactionId: string;
}

/**
 * Buyer returning from the gateway (Batch 10 — Phase 18). The backend
 * verifies with the provider server-side using the persisted amount — the
 * client's word is never payment success.
 */
export class PaymentConfirmDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  transactionId: string;

  @IsIn(['OK', 'NOK'], { message: 'status must be OK or NOK' })
  status: 'OK' | 'NOK';
}

export class AdminRefundDecisionDto {
  @IsIn(['approve', 'reject'], {
    message: 'decision must be approve or reject',
  })
  decision: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /**
   * Phase 2 — approve only PART of the requested refund (major units).
   * Supported for single-item orders; the buyer keeps the product.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,18}(\.\d{1,2})?$/, {
    message: 'amount must be a plain decimal number',
  })
  amount?: string;
}

export class AdminListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

/**
 * A5 §9 — optional checkout context (promotion attribution). Documentation
 * shape only: the controller reads it leniently (see `checkoutPromotionId`).
 */
export interface CheckoutContext {
  promotionId?: string;
  /**
   * Sprint 2 (P2-01) — the IRR amount the buyer reviewed on the order-review
   * page. When present and different from the listing's current price the
   * checkout is refused with 409 PRICE_CHANGED before any row is written.
   * Never used as the charged amount: the price authority stays the listing.
   */
  expectedAmount?: string;
}
