import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { CreatorLead } from '../../database/entities/crm/creator-lead.entity';
import {
  CreatorCrmRecordTag,
  CreatorCrmTag,
} from '../../database/entities/crm/creator-crm-tag.entity';
import { CreatorCrmNote } from '../../database/entities/crm/creator-crm-note.entity';
import { CreatorCrmAction } from '../../database/entities/crm/creator-crm-action.entity';
import { UserRole } from '../../database/entities/identity/user.entity';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { CrmEventsService } from './crm-events.service';
import { CREATOR_EVENTS } from './domain/events';
import {
  CrmRecordsService,
  type ActivityThresholds,
  type CrmRow,
} from './crm-records.service';
import {
  assertManualStageAllowed,
  deriveStage,
  isCrmStage,
  type CrmStage,
} from './domain/funnel';
import {
  isCrmCreatorType,
  isCrmSource,
  normalizeEmail,
  normalizeTagSlug,
  websiteDomain,
} from './domain/taxonomy';
import { evaluateSegment, type SegmentDocument } from './domain/segments';

const URL_RE = /^https?:\/\/[^\s]+$/i;

export interface CreateLeadInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  websiteUrl?: string | null;
  socialLinks?: string[];
  source?: string;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  creatorType?: string | null;
  ownerId?: string | null;
  tags?: string[];
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  manualStage?: string | null;
  qualified?: boolean;
}

/**
 * Phase C1 — lead lifecycle: create, update, qualify, own, tag, merge.
 *
 * Two rules dominate every method here:
 *
 *   1. NO DUPLICATES (§19). A lead is created only when the person is not
 *      already known — matched on the normalized email (the partial unique
 *      index is the last line of defence) and on the linked user. Creating a
 *      person who exists returns the existing row and a CONFLICT, never a
 *      second copy.
 *   2. EVERY SENSITIVE WRITE IS AUDITED (§18) — stage, owner, tags, merge,
 *      bulk actions and manual attribution all land in audit_logs.
 */
@Injectable()
export class CrmLeadsService {
  private readonly logger = new Logger(CrmLeadsService.name);

  constructor(
    @InjectRepository(CreatorLead)
    private readonly leadsRepository: Repository<CreatorLead>,
    @InjectRepository(CreatorCrmTag)
    private readonly tagsRepository: Repository<CreatorCrmTag>,
    @InjectRepository(CreatorCrmRecordTag)
    private readonly recordTagsRepository: Repository<CreatorCrmRecordTag>,
    @InjectRepository(CreatorCrmNote)
    private readonly notesRepository: Repository<CreatorCrmNote>,
    @InjectRepository(CreatorCrmAction)
    private readonly actionsRepository: Repository<CreatorCrmAction>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly events: CrmEventsService,
    private readonly records: CrmRecordsService,
  ) {}

  // ---------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------

  async create(input: CreateLeadInput, actorId: string): Promise<CreatorLead> {
    const email = normalizeEmail(input.email);
    if (input.email && !email) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Email is not valid',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (input.websiteUrl && !URL_RE.test(input.websiteUrl.trim())) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'websiteUrl must start with http:// or https://',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (input.source && !isCrmSource(input.source)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Unknown source',
        HttpStatus.BAD_REQUEST,
        {
          field: 'source',
        },
      );
    }
    if (input.creatorType && !isCrmCreatorType(input.creatorType)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Unknown creator type',
        HttpStatus.BAD_REQUEST,
        {
          field: 'creatorType',
        },
      );
    }
    await this.assertOwnerIsAdmin(input.ownerId ?? null);

    // §19 — never create a person who already exists.
    const existing = await this.findExisting(email, input.phone ?? null, null);
    if (existing) {
      throw new ApiException(
        'CONFLICT',
        'This person already exists in the CRM',
        HttpStatus.CONFLICT,
        { leadId: existing.id, matchedOn: existing.email ? 'email' : 'phone' },
      );
    }

    const lead = this.leadsRepository.create({
      name: input.name?.trim() || null,
      email,
      phone: input.phone?.trim() || null,
      company: input.company?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      socialLinks: (input.socialLinks ?? []).slice(0, 12),
      source: isCrmSource(input.source) ? input.source : 'other',
      medium: input.medium?.trim() || null,
      campaign: input.campaign?.trim() || null,
      content: input.content?.trim() || null,
      term: input.term?.trim() || null,
      landingPage: input.landingPage?.trim() || null,
      referrer: input.referrer?.trim() || null,
      creatorType: isCrmCreatorType(input.creatorType)
        ? input.creatorType
        : null,
      ownerId: input.ownerId ?? null,
      firstContactAt: new Date(),
      lastActivityAt: new Date(),
    });
    const saved = await this.leadsRepository.save(lead);

    if (input.tags?.length) {
      await this.applyTags(saved.id, input.tags, actorId);
    }
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.LEAD_CREATED,
      leadId: saved.id,
      actorId,
      entityType: 'creator_lead',
      entityId: saved.id,
      dedupKey: CrmEventsService.dedupKey('crm.lead_created', saved.id),
      metadata: { source: saved.source, hasEmail: Boolean(saved.email) },
    });
    await this.audit.record({
      action: 'crm.lead_created',
      entity: 'crm_lead',
      entityId: saved.id,
      context: { actorId },
      metadata: { source: saved.source, hasEmail: Boolean(saved.email) },
    });
    return saved;
  }

  // ---------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------

  async update(
    leadId: string,
    input: UpdateLeadInput,
    actorId: string,
  ): Promise<CreatorLead> {
    const lead = await this.requireLead(leadId);
    const mutable = lead as unknown as Record<string, unknown>;
    const before: Record<string, unknown> = {};
    const assign = (key: keyof CreatorLead, value: unknown) => {
      const current = lead[key] as unknown;
      if (
        value === undefined ||
        JSON.stringify(current) === JSON.stringify(value)
      )
        return;
      before[key] = current;
      mutable[key] = value;
    };

    if (input.name !== undefined) assign('name', input.name?.trim() || null);
    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      if (input.email && !email) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'Email is not valid',
          HttpStatus.BAD_REQUEST,
        );
      }
      const clash = await this.findExisting(email, null, leadId);
      if (clash) {
        throw new ApiException(
          'CONFLICT',
          'Another lead already uses this email',
          HttpStatus.CONFLICT,
          {
            leadId: clash.id,
          },
        );
      }
      assign('email', email);
    }
    if (input.phone !== undefined) assign('phone', input.phone?.trim() || null);
    if (input.company !== undefined)
      assign('company', input.company?.trim() || null);
    if (input.websiteUrl !== undefined) {
      if (input.websiteUrl && !URL_RE.test(input.websiteUrl.trim())) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'websiteUrl is not a valid URL',
          HttpStatus.BAD_REQUEST,
        );
      }
      assign('websiteUrl', input.websiteUrl?.trim() || null);
    }
    if (input.socialLinks !== undefined)
      assign('socialLinks', input.socialLinks.slice(0, 12));
    if (input.source !== undefined) {
      if (!isCrmSource(input.source)) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'Unknown source',
          HttpStatus.BAD_REQUEST,
        );
      }
      assign('source', input.source);
    }
    if (input.creatorType !== undefined) {
      if (input.creatorType && !isCrmCreatorType(input.creatorType)) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'Unknown creator type',
          HttpStatus.BAD_REQUEST,
        );
      }
      assign('creatorType', input.creatorType);
    }
    for (const key of [
      'medium',
      'campaign',
      'content',
      'term',
      'landingPage',
      'referrer',
    ] as const) {
      if (input[key] !== undefined) assign(key, input[key]?.trim() || null);
    }

    if (input.ownerId !== undefined) {
      await this.assertOwnerIsAdmin(input.ownerId ?? null);
      if (input.ownerId !== lead.ownerId) {
        before.ownerId = lead.ownerId;
        lead.ownerId = input.ownerId ?? null;
        await this.audit.record({
          action: 'crm.owner_changed',
          entity: 'crm_lead',
          entityId: lead.id,
          context: { actorId },
          metadata: { from: lead.ownerId, to: input.ownerId ?? null },
        });
        await this.events.recordSafe({
          eventName: CREATOR_EVENTS.OWNER_CHANGED,
          leadId: lead.id,
          actorId,
          entityType: 'creator_lead',
          entityId: lead.id,
          dedupKey: CrmEventsService.dedupKey(
            'crm.owner_changed',
            lead.id,
            Date.now(),
          ),
          metadata: { from: before.ownerId ?? null, to: input.ownerId ?? null },
        });
      }
    }

    if (input.manualStage !== undefined) {
      await this.setManualStage(lead, input.manualStage, actorId);
    }

    if (input.qualified !== undefined) {
      const qualified = input.qualified;
      if (qualified && !lead.qualifiedAt) {
        lead.qualifiedAt = new Date();
        lead.qualifiedBy = actorId;
      } else if (!qualified) {
        lead.qualifiedAt = null;
        lead.qualifiedBy = null;
      }
    }

    const saved = await this.leadsRepository.save(lead);
    if (input.tags !== undefined) {
      await this.setTags(saved.id, input.tags, actorId);
    }
    if (Object.keys(before).length > 0) {
      await this.audit.record({
        action: 'crm.lead_updated',
        entity: 'crm_lead',
        entityId: saved.id,
        context: { actorId },
        metadata: { fields: Object.keys(before) },
      });
      await this.events.recordSafe({
        eventName: CREATOR_EVENTS.LEAD_UPDATED,
        leadId: saved.id,
        actorId,
        entityType: 'creator_lead',
        entityId: saved.id,
        dedupKey: CrmEventsService.dedupKey(
          'crm.lead_updated',
          saved.id,
          Date.now(),
        ),
        metadata: { fields: Object.keys(before) },
      });
    }
    return saved;
  }

  // ---------------------------------------------------------------------
  // Stage (spec §8) — derived truth, audited lowering only
  // ---------------------------------------------------------------------

  /**
   * A manual stage may only LOWER the derived stage. Raising it is rejected
   * with 422 and an explanation, because "a dropdown must not be able to
   * make an unpublished creator look published" is a hard product rule.
   */
  async setManualStage(
    lead: CreatorLead,
    manualStage: string | null,
    actorId: string,
    thresholds?: ActivityThresholds,
  ): Promise<void> {
    if (manualStage === null || manualStage === '') {
      if (lead.manualStage) {
        await this.audit.record({
          action: 'crm.stage_changed',
          entity: 'crm_lead',
          entityId: lead.id,
          context: { actorId },
          metadata: { from: lead.manualStage, to: null, cleared: true },
        });
      }
      lead.manualStage = null;
      return;
    }
    if (!isCrmStage(manualStage)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Unknown stage',
        HttpStatus.BAD_REQUEST,
      );
    }
    const row = await this.records.byLeadId(
      lead.id,
      thresholds ?? DEFAULT_THRESHOLDS,
    );
    const derived: CrmStage = row?.stage.derived ?? 'new_lead';
    const verdict = assertManualStageAllowed(manualStage, derived);
    if (!verdict.allowed) {
      throw new ApiException(
        'VALIDATION_ERROR',
        verdict.reason === 'unknown_stage'
          ? 'Unknown stage'
          : 'A manual stage can only move a creator BACK in the funnel, never forward',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { reason: verdict.reason, derived },
      );
    }
    const from = lead.manualStage;
    lead.manualStage = manualStage;
    await this.audit.record({
      action: 'crm.stage_changed',
      entity: 'crm_lead',
      entityId: lead.id,
      context: { actorId },
      metadata: { from, to: manualStage, derived, manual: true },
    });
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.STAGE_CHANGED,
      leadId: lead.id,
      actorId,
      entityType: 'creator_lead',
      entityId: lead.id,
      dedupKey: CrmEventsService.dedupKey(
        'crm.stage_changed',
        lead.id,
        Date.now(),
      ),
      metadata: { from, to: manualStage, derived, manual: true },
    });
  }

  // ---------------------------------------------------------------------
  // Tags (spec §9)
  // ---------------------------------------------------------------------

  /** Creates tags on demand so the vocabulary grows with the team. */
  private async ensureTag(
    slug: string,
    label: string,
    actorId: string | null,
  ): Promise<CreatorCrmTag> {
    const normalized = normalizeTagSlug(slug);
    if (!normalized) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Tag slug is empty after normalization',
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.tagsRepository.findOne({
      where: { slug: normalized },
    });
    if (existing) return existing;
    const created = this.tagsRepository.create({
      slug: normalized,
      label: label.trim().slice(0, 80) || normalized,
      group: 'custom',
      createdBy: actorId,
    });
    try {
      return await this.tagsRepository.save(created);
    } catch {
      // Lost a race with a concurrent create — the unique index held.
      return this.tagsRepository.findOneOrFail({ where: { slug: normalized } });
    }
  }

  async applyTags(
    leadId: string,
    slugs: string[],
    actorId: string,
  ): Promise<CreatorCrmTag[]> {
    const tags: CreatorCrmTag[] = [];
    for (const raw of slugs.slice(0, 20)) {
      const tag = await this.ensureTag(raw, raw, actorId);
      tags.push(tag);
      await this.recordTagsRepository
        .createQueryBuilder()
        .insert()
        .into(CreatorCrmRecordTag)
        .values({ leadId, tagId: tag.id, addedBy: actorId })
        .orIgnore()
        .execute();
    }
    await this.audit.record({
      action: 'crm.tags_changed',
      entity: 'crm_lead',
      entityId: leadId,
      context: { actorId },
      metadata: { added: tags.map((tag) => tag.slug) },
    });
    return tags;
  }

  async removeTag(
    leadId: string,
    slug: string,
    actorId: string,
  ): Promise<void> {
    const tag = await this.tagsRepository.findOne({
      where: { slug: normalizeTagSlug(slug) },
    });
    if (!tag) return;
    await this.recordTagsRepository.delete({ leadId, tagId: tag.id });
    await this.audit.record({
      action: 'crm.tags_changed',
      entity: 'crm_lead',
      entityId: leadId,
      context: { actorId },
      metadata: { removed: [tag.slug] },
    });
  }

  /** Replaces the whole tag set (bulk action). */
  async setTags(
    leadId: string,
    slugs: string[],
    actorId: string,
  ): Promise<void> {
    const normalized = [
      ...new Set(slugs.map(normalizeTagSlug).filter(Boolean)),
    ];
    const rows = await this.recordTagsRepository.find({ where: { leadId } });
    const keep = new Set<string>();
    for (const slug of normalized) {
      const tag = await this.ensureTag(slug, slug, actorId);
      keep.add(tag.id);
    }
    for (const row of rows) {
      if (!keep.has(row.tagId)) {
        await this.recordTagsRepository.delete({ id: row.id });
      }
    }
    // Insert the RESOLVED tag ids — `tag_id` is a uuid foreign key, so a
    // slug here would be a type error the moment a tag is actually added.
    const toAdd = [...keep].filter(
      (tagId) => !rows.some((row) => row.tagId === tagId),
    );
    if (toAdd.length) {
      await this.recordTagsRepository
        .createQueryBuilder()
        .insert()
        .into(CreatorCrmRecordTag)
        .values(
          toAdd.map((tagId) => ({ leadId, tagId, addedBy: actorId ?? null })),
        )
        .orIgnore()
        .execute();
    }
    await this.audit.record({
      action: 'crm.tags_changed',
      entity: 'crm_lead',
      entityId: leadId,
      context: { actorId },
      metadata: { set: normalized },
    });
  }

  async tagsFor(
    leadId: string,
  ): Promise<
    Array<{ id: string; slug: string; label: string; group: string }>
  > {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT t.id, t.slug, t.label, t.group
         FROM creator_crm_record_tags rt
         JOIN creator_crm_tags t ON t.id = rt.tag_id
        WHERE rt.lead_id = $1
        ORDER BY t.slug`,
      [leadId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      label: String(row.label),
      group: String(row.group),
    }));
  }

  async allTags(): Promise<
    Array<{
      id: string;
      slug: string;
      label: string;
      group: string;
      count: number;
    }>
  > {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT t.id, t.slug, t.label, t.group,
              (SELECT COUNT(*) FROM creator_crm_record_tags rt WHERE rt.tag_id = t.id)::int AS count
         FROM creator_crm_tags t
        ORDER BY t.group, t.slug`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      label: String(row.label),
      group: String(row.group),
      count: Number(row.count ?? 0),
    }));
  }

  // ---------------------------------------------------------------------
  // Duplicate detection + merge (spec §19)
  // ---------------------------------------------------------------------

  /**
   * Candidate duplicate groups among OPEN leads.
   *
   * Strong evidence first: the same normalized email, the same linked
   * user/creator, or the same website domain + name. Each group reports
   * WHY it matched so the admin decides, not the tool.
   */
  async findDuplicates(thresholds: ActivityThresholds): Promise<
    Array<{
      key: string;
      reason: 'email' | 'user' | 'creator' | 'website_name';
      leadIds: string[];
      rows: CrmRow[];
    }>
  > {
    const groups: Array<{
      key: string;
      reason: 'email' | 'user' | 'creator' | 'website_name';
      leadIds: string[];
    }> = [];

    const push = (
      key: string,
      reason: 'email' | 'user' | 'creator' | 'website_name',
      ids: string[],
    ) => {
      if (ids.length > 1) groups.push({ key, reason, leadIds: ids });
    };

    const byEmail = await this.dataSource.query<
      Array<{ email: string; ids: string[] }>
    >(
      `SELECT lower("email") AS email, array_agg("id"::text) AS ids
         FROM creator_leads
        WHERE "merged_into_id" IS NULL AND "email" IS NOT NULL
        GROUP BY lower("email")
       HAVING COUNT(*) > 1`,
    );
    for (const row of byEmail) push(row.email, 'email', row.ids);

    const byUser = await this.dataSource.query<
      Array<{ user_id: string; ids: string[] }>
    >(
      `SELECT "user_id"::text AS user_id, array_agg("id"::text) AS ids
         FROM creator_leads
        WHERE "merged_into_id" IS NULL AND "user_id" IS NOT NULL
        GROUP BY "user_id"
       HAVING COUNT(*) > 1`,
    );
    for (const row of byUser) push(row.user_id, 'user', row.ids);

    const byCreator = await this.dataSource.query<
      Array<{ creator_profile_id: string; ids: string[] }>
    >(
      `SELECT "creator_profile_id"::text AS creator_profile_id, array_agg("id"::text) AS ids
         FROM creator_leads
        WHERE "merged_into_id" IS NULL AND "creator_profile_id" IS NOT NULL
        GROUP BY "creator_profile_id"
       HAVING COUNT(*) > 1`,
    );
    for (const row of byCreator)
      push(row.creator_profile_id, 'creator', row.ids);

    // Weaker signal: same website domain AND same display name.
    const byWebsite = await this.dataSource.query<
      Array<{ domain: string; ids: string[] }>
    >(
      `SELECT lower(split_part(split_part("website_url", '://', 2), '/', 1)) AS domain,
              array_agg("id"::text) AS ids
         FROM creator_leads
        WHERE "merged_into_id" IS NULL AND "website_url" IS NOT NULL
        GROUP BY 1, lower(COALESCE("name", "company", ''))
       HAVING COUNT(*) > 1`,
    );
    for (const row of byWebsite)
      push(`${row.domain}:name`, 'website_name', row.ids);

    const result: Array<{
      key: string;
      reason: 'email' | 'user' | 'creator' | 'website_name';
      leadIds: string[];
      rows: CrmRow[];
    }> = [];
    for (const group of groups) {
      const rows: CrmRow[] = [];
      for (const id of group.leadIds) {
        const row = await this.records.byLeadId(id, thresholds);
        if (row) rows.push(row);
      }
      // The hydrated rows travel WITH the group — the admin needs to see
      // which record is which before deciding which one survives.
      if (rows.length > 1) result.push({ ...group, rows });
    }
    return result;
  }

  /**
   * Merges `sourceLeadId` into `targetLeadId`.
   *
   * Safe and REVERSIBLE-where-practical (spec §19): nothing is deleted. The
   * source row is retained with a `merged_into_id` pointer, its notes,
   * actions, tags and events are re-pointed at the survivor (each carrying
   * `moved_from_lead_id` / the original id), and `unmerge()` can walk the
   * whole thing back.
   */
  async merge(
    targetLeadId: string,
    sourceLeadId: string,
    actorId: string,
  ): Promise<CreatorLead> {
    if (targetLeadId === sourceLeadId) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Cannot merge a lead into itself',
        HttpStatus.BAD_REQUEST,
      );
    }
    const target = await this.requireLead(targetLeadId);
    const source = await this.requireLead(sourceLeadId);
    if (source.mergedIntoId) {
      throw new ApiException(
        'CONFLICT',
        'The source lead is already merged',
        HttpStatus.CONFLICT,
      );
    }
    if (target.mergedIntoId) {
      throw new ApiException(
        'CONFLICT',
        'The target lead is merged; pick the survivor',
        HttpStatus.CONFLICT,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      // 1) fill the gaps on the survivor — never overwrite what it has.
      target.name = target.name ?? source.name;
      target.email = target.email ?? source.email;
      target.phone = target.phone ?? source.phone;
      target.username = target.username ?? source.username;
      target.company = target.company ?? source.company;
      target.websiteUrl = target.websiteUrl ?? source.websiteUrl;
      target.socialLinks = [
        ...new Set([
          ...(target.socialLinks ?? []),
          ...(source.socialLinks ?? []),
        ]),
      ].slice(0, 12);
      target.creatorType = target.creatorType ?? source.creatorType;
      target.ownerId = target.ownerId ?? source.ownerId;
      target.campaign = target.campaign ?? source.campaign;
      target.medium = target.medium ?? source.medium;
      target.content = target.content ?? source.content;
      target.term = target.term ?? source.term;
      target.landingPage = target.landingPage ?? source.landingPage;
      target.referrer = target.referrer ?? source.referrer;
      if (target.source === 'other' && source.source !== 'other') {
        target.source = source.source;
      }
      target.userId = target.userId ?? source.userId;
      target.creatorProfileId =
        target.creatorProfileId ?? source.creatorProfileId;
      target.firstContactAt =
        target.firstContactAt && source.firstContactAt
          ? new Date(
              Math.min(
                target.firstContactAt.getTime(),
                source.firstContactAt.getTime(),
              ),
            )
          : (target.firstContactAt ?? source.firstContactAt);
      target.lastActivityAt =
        target.lastActivityAt && source.lastActivityAt
          ? new Date(
              Math.max(
                target.lastActivityAt.getTime(),
                source.lastActivityAt.getTime(),
              ),
            )
          : (target.lastActivityAt ?? source.lastActivityAt);
      await manager.save(CreatorLead, target);

      // 2) move children.
      await manager.update(
        CreatorCrmNote,
        { leadId: sourceLeadId },
        { leadId: targetLeadId, movedFromLeadId: sourceLeadId },
      );
      await manager.update(
        CreatorCrmAction,
        { leadId: sourceLeadId },
        { leadId: targetLeadId, movedFromLeadId: sourceLeadId },
      );
      const sourceTagRows = await manager.find(CreatorCrmRecordTag, {
        where: { leadId: sourceLeadId },
      });
      for (const row of sourceTagRows) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(CreatorCrmRecordTag)
          .values({ leadId: targetLeadId, tagId: row.tagId, addedBy: actorId })
          .orIgnore()
          .execute();
        await manager.delete(CreatorCrmRecordTag, { id: row.id });
      }
      await this.events.moveLeadEvents(sourceLeadId, targetLeadId, manager);
      await this.events.moveAttributions(sourceLeadId, targetLeadId, manager);

      // 3) retire the source — kept, not deleted, so the merge is reversible.
      source.mergedIntoId = targetLeadId;
      source.mergedAt = new Date();
      // Drop the email so the partial unique index stops blocking the person.
      source.email = source.email
        ? `${source.email}#merged-${source.id.slice(0, 8)}`
        : null;
      source.userId = null;
      source.creatorProfileId = null;
      await manager.save(CreatorLead, source);
    });

    await this.audit.record({
      action: 'crm.lead_merged',
      entity: 'crm_lead',
      entityId: targetLeadId,
      context: { actorId },
      metadata: {
        target: targetLeadId,
        source: sourceLeadId,
        reversible: true,
      },
    });
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.LEAD_MERGED,
      leadId: targetLeadId,
      actorId,
      entityType: 'creator_lead',
      entityId: targetLeadId,
      dedupKey: CrmEventsService.dedupKey(
        'crm.lead_merged',
        sourceLeadId,
        targetLeadId,
      ),
      metadata: { source: sourceLeadId, target: targetLeadId },
    });
    return this.requireLead(targetLeadId);
  }

  /** Walks a merge back: restores the source row and its children. */
  async unmerge(leadId: string, actorId: string): Promise<CreatorLead> {
    // `requireLead` deliberately hides MERGED rows (the list must not show
    // them), so the undo path reads the row directly and then decides.
    const source = await this.leadsRepository.findOne({
      where: { id: leadId },
    });
    if (!source) {
      throw new ApiException(
        'NOT_FOUND',
        'Creator lead not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!source.mergedIntoId) {
      throw new ApiException(
        'CONFLICT',
        'This lead is not merged',
        HttpStatus.CONFLICT,
      );
    }
    const targetId = source.mergedIntoId;
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        CreatorCrmNote,
        { movedFromLeadId: leadId },
        { leadId, movedFromLeadId: null },
      );
      await manager.update(
        CreatorCrmAction,
        { movedFromLeadId: leadId },
        { leadId, movedFromLeadId: null },
      );
      source.mergedIntoId = null;
      source.mergedAt = null;
      if (source.email?.includes('#merged-')) {
        source.email = source.email.split('#merged-')[0];
      }
      await manager.save(CreatorLead, source);
    });
    await this.audit.record({
      action: 'crm.lead_merged',
      entity: 'crm_lead',
      entityId: leadId,
      context: { actorId },
      metadata: { unmergedFrom: targetId, reversible: true },
    });
    return source;
  }

  // ---------------------------------------------------------------------
  // Bulk actions (spec §1) — every one audited, one actor, bounded size
  // ---------------------------------------------------------------------

  async bulkAssignOwner(
    leadIds: string[],
    ownerId: string | null,
    actorId: string,
  ): Promise<number> {
    await this.assertOwnerIsAdmin(ownerId);
    const leads = await this.leadsRepository.find({
      where: { id: In(leadIds) },
    });
    let changed = 0;
    for (const lead of leads) {
      if (lead.ownerId === ownerId) continue;
      await this.audit.record({
        action: 'crm.owner_changed',
        entity: 'crm_lead',
        entityId: lead.id,
        context: { actorId },
        metadata: { from: lead.ownerId, to: ownerId, bulk: true },
      });
      lead.ownerId = ownerId;
      changed += 1;
    }
    if (changed) await this.leadsRepository.save(leads);
    await this.auditBulk(leadIds, actorId, 'assign_owner', {
      ownerId,
      changed,
    });
    return changed;
  }

  /**
   * Bulk stage change. Each lead is validated individually against ITS OWN
   * derived stage — a batch can never push an unpublished creator forward.
   */
  async bulkSetManualStage(
    leadIds: string[],
    manualStage: string | null,
    actorId: string,
    thresholds: ActivityThresholds,
  ): Promise<{
    changed: number;
    skipped: Array<{ leadId: string; reason: string }>;
  }> {
    const leads = await this.leadsRepository.find({
      where: { id: In(leadIds) },
    });
    let changed = 0;
    const skipped: Array<{ leadId: string; reason: string }> = [];
    for (const lead of leads) {
      try {
        await this.setManualStage(lead, manualStage, actorId, thresholds);
        changed += 1;
      } catch (error) {
        skipped.push({
          leadId: lead.id,
          reason: error instanceof ApiException ? error.message : 'not allowed',
        });
      }
    }
    await this.auditBulk(leadIds, actorId, 'set_stage', {
      manualStage,
      changed,
      skipped: skipped.length,
    });
    return { changed, skipped };
  }

  async bulkAddTag(
    leadIds: string[],
    tag: string,
    actorId: string,
  ): Promise<number> {
    for (const id of leadIds) await this.applyTags(id, [tag], actorId);
    await this.auditBulk(leadIds, actorId, 'add_tag', { tag });
    return leadIds.length;
  }

  async bulkRemoveTag(
    leadIds: string[],
    tag: string,
    actorId: string,
  ): Promise<number> {
    for (const id of leadIds) await this.removeTag(id, tag, actorId);
    await this.auditBulk(leadIds, actorId, 'remove_tag', { tag });
    return leadIds.length;
  }

  /**
   * Records ONE audit row for a bulk operation (spec §1: "every bulk action
   * is audited"). Exposed so the controller can audit the batches it runs
   * itself (notes, next actions) through exactly the same shape.
   */
  async auditBulkAction(
    leadIds: string[],
    actorId: string,
    action: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    return this.auditBulk(leadIds, actorId, action, metadata);
  }

  private async auditBulk(
    leadIds: string[],
    actorId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      action: 'crm.bulk_action',
      entity: 'crm_lead',
      entityId: null,
      context: { actorId },
      metadata: {
        action,
        count: leadIds.length,
        leadIds: leadIds.slice(0, 100),
        ...metadata,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Segment evaluation over the hydrated rows (preview / automation-ready)
  // ---------------------------------------------------------------------

  async previewSegment(
    document: SegmentDocument,
    thresholds: ActivityThresholds,
  ): Promise<{ matches: string[]; evaluated: number }> {
    const BATCH = 500;
    const matches: string[] = [];
    let evaluated = 0;
    let offset = 0;
    for (;;) {
      const { rows } = await this.records.list(
        { page: Math.floor(offset / BATCH) + 1, pageSize: BATCH },
        thresholds,
      );
      if (!rows.length) break;
      for (const row of rows) {
        evaluated += 1;
        if (evaluateSegment(document, toSubject(row))) {
          if (row.leadId) matches.push(row.leadId);
        }
      }
      offset += rows.length;
      if (rows.length < BATCH) break;
    }
    return { matches, evaluated };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  async requireLead(id: string): Promise<CreatorLead> {
    const lead = await this.leadsRepository.findOne({ where: { id } });
    if (!lead || lead.mergedIntoId) {
      throw new ApiException(
        'NOT_FOUND',
        'Creator lead not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return lead;
  }

  private async findExisting(
    email: string | null,
    phone: string | null,
    excludeId: string | null,
  ): Promise<CreatorLead | null> {
    if (email) {
      const rows = await this.dataSource.query<Array<{ id: string }>>(
        `SELECT id FROM creator_leads
          WHERE merged_into_id IS NULL AND lower(email) = $1
            AND ($2::uuid IS NULL OR id <> $2::uuid)
          LIMIT 1`,
        [email, excludeId],
      );
      if (rows[0]?.id)
        return this.leadsRepository.findOneBy({ id: rows[0].id });
    }
    if (phone) {
      const lead = await this.leadsRepository.findOne({
        where: { phone, mergedIntoId: IsNull() },
      });
      if (lead && lead.id !== excludeId) return lead;
    }
    return null;
  }

  /**
   * The owner must be an internal team member. Reusing the existing
   * `admin` role is deliberate: C1 adds no parallel permission system, and
   * §17 asks that only authorized staff can own records.
   */
  private async assertOwnerIsAdmin(ownerId: string | null): Promise<void> {
    if (!ownerId) return;
    const user = await this.dataSource.query<
      Array<{ role: string; status: string }>
    >(`SELECT role, status FROM users WHERE id = $1`, [ownerId]);
    const found = user[0];
    if (!found || String(found.role) !== String(UserRole.ADMIN)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Owner must be an active team member (admin)',
        HttpStatus.BAD_REQUEST,
        { field: 'ownerId' },
      );
    }
    if (found.status !== 'active') {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Owner account is suspended',
        HttpStatus.BAD_REQUEST,
        {
          field: 'ownerId',
        },
      );
    }
  }

  /** Team members that can own a record (used by the owner filter). */
  async owners(): Promise<
    Array<{ id: string; name: string; username: string | null }>
  > {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT id,
              COALESCE(full_name, username, email, 'admin') AS name,
              username
         FROM users
        WHERE role = $1 AND status = 'active'
        ORDER BY name`,
      [UserRole.ADMIN],
    );
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      username: row.username == null ? null : String(row.username as string),
    }));
  }

  async notes(leadId: string): Promise<
    Array<{
      id: string;
      body: string;
      author: { id: string; name: string };
      createdAt: Date;
    }>
  > {
    const rows = await this.notesRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: { author: true },
    });
    return rows.map((note) => ({
      id: note.id,
      body: note.body,
      author: {
        id: note.authorId,
        name:
          note.author.fullName ??
          note.author.username ??
          note.author.email ??
          '—',
      },
      createdAt: note.createdAt,
    }));
  }
}

const DEFAULT_THRESHOLDS = { activeDays: 7, inactiveDays: 14, dormantDays: 30 };

function toSubject(row: CrmRow) {
  return {
    stage: row.stage.effective,
    source: (row.source ?? 'other') as never,
    score: row.score.score,
    ownerId: row.ownerId,
    activity: row.activity.status,
    productStatus: row.productStatus,
    hasProduct: row.productCount > 0,
    hasPublishedProduct: row.publishedProductCount > 0,
    hasSale: row.salesCount > 0,
    isRegistered: Boolean(row.userId),
    tags: row.tags ?? [],
    hasNextAction: Boolean(row.hasNextAction),
    nextActionOverdue: Boolean(row.hasOverdueAction),
    revenue: Number(row.revenue ?? 0),
    lastActivityDays: row.activity.daysSinceActivity,
    hasAttribution: Boolean(row.campaign),
  };
}

export { DEFAULT_THRESHOLDS, websiteDomain, deriveStage };
