import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface WebhookFields {
  gateway: string;
  event: string;
  transactionId: string;
  amount: string;
  currency: string;
}

/**
 * Canonical, deterministic webhook payload signing for gateway callbacks.
 * A real payment provider adapter (Stripe-style signature headers) replaces
 * the canonicalization when a gateway is chosen; until then every webhook —
 * including the development sandbox — is signed with this scheme.
 */
@Injectable()
export class WebhookSignatureService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('paymentWebhookSecret');
  }

  sign(fields: WebhookFields): string {
    return createHmac('sha256', this.secret)
      .update(this.canonicalize(fields))
      .digest('hex');
  }

  verify(fields: WebhookFields, signature: string): boolean {
    if (!signature) return false;
    const expected = Buffer.from(this.sign(fields), 'hex');
    const provided = Buffer.from(signature, 'hex');
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }

  private canonicalize(fields: WebhookFields): string {
    return JSON.stringify({
      gateway: fields.gateway,
      event: fields.event,
      transactionId: fields.transactionId,
      amount: fields.amount,
      currency: fields.currency,
    });
  }
}
