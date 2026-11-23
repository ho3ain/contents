import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatorCrmNote } from '../../database/entities/crm/creator-crm-note.entity';
import { CreatorCrmAction } from '../../database/entities/crm/creator-crm-action.entity';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { CrmEventsService } from './crm-events.service';
import { CREATOR_EVENTS } from './domain/events';
import {
  isCrmActionPriority,
  isCrmActionStatus,
  isCrmActionType,
  OPEN_ACTION_STATUSES,
} from './domain/taxonomy';

export interface CreateNoteInput {
  body: string;
}

export interface CreateActionInput {
  type: string;
  title: string;
  dueDate?: string | null;
  assignedToId?: string | null;
  priority?: string;
}

export interface UpdateActionInput {
  status?: string;
  priority?: string;
  dueDate?: string | null;
  assignedToId?: string | null;
  snoozedUntil?: string | null;
}

/**
 * Phase C1 — internal notes and next actions.
 *
 * Both are INTERNAL: they exist for the growth team, never for the creator.
 * That is structural — this service is provided by the CRM (admin) module and
 * exported nowhere else, so no creator-facing module can reach a note.
 *
 * Both are also the timeline's most important CRM events, so each write
 * appends one idempotent event and one audit record.
 */
@Injectable()
export class CrmEngagementService {
  constructor(
    @InjectRepository(CreatorCrmNote)
    private readonly notesRepository: Repository<CreatorCrmNote>,
    @InjectRepository(CreatorCrmAction)
    private readonly actionsRepository: Repository<CreatorCrmAction>,
    private readonly audit: AuditService,
    private readonly events: CrmEventsService,
  ) {}

  // ---- Notes (spec §3) ----------------------------------------------------

  async addNote(
    leadId: string,
    input: CreateNoteInput,
    actorId: string,
  ): Promise<CreatorCrmNote> {
    const body = input.body?.trim();
    if (!body) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Note body is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (body.length > 4000) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Note is too long (4000 characters max)',
        HttpStatus.BAD_REQUEST,
      );
    }
    const note = this.notesRepository.create({
      leadId,
      body,
      authorId: actorId,
    });
    const saved = await this.notesRepository.save(note);
    await this.audit.record({
      action: 'crm.note_added',
      entity: 'crm_note',
      entityId: saved.id,
      context: { actorId },
      metadata: { leadId, length: body.length },
    });
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.NOTE_ADDED,
      leadId,
      actorId,
      entityType: 'creator_crm_note',
      entityId: saved.id,
      dedupKey: CrmEventsService.dedupKey('crm.note_added', saved.id),
      metadata: { length: body.length },
    });
    await this.touch(leadId);
    return saved;
  }

  async listNotes(leadId: string): Promise<CreatorCrmNote[]> {
    return this.notesRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: { author: true },
    });
  }

  /** Notes are append-only: there is no edit or delete by design (§3). */
  async deleteNote(
    leadId: string,
    noteId: string,
    actorId: string,
  ): Promise<void> {
    const note = await this.notesRepository.findOne({
      where: { id: noteId, leadId },
    });
    if (!note) {
      throw new ApiException(
        'NOT_FOUND',
        'Note not found',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.notesRepository.delete({ id: noteId });
    await this.audit.record({
      action: 'crm.note_added',
      entity: 'crm_note',
      entityId: noteId,
      context: { actorId },
      metadata: { leadId, deleted: true },
    });
  }

  // ---- Next actions (spec §4) -------------------------------------------

  async createAction(
    leadId: string,
    input: CreateActionInput,
    actorId: string,
  ): Promise<CreatorCrmAction> {
    if (!isCrmActionType(input.type)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Unknown action type',
        HttpStatus.BAD_REQUEST,
        {
          field: 'type',
        },
      );
    }
    const title = input.title?.trim();
    if (!title) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Action title is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (input.priority && !isCrmActionPriority(input.priority)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Unknown priority',
        HttpStatus.BAD_REQUEST,
      );
    }
    const action = this.actionsRepository.create({
      leadId,
      type: input.type,
      title: title.slice(0, 200),
      dueDate: parseDate(input.dueDate, 'dueDate'),
      assignedToId: input.assignedToId ?? null,
      priority: input.priority ?? 'normal',
      status: 'open',
      createdBy: actorId,
    });
    const saved = await this.actionsRepository.save(action);
    await this.audit.record({
      action: 'crm.next_action_created',
      entity: 'crm_action',
      entityId: saved.id,
      context: { actorId },
      metadata: {
        leadId,
        type: saved.type,
        priority: saved.priority,
        dueDate: saved.dueDate,
      },
    });
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.NEXT_ACTION_CREATED,
      leadId,
      actorId,
      entityType: 'creator_crm_action',
      entityId: saved.id,
      dedupKey: CrmEventsService.dedupKey('crm.next_action_created', saved.id),
      metadata: { type: saved.type, priority: saved.priority },
    });
    await this.touch(leadId);
    return saved;
  }

  async updateAction(
    leadId: string,
    actionId: string,
    input: UpdateActionInput,
    actorId: string,
  ): Promise<CreatorCrmAction> {
    const action = await this.actionsRepository.findOne({
      where: { id: actionId, leadId },
    });
    if (!action) {
      throw new ApiException(
        'NOT_FOUND',
        'Action not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (input.status !== undefined) {
      if (!isCrmActionStatus(input.status)) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'Unknown status',
          HttpStatus.BAD_REQUEST,
        );
      }
      action.status = input.status;
      action.completedAt = input.status === 'completed' ? new Date() : null;
      if (input.status !== 'snoozed') action.snoozedUntil = null;
    }
    if (input.priority !== undefined) {
      if (!isCrmActionPriority(input.priority)) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'Unknown priority',
          HttpStatus.BAD_REQUEST,
        );
      }
      action.priority = input.priority;
    }
    if (input.dueDate !== undefined)
      action.dueDate = parseDate(input.dueDate, 'dueDate');
    if (input.snoozedUntil !== undefined)
      action.snoozedUntil = parseDate(input.snoozedUntil, 'snoozedUntil');
    if (input.assignedToId !== undefined)
      action.assignedToId = input.assignedToId || null;

    const saved = await this.actionsRepository.save(action);
    await this.audit.record({
      action: 'crm.next_action_updated',
      entity: 'crm_action',
      entityId: saved.id,
      context: { actorId },
      metadata: { leadId, status: saved.status, priority: saved.priority },
    });
    if (input.status === 'completed') {
      await this.events.recordSafe({
        eventName: CREATOR_EVENTS.NEXT_ACTION_COMPLETED,
        leadId,
        actorId,
        entityType: 'creator_crm_action',
        entityId: saved.id,
        dedupKey: CrmEventsService.dedupKey(
          'crm.next_action_completed',
          saved.id,
        ),
        metadata: { type: saved.type },
      });
    }
    return saved;
  }

  async listActions(leadId: string): Promise<CreatorCrmAction[]> {
    return this.actionsRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: { assignedTo: true },
    });
  }

  /**
   * The team's task queue (spec §4 "Reminder") — the growth view of what is
   * open, overdue and assigned. This is the "use the existing Notification
   * system" answer: rather than inventing a second reminder channel, the
   * queue is the notification, scoped to internal users only.
   */
  async queue(options: { assignedToId?: string; limit?: number } = {}): Promise<
    Array<{
      id: string;
      leadId: string;
      leadName: string | null;
      type: string;
      title: string;
      dueDate: Date | null;
      assignedToId: string | null;
      assigneeName: string | null;
      priority: string;
      status: string;
      isOverdue: boolean;
    }>
  > {
    const qb = this.actionsRepository
      .createQueryBuilder('a')
      .leftJoin('creator_leads', 'l', 'l.id = a.lead_id')
      .leftJoin('users', 'u', 'u.id = a.assigned_to_id')
      .select([
        'a.id AS "id"',
        'a.lead_id AS "leadId"',
        'l.name AS "leadName"',
        'a.type AS "type"',
        'a.title AS "title"',
        'a.due_date AS "dueDate"',
        'a.assigned_to_id AS "assignedToId"',
        'u.full_name AS "assigneeName"',
        'a.priority AS "priority"',
        'a.status AS "status"',
        '((a.due_date IS NOT NULL AND a.due_date < now()) AND a.status IN (:...open)) AS "isOverdue"',
      ])
      .where('a.status IN (:...open)', { open: OPEN_ACTION_STATUSES })
      .orderBy('a.due_date', 'ASC', 'NULLS LAST')
      .addOrderBy('a.priority', 'DESC')
      .limit(Math.min(options.limit ?? 50, 200));
    if (options.assignedToId) {
      qb.andWhere('a.assigned_to_id = :assignedToId', {
        assignedToId: options.assignedToId,
      });
    }
    return qb.getRawMany();
  }

  /**
   * Records a real outreach touch (§2 timeline "Outreach"). It is a CRM
   * event like any other, so it feeds the "engaged" stage and the
   * last-activity clock.
   */
  async logOutreach(
    leadId: string,
    body: { channel: string; summary: string },
    actorId: string,
  ): Promise<void> {
    const summary = body.summary?.trim();
    if (!summary) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Outreach summary is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.OUTREACH,
      leadId,
      actorId,
      entityType: 'creator_lead',
      entityId: leadId,
      dedupKey: CrmEventsService.dedupKey('crm.outreach', leadId, Date.now()),
      metadata: { channel: body.channel, summary: summary.slice(0, 300) },
    });
    await this.audit.record({
      action: 'crm.outreach',
      entity: 'crm_lead',
      entityId: leadId,
      context: { actorId },
      metadata: { channel: body.channel },
    });
    await this.touch(leadId);
  }

  /** Every CRM write is an interaction: keep the activity clock honest. */
  private async touch(leadId: string): Promise<void> {
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.LEAD_UPDATED,
      leadId,
      dedupKey: CrmEventsService.dedupKey('crm.touch', leadId, Date.now()),
      metadata: { touch: true },
    });
  }
}

function parseDate(
  value: string | null | undefined,
  field: string,
): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiException(
      'VALIDATION_ERROR',
      `${field} is not a valid date`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return date;
}
