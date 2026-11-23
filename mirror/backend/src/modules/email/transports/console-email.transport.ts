import { Logger } from '@nestjs/common';
import {
  EmailTransport,
  EmailTransportSendResult,
  OutgoingEmail,
} from './email-transport';

/**
 * Development/test transport (Batch 10 — Phase 19).
 *
 * Prints the message to the application log in the SAME stable format the
 * previous development sender used — browser/API e2e suites read verification
 * codes and reset tokens from this output. It is refused in production at
 * startup (env.validation): console delivery is a development affordance,
 * never a production implementation.
 */
export class ConsoleEmailTransport implements EmailTransport {
  readonly name = 'console';

  private readonly logger = new Logger('VerificationSenderService');

  send(email: OutgoingEmail): Promise<EmailTransportSendResult> {
    this.logger.warn(
      `[console email transport] to=${email.to} subject="${email.subject}"\n` +
        `${email.text}\n` +
        `Configure a real email transport (EMAIL_TRANSPORT=smtp) before deploying outside development.`,
    );
    return Promise.resolve({ messageId: null });
  }

  verify(): Promise<{ ok: boolean; detail: string }> {
    return Promise.resolve({
      ok: true,
      detail: 'console transport (dev/test only)',
    });
  }
}
