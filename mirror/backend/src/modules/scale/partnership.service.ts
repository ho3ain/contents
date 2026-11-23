import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Partnership } from '../../database/entities/scale/partnership.entity';
import { CreatorLead } from '../../database/entities/crm/creator-lead.entity';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { CrmEventsService } from '../crm/crm-events.service';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { CREATOR_EVENTS } from '../crm/domain/events';
import {
  nextPartnershipStage,
  partnershipWarning,
  partnerConversion,
  PARTNERSHIP_STAGE_RANK,
  type PartnershipStage,
  type PartnershipType,
  type AttributionMethod,
  type AgreementStatus,
} from './domain/partnership';

/**
 * Phase C5 §14–§18 — the partnership CRM.
 *
 * A partnership is an ORGANISATION relationship with a contract, and it is
 * built on C2's `creator_leads` rather than beside it (§2.4). A partner is,
 * at the start, a lead: somebody an admin is talking to. Re-entering their
 * name, email and website into a second table would give two records of the
 * same person that could disagree, which is the exact failure C2's audit
 * already had to guard against for lead merging.
 *
 * So `partnerships.lead_id` is the identity, and this table holds only what
 * is genuinely partnership-specific: pipeline stage, agreement state,
 * attribution method, contract dates, and the internal narrative.
 */
@Injectable()
export class PartnershipService {
  private readonly logger = new Logger(PartnershipService.name);

  constructor(
    @InjectRepository(Partnership)
    private readonly partnerships: Repository<Partnership>,
    @InjectRepository(CreatorLead)
    private readonly leads: Repository<CreatorLead>,
    private readonly dataSource: DataSource,
    private readonly crmEvents: CrmEventsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailService,
  ) {}

  /**
   * §15 — create a partnership for an EXISTING lead.
   *
   * Creating the lead here too would be convenient and wrong: a partnership is
   * not a lead, and importing them into one CRUD form is how a pipeline ends
   * up full of "partnerships" who were never contacted. The lead is created
   * by the C2 pipeline, and this attaches to it.
   */
  async create(
    leadId: string,
    input: {
      name: string;
      type: PartnershipType;
      ownerId?: string | null;
      attributionMethod?: AttributionMethod;
      notes?: string | null;
      internalNotes?: string | null;
      brings?: string;
    },
    adminUserId: string,
  ): Promise<{
    partnership: Partnership;
    created: boolean;
    blocked: string | null;
  }> {
    const existing = await this.partnerships.findOneBy({ leadId });
    if (existing)
      return {
        partnership: existing,
        created: false,
        blocked: 'already_exists',
      };

    const lead = await this.leads.findOneBy({ id: leadId });
    if (!lead) {
      return {
        partnership: null as unknown as Partnership,
        created: false,
        blocked: 'lead_not_found',
      };
    }

    const partnership = await this.partnerships.save(
      this.partnerships.create({
        leadId,
        name: input.name,
        type: input.type,
        stage: 'prospect',
        agreementStatus: 'none',
        ownerId: input.ownerId ?? null,
        attributionMethod: input.attributionMethod ?? 'referral_link',
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        brings: input.brings ?? 'both',
        code: await this.mintCode(),
      }),
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.C5_PARTNERSHIP_CREATED,
      entity: AUDIT_ENTITIES.PARTNERSHIP,
      entityId: partnership.id,
      metadata: { leadId, type: input.type, name: input.name },
      context: { actorId: adminUserId },
    });
    await this.crmEvents.recordSafe({
      leadId,
      eventName: CREATOR_EVENTS.PARTNERSHIP_CREATED,
      dedupKey: `c5:partnership:created:${partnership.id}`,
      actorId: adminUserId,
    });

    return { partnership, created: true, blocked: null };
  }

  /**
   * §16 — move through the pipeline.
   *
   * Illegal moves are refused with the state machine's verdict rather than
   * silently applied, and the refusal is distinguishable from a no-op so the
   * admin UI can say "that transition isn't allowed" instead of "saved".
   */
  async transition(
    partnershipId: string,
    to: PartnershipStage,
    adminUserId: string,
    options: {
      agreementStatus?: AgreementStatus;
      endDate?: string | null;
    } = {},
  ): Promise<{
    changed: boolean;
    blocked: string | null;
    partnership: Partnership | null;
  }> {
    const partnership = await this.partnerships.findOneBy({
      id: partnershipId,
    });
    if (!partnership)
      return { changed: false, blocked: 'not_found', partnership: null };

    const next = nextPartnershipStage(partnership.stage, to);
    if (next === null) {
      return { changed: false, blocked: 'illegal_transition', partnership };
    }
    if (next === partnership.stage) {
      // The agreement may still be moving even when the stage is not.
      const changed = await this.applyAgreement(
        partnership,
        options,
        adminUserId,
      );
      return { changed, blocked: 'already_in_state', partnership };
    }

    partnership.stage = next;
    if (next === 'active' && !partnership.startDate) {
      partnership.startDate = new Date();
    }
    if (options.agreementStatus)
      partnership.agreementStatus = options.agreementStatus;
    if (options.endDate !== undefined) {
      partnership.endDate = options.endDate ? new Date(options.endDate) : null;
    }
    await this.partnerships.save(partnership);

    await this.audit.record({
      action: AUDIT_ACTIONS.C5_PARTNERSHIP_STATUS_CHANGED,
      entity: AUDIT_ENTITIES.PARTNERSHIP,
      entityId: partnership.id,
      metadata: {
        from: next === to ? to : to,
        to,
        agreementStatus: partnership.agreementStatus,
      },
      context: { actorId: adminUserId },
    });

    // §40 — `partnership_converted`. In this model conversion IS the move to
    // `active` (a prospect becomes a live agreement); there is no separate
    // "converted" flag, and inventing one would be a second source of truth
    // for something the stage already says.
    if (next === 'active') {
      await this.crmEvents.recordSafe({
        leadId: partnership.leadId,
        eventName: CREATOR_EVENTS.PARTNERSHIP_CONVERTED,
        dedupKey: `c5:partnership:converted:${partnership.id}`,
        actorId: adminUserId,
        metadata: { stage: next, agreementStatus: partnership.agreementStatus },
      });

      // §34/§35 — a partnership going live is one of the six meaningful
      // events. Notified to the creator on the lead; the partner themselves
      // may not have an account, so the email goes to the lead's owner when
      // there is one.
      const owner = await this.dataSource
        .query<Array<{ user_id: string | null }>>(
          `SELECT user_id FROM creator_leads WHERE id = $1`,
          [partnership.leadId],
        )
        .then((rows) => rows[0]?.user_id ?? null)
        .catch(() => null);
      if (owner) {
        await this.notifications.notifyEventSafe(
          owner,
          NOTIFICATION_TYPES.C5_PARTNERSHIP_DECISION,
          { partnerName: partnership.name },
          { variant: 'granted', link: '/creator/scale/affiliate' },
        );
        await this.emails
          .enqueue({
            template: 'c5_partnership_update',
            userId: owner,
            data: { partnerName: partnership.name, status: partnership.stage },
            relatedEntityType: 'partnership',
            relatedEntityId: partnership.id,
          })
          .catch(() => null);
      }
    }

    return { changed: true, blocked: null, partnership };
  }

  private async applyAgreement(
    partnership: Partnership,
    options: { agreementStatus?: AgreementStatus; endDate?: string | null },
    adminUserId: string,
  ): Promise<boolean> {
    let changed = false;
    if (
      options.agreementStatus &&
      options.agreementStatus !== partnership.agreementStatus
    ) {
      partnership.agreementStatus = options.agreementStatus;
      changed = true;
    }
    if (options.endDate !== undefined) {
      partnership.endDate = options.endDate ? new Date(options.endDate) : null;
      changed = true;
    }
    if (changed) {
      await this.partnerships.save(partnership);
      await this.audit.record({
        action: AUDIT_ACTIONS.C5_PARTNERSHIP_STATUS_CHANGED,
        entity: AUDIT_ENTITIES.PARTNERSHIP,
        entityId: partnership.id,
        metadata: { agreementStatus: partnership.agreementStatus },
        context: { actorId: adminUserId },
      });
    }
    return changed;
  }

  /** §18 — per-partner performance, and §32's partnership block. */
  async analytics() {
    const rows = await this.dataSource.query<
      Array<{
        stage: string;
        agreement: string;
        n: string;
        leads: string;
        end_date: Date | null;
        name: string;
        id: string;
        code: string | null;
      }>
    >(
      `SELECT p.stage,
              p.agreement_status AS agreement,
              p.end_date,
              p.name,
              p.id,
              p.code,
              COUNT(l.id)::text AS leads
         FROM partnerships p
         LEFT JOIN creator_leads l ON l.referred_by_id = p.lead_id
        GROUP BY p.id
        ORDER BY p.created_at DESC`,
    );

    const now = new Date();
    const summary = {
      active: 0,
      total: rows.length,
      leads: 0,
      byStage: {} as Record<string, number>,
      warnings: [] as Array<{ id: string; name: string; warning: string }>,
    };

    for (const row of rows) {
      summary.byStage[row.stage] = (summary.byStage[row.stage] ?? 0) + 1;
      if (row.stage === 'active') summary.active += 1;
      summary.leads += Number.parseInt(row.leads, 10);
      // §15's contradictions are surfaced rather than normalised away. An
      // "active" partnership with a terminated agreement is a real state an
      // admin must see, and quietly repairing it would hide the problem.
      const warning = partnershipWarning(
        row.stage as PartnershipStage,
        row.agreement as AgreementStatus,
        row.end_date,
        now,
      );
      if (warning)
        summary.warnings.push({ id: row.id, name: row.name, warning });
    }

    return {
      ...summary,
      stageOrder: Object.entries(PARTNERSHIP_STAGE_RANK)
        .sort((a, b) => a[1] - b[1])
        .map(([stage]) => stage),
    };
  }

  /** §18 — one partner's numbers, with a `null` conversion when untrafficked. */
  async performance(partnershipId: string) {
    const partnership = await this.partnerships.findOneBy({
      id: partnershipId,
    });
    if (!partnership) return null;

    // The partner is the LEAD. `owner_id` is an internal MESH user who owns
    // the relationship and is nullable — selecting referrals by it always
    // matched nothing, so every partnership reported 0 clicks and 0 revenue
    // no matter how much it actually brought.
    const clicks = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n
         FROM creator_referrals cr
         JOIN creator_leads l ON l.referred_by_id = cr.referrer_user_id
        WHERE l.id = (SELECT lead_id FROM partnerships WHERE id = $1)
          AND cr.referral_kind = 'buyer'
          AND cr.registered_at IS NOT NULL`,
      [partnershipId],
    );
    const conversions = await this.dataSource.query<
      Array<{ n: string; revenue: string }>
    >(
      `SELECT COUNT(*)::text AS n, COALESCE(SUM(cr.attributed_revenue_minor), 0)::text AS revenue
         FROM creator_referrals cr
         JOIN creator_leads l ON l.referred_by_id = cr.referrer_user_id
        WHERE l.id = (SELECT lead_id FROM partnerships WHERE id = $1)
          AND cr.referral_kind = 'buyer'
          AND cr.registered_at IS NOT NULL
          AND cr.attributed_revenue_minor > 0`,
      [partnershipId],
    );
    const leads = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n FROM creator_leads WHERE referred_by_id = $1`,
      [partnershipId],
    );

    const clickCount = Number.parseInt(clicks[0]?.n ?? '0', 10);
    return {
      partnership: {
        id: partnership.id,
        name: partnership.name,
        stage: partnership.stage,
        agreementStatus: partnership.agreementStatus,
        code: partnership.code,
        attributionMethod: partnership.attributionMethod,
        clickCount: partnership.clickCount,
      },
      clicks: clickCount,
      leads: Number.parseInt(leads[0]?.n ?? '0', 10),
      conversions: Number.parseInt(conversions[0]?.n ?? '0', 10),
      revenueMinor: Number.parseInt(conversions[0]?.revenue ?? '0', 10),
      conversionRate: partnerConversion(
        clickCount,
        Number.parseInt(conversions[0]?.n ?? '0', 10),
      ),
    };
  }

  private async mintCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = `pt${Math.random().toString(36).slice(2, 10)}`;
      const taken = await this.partnerships.findOneBy({ code: candidate });
      if (!taken) return candidate;
    }
    throw new Error('could not mint a unique partnership code');
  }
}
