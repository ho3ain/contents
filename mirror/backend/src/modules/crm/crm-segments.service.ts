import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreatorCrmSegment } from '../../database/entities/crm/creator-crm-segment.entity';
import {
  CreatorCrmSavedView,
  type CrmSavedViewFilters,
} from '../../database/entities/crm/creator-crm-saved-view.entity';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { CrmLeadsService } from './crm-leads.service';
import { thresholdsFromEnv } from './domain/activity';
import {
  validateSegmentDocument,
  type SegmentDocument,
} from './domain/segments';
import { normalizeTagSlug } from './domain/taxonomy';
import type { ActivityThresholds } from './crm-records.service';

/**
 * Phase C1 — dynamic segments and saved views.
 *
 * A segment stores a RULE DOCUMENT, so it keeps answering "who matches right
 * now" as the data changes — which is what makes it usable for the future
 * automations of §15. A saved view stores FILTER STATE, so a growth member
 * can pin "high score + my leads + needs follow-up" in one click.
 *
 * Both are validated against closed grammars at write time, so neither table
 * can ever contain an instruction the server does not understand.
 */
@Injectable()
export class CrmSegmentsService {
  constructor(
    @InjectRepository(CreatorCrmSegment)
    private readonly segmentsRepository: Repository<CreatorCrmSegment>,
    @InjectRepository(CreatorCrmSavedView)
    private readonly viewsRepository: Repository<CreatorCrmSavedView>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly leads: CrmLeadsService,
  ) {}

  // ---- Segments ---------------------------------------------------------

  async listSegments(): Promise<
    Array<{
      id: string;
      slug: string;
      name: string;
      description: string;
      document: SegmentDocument;
      isSystem: boolean;
      matchCount: number;
    }>
  > {
    const segments = await this.segmentsRepository.find({
      order: { slug: 'ASC' },
    });
    const counts = await this.segmentCounts();
    return segments.map((segment) => ({
      id: segment.id,
      slug: segment.slug,
      name: segment.name,
      description: segment.description,
      document: segment.document,
      isSystem: segment.isSystem,
      matchCount: counts[segment.slug] ?? 0,
    }));
  }

  /**
   * How many records each segment currently matches. Evaluated in bounded
   * batches through the SAME evaluator the filter uses, so the number in the
   * segment bar and the number in the filtered list can never disagree.
   */
  async segmentCounts(
    thresholds?: ActivityThresholds,
  ): Promise<Record<string, number>> {
    const segments = await this.segmentsRepository.find();
    const out: Record<string, number> = {};
    if (!segments.length) return out;
    const resolved = thresholds ?? this.resolveThresholds();
    for (const segment of segments) {
      const { matches } = await this.leads.previewSegment(
        segment.document,
        resolved,
      );
      out[segment.slug] = matches.length;
    }
    return out;
  }

  private resolveThresholds(): ActivityThresholds {
    return thresholdsFromEnv(process.env);
  }

  async createSegment(
    input: {
      slug: string;
      name: string;
      description?: string;
      document: SegmentDocument;
    },
    actorId: string,
  ): Promise<CreatorCrmSegment> {
    const slug = normalizeTagSlug(input.slug);
    if (!slug) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Segment slug is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const errors = validateSegmentDocument(input.document);
    if (errors.length) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Invalid segment rules',
        HttpStatus.BAD_REQUEST,
        {
          errors,
        },
      );
    }
    const existing = await this.segmentsRepository.findOne({ where: { slug } });
    if (existing) {
      throw new ApiException(
        'CONFLICT',
        'A segment with this slug already exists',
        HttpStatus.CONFLICT,
      );
    }
    const segment = this.segmentsRepository.create({
      slug,
      name: input.name.trim().slice(0, 120),
      description: (input.description ?? '').slice(0, 500),
      document: input.document,
      isSystem: false,
      createdBy: actorId,
    });
    const saved = await this.segmentsRepository.save(segment);
    await this.audit.record({
      action: 'crm.segment_created',
      entity: 'crm_segment',
      entityId: saved.id,
      context: { actorId },
      metadata: { slug: saved.slug },
    });
    return saved;
  }

  async updateSegment(
    id: string,
    input: { name?: string; description?: string; document?: SegmentDocument },
    actorId: string,
  ): Promise<CreatorCrmSegment> {
    const segment = await this.segmentsRepository.findOne({ where: { id } });
    if (!segment) {
      throw new ApiException(
        'NOT_FOUND',
        'Segment not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (input.document) {
      const errors = validateSegmentDocument(input.document);
      if (errors.length) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'Invalid segment rules',
          HttpStatus.BAD_REQUEST,
          {
            errors,
          },
        );
      }
      segment.document = input.document;
    }
    if (input.name) segment.name = input.name.trim().slice(0, 120);
    if (input.description !== undefined)
      segment.description = input.description.slice(0, 500);
    const saved = await this.segmentsRepository.save(segment);
    await this.audit.record({
      action: 'crm.segment_created',
      entity: 'crm_segment',
      entityId: saved.id,
      context: { actorId },
      metadata: { updated: true, slug: saved.slug },
    });
    return saved;
  }

  async deleteSegment(id: string, actorId: string): Promise<void> {
    const segment = await this.segmentsRepository.findOne({ where: { id } });
    if (!segment) {
      throw new ApiException(
        'NOT_FOUND',
        'Segment not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (segment.isSystem) {
      throw new ApiException(
        'FORBIDDEN',
        'System segments cannot be deleted',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.segmentsRepository.delete({ id });
    await this.audit.record({
      action: 'crm.segment_created',
      entity: 'crm_segment',
      entityId: id,
      context: { actorId },
      metadata: { deleted: true, slug: segment.slug },
    });
  }

  async segmentBySlug(slug: string): Promise<CreatorCrmSegment | null> {
    return this.segmentsRepository.findOne({ where: { slug } });
  }

  // ---- Saved views ------------------------------------------------------

  async listViews(actorId: string): Promise<
    Array<{
      id: string;
      slug: string;
      name: string;
      description: string;
      filters: CrmSavedViewFilters;
      isSystem: boolean;
      position: number;
      isOwner: boolean;
    }>
  > {
    const views = await this.viewsRepository.find({
      order: { position: 'ASC', name: 'ASC' },
    });
    return views.map((view) => ({
      id: view.id,
      slug: view.slug,
      name: view.name,
      description: view.description,
      filters: view.filters,
      isSystem: view.isSystem,
      position: view.position,
      isOwner: view.ownerId === null || view.ownerId === actorId,
    }));
  }

  async createView(
    input: {
      slug: string;
      name: string;
      description?: string;
      filters: CrmSavedViewFilters;
    },
    actorId: string,
  ): Promise<CreatorCrmSavedView> {
    const slug = normalizeTagSlug(input.slug);
    if (!slug) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'View slug is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.viewsRepository.findOne({ where: { slug } });
    if (existing) {
      throw new ApiException(
        'CONFLICT',
        'A view with this slug already exists',
        HttpStatus.CONFLICT,
      );
    }
    const view = this.viewsRepository.create({
      slug,
      name: input.name.trim().slice(0, 120),
      description: (input.description ?? '').slice(0, 500),
      filters: sanitizeFilters(input.filters),
      isSystem: false,
      ownerId: actorId,
      position: 100,
    });
    const saved = await this.viewsRepository.save(view);
    await this.audit.record({
      action: 'crm.saved_view_created',
      entity: 'crm_saved_view',
      entityId: saved.id,
      context: { actorId },
      metadata: { slug: saved.slug },
    });
    return saved;
  }

  async deleteView(id: string, actorId: string): Promise<void> {
    const view = await this.viewsRepository.findOne({ where: { id } });
    if (!view) {
      throw new ApiException(
        'NOT_FOUND',
        'View not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (view.isSystem) {
      throw new ApiException(
        'FORBIDDEN',
        'System views cannot be deleted',
        HttpStatus.FORBIDDEN,
      );
    }
    if (view.ownerId && view.ownerId !== actorId) {
      throw new ApiException(
        'FORBIDDEN',
        'You can only delete your own views',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.viewsRepository.delete({ id });
    await this.audit.record({
      action: 'crm.saved_view_created',
      entity: 'crm_saved_view',
      entityId: id,
      context: { actorId },
      metadata: { deleted: true, slug: view.slug },
    });
  }

  /** Shared views plus the caller's own — never another admin's private view. */
  async visibleViews(actorId: string): Promise<CreatorCrmSavedView[]> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM creator_crm_saved_views
        WHERE owner_id IS NULL OR owner_id = $1
        ORDER BY position ASC, name ASC`,
      [actorId],
    );
    if (!rows.length) return [];
    return this.viewsRepository.find({
      where: rows.map((row) => ({ id: row.id })),
      order: { position: 'ASC', name: 'ASC' },
    });
  }
}

/** Whitelists the persisted filter shape — no arbitrary key can be stored. */
function sanitizeFilters(
  filters: CrmSavedViewFilters | undefined,
): CrmSavedViewFilters {
  const out: CrmSavedViewFilters = {};
  if (!filters || typeof filters !== 'object') return out;
  const text = (value: unknown, max = 120): string | undefined =>
    typeof value === 'string' && value.trim()
      ? value.trim().slice(0, max)
      : undefined;
  out.search = text(filters.search);
  out.stage = text(filters.stage, 24);
  out.source = text(filters.source, 32);
  out.scoreBand = text(filters.scoreBand, 16);
  out.ownerId = text(filters.ownerId, 36);
  out.activity = text(filters.activity, 16);
  out.productStatus = text(filters.productStatus, 24);
  out.segmentSlug = text(filters.segmentSlug, 64);
  out.sort = text(filters.sort, 32);
  if (Array.isArray(filters.tags)) {
    out.tags = filters.tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map(normalizeTagSlug)
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof filters.hasNextAction === 'boolean')
    out.hasNextAction = filters.hasNextAction;
  return out;
}

export { sanitizeFilters };
