import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../../database/entities/identity/user.entity';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { ApiException } from '../../common/errors/api-error';
import { CrmRecordsService, type CrmRow } from './crm-records.service';
import { CrmLeadsService, DEFAULT_THRESHOLDS } from './crm-leads.service';
import { CrmEngagementService } from './crm-engagement.service';
import {
  CrmAcquisitionService,
  CrmReferralService,
} from './crm-acquisition.service';
import { CrmConversionService } from './crm-conversion.service';
import { CrmImportService } from './crm-import.service';
import {
  CrmCapabilityGuard,
  RequireCrmCapability,
} from './crm-capability.guard';
import { CrmSegmentsService } from './crm-segments.service';
import { CrmAnalyticsService } from './crm-analytics.service';
import { CrmExportService } from './crm-export.service';
import { CrmAttributionService } from './crm-attribution.service';
import { CrmEventsService } from './crm-events.service';
import {
  thresholdsFromEnv,
  DEFAULT_ACTIVITY_THRESHOLDS,
  type ActivityThresholds,
} from './domain/activity';
import { CRM_OUTCOMES, CRM_STAGES, STAGE_DEFINITIONS } from './domain/funnel';
import {
  CRM_SOURCES,
  CRM_CREATOR_TYPES,
  CRM_ACTION_TYPES,
  CRM_ACTION_STATUSES,
  CRM_ACTION_PRIORITIES,
} from './domain/taxonomy';
import { PageSizeParamPipe } from '../../common/validation/page-params.pipe';
import { AUTOMATION_READY_EVENTS, CREATOR_EVENT_NAMES } from './domain/events';
import {
  BulkActionDto,
  CreateActionDto,
  CreateLeadDto,
  CreateNoteDto,
  AcquisitionStepDto,
  CommitImportDto,
  ConversionInviteDto,
  CreateSavedViewDto,
  CreateSegmentDto,
  ImportPreviewDto,
  CrmListQueryDto,
  MergeLeadDto,
  OutreachDto,
  SetLostDto,
  SetReferrerDto,
  UpdateActionDto,
  UpdateLeadDto,
  UpdateSegmentDto,
} from './dto/crm.dto';

/** The activity thresholds are config, not code (§14). */
function thresholds(): ActivityThresholds {
  return thresholdsFromEnv(process.env) ?? DEFAULT_ACTIVITY_THRESHOLDS;
}

/** The row shape the list and the detail page share. */
function presentRow(row: CrmRow) {
  return {
    leadId: row.leadId,
    userId: row.userId,
    creatorProfileId: row.creatorProfileId,
    creatorSlug: row.creatorSlug,
    name: row.name,
    email: row.email,
    phone: row.phone,
    username: row.username,
    company: row.company,
    websiteUrl: row.websiteUrl,
    socialLinks: row.socialLinks ?? [],
    source: row.source,
    medium: row.medium,
    campaign: row.campaign,
    content: row.content,
    term: row.term,
    landingPage: row.landingPage,
    referrer: row.referrer,
    creatorType: row.creatorType,
    stage: row.stage.effective,
    derivedStage: row.stage.derived,
    manualStage: row.stage.manual,
    isStageOverridden: row.stage.isOverridden,
    score: row.score.score,
    scoreBand: row.score.band,
    scoreBreakdown: row.score.breakdown,
    productStatus: row.productStatus,
    productCount: row.productCount,
    publishedProductCount: row.publishedProductCount,
    salesCount: row.salesCount,
    revenue: Number(row.revenue ?? 0),
    views7d: row.views7d,
    lastActivityAt: row.lastActivityAt,
    lastActivityDays: row.activity.daysSinceActivity,
    activityStatus: row.activity.status,
    nextAction: row.hasNextAction,
    hasOverdueAction: row.hasOverdueAction,
    openActionCount: row.openActionCount,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    tags: row.tags ?? [],
    isResolved: row.isResolved,
    // C2 — the outcome travels with every row so the list, the Kanban and
    // the 360 view can never disagree about whether a lead is live.
    outcome: row.outcome,
    lostAt: row.lostAt,
    lostReason: row.lostReason,
    referredById: row.referredById,
    referredByName: row.referredByName,
    userRole: row.userRole,
    userStatus: row.userStatus,
    profileStatus: row.profileStatus,
    verificationStatus: row.verificationStatus,
    displayName: row.displayName,
    firstContactAt: row.firstContactAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Phase C1 — Creator CRM API.
 *
 * SECURITY (spec §17): every route in this controller is admin-only
 * (`@Roles(UserRole.ADMIN)`), the bulk endpoints are size-bounded, and the
 * export is permission-checked AND audited. There is no creator-facing read
 * path for any of this data — the notes/timeline/attribution of a person are
 * internal-only by construction, not by convention.
 */
@ApiTags('crm')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/crm')
export class CrmController {
  constructor(
    private readonly leads: CrmLeadsService,
    private readonly records: CrmRecordsService,
    private readonly engagement: CrmEngagementService,
    private readonly segments: CrmSegmentsService,
    private readonly analytics: CrmAnalyticsService,
    private readonly exportService: CrmExportService,
    private readonly attribution: CrmAttributionService,
    private readonly events: CrmEventsService,
    private readonly acquisition: CrmAcquisitionService,
    private readonly referrals: CrmReferralService,
    private readonly conversion: CrmConversionService,
    private readonly importer: CrmImportService,
  ) {}

  // ---------------------------------------------------------------------
  // Meta — the closed vocabularies the UI renders
  // ---------------------------------------------------------------------

  @Get('meta')
  @ApiOperation({
    summary: 'Closed vocabularies, stage rules and thresholds for the CRM UI',
  })
  async meta(): Promise<Record<string, unknown>> {
    const { owners, tags, activity } = await this.thresholdsMeta();
    return {
      stages: CRM_STAGES,
      // C2: 'lost' is an outcome, not a rung — the UI needs both to render
      // the loss report without treating a lost lead as stage-less.
      outcomes: CRM_OUTCOMES,
      stageDefinitions: STAGE_DEFINITIONS.map((definition) => ({
        stage: definition.stage,
        definitionKey: definition.definitionKey,
        entryConditionKey: definition.entryConditionKey,
        exitConditionKey: definition.exitConditionKey,
      })),
      sources: CRM_SOURCES,
      creatorTypes: CRM_CREATOR_TYPES,
      actionTypes: CRM_ACTION_TYPES,
      actionStatuses: CRM_ACTION_STATUSES,
      actionPriorities: CRM_ACTION_PRIORITIES,
      eventNames: CREATOR_EVENT_NAMES,
      automationReadyEvents: AUTOMATION_READY_EVENTS,
      score: this.analytics.scoreConfig(),
      activity,
      owners,
      tags,
    };
  }

  private async thresholdsMeta(): Promise<{
    owners: Array<{ id: string; name: string; username: string | null }>;
    tags: Array<{
      id: string;
      slug: string;
      label: string;
      group: string;
      count: number;
    }>;
    activity: ActivityThresholds;
  }> {
    const [owners, tags] = await Promise.all([
      this.leads.owners(),
      this.leads.allTags(),
    ]);
    return { owners, tags, activity: thresholds() };
  }

  // ---------------------------------------------------------------------
  // KPIs + list
  // ---------------------------------------------------------------------

  @Get('kpis')
  @ApiOperation({
    summary: 'Headline CRM metrics (each one deep-links to the filtered list)',
  })
  async kpis(): Promise<Record<string, number>> {
    return this.analytics.kpis(thresholds());
  }

  @Get('creators')
  @ApiOperation({
    summary:
      'Creator CRM list — server-side search, filters, sorting and pagination',
  })
  async list(@Query() query: CrmListQueryDto, @CurrentUser() user: AuthUser) {
    const limit = thresholds();
    // The "Owned by me" saved view stores the sentinel '@me'; it is resolved
    // HERE, from the verified token, so a client can never ask for someone
    // else's queue by editing the URL.
    const ownerId = query.ownerId === '@me' ? user.id : query.ownerId;
    const rows = query.segmentSlug
      ? await this.listBySegment(query, query.segmentSlug, limit)
      : await this.records.listFiltered(
          {
            search: query.search,
            stage: query.stage,
            source: query.source,
            scoreBand: query.scoreBand,
            ownerId,
            activity: query.activity,
            productStatus: query.productStatus,
            tags: query.tags
              ? query.tags
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              : undefined,
            hasNextAction: query.hasNextAction,
            resolved: query.resolved as 'yes' | 'no' | undefined,
            sort: query.sort,
            page: query.page,
            pageSize: query.pageSize,
          },
          limit,
        );
    return {
      items: rows.rows.map(presentRow),
      meta: buildPaginationMeta(query.page, query.pageSize, rows.total),
    };
  }

  private async listBySegment(
    query: CrmListQueryDto,
    slug: string,
    limit: ActivityThresholds,
  ) {
    const segment = await this.segments.segmentBySlug(slug);
    if (!segment) {
      throw new ApiException(
        'NOT_FOUND',
        'Segment not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const { matches } = await this.leads.previewSegment(
      segment.document,
      limit,
    );
    if (!matches.length) {
      return { rows: [], total: 0 };
    }
    // Intersect the segment with the rest of the active filters by running
    // the same list query and keeping the matching ids — one code path, so a
    // segment can never bypass a filter the admin set.
    const page = await this.records.listFiltered(
      {
        search: query.search,
        source: query.source,
        ownerId: query.ownerId,
        activity: query.activity,
        productStatus: query.productStatus,
        hasNextAction: query.hasNextAction,
        sort: query.sort,
        page: 1,
        pageSize: 100,
      },
      limit,
    );
    const allowed = new Set(matches);
    const filtered = page.rows.filter(
      (row) => row.leadId && allowed.has(row.leadId),
    );
    const start = (query.page - 1) * query.pageSize;
    return {
      rows: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
    };
  }

  // ---------------------------------------------------------------------
  // 360 view
  // ---------------------------------------------------------------------

  @Get('leads/:id')
  @ApiOperation({
    summary: 'Creator 360 view: header, summary, products, attribution',
  })
  @ApiNotFoundResponse({ description: 'NOT_FOUND — no such CRM record.' })
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const limit = thresholds();
    const row = await this.records.byLeadId(id, limit);
    if (!row) {
      throw new ApiException(
        'NOT_FOUND',
        'Creator not found in CRM',
        HttpStatus.NOT_FOUND,
      );
    }
    const [notes, actions, tags, attributions] = await Promise.all([
      this.engagement.listNotes(id),
      this.engagement.listActions(id),
      this.leads.tagsFor(id),
      this.attribution.forLead(id),
    ]);
    return {
      ...presentRow(row),
      notes: notes.map((note) => ({
        id: note.id,
        body: note.body,
        authorId: note.authorId,
        createdAt: note.createdAt,
      })),
      actions: actions.map((action) => ({
        id: action.id,
        type: action.type,
        title: action.title,
        dueDate: action.dueDate,
        assignedToId: action.assignedToId,
        priority: action.priority,
        status: action.status,
        completedAt: action.completedAt,
        snoozedUntil: action.snoozedUntil,
        createdAt: action.createdAt,
      })),
      tags,
      attribution: attributions.map((item) => ({
        id: item.id,
        source: item.source,
        medium: item.medium,
        campaign: item.campaign,
        content: item.content,
        term: item.term,
        landingPage: item.landingPage,
        referrer: item.referrer,
        touchCount: item.touchCount,
        firstSeenAt: item.firstSeenAt,
        lastSeenAt: item.lastSeenAt,
        convertedAt: item.convertedAt,
      })),
    };
  }

  @Get('leads/:id/timeline')
  @ApiOperation({
    summary: 'Creator timeline — real lifecycle events, newest first',
  })
  async timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const size = Math.min(
      100,
      Math.max(1, Number.parseInt(pageSize ?? '20', 10) || 20),
    );
    const lead = await this.leads.requireLead(id);
    const result = lead.creatorProfileId
      ? await this.events.timelineByCreator(
          lead.creatorProfileId,
          size,
          (p - 1) * size,
        )
      : await this.events.timeline(id, size, (p - 1) * size);
    // A lead-linked timeline includes both lead and creator-scoped events.
    const leadScoped = await this.events.timeline(id, size, (p - 1) * size);
    const seen = new Set<string>();
    const items = [...leadScoped.items, ...result.items]
      .filter((item) => {
        const key = String((item as { id: string }).id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.occurredAt as string).getTime() -
          new Date(a.occurredAt as string).getTime(),
      );
    return {
      items,
      meta: buildPaginationMeta(
        p,
        size,
        Math.max(leadScoped.total, result.total),
      ),
    };
  }

  // ---------------------------------------------------------------------
  // Lead CRUD (spec §1, §6)
  // ---------------------------------------------------------------------

  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a lead (works before the person has an account)',
  })
  @ApiConflictResponse({
    description: 'CONFLICT — this person already exists in the CRM.',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR — bad email/source/owner.',
  })
  async create(@CurrentUser() admin: AuthUser, @Body() dto: CreateLeadDto) {
    const lead = await this.leads.create(dto, admin.id);
    return { id: lead.id, createdAt: lead.createdAt };
  }

  @Patch('leads/:id')
  @ApiOperation({
    summary: 'Update a lead, its owner, tags or its manual stage',
  })
  async update(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    const lead = await this.leads.update(id, dto, admin.id);
    return { id: lead.id, updatedAt: lead.updatedAt };
  }

  @Post('leads/:id/outreach')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Log a real outreach touch (feeds the engaged stage)',
  })
  async outreach(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OutreachDto,
  ) {
    await this.leads.requireLead(id);
    await this.engagement.logOutreach(id, dto, admin.id);
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // C2 - the acquisition conversation (spec 6)
  //
  // These endpoints are the ONLY way a human moves a lead through
  // contacted -> replied -> interested, and they do it by RECORDING AN
  // EVENT, never by writing a stage. The funnel still derives the stage:
  // the C1 anti-fake rule carries into C2 unchanged.
  // ---------------------------------------------------------------------

  @Post('leads/:id/replied')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.leads.convert')
  @ApiOperation({
    summary: 'Record that the lead actually replied (feeds the replied stage)',
  })
  async replied(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcquisitionStepDto,
  ) {
    await this.leads.requireLead(id);
    return this.acquisition.recordReply(id, dto, admin.id);
  }

  @Post('leads/:id/interested')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.leads.convert')
  @ApiOperation({ summary: 'Record that the lead said they are interested' })
  async interested(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcquisitionStepDto,
  ) {
    await this.leads.requireLead(id);
    return this.acquisition.recordInterest(id, dto, admin.id);
  }

  @Post('leads/:id/lost')
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.leads.edit')
  @ApiOperation({
    summary: 'Mark a lead lost, or reopen it (an outcome, not a stage)',
  })
  async setLost(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetLostDto,
  ) {
    await this.leads.requireLead(id);
    return this.acquisition.setLost(id, dto, admin.id);
  }

  @Post('leads/:id/conversion-invite')
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.leads.convert')
  @ApiOperation({
    summary:
      'Invite a lead to convert (sends an invite; never creates the account)',
  })
  async conversionInvite(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConversionInviteDto,
  ) {
    await this.leads.requireLead(id);
    return this.conversion.sendInvite(id, dto, {
      id: admin.id,
      // AuthUser carries no display name by design; the sender's verified
      // email is the honest identity to put on the invite.
      email: admin.email,
    });
  }

  // ---------------------------------------------------------------------
  // C2 - referral relationship (spec 12)
  // ---------------------------------------------------------------------

  @Post('leads/:id/referrer')
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.leads.edit')
  @ApiOperation({ summary: 'Link or clear the lead that referred this one' })
  async setReferrer(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReferrerDto,
  ) {
    await this.leads.requireLead(id);
    return this.referrals.setReferrer(id, dto.referredById ?? null, admin.id);
  }

  @Get('leads/:id/referred')
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.leads.view')
  @ApiOperation({ summary: 'The leads this lead referred' })
  async referred(
    @CurrentUser() _admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.leads.requireLead(id);
    return { data: await this.referrals.referredLeads(id) };
  }

  // ---------------------------------------------------------------------
  // C2 - CSV import (spec 28), always preview-then-commit
  // ---------------------------------------------------------------------

  @Post('imports/preview')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.leads.import')
  @ApiOperation({
    summary: 'Validate a CSV without writing anything; returns the report',
  })
  async importPreview(
    @CurrentUser() admin: AuthUser,
    @Body() dto: ImportPreviewDto,
  ) {
    return this.importer.preview(dto.filename, dto.content, admin.id);
  }

  @Post('imports/commit')
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.leads.import')
  @ApiOperation({ summary: 'Apply a previously previewed import' })
  async importCommit(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CommitImportDto,
  ) {
    return this.importer.commit(dto.importId, admin.id);
  }

  @Post('imports/:id/discard')
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.leads.import')
  @ApiOperation({ summary: 'Discard a preview so it can never be committed' })
  async importDiscard(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.importer.discard(id, admin.id);
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Notes (spec §3) and next actions (spec §4)
  // ---------------------------------------------------------------------

  @Post('leads/:id/notes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add an internal note (never visible to the creator)',
  })
  async addNote(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNoteDto,
  ) {
    await this.leads.requireLead(id);
    const note = await this.engagement.addNote(id, dto, admin.id);
    return { id: note.id, createdAt: note.createdAt };
  }

  @Post('leads/:id/actions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create the next action for a creator' })
  async createAction(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateActionDto,
  ) {
    await this.leads.requireLead(id);
    const action = await this.engagement.createAction(id, dto, admin.id);
    return { id: action.id, status: action.status, dueDate: action.dueDate };
  }

  @Patch('leads/:id/actions/:actionId')
  @ApiOperation({ summary: 'Update / complete / snooze a next action' })
  async updateAction(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('actionId', ParseUUIDPipe) actionId: string,
    @Body() dto: UpdateActionDto,
  ) {
    await this.leads.requireLead(id);
    const action = await this.engagement.updateAction(
      id,
      actionId,
      dto,
      admin.id,
    );
    return {
      id: action.id,
      status: action.status,
      completedAt: action.completedAt,
    };
  }

  @Get('actions')
  @ApiOperation({
    summary: 'The internal task queue (the CRM reminder surface)',
  })
  async actionQueue(
    @Query('assignedToId') assignedToId?: string,
    // 50 by default, at most 200; `limit=-5` / `limit=abc` is a 400, not a
    // database error (found by the security suite's list-route crawl).
    @Query('limit', new PageSizeParamPipe(50, 200, 'limit')) limit?: number,
  ) {
    const rows = await this.engagement.queue({
      assignedToId: assignedToId || undefined,
      limit,
    });
    return { items: rows, total: rows.length };
  }

  // ---------------------------------------------------------------------
  // Bulk actions (spec §1)
  // ---------------------------------------------------------------------

  @Post('bulk')
  @ApiOperation({
    summary: 'Bulk owner / stage / tag / next-action / note changes (audited)',
  })
  @ApiForbiddenResponse({
    description: 'FORBIDDEN — the actor is not an admin.',
  })
  async bulk(@CurrentUser() admin: AuthUser, @Body() dto: BulkActionDto) {
    const limit = thresholds();
    const ids = [...new Set(dto.leadIds)];
    switch (dto.action) {
      case 'assign_owner':
        return {
          action: dto.action,
          changed: await this.leads.bulkAssignOwner(
            ids,
            dto.ownerId || null,
            admin.id,
          ),
          skipped: [],
        };
      case 'set_stage': {
        const result = await this.leads.bulkSetManualStage(
          ids,
          dto.manualStage || null,
          admin.id,
          limit,
        );
        return { action: dto.action, ...result };
      }
      case 'clear_stage': {
        const result = await this.leads.bulkSetManualStage(
          ids,
          null,
          admin.id,
          limit,
        );
        return { action: dto.action, ...result };
      }
      case 'add_tag':
        if (!dto.tag) {
          throw new ApiException(
            'VALIDATION_ERROR',
            'tag is required',
            HttpStatus.BAD_REQUEST,
          );
        }
        return {
          action: dto.action,
          changed: await this.leads.bulkAddTag(ids, dto.tag, admin.id),
          skipped: [],
        };
      case 'remove_tag':
        if (!dto.tag) {
          throw new ApiException(
            'VALIDATION_ERROR',
            'tag is required',
            HttpStatus.BAD_REQUEST,
          );
        }
        return {
          action: dto.action,
          changed: await this.leads.bulkRemoveTag(ids, dto.tag, admin.id),
          skipped: [],
        };
      case 'set_next_action': {
        if (!dto.actionType) {
          throw new ApiException(
            'VALIDATION_ERROR',
            'actionType is required',
            HttpStatus.BAD_REQUEST,
          );
        }
        let created = 0;
        for (const id of ids) {
          await this.leads.requireLead(id);
          await this.engagement.createAction(
            id,
            {
              type: dto.actionType,
              title: dto.actionTitle ?? dto.actionType,
              dueDate: dto.dueDate,
              priority: dto.priority,
            },
            admin.id,
          );
          created += 1;
        }
        // A bulk that touched N records is ONE audited operation, exactly
        // like assign_owner / add_tag — the per-row writes are audited by
        // createAction, the batch itself is audited here.
        await this.leads.auditBulkAction(ids, admin.id, dto.action, {
          actionType: dto.actionType,
          changed: created,
        });
        return { action: dto.action, changed: created, skipped: [] };
      }
      case 'add_note': {
        if (!dto.note?.trim()) {
          throw new ApiException(
            'VALIDATION_ERROR',
            'note is required',
            HttpStatus.BAD_REQUEST,
          );
        }
        let created = 0;
        for (const id of ids) {
          await this.leads.requireLead(id);
          await this.engagement.addNote(id, { body: dto.note }, admin.id);
          created += 1;
        }
        await this.leads.auditBulkAction(ids, admin.id, dto.action, {
          changed: created,
        });
        return { action: dto.action, changed: created, skipped: [] };
      }
      default:
        throw new ApiException(
          'VALIDATION_ERROR',
          'Unknown bulk action',
          HttpStatus.BAD_REQUEST,
        );
    }
  }

  // ---------------------------------------------------------------------
  // Segments + saved views
  // ---------------------------------------------------------------------

  @Get('segments')
  @ApiOperation({ summary: 'Dynamic segments with their live match counts' })
  async listSegments() {
    const segments = await this.segments.listSegments();
    return { items: segments, total: segments.length };
  }

  @Post('segments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a dynamic segment from a rule document' })
  async createSegment(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateSegmentDto,
  ) {
    const segment = await this.segments.createSegment(dto as never, admin.id);
    return { id: segment.id, slug: segment.slug };
  }

  @Patch('segments/:id')
  @ApiOperation({ summary: 'Update a segment' })
  async updateSegment(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSegmentDto,
  ) {
    const segment = await this.segments.updateSegment(
      id,
      dto as never,
      admin.id,
    );
    return { id: segment.id, updatedAt: segment.updatedAt };
  }

  @Delete('segments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a non-system segment' })
  @ApiForbiddenResponse({
    description: 'FORBIDDEN — system segments are protected.',
  })
  async deleteSegment(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.segments.deleteSegment(id, admin.id);
  }

  @Get('views')
  @ApiOperation({ summary: 'Saved CRM views (shared + the caller’s own)' })
  async listViews(@CurrentUser() admin: AuthUser) {
    const views = await this.segments.listViews(admin.id);
    return { items: views, total: views.length };
  }

  @Post('views')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save the current filters as a view' })
  async createView(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateSavedViewDto,
  ) {
    const view = await this.segments.createView(dto as never, admin.id);
    return { id: view.id, slug: view.slug };
  }

  @Delete('views/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a view you own' })
  async deleteView(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.segments.deleteView(id, admin.id);
  }

  // ---------------------------------------------------------------------
  // Duplicates + merge (spec §19)
  // ---------------------------------------------------------------------

  @Get('duplicates')
  @ApiOperation({
    summary: 'Candidate duplicate leads with the reason they matched',
  })
  async duplicates() {
    const groups = await this.leads.findDuplicates(thresholds());
    return {
      items: groups.map((group) => ({
        key: group.key,
        reason: group.reason,
        leadIds: group.leadIds,
        rows: group.rows.map(presentRow),
      })),
      total: groups.length,
    };
  }

  @Post('leads/:id/merge')
  @ApiOperation({
    summary: 'Merge this lead into another (audited, reversible)',
  })
  async merge(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeLeadDto,
  ) {
    const lead = await this.leads.merge(dto.targetLeadId, id, admin.id);
    return { id: lead.id, mergedFrom: id };
  }

  @Post('leads/:id/unmerge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo a previous merge' })
  async unmerge(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const lead = await this.leads.unmerge(id, admin.id);
    return { id: lead.id, restored: true };
  }

  // ---------------------------------------------------------------------
  // Dashboard (spec §12) + revenue attribution (§13) + readiness (§15)
  // ---------------------------------------------------------------------

  @Get('dashboard')
  @ApiOperation({
    summary:
      'Growth dashboard: funnel with conversion, drop-off and cycle time',
  })
  async dashboard() {
    const limit = thresholds();
    const [funnel, kpis] = await Promise.all([
      this.analytics.funnel(limit),
      this.analytics.kpis(limit),
    ]);
    return { ...funnel, kpis, thresholds: limit };
  }

  @Get('acquisition-analytics')
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.analytics.view')
  @ApiOperation({
    summary: 'Which channels bring leads who actually reply and convert',
  })
  async acquisitionAnalytics() {
    return this.analytics.acquisitionAnalytics();
  }

  @Get('revenue-attribution')
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.revenue.view')
  @ApiOperation({
    summary: 'Which source produced qualified creators and revenue',
  })
  async revenueAttribution() {
    return this.analytics.revenueAttribution();
  }

  @Get('automation-readiness')
  @ApiOperation({ summary: 'Events already recorded for future automations' })
  async automationReadiness() {
    return this.analytics.automationReadiness();
  }

  // ---------------------------------------------------------------------
  // Export (spec §20)
  // ---------------------------------------------------------------------

  @Get('export')
  @UseGuards(CrmCapabilityGuard)
  @RequireCrmCapability('crm.data.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="creator-crm.csv"')
  @ApiOperation({
    summary: 'Export the filtered CRM list as CSV (audited, no secrets)',
  })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED — anonymous.' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN — non-admin.' })
  async export(
    @CurrentUser() admin: AuthUser,
    @Query() query: CrmListQueryDto,
    @Res() res: Response,
  ) {
    const { csv, rowCount, truncated } = await this.exportService.toCsv(
      {
        search: query.search,
        stage: query.stage,
        source: query.source,
        scoreBand: query.scoreBand,
        ownerId: query.ownerId,
        activity: query.activity,
        productStatus: query.productStatus,
        tags: query.tags
          ? query.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : undefined,
        hasNextAction: query.hasNextAction,
        resolved: query.resolved as 'yes' | 'no' | undefined,
        sort: query.sort,
      },
      thresholds(),
      admin.id,
    );
    res.setHeader('X-CRM-Row-Count', String(rowCount));
    res.setHeader('X-CRM-Truncated', String(truncated));
    res.send(csv);
  }
}

export { thresholds, presentRow, DEFAULT_THRESHOLDS };
