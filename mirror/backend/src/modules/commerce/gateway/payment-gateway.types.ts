/**
 * Payment gateway contract (Batch 10 — Phase 18, §4).
 *
 * Provider-specific code lives BEHIND this interface. The commerce core
 * (checkout, confirm, webhook) only ever talks to a `PaymentGateway`;
 * switching providers means implementing this interface and selecting it
 * via PAYMENT_PROVIDER — no business logic changes.
 *
 * Confirmation model: the buyer is redirected to `paymentUrl` by the
 * provider and lands back on the frontend callback page, which asks the
 * backend to verify. The backend verifies with the provider SERVER-TO-SERVER
 * using its own persisted amount — a client returning from a provider URL
 * is never, by itself, treated as payment success (§12).
 */

export interface GatewayCreatePaymentInput {
  /** Canonical numeric string, major-unit Rial (IRR). Server-authoritative. */
  amount: string;
  currency: string;
  /** Server-configured frontend callback page (never client-supplied). */
  callbackUrl: string;
  description: string;
  metadata: {
    orderId: string;
    email?: string;
    mobile?: string;
  };
}

export interface GatewayCreatePaymentResult {
  /** Provider transaction reference — persisted as gateway_transaction_id. */
  authority: string;
  /** Where the buyer must be redirected. null when there is no external
   * redirect (development sandbox). */
  paymentUrl: string | null;
  /** Sanitized provider response fragment persisted in provider_payload. */
  raw: Record<string, unknown>;
}

export interface GatewayVerifyInput {
  /** The PERSISTED amount — the value the provider must match. */
  amount: string;
  authority: string;
}

export interface GatewayVerifyResult {
  /**
   * `failed` means the provider DEFINITIVELY rejected the payment.
   *
   * `unknown` means the provider answered but the answer could not be
   * interpreted as either success or rejection. The two must stay distinct:
   * recording an uninterpretable answer as a terminal failure can close an
   * order the buyer was actually charged for, so callers must keep such a
   * payment pending for reconciliation instead of resolving it.
   */
  outcome: 'verified' | 'already_verified' | 'failed' | 'unknown';
  code: number;
  message: string;
  /** Bank/provider reference for the receipt (e.g. Zarinpal ref_id). */
  refId: string | null;
  raw: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly name: string;
  createPayment(
    input: GatewayCreatePaymentInput,
  ): Promise<GatewayCreatePaymentResult>;
  verifyPayment(input: GatewayVerifyInput): Promise<GatewayVerifyResult>;
  /** Lightweight availability probe for the detailed health endpoint. */
  ping(): Promise<{ ok: boolean; detail: string }>;
}

/**
 * Provider unreachable / timed out / returned transport-level garbage.
 * The payment stays in a non-terminal state — the outcome is INDETERMINATE,
 * never "failed" (§11: provider timeout → safe failure/pending behavior).
 */
export class GatewayUnavailableError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'GatewayUnavailableError';
  }
}

/**
 * Provider answered with a definitive rejection of the initiation request.
 * Safe to persist as a failed initiation.
 */
export class GatewayRejectedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'GatewayRejectedError';
  }
}

/**
 * DI token for the active payment gateway. Lives here (not in the module)
 * so services can inject it without a circular import.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
