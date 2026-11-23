import {
  GatewayCreatePaymentInput,
  GatewayCreatePaymentResult,
  GatewayVerifyInput,
  GatewayVerifyResult,
  PaymentGateway,
} from './payment-gateway.types';

/**
 * Development/test gateway (Batch 10 — Phase 18).
 *
 * Models the provider contract with NO external service: sessions are
 * created locally and confirmed through the existing server-side
 * `POST /payments/confirm` (and the HMAC-signed webhook for failure
 * injection). It is refused at startup in production (env.validation) —
 * it can never silently stand in for a real provider.
 */
export class SandboxGateway implements PaymentGateway {
  readonly name = 'sandbox';

  createPayment(
    input: GatewayCreatePaymentInput,
  ): Promise<GatewayCreatePaymentResult> {
    return Promise.resolve({
      authority: `sbx_${crypto.randomUUID()}`,
      paymentUrl: null,
      raw: {
        mode: 'sandbox',
        note: 'development/test gateway — no external redirect',
        orderId: input.metadata.orderId,
      },
    });
  }

  verifyPayment(input: GatewayVerifyInput): Promise<GatewayVerifyResult> {
    // The sandbox has no external authority; confirmation is the
    // server-side sandbox confirm flow itself.
    return Promise.resolve({
      outcome: 'verified',
      code: 100,
      message: 'sandbox payment verified server-side',
      refId: null,
      raw: { mode: 'sandbox', amount: input.amount },
    });
  }

  ping(): Promise<{ ok: boolean; detail: string }> {
    return Promise.resolve({
      ok: true,
      detail: 'sandbox gateway (in-process, dev/test only)',
    });
  }
}
