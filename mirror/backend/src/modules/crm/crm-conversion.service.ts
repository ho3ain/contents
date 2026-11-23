import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { CrmEventsService } from './crm-events.service';
import { CREATOR_EVENTS } from './domain/events';

/** What the UI needs to know after pressing "send invite". */
export interface ConversionInviteResult {
  sent: boolean;
  /**
   * False when nothing was sent — either the lead has no email, or it already
   * converted. The API says so explicitly instead of returning a cheerful
   * 201 that lied.
   */
  reason?: 'already_converted' | 'no_email' | 'already_invited_today';
  referralCode: string;
}

/**
 * Phase C2 §12 — the CONVERSION INVITE.
 *
 * The rule this class exists to enforce: a human may INVITE a lead to
 * convert, and may do nothing else. They may not create a user, may not
 * create a creator profile, and may not flip the lead to "registered".
 *
 * Conversion itself stays exactly where C1 put it: event-driven, from the
 * real signup and the real onboarding. A button that manufactured an account
 * would produce a funnel that counts people who never showed up.
 *
 * Every invite is:
 *  - refused once the lead has actually converted (nothing left to invite),
 *  - rate-limited to one per lead per day (no inbox flooding on re-click),
 *  - recorded as an event + an audit row, and
 *  - carrying the lead's referral code, so a creator who sends this and the
 *    person signs up later is still credited for it.
 */
@Injectable()
export class CrmConversionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly events: CrmEventsService,
  ) {}

  async sendInvite(
    leadId: string,
    body: { channel: string; message?: string },
    actor: { id: string; email?: string | null },
  ): Promise<ConversionInviteResult> {
    const lead = await this.loadLead(leadId);
    const referralCode = this.referralCodeFor(lead);

    // 1. Already converted? There is nothing to invite.
    if (lead.userId || lead.creatorProfileId) {
      return { sent: false, reason: 'already_converted', referralCode };
    }

    // 2. A lost lead is not being invited — reopening is a deliberate act.
    if (lead.outcome === 'lost') {
      throw new ApiException(
        'VALIDATION_ERROR',
        'This lead is marked lost — reopen it first',
        HttpStatus.CONFLICT,
      );
    }

    // 3. No address means no email; saying so beats silently doing nothing.
    if (!lead.email) {
      return { sent: false, reason: 'no_email', referralCode };
    }

    // 4. One invite per day, so a double-click or a retry is harmless.
    const today = new Date().toISOString().slice(0, 10);
    const dedupKey = CrmEventsService.dedupKey(
      CREATOR_EVENTS.CONVERSION_INVITE_SENT,
      leadId,
      today,
    );
    const recorded = await this.events.recordSafe({
      eventName: CREATOR_EVENTS.CONVERSION_INVITE_SENT,
      leadId,
      actorId: actor.id,
      entityType: 'creator_lead',
      entityId: leadId,
      dedupKey,
      metadata: { channel: body.channel, referralCode },
    });
    if (!recorded) {
      return { sent: false, reason: 'already_invited_today', referralCode };
    }

    // The email layer never throws into the business flow — a transport
    // failure is recorded on the email row and retried there — so this call
    // is safe and its result does not need a try/catch.
    await this.email.enqueue({
      template: 'creator_conversion_invite',
      to: lead.email,
      data: {
        senderName: actor.email ?? undefined,
        message: body.message?.slice(0, 1000),
        referralCode,
        recipientName: lead.name ?? undefined,
      },
      relatedEntityType: 'creator_lead',
      relatedEntityId: leadId,
    });

    await this.audit.record({
      action: 'crm.conversion_invite_sent',
      entity: 'crm_lead',
      entityId: leadId,
      context: { actorId: actor.id },
      metadata: { channel: body.channel, referralCode },
    });

    return { sent: true, referralCode };
  }

  // ---- internals --------------------------------------------------------

  private async loadLead(leadId: string): Promise<{
    id: string;
    email: string | null;
    name: string | null;
    userId: string | null;
    creatorProfileId: string | null;
    outcome: string;
    source: string;
    campaign: string | null;
  }> {
    const [row] = await this.dataSource.query<
      Array<{
        id: string;
        email: string | null;
        name: string | null;
        userId: string | null;
        creatorProfileId: string | null;
        outcome: string;
        source: string;
        campaign: string | null;
      }>
    >(
      `SELECT "id", "email", "name", "user_id" AS "userId",
              "creator_profile_id" AS "creatorProfileId",
              "outcome", "source", "campaign"
         FROM "creator_leads"
        WHERE "id" = $1 AND "merged_into_id" IS NULL`,
      [leadId],
    );
    if (!row) {
      throw new ApiException(
        'NOT_FOUND',
        'Lead not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
  }

  /**
   * A stable, non-guessable code the person can also pass on manually.
   * It is derived from the lead id, so it exists before any signup and does
   * not need a column: a creator can copy it into a DM today and the same
   * code still resolves months later.
   */
  private referralCodeFor(lead: {
    id: string;
    source: string;
    campaign: string | null;
  }): string {
    return `lead-${lead.id.replace(/-/g, '').slice(0, 12)}`;
  }
}
