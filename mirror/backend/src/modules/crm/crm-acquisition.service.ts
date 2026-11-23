import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { CrmEventsService } from './crm-events.service';
import { CREATOR_EVENTS } from './domain/events';

/**
 * Phase C2 — the acquisition conversation.
 *
 * C1 could record that the team REACHED a lead. C2 adds the two facts that
 * actually decide whether a creator is worth onboarding: the person replied,
 * and the person said they are interested. Both are things only a human can
 * know, so both are recorded by a human — but they are recorded as EVENTS,
 * which is what keeps the funnel derived from evidence rather than edited by
 * hand (the C1 anti-fake rule, extended).
 *
 * This service deliberately owns no new tables. Every write here lands in the
 * `creator_growth_events` ledger that C1 already established and audits, so
 * the timeline, the attribution and the funnel all read one source of truth.
 */
@Injectable()
export class CrmAcquisitionService {
  constructor(
    private readonly events: CrmEventsService,
    private readonly audit: AuditService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Marks the lead as having replied.
   *
   * Idempotent by design: the dedup key is per-lead and per-day, so double
   * clicking the button, or a retry from a flaky network, records one fact
   * instead of polluting the timeline with duplicates. A second reply on a
   * later day is a genuinely new event and is kept.
   */
  async recordReply(
    leadId: string,
    body: { channel?: string; summary?: string },
    actorId: string,
  ): Promise<{ recorded: boolean }> {
    const summary = this.requireText(body.summary, 'Reply summary is required');
    const recorded = await this.recordStep(
      CREATOR_EVENTS.REPLIED,
      leadId,
      actorId,
      { channel: body.channel?.trim() || 'unknown', summary },
    );
    return { recorded };
  }

  /**
   * Marks the lead as interested. Interest implies a reply, so a lead that
   * skips the reply step is still moved to `replied` by the derived walk —
   * see the `contacted`/`replied` predicates in `domain/funnel.ts`.
   */
  async recordInterest(
    leadId: string,
    body: { channel?: string; summary?: string },
    actorId: string,
  ): Promise<{ recorded: boolean }> {
    const summary = this.requireText(body.summary, 'Summary is required');
    const recorded = await this.recordStep(
      CREATOR_EVENTS.INTERESTED,
      leadId,
      actorId,
      { channel: body.channel?.trim() || 'unknown', summary },
    );
    return { recorded };
  }

  /**
   * Closes a lead as lost (C2 §6).
   *
   * Losing is reversible in this domain: a lead that comes back to life must
   * not be stuck in a terminal state, so the same endpoint clears the flag
   * when called with `lost: false`. The stage itself is never rolled back —
   * the funnel keeps the furthest rung the person actually reached, which is
   * the only honest history.
   */
  async setLost(
    leadId: string,
    body: { lost: boolean; reason?: string },
    actorId: string,
  ): Promise<{ lost: boolean }> {
    if (typeof body.lost !== 'boolean') {
      throw new ApiException(
        'VALIDATION_ERROR',
        'lost must be a boolean',
        HttpStatus.BAD_REQUEST,
      );
    }
    // The reason is only meaningful when a lead is actually being dropped;
    // requiring it keeps "we lost them" from being a shrug with no signal.
    // Reopening needs none — the old reason is cleared, not overwritten.
    const reason = body.lost
      ? this.requireText(
          body.reason,
          'A reason is required when marking a lead as lost',
        )
      : 'reopened';

    const current = await this.currentOutcome(leadId);
    if (current.outcome === (body.lost ? 'lost' : 'active')) {
      return { lost: body.lost }; // already in the requested state
    }

    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.LOST,
      leadId,
      actorId,
      entityType: 'creator_lead',
      entityId: leadId,
      dedupKey: CrmEventsService.dedupKey(
        'crm.lost',
        leadId,
        body.lost ? 'lost' : 'reopened',
      ),
      metadata: { lost: body.lost, reason, previousOutcome: current.outcome },
    });

    // The event log explains WHY; this column is what the list filters and
    // the loss report counts. Both are written, and the CHECK constraint
    // keeps the two in agreement.
    await this.dataSource.query(
      `UPDATE "creator_leads"
          SET "outcome" = $2,
              "lost_reason" = $3,
              "lost_at" = $4,
              "updated_at" = now()
        WHERE "id" = $1`,
      [
        leadId,
        body.lost ? 'lost' : 'active',
        body.lost ? reason : null,
        body.lost ? new Date() : null,
      ],
    );
    await this.audit.record({
      action: body.lost ? 'crm.lost' : 'crm.reopened',
      entity: 'crm_lead',
      entityId: leadId,
      context: { actorId },
      metadata: { reason },
    });
    return { lost: body.lost };
  }

  // ---- internals --------------------------------------------------------

  /**
   * Writes one acquisition step and bumps the activity clock.
   *
   * The dedup key is stable for a given lead + step + calendar day, so the
   * method is safe to retry but still records a real second conversation the
   * next day.
   */
  private async recordStep(
    // Narrowed to the two acquisition steps so the audit action and the
    // event name can never drift apart: the audit trail is derived from the
    // very same value that was written to the ledger.
    eventName: typeof CREATOR_EVENTS.REPLIED | typeof CREATOR_EVENTS.INTERESTED,
    leadId: string,
    actorId: string,
    metadata: Record<string, unknown>,
  ): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const dedupKey = CrmEventsService.dedupKey(eventName, leadId, day);
    const recorded = await this.events.recordSafe({
      eventName,
      leadId,
      actorId,
      entityType: 'creator_lead',
      entityId: leadId,
      dedupKey,
      metadata,
    });
    if (recorded) {
      await this.audit.record({
        action: eventName,
        entity: 'crm_lead',
        entityId: leadId,
        context: { actorId },
        metadata,
      });
      // The activity clock is what the "inactive" filters sort on; a new
      // conversation has to move it or the lead will look abandoned.
      await this.events.recordSafe({
        eventName: CREATOR_EVENTS.LEAD_UPDATED,
        leadId,
        dedupKey: CrmEventsService.dedupKey('crm.touch', leadId, day),
        metadata: { touch: true },
      });
    }
    return recorded;
  }

  /**
   * Reads the lead's current outcome so the write is idempotent and so a
   * missing lead is a clean 404 rather than a foreign-key error.
   */
  private async currentOutcome(leadId: string): Promise<{ outcome: string }> {
    const [row] = await this.dataSource.query<
      Array<{ outcome: string | null }>
    >(`SELECT "outcome" FROM "creator_leads" WHERE "id" = $1`, [leadId]);
    if (!row) {
      throw new ApiException(
        'NOT_FOUND',
        'Lead not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return { outcome: row.outcome ?? 'active' };
  }

  private requireText(value: string | undefined, message: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new ApiException(
        'VALIDATION_ERROR',
        message,
        HttpStatus.BAD_REQUEST,
      );
    }
    return trimmed.slice(0, 300);
  }
}

/**
 * Phase C2 §12 — the referral relationship.
 *
 * A creator who brings in another creator is a real, measurable acquisition
 * channel, so the referrer is stored as a relation on the SAME lead row the
 * rest of the CRM already uses. There is no second table and no second funnel:
 * a referred lead is just a lead with a `referred_by_id`, and it counts in
 * every existing report.
 */
@Injectable()
export class CrmReferralService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly events: CrmEventsService,
  ) {}

  /**
   * Links (or clears) the referrer of a lead.
   *
   * Two things are rejected here that a plain FK would happily allow:
   *  - referring yourself, which would let a lead manufacture its own credit;
   *  - a referral CYCLE (A refers B refers A), which would make the referral
   *    tree non-terminating for any code that walks it. The cycle is checked
   *    by walking the existing chain, not by trusting the caller.
   */
  async setReferrer(
    leadId: string,
    referrerId: string | null,
    actorId: string,
  ): Promise<{ referredById: string | null }> {
    await this.assertLeadExists(leadId, 'Lead not found');

    if (referrerId === null) {
      await this.write(leadId, null, actorId, 'cleared');
      return { referredById: null };
    }
    if (referrerId === leadId) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A lead cannot refer itself',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertLeadExists(referrerId, 'Referrer lead not found');

    if (await this.wouldCreateCycle(leadId, referrerId)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'That referral would create a loop',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.write(leadId, referrerId, actorId, 'linked');
    return { referredById: referrerId };
  }

  /** The leads this lead referred — the other half of the relationship. */
  async referredLeads(
    leadId: string,
  ): Promise<Array<{ id: string; name: string | null; stage: string | null }>> {
    return this.dataSource.query(
      `SELECT l."id", l."name", l."outcome"
         FROM "creator_leads" l
        WHERE l."referred_by_id" = $1
        ORDER BY l."created_at" DESC
        LIMIT 200`,
      [leadId],
    );
  }

  // ---- internals --------------------------------------------------------

  private async write(
    leadId: string,
    referrerId: string | null,
    actorId: string,
    verb: 'linked' | 'cleared',
  ): Promise<void> {
    const [current] = await this.dataSource.query<
      Array<{ referred: string | null }>
    >(
      `SELECT "referred_by_id" AS referred FROM "creator_leads" WHERE "id" = $1`,
      [leadId],
    );
    if (current?.referred === referrerId) return; // already in this state

    await this.dataSource.query(
      `UPDATE "creator_leads"
          SET "referred_by_id" = $2, "updated_at" = now()
        WHERE "id" = $1`,
      [leadId, referrerId],
    );
    await this.audit.record({
      action: 'crm.referral_linked',
      entity: 'crm_lead',
      entityId: leadId,
      context: { actorId },
      metadata: { referredById: referrerId, verb },
    });
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.ATTRIBUTION_LINKED,
      leadId,
      actorId,
      entityType: 'creator_lead',
      entityId: leadId,
      dedupKey: CrmEventsService.dedupKey(
        'crm.referral',
        leadId,
        referrerId ?? 'none',
      ),
      metadata: { kind: 'referral', referredById: referrerId, verb },
    });
  }

  /**
   * Walks up from the prospective referrer. If we ever reach `leadId` the
   * link would close a loop. Bounded so a pre-existing corrupt chain cannot
   * hang the request.
   */
  private async wouldCreateCycle(
    leadId: string,
    referrerId: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<
      Array<{ referred_by_id: string | null }>
    >(
      `WITH RECURSIVE chain AS (
         SELECT "id", "referred_by_id", 1 AS depth
           FROM "creator_leads" WHERE "id" = $1
         UNION ALL
         SELECT l."id", l."referred_by_id", c.depth + 1
           FROM "creator_leads" l
           JOIN chain c ON l."id" = c."referred_by_id"
          WHERE c.depth < 50
       )
       SELECT "referred_by_id" FROM chain`,
      [referrerId],
    );
    return rows.some((row) => row.referred_by_id === leadId);
  }

  private async assertLeadExists(id: string, message: string): Promise<void> {
    const [row] = await this.dataSource.query<Array<{ one: number }>>(
      `SELECT 1 AS one FROM "creator_leads"
        WHERE "id" = $1 AND "merged_into_id" IS NULL`,
      [id],
    );
    if (!row) {
      throw new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
    }
  }
}
