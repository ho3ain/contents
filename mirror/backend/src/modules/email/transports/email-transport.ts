/**
 * Transactional email transport contract (Batch 10 — Phase 19, §16).
 *
 * Implementations: `console` (development/test — prints to the application
 * log) and `smtp` (SMTP submission via nodemailer). The transport is chosen
 * by the VALIDATED `emailTransport` config; production refuses to boot with
 * `console` (env.validation), so fake delivery can never stand in for the
 * real thing in production (§51).
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailTransportSendResult {
  messageId: string | null;
}

export class EmailTransportError extends Error {
  constructor(
    message: string,
    /** Permanent failures must not be retried forever (§22). */
    readonly permanent: boolean,
    /** Safe provider error code/class for logs and the delivery record. */
    readonly code: string,
  ) {
    super(message);
    this.name = 'EmailTransportError';
  }
}

export interface EmailTransport {
  readonly name: string;
  send(email: OutgoingEmail): Promise<EmailTransportSendResult>;
  /** Availability probe for the detailed health endpoint. */
  verify(): Promise<{ ok: boolean; detail: string }>;
}
