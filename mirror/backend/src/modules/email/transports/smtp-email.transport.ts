import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import {
  EmailTransport,
  EmailTransportSendResult,
  EmailTransportError,
  OutgoingEmail,
} from './email-transport';

const SMTP_TIMEOUT_MS = 15_000;

/** SMTP response codes that mean "do not retry this message". */
const PERMANENT_SMTP_CODES = new Set([
  500, 501, 502, 503, 504, 521, 530, 550, 551, 552, 553, 554, 556,
]);

/**
 * Real SMTP transport (Batch 10 — Phase 19) via nodemailer.
 *
 * - Configuration comes exclusively from the VALIDATED environment
 *   (SMTP_HOST/PORT/SECURE/USER/PASSWORD, EMAIL_FROM/FROM_NAME); partial
 *   configuration is a startup error.
 * - Failures are classified: permanent SMTP rejections (5xx/auth) never
 *   retry; network/timeout/4xx are transient and retry with backoff.
 * - Credentials are never logged — only safe error codes/classes.
 */
export class SmtpEmailTransport implements EmailTransport {
  readonly name = 'smtp';

  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.getOrThrow<string>('smtpHost');
    const port = config.getOrThrow<number>('smtpPort');
    const secure = config.getOrThrow<boolean>('smtpSecure');
    const user = config.getOrThrow<string>('smtpUser');
    const password = config.getOrThrow<string>('smtpPassword');
    const fromAddress = config.getOrThrow<string>('emailFrom');
    const fromName = config.getOrThrow<string>('emailFromName');

    this.from = `"${fromName}" <${fromAddress}>`;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
      connectionTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
    });
  }

  async send(email: OutgoingEmail): Promise<EmailTransportSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return { messageId: info.messageId ?? null };
    } catch (error) {
      throw this.classify(error);
    }
  }

  async verify(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.transporter.verify();
      return { ok: true, detail: 'smtp verify succeeded' };
    } catch (error) {
      const classified = this.classify(error);
      return { ok: false, detail: classified.code };
    }
  }

  private classify(error: unknown): EmailTransportError {
    const err = error as {
      code?: string;
      responseCode?: number;
      response?: string;
      message?: string;
    };
    const code = err?.code ?? err?.responseCode ?? 'UNKNOWN';
    const message =
      typeof err?.response === 'string' && err.response.length > 0
        ? err.response
        : (err?.message ?? 'SMTP submission failed');

    // Authentication or a definitive 5xx rejection: permanent.
    if (err?.code === 'EAUTH' || err?.responseCode === 535) {
      return new EmailTransportError(message, true, `smtp_auth_error`);
    }
    if (
      typeof err?.responseCode === 'number' &&
      PERMANENT_SMTP_CODES.has(err.responseCode)
    ) {
      return new EmailTransportError(message, true, `smtp_${err.responseCode}`);
    }
    // Network / timeout / transient 4xx: retryable.
    return new EmailTransportError(message, false, String(code));
  }
}
