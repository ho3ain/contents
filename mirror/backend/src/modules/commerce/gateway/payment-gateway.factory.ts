import { ConfigService } from '@nestjs/config';
import { ZarinpalGateway } from './zarinpal.gateway';
import { SandboxGateway } from './sandbox.gateway';
import { PAYMENT_GATEWAY, PaymentGateway } from './payment-gateway.types';

/**
 * Builds the payment gateway from the VALIDATED environment
 * (`paymentProvider`: 'zarinpal' | 'sandbox'). Extracted as a standalone,
 * exported function so the environment→provider wiring is directly
 * unit-testable (Batch 10 — Phase 18).
 *
 * Production only ever selects what the environment says: there is no
 * fallback to a fake gateway. An unknown provider is a boot-time failure,
 * not a silent default.
 */
export function createPaymentGateway(config: ConfigService): PaymentGateway {
  const provider = config.getOrThrow<string>('paymentProvider');
  if (provider === 'zarinpal') {
    return new ZarinpalGateway(config);
  }
  if (provider === 'sandbox') {
    return new SandboxGateway();
  }
  throw new Error(
    `Unknown PAYMENT_PROVIDER "${provider}": expected "sandbox" or "zarinpal"`,
  );
}

export { PAYMENT_GATEWAY };
