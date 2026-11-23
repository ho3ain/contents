import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { CreatorAttribution } from '../../database/entities/crm/creator-attribution.entity';
import { CreatorLead } from '../../database/entities/crm/creator-lead.entity';
import {
  normalizeEmail,
  normalizeDomain,
  sourceFromUtm,
} from './domain/taxonomy';
import { CREATOR_EVENTS } from './domain/events';
import { CrmEventsService } from './crm-events.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CaptureAttributionInput {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  /** Anonymous, client-generated id — hashed before it is stored. */
  visitorId?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Bounded, trimmed free text — the table is a marketing fact table, not a CMS. */
function bounded(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Phase C1 — first-party attribution (spec §7).
 *
 * The persistence problem the spec calls out: a creator lands today,
 * registers three days later, and the campaign must not be lost. We solve it
 * with a self-hosted capture instead of a third-party cookie:
 *
 *   1. A landing with UTM params calls the PUBLIC capture endpoint.
 *   2. The server upserts one row per salted visitor hash and returns its id.
 *   3. The browser stores only that id in a first-party cookie.
 *   4. On register/login the id is sent back and the row is linked to the
 *      user AND copied onto the lead (once, and never overwritten).
 *
 * The visitor key is a SHA-256 of salt|identity — the same approach the
 * existing analytics recorder uses, so no raw IP or user agent is ever
 * written to disk.
 */
@Injectable()
export class CrmAttributionService {
  private readonly logger = new Logger(CrmAttributionService.name);

  constructor(
    @InjectRepository(CreatorAttribution)
    private readonly attributionsRepository: Repository<CreatorAttribution>,
    @InjectRepository(CreatorLead)
    private readonly leadsRepository: Repository<CreatorLead>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly events: CrmEventsService,
  ) {}

  /** Salted one-way visitor identity — same construction as analytics. */
  visitorKey(input: {
    visitorId?: string | null;
    userId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): string {
    const salt = this.config.get<string>('analyticsSalt') ?? 'analytics';
    const identity = input.userId
      ? `u:${input.userId}`
      : input.visitorId && UUID_RE.test(input.visitorId)
        ? `v:${input.visitorId.toLowerCase()}`
        : `n:${input.ip ?? ''}|${input.userAgent ?? ''}`;
    return createHash('sha256').update(`${salt}|${identity}`).digest('hex');
  }

  /**
   * Records/refreshes one capture. Idempotent per visitor: repeated calls
   * bump `touch_count` and `last_seen_at` but never create a second row and
   * never overwrite the ORIGINAL utm set (first touch wins — the standard
   * and the only honest attribution model here).
   */
  async capture(input: CaptureAttributionInput): Promise<CreatorAttribution> {
    const visitorKey = this.visitorKey(input);
    const now = new Date();
    const source = sourceFromUtm(bounded(input.utmSource, 64));
    const row = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO creator_attributions
         (visitor_key, source, medium, campaign, content, term,
          landing_page, referrer, touch_count, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9)
       ON CONFLICT (visitor_key) DO UPDATE
         SET touch_count = creator_attributions.touch_count + 1,
             last_seen_at = $9
       RETURNING id`,
      [
        visitorKey,
        input.utmSource ? source : null,
        bounded(input.utmMedium, 64),
        bounded(input.utmCampaign, 120),
        bounded(input.utmContent, 120),
        bounded(input.utmTerm, 120),
        bounded(input.landingPage, 500),
        bounded(input.referrer, 500),
        now,
      ],
    );
    const id = row[0]?.id;
    if (!id) throw new Error('attribution capture returned no id');
    const created = await this.attributionsRepository.findOneOrFail({
      where: { id },
    });
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.ATTRIBUTION_CAPTURED,
      dedupKey: CrmEventsService.dedupKey('crm.attribution_captured', id),
      metadata: { attributionId: id, source: created.source },
    });
    return created;
  }

  /**
   * Links a capture to a user and, when the user has (or gets) a lead,
   * copies the attribution onto it. Called from the registration path.
   *
   * FIRST-TOUCH WINS: a lead that already carries a campaign is never
   * overwritten, so attribution cannot drift as the person browses.
   */
  async linkToUser(
    attributionId: string,
    user: { id: string; email: string | null; phone: string | null },
  ): Promise<{
    attribution: CreatorAttribution | null;
    leadId: string | null;
  }> {
    if (!UUID_RE.test(attributionId))
      return { attribution: null, leadId: null };
    return this.dataSource.transaction(async (manager) => {
      const attribution = await manager.findOne(CreatorAttribution, {
        where: { id: attributionId },
      });
      if (!attribution) return { attribution: null, leadId: null };

      if (attribution.userId !== user.id) {
        await manager.update(
          CreatorAttribution,
          { id: attributionId },
          { userId: user.id, convertedAt: new Date() },
        );
      }

      const lead = await this.resolveOrCreateLeadForUser(
        user,
        manager,
        attribution,
      );
      if (lead) {
        await this.events.recordSafe(
          {
            eventName: CREATOR_EVENTS.ATTRIBUTION_LINKED,
            leadId: lead.id,
            userId: user.id,
            creatorProfileId: lead.creatorProfileId,
            dedupKey: CrmEventsService.dedupKey(
              'crm.attribution_linked',
              attributionId,
            ),
            metadata: { attributionId, campaign: attribution.campaign },
          },
          manager,
        );
      }
      return { attribution, leadId: lead?.id ?? null };
    });
  }

  /**
   * Identity resolution (spec §6).
   *
   * "نباید یک فرد با Lead / User / Creator به‌صورت سه فرد مختلف نمایش داده
   *  شود." So signup never creates a second row: it finds the open lead by
   * normalized email (then phone), links it to the user, and only creates a
   * lead when there genuinely is none.
   */
  async resolveOrCreateLeadForUser(
    user: { id: string; email: string | null; phone: string | null },
    manager: EntityManager,
    attribution?: CreatorAttribution | null,
  ): Promise<CreatorLead | null> {
    // 1) A lead already linked to this exact user wins.
    const byUser = await manager.findOne(CreatorLead, {
      where: { userId: user.id, mergedIntoId: IsNull() },
    });
    if (byUser) return byUser;

    // 2) Otherwise match on normalized email, then phone.
    const email = normalizeEmail(user.email);
    let found: CreatorLead | null = null;
    if (email) {
      found = await manager
        .createQueryBuilder(CreatorLead, 'lead')
        .where('lead.mergedIntoId IS NULL')
        .andWhere('lower(lead.email) = :email', { email })
        .getOne();
    }
    if (!found && user.phone) {
      found = await manager.findOne(CreatorLead, {
        where: { phone: user.phone, mergedIntoId: IsNull() },
      });
    }
    if (!found) {
      // 3) No prior lead: create one so attribution has somewhere to land.
      found = manager.create(CreatorLead, {
        userId: user.id,
        email,
        phone: user.phone,
        name: null,
        source: 'other',
        firstContactAt: new Date(),
        lastActivityAt: new Date(),
      });
    } else {
      found.userId = user.id;
      found.resolvedAt = new Date();
      if (!found.email && email) found.email = email;
      if (!found.phone && user.phone) found.phone = user.phone;
    }
    if (attribution && found.source === 'other' && !found.campaign) {
      // First-touch attribution: only fills the gaps, never overwrites.
      found.source = attribution.source ?? found.source;
      found.medium = attribution.medium ?? found.medium;
      found.campaign = attribution.campaign ?? found.campaign;
      found.content = attribution.content ?? found.content;
      found.term = attribution.term ?? found.term;
      found.landingPage = attribution.landingPage ?? found.landingPage;
      found.referrer = attribution.referrer ?? found.referrer;
    }
    const saved = await manager.save(CreatorLead, found);
    return saved;
  }

  /**
   * Links an existing creator profile to its lead (called when a user turns
   * into a creator, so the CRM keeps ONE row for the person).
   */
  async linkCreatorProfile(
    userId: string,
    creatorProfileId: string,
    manager?: EntityManager,
  ): Promise<CreatorLead | null> {
    const runner = manager ?? this.dataSource.manager;
    const lead = await runner
      .createQueryBuilder(CreatorLead, 'lead')
      .where(
        '(lead.user_id = :userId OR lead.creator_profile_id = :creatorId)',
        { userId, creatorId: creatorProfileId },
      )
      .andWhere('lead.merged_into_id IS NULL')
      .orderBy('lead.created_at', 'ASC')
      .getOne();
    if (!lead) return null;
    lead.creatorProfileId = creatorProfileId;
    lead.userId = userId;
    lead.resolvedAt = lead.resolvedAt ?? new Date();
    return runner.save(CreatorLead, lead);
  }

  /** The attribution of a lead (or null when it never had one). */
  async forLead(leadId: string): Promise<CreatorAttribution[]> {
    return this.attributionsRepository.find({
      where: { leadId },
      order: { firstSeenAt: 'ASC' },
    });
  }

  /** The most recent capture of a user (shown on the CRM detail page). */
  /**
   * The user's own attribution, FIRST touch.
   *
   * The whole attribution model of §7 is first-touch: a later campaign never
   * rewrites the campaign that actually brought the person in (see
   * `resolveOrCreateLeadForUser`, which only fills gaps). Returning the most
   * RECENT row here would contradict what the CRM lead shows, so the order
   * is ASC by first touch.
   */
  async forUser(userId: string): Promise<CreatorAttribution | null> {
    return this.attributionsRepository.findOne({
      where: { userId },
      order: { firstSeenAt: 'ASC' },
    });
  }

  /**
   * Audited manual attribution correction (spec §18). Leads can be
   * re-attributed when a campaign turns out to be mis-tagged.
   */
  async overrideLeadAttribution(
    leadId: string,
    patch: Partial<
      Pick<
        CreatorLead,
        | 'source'
        | 'medium'
        | 'campaign'
        | 'content'
        | 'term'
        | 'landingPage'
        | 'referrer'
      >
    >,
  ): Promise<CreatorLead | null> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) return null;
    if (patch.source !== undefined) lead.source = patch.source;
    if (patch.medium !== undefined) lead.medium = bounded(patch.medium, 64);
    if (patch.campaign !== undefined)
      lead.campaign = bounded(patch.campaign, 120);
    if (patch.content !== undefined) lead.content = bounded(patch.content, 120);
    if (patch.term !== undefined) lead.term = bounded(patch.term, 120);
    if (patch.landingPage !== undefined)
      lead.landingPage = bounded(patch.landingPage, 500);
    if (patch.referrer !== undefined)
      lead.referrer = bounded(patch.referrer, 500);
    return this.leadsRepository.save(lead);
  }

  /** Domain of a lead's website — the weak duplicate-detection key. */
  static websiteKey(website?: string | null): string | null {
    return normalizeDomain(website);
  }
}
