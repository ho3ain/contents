import { ConfigService } from '@nestjs/config';
import {
  GatewayCreatePaymentInput,
  GatewayCreatePaymentResult,
  GatewayVerifyInput,
  GatewayVerifyResult,
  GatewayRejectedError,
  GatewayUnavailableError,
  PaymentGateway,
} from './payment-gateway.types';

/**
 * Zarinpal payment gateway (Batch 10 — Phase 18) — the real provider
 * integration for the IRR marketplace.
 *
 * Protocol (Zarinpal PG v4):
 *   1. `POST {base}/pg/v4/payment/request.json` with the server-persisted
 *      amount → returns an `authority`; the buyer is redirected to
 *      `{base}/pg/StartPay/{authority}`.
 *   2. The provider redirects the buyer back to OUR callback page with
 *      `Authority` + `Status` query parameters.
 *   3. `POST {base}/pg/v4/payment/verify.json` with merchant id + the
 *      PERSISTED amount + authority. code 100 = verified, 101 = already
 *      verified (idempotent), anything else = definitive failure. The
 *      amount sent to verify is ours, so a mismatched payment cannot be
 *      confirmed.
 *
 * Security invariants:
 *   - The merchant id is NEVER logged and never returned in raw fragments.
 *   - Network calls carry an AbortController timeout (default 15s).
 *   - Transport failures raise GatewayUnavailableError → the payment stays
 *     pending (indeterminate), never falsely failed.
 *   - `fetchImpl` is an injection seam for unit tests ONLY — production
 *     always uses the global fetch.
 */
export class ZarinpalGateway implements PaymentGateway {
  readonly name = 'zarinpal';

  private readonly merchantId: string | null;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    config: ConfigService,
    private readonly fetchImpl: typeof fetch = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => fetch(input, init),
  ) {
    this.merchantId = config.get<string | null>('zarinpalMerchantId') ?? null;
    this.baseUrl = (config.get<string>('zarinpalBaseUrl') ?? '').replace(
      /\/+$/,
      '',
    );
    this.timeoutMs = config.get<number>('zarinpalTimeoutMs') ?? 15000;
  }

  async createPayment(
    input: GatewayCreatePaymentInput,
  ): Promise<GatewayCreatePaymentResult> {
    const amount = this.toRialInteger(input.amount);
    const body = {
      merchant_id: this.requireMerchantId(),
      amount,
      callback_url: input.callbackUrl,
      description: input.description,
      metadata: {
        order_id: input.metadata.orderId,
        ...(input.metadata.email ? { email: input.metadata.email } : {}),
        ...(input.metadata.mobile ? { mobile: input.metadata.mobile } : {}),
      },
    };

    const json = await this.postJson('/pg/v4/payment/request.json', body);
    const data = (json?.data ?? {}) as Record<string, unknown>;
    const errors = json?.errors;
    const code = typeof data.code === 'number' ? data.code : -1;
    const authority =
      typeof data.authority === 'string' && data.authority.length > 0
        ? data.authority
        : null;

    if (code !== 100 || !authority) {
      // Provider definitively refused the initiation.
      throw new GatewayRejectedError(
        'Zarinpal refused the payment request',
        this.describeError(code, errors),
      );
    }

    return {
      authority,
      paymentUrl: `${this.baseUrl}/pg/StartPay/${authority}`,
      raw: this.sanitize({ code, authority, message: data.message }),
    };
  }

  async verifyPayment(input: GatewayVerifyInput): Promise<GatewayVerifyResult> {
    const amount = this.toRialInteger(input.amount);
    const body = {
      merchant_id: this.requireMerchantId(),
      amount,
      authority: input.authority,
    };

    const json = await this.postJson('/pg/v4/payment/verify.json', body);
    const data = (json?.data ?? {}) as Record<string, unknown>;
    const errors = json?.errors;
    // Zarinpal reports success under `data.code` but rejections under
    // `errors.code`. Reading only the first collapsed every provider error to
    // a synthetic -1, which both destroyed the reconciliation trail and made
    // an uninterpretable response indistinguishable from a real rejection.
    const code =
      typeof data.code === 'number' ? data.code : errorCodeOf(errors);

    if (code === 100 || code === 101) {
      return {
        outcome: code === 100 ? 'verified' : 'already_verified',
        code,
        message: typeof data.message === 'string' ? data.message : '',
        refId: safePrimitiveString(data.ref_id),
        raw: this.sanitize({ code, ref_id: data.ref_id }),
      };
    }

    if (code === null) {
      // The provider answered, but with neither a success code nor an error
      // code we can attribute. Indeterminate — never resolve it as a
      // rejection; the caller keeps the payment pending for reconciliation.
      return {
        outcome: 'unknown',
        code: 0,
        message: '',
        refId: null,
        raw: this.sanitize({ errors }),
      };
    }

    return {
      outcome: 'failed',
      code,
      message: typeof data.message === 'string' ? data.message : '',
      refId: null,
      raw: this.sanitize({ code, errors }),
    };
  }

  async ping(): Promise<{ ok: boolean; detail: string }> {
    if (!this.merchantId) {
      return { ok: false, detail: 'merchant id not configured' };
    }
    try {
      const response = await this.withTimeout((signal) =>
        this.fetchImpl(this.baseUrl, { method: 'GET', signal }),
      );
      return {
        ok: response.status < 500,
        detail: `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.name : 'unreachable',
      };
    }
  }

  // ---------------------------------------------------------------------

  private requireMerchantId(): string {
    if (!this.merchantId) {
      // Loud misconfiguration — never fabricate a session.
      throw new GatewayUnavailableError(
        'Zarinpal merchant id is not configured (ZARINPAL_MERCHANT_ID)',
      );
    }
    return this.merchantId;
  }

  /** numeric(20,2) string → integral Rial; fractional Rial is invalid. */
  private toRialInteger(amount: string): number {
    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw new GatewayRejectedError(
        `Unsupported payable amount "${amount}"`,
        'INVALID_AMOUNT',
      );
    }
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) > 1e-9) {
      throw new GatewayRejectedError(
        `Amount "${amount}" has a fractional Rial part`,
        'INVALID_AMOUNT',
      );
    }
    if (rounded > Number.MAX_SAFE_INTEGER) {
      throw new GatewayRejectedError(
        'Amount exceeds the supported range',
        'INVALID_AMOUNT',
      );
    }
    return rounded;
  }

  private async postJson(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ data?: unknown; errors?: unknown }> {
    let response: Response;
    try {
      response = await this.withTimeout((signal) =>
        this.fetchImpl(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
          signal,
        }),
      );
    } catch (error) {
      throw new GatewayUnavailableError(
        'Zarinpal API is unreachable',
        error instanceof Error ? error.name : String(error),
      );
    }

    if (response.status >= 500 || response.status === 429) {
      throw new GatewayUnavailableError(
        'Zarinpal API returned a transient error',
        `HTTP ${response.status}`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new GatewayUnavailableError(
        'Zarinpal API returned a malformed response',
        `HTTP ${response.status}`,
      );
    }
    return json ?? {};
  }

  private async withTimeout<T>(
    call: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await call(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Only allowlisted fields are ever persisted/logged. */
  private sanitize(fragment: Record<string, unknown>): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(fragment)) {
      if (
        ['code', 'message', 'authority', 'ref_id', 'fee', 'errors'].includes(
          key,
        )
      ) {
        output[key] = fragment[key];
      }
    }
    return output;
  }

  private describeError(code: number, errors: unknown): string {
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as { code?: unknown; message?: unknown };
      if (first && typeof first === 'object') {
        const errorCode = safePrimitiveString(first.code);
        return `code=${errorCode ?? String(code)} ${
          typeof first.message === 'string' ? first.message : ''
        }`.trim();
      }
    }
    return `code=${code}`;
  }
}

/**
 * Numeric provider error code, wherever the provider put it.
 *
 * Zarinpal has returned `errors` both as an object and as an array across
 * responses, so both shapes are read. `null` means "no attributable code",
 * which the caller must treat as indeterminate rather than as a rejection.
 */
function errorCodeOf(errors: unknown): number | null {
  // `Array.isArray` widens an `unknown` to `any[]`, so the element is read
  // through an explicitly typed view instead.
  const candidate: unknown = Array.isArray(errors)
    ? (errors as unknown[])[0]
    : errors;
  if (candidate && typeof candidate === 'object') {
    const code = (candidate as { code?: unknown }).code;
    if (typeof code === 'number') return code;
    if (typeof code === 'string' && /^-?\d+$/.test(code)) return Number(code);
  }
  return null;
}

/** Stringifies only primitives — never "[object Object]". */
function safePrimitiveString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
