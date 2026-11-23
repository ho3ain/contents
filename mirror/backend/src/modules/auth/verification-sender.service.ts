import { Injectable } from '@nestjs/common';
import { EmailService } from '../email/email.service';

/**
 * Delivers verification codes and reset tokens to the user (Batch 10 —
 * Phase 19 rework).
 *
 * All messages now flow through the transactional email subsystem: the
 * locale comes from the user's stored preference (fa/en), the message is
 * rendered from the localized template registry, and delivery state is
 * persisted + retried by EmailService. The development `console` transport
 * keeps printing codes to the application log (the documented development
 * affordance e2e tooling relies on); production boots with SMTP only.
 */
@Injectable()
export class VerificationSenderService {
  constructor(private readonly emails: EmailService) {}

  async sendEmailVerificationCode(
    userId: string,
    email: string,
    code: string,
  ): Promise<void> {
    await this.emails.enqueue({
      template: 'email_verification_code',
      data: { code },
      userId,
      to: email,
      relatedEntityType: 'user_verification',
    });
  }

  /**
   * Password reset CODE (AUTH upgrade): the 6-digit code replaces the old
   * long token — same delivery pipeline, no raw secret is ever displayed by
   * the backend or logged.
   */
  async sendPasswordResetCode(
    userId: string,
    email: string,
    code: string,
  ): Promise<void> {
    await this.emails.enqueue({
      template: 'password_reset',
      data: { code },
      userId,
      to: email,
      relatedEntityType: 'user_verification',
    });
  }
}
