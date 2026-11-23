import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { AgentReviewSubmission } from '../../database/entities/agents/agent-review-submission.entity';
import { EvaluationClaimAssessment } from '../../database/entities/evaluation/evaluation-claim-assessment.entity';
import { EvaluationControlResult } from '../../database/entities/evaluation/evaluation-control-result.entity';
import { EvaluationEvidenceRecord } from '../../database/entities/evaluation/evaluation-evidence-record.entity';
import { EvaluationRun } from '../../database/entities/evaluation/evaluation-run.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { TechnicalReviewAssignment } from '../../database/entities/technical-review/technical-review-assignment.entity';
import { TechnicalReviewCase } from '../../database/entities/technical-review/technical-review-case.entity';
import { TechnicalReviewControlReview } from '../../database/entities/technical-review/technical-review-control-review.entity';
import { TechnicalReviewCreatorResponse } from '../../database/entities/technical-review/technical-review-creator-response.entity';
import { TechnicalReviewDecision } from '../../database/entities/technical-review/technical-review-decision.entity';
import { TechnicalReviewEvent } from '../../database/entities/technical-review/technical-review-event.entity';
import { TechnicalReviewFinding } from '../../database/entities/technical-review/technical-review-finding.entity';
import { AdminAuditService } from '../control-plane/audit/admin-audit.service';
import { AdminAccessService } from '../control-plane/authz/admin-access.service';
import type { Permission } from '../control-plane/authz/admin-permissions';
import type {
  AdminTechnicalReviewQueryDto,
  AssignTechnicalReviewDto,
  CreateTechnicalFindingDto,
  CreateTechnicalReviewCaseDto,
  CreatorResponseDto,
  CreatorTechnicalReviewQueryDto,
  ReopenTechnicalReviewDto,
  RequestTechnicalChangesDto,
  ResubmitTechnicalReviewDto,
  ReviewControlDto,
  SecurityEscalationDto,
  TechnicalDecisionDto,
} from './dto/technical-review.dto';
import {
  MUTABLE_TECHNICAL_STATES,
  requiresIndependentSecondApproval,
  type TechnicalDecisionType,
  type TechnicalReviewCaseState,
} from './domain/technical-review.types';

const page = (n?: number) => Math.max(1, n ?? 1);
const size = (n?: number) => Math.min(100, Math.max(1, n ?? 25));

function fail(
  code: ConstructorParameters<typeof ApiException>[0],
  message: string,
  status: HttpStatus,
  details?: Record<string, unknown>,
): never {
  throw new ApiException(code, message, status, details);
}

/**
 * The sole technical-review command owner. It does not invoke legacy product
 * approval/publish, change EvaluationRun, mutate controls/evidence/claims, or
 * execute artifacts. Locks + `revision` protect state-changing commands.
 */
@Injectable()
export class TechnicalReviewService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AdminAuditService,
    private readonly adminAccess: AdminAccessService,
  ) {}

  async createForCreator(userId: string, dto: CreateTechnicalReviewCaseDto) {
    return this.dataSource.transaction(async (m) => {
      const creator = await this.requireCreator(m, userId);
      const existing = await m.getRepository(TechnicalReviewCase).findOneBy({
        creatorId: creator.id,
        idempotencyKey: dto.idempotencyKey,
      });
      if (existing) {
        if (
          existing.evaluationRunId !== dto.evaluationRunId ||
          existing.reviewSubmissionId !== dto.reviewSubmissionId
        ) {
          fail(
            'IDEMPOTENCY_CONFLICT',
            'This idempotency key is already bound to another technical review input',
            HttpStatus.CONFLICT,
          );
        }
        return { case: this.creatorCase(existing), reused: true };
      }
      const created = await this.createCase(m, creator, dto);
      await this.auditCreator(
        m,
        userId,
        'technical_review.case_submitted',
        created.id,
        {
          evaluationRunId: created.evaluationRunId,
          reviewSubmissionId: created.reviewSubmissionId,
        },
      );
      return { case: this.creatorCase(created), reused: false };
    });
  }

  async listForCreator(userId: string, query: CreatorTechnicalReviewQueryDto) {
    const creator = await this.requireCreator(this.dataSource.manager, userId);
    const take = size(query.pageSize);
    const current = page(query.page);
    const qb = this.dataSource
      .getRepository(TechnicalReviewCase)
      .createQueryBuilder('c')
      .where('c.creator_id = :creatorId', { creatorId: creator.id })
      .orderBy('c.updatedAt', 'DESC')
      .skip((current - 1) * take)
      .take(take);
    if (query.state) qb.andWhere('c.state = :state', { state: query.state });
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((item) => this.creatorCase(item)),
      meta: { total, page: current, pageSize: take },
    };
  }

  async getForCreator(userId: string, caseId: string) {
    const creator = await this.requireCreator(this.dataSource.manager, userId);
    const reviewCase = await this.dataSource
      .getRepository(TechnicalReviewCase)
      .findOneBy({ id: caseId, creatorId: creator.id });
    if (!reviewCase)
      fail(
        'NOT_FOUND',
        'Technical review case not found',
        HttpStatus.NOT_FOUND,
      );
    const [findings, responses, decisions, events, run, controls] =
      await Promise.all([
        this.dataSource.getRepository(TechnicalReviewFinding).find({
          where: { caseId, creatorVisible: true },
          order: { createdAt: 'ASC' },
        }),
        this.dataSource.getRepository(TechnicalReviewCreatorResponse).find({
          where: { caseId, creatorId: creator.id },
          order: { createdAt: 'ASC' },
        }),
        this.dataSource
          .getRepository(TechnicalReviewDecision)
          .find({ where: { caseId }, order: { createdAt: 'ASC' } }),
        this.dataSource
          .getRepository(TechnicalReviewEvent)
          .find({ where: { caseId }, order: { createdAt: 'ASC' } }),
        this.dataSource
          .getRepository(EvaluationRun)
          .findOneBy({ id: reviewCase.evaluationRunId }),
        this.dataSource.getRepository(EvaluationControlResult).find({
          where: { evaluationRunId: reviewCase.evaluationRunId },
          order: { createdAt: 'ASC' },
        }),
      ]);
    return {
      case: this.creatorCase(reviewCase),
      evaluation: run ? this.safeEvaluation(run, controls) : null,
      findings: findings.map((item) => this.creatorFinding(item)),
      responses: responses.map((item) => ({
        id: item.id,
        findingId: item.findingId,
        response: item.response,
        evidenceReference: item.evidenceReference,
        createdAt: item.createdAt,
      })),
      decisions: decisions.map((item) => ({
        type: item.decisionType,
        rationale: item.rationale,
        createdAt: item.createdAt,
      })),
      timeline: events
        .filter(
          (e) =>
            !e.type.startsWith('security_') &&
            !e.type.startsWith('assignment_'),
        )
        .map((e) => ({
          type: e.type,
          fromState: e.fromState,
          toState: e.toState,
          reason: e.reason,
          createdAt: e.createdAt,
        })),
      publication: {
        status: 'NotDetermined',
        note: 'Technical review does not publish this product. Release eligibility is decided separately.',
      },
    };
  }

  async respondForCreator(
    userId: string,
    caseId: string,
    dto: CreatorResponseDto,
  ) {
    return this.dataSource.transaction(async (m) => {
      const creator = await this.requireCreator(m, userId);
      const reviewCase = await this.lockCase(m, caseId);
      this.assertCreatorOwner(reviewCase, creator.id);
      this.assertRevision(reviewCase, dto.expectedRevision);
      if (
        !['ChangesRequested', 'AwaitingCreatorResponse'].includes(
          reviewCase.state,
        )
      ) {
        fail(
          'INVALID_TRANSITION',
          'Responses are only accepted while changes are requested',
          HttpStatus.CONFLICT,
          { state: reviewCase.state },
        );
      }
      const finding = await m
        .getRepository(TechnicalReviewFinding)
        .findOneBy({ id: dto.findingId, caseId, creatorVisible: true });
      if (!finding)
        fail(
          'NOT_FOUND',
          'Creator-visible technical finding not found',
          HttpStatus.NOT_FOUND,
        );
      const response = await m
        .getRepository(TechnicalReviewCreatorResponse)
        .save(
          m.getRepository(TechnicalReviewCreatorResponse).create({
            caseId,
            findingId: finding.id,
            creatorId: creator.id,
            response: dto.response.trim(),
            evidenceReference: dto.evidenceReference ?? null,
          }),
        );
      const updated = await this.transition(
        m,
        reviewCase,
        'AwaitingRetest',
        userId,
        'creator_response_submitted',
        'Creator supplied a response; a new bound evaluation/submission is required for retest',
      );
      await this.auditCreator(
        m,
        userId,
        'technical_review.creator_response_submitted',
        caseId,
        { findingId: finding.id, responseId: response.id },
      );
      return {
        response: {
          id: response.id,
          findingId: response.findingId,
          createdAt: response.createdAt,
        },
        case: this.creatorCase(updated),
      };
    });
  }

  async resubmitForCreator(
    userId: string,
    caseId: string,
    dto: ResubmitTechnicalReviewDto,
  ) {
    return this.dataSource.transaction(async (m) => {
      const creator = await this.requireCreator(m, userId);
      const previous = await this.lockCase(m, caseId);
      this.assertCreatorOwner(previous, creator.id);
      this.assertRevision(previous, dto.expectedRevision);
      if (previous.state !== 'AwaitingRetest')
        fail(
          'INVALID_TRANSITION',
          'A successor technical case requires a creator response and retest state',
          HttpStatus.CONFLICT,
          { state: previous.state },
        );
      if (
        previous.reviewSubmissionId === dto.reviewSubmissionId ||
        previous.evaluationRunId === dto.evaluationRunId
      ) {
        fail(
          'UNPROCESSABLE',
          'Resubmission must bind a new submission and a new evaluation run',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const existing = await m.getRepository(TechnicalReviewCase).findOneBy({
        creatorId: creator.id,
        idempotencyKey: dto.idempotencyKey,
      });
      if (existing) return { case: this.creatorCase(existing), reused: true };
      const successor = await this.createCase(m, creator, dto, previous.id);
      await this.transition(
        m,
        previous,
        'Superseded',
        userId,
        'case_superseded',
        'A successor case has been submitted',
        { successorCaseId: successor.id },
      );
      await m
        .getRepository(TechnicalReviewCase)
        .update(previous.id, { supersededByCaseId: successor.id });
      await this.decision(
        m,
        previous.id,
        'Superseded',
        'Superseded by a successor case with new immutable anchors',
        userId,
        dto.idempotencyKey,
      );
      await this.auditCreator(
        m,
        userId,
        'technical_review.case_resubmitted',
        successor.id,
        { predecessorCaseId: previous.id },
      );
      return { case: this.creatorCase(successor), reused: false };
    });
  }

  async listForAdmin(query: AdminTechnicalReviewQueryDto) {
    const take = size(query.pageSize);
    const current = page(query.page);
    const qb = this.dataSource
      .getRepository(TechnicalReviewCase)
      .createQueryBuilder('c')
      .orderBy('c.createdAt', 'ASC')
      .skip((current - 1) * take)
      .take(take);
    if (query.state) qb.where('c.state = :state', { state: query.state });
    if (query.riskLevel)
      qb.andWhere('c.risk_level = :riskLevel', { riskLevel: query.riskLevel });
    if (query.profile)
      qb.andWhere('c.profile = :profile', { profile: query.profile });
    if (query.assignedTo)
      qb.andWhere(
        '(c.assigned_technical_reviewer_id = :assignedTo OR c.assigned_security_reviewer_id = :assignedTo)',
        { assignedTo: query.assignedTo },
      );
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((item) => this.adminQueueCase(item)),
      meta: { total, page: current, pageSize: take },
    };
  }

  async getForAdmin(caseId: string) {
    const reviewCase = await this.requireCase(caseId);
    const [
      run,
      controls,
      evidence,
      claims,
      assignments,
      humanControls,
      findings,
      responses,
      decisions,
      events,
    ] = await Promise.all([
      this.dataSource
        .getRepository(EvaluationRun)
        .findOneBy({ id: reviewCase.evaluationRunId }),
      this.dataSource.getRepository(EvaluationControlResult).find({
        where: { evaluationRunId: reviewCase.evaluationRunId },
        order: { createdAt: 'ASC' },
      }),
      this.dataSource.getRepository(EvaluationEvidenceRecord).find({
        where: { evaluationRunId: reviewCase.evaluationRunId },
        order: { createdAt: 'ASC' },
      }),
      this.dataSource.getRepository(EvaluationClaimAssessment).find({
        where: { evaluationRunId: reviewCase.evaluationRunId },
        order: { createdAt: 'ASC' },
      }),
      this.dataSource
        .getRepository(TechnicalReviewAssignment)
        .find({ where: { caseId }, order: { createdAt: 'ASC' } }),
      this.dataSource
        .getRepository(TechnicalReviewControlReview)
        .find({ where: { caseId }, order: { createdAt: 'ASC' } }),
      this.dataSource
        .getRepository(TechnicalReviewFinding)
        .find({ where: { caseId }, order: { createdAt: 'ASC' } }),
      this.dataSource
        .getRepository(TechnicalReviewCreatorResponse)
        .find({ where: { caseId }, order: { createdAt: 'ASC' } }),
      this.dataSource
        .getRepository(TechnicalReviewDecision)
        .find({ where: { caseId }, order: { createdAt: 'ASC' } }),
      this.dataSource
        .getRepository(TechnicalReviewEvent)
        .find({ where: { caseId }, order: { createdAt: 'ASC' } }),
    ]);
    return {
      case: this.adminQueueCase(reviewCase),
      evaluation: run
        ? {
            ...this.safeEvaluation(run, controls),
            inputSnapshot: run.inputSnapshot,
            policy: {
              key: run.policyKey,
              version: run.policyVersion,
              engineVersion: run.engineVersion,
            },
          }
        : null,
      evidence: evidence.map((item) => ({
        id: item.id,
        controlResultId: item.controlResultId,
        kind: item.evidenceKind,
        source: item.source,
        sensitivity: item.sensitivity,
        digest: item.valueDigest,
        value: item.sensitivity === 'safe' ? item.valueRedacted : undefined,
        restricted: item.sensitivity === 'restricted',
        createdAt: item.createdAt,
      })),
      claims: claims.map((item) => ({
        id: item.id,
        claimKey: item.claimKey,
        status: item.status,
        scope: item.scope,
        limitation: item.limitation,
        controlIds: item.controlIds,
        createdAt: item.createdAt,
      })),
      assignments,
      humanControlReviews: humanControls,
      findings,
      creatorResponses: responses.map((item) => ({
        id: item.id,
        findingId: item.findingId,
        creatorId: item.creatorId,
        response: item.response,
        evidenceReference: item.evidenceReference,
        createdAt: item.createdAt,
      })),
      decisions: decisions.map((item) => ({
        id: item.id,
        type: item.decisionType,
        rationale: item.rationale,
        decidedBy: item.decidedBy,
        createdAt: item.createdAt,
      })),
      timeline: events,
      releaseHandoff: this.releaseHandoff(reviewCase, run),
    };
  }

  async claim(userId: string, caseId: string, dto: ReopenTechnicalReviewDto) {
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      if (reviewCase.state !== 'PendingReview')
        fail(
          'INVALID_TRANSITION',
          'Only pending cases can be claimed',
          HttpStatus.CONFLICT,
          { state: reviewCase.state },
        );
      if (
        reviewCase.assignedTechnicalReviewerId &&
        reviewCase.assignedTechnicalReviewerId !== userId
      )
        fail(
          'FORBIDDEN',
          'This case is assigned to another technical reviewer',
          HttpStatus.FORBIDDEN,
        );
      if (!reviewCase.assignedTechnicalReviewerId)
        await this.assignProjection(
          m,
          reviewCase,
          'Technical',
          userId,
          userId,
          dto.rationale,
        );
      const updated = await this.transition(
        m,
        reviewCase,
        'InReview',
        userId,
        'review_claimed',
        dto.rationale,
      );
      await this.auditAdmin(m, userId, 'technical_review.claimed', caseId, {
        state: updated.state,
      });
      return this.adminQueueCase(updated);
    });
  }

  async assign(userId: string, caseId: string, dto: AssignTechnicalReviewDto) {
    const permission: Permission =
      dto.assignmentType === 'Technical'
        ? 'technical_review:claim'
        : 'technical_review:security_review';
    await this.requireReviewerPermission(dto.reviewerId, permission);
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      this.assertMutable(reviewCase);
      await this.assignProjection(
        m,
        reviewCase,
        dto.assignmentType,
        dto.reviewerId,
        userId,
        dto.reason,
      );
      const latest = await this.lockCase(m, caseId);
      await this.event(
        m,
        caseId,
        'assignment_changed',
        latest.state,
        latest.state,
        userId,
        dto.reason,
        { assignmentType: dto.assignmentType, assigneeId: dto.reviewerId },
      );
      await this.auditAdmin(
        m,
        userId,
        'technical_review.assignment_changed',
        caseId,
        { assignmentType: dto.assignmentType, assigneeId: dto.reviewerId },
      );
      return this.adminQueueCase(latest);
    });
  }

  async reviewControl(userId: string, caseId: string, dto: ReviewControlDto) {
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      if (!['InReview', 'Escalated'].includes(reviewCase.state))
        fail(
          'INVALID_TRANSITION',
          'Control reviews require an active technical/security review',
          HttpStatus.CONFLICT,
          { state: reviewCase.state },
        );
      this.assertAssignedReviewer(reviewCase, userId);
      const control = await m.getRepository(EvaluationControlResult).findOneBy({
        id: dto.controlResultId,
        evaluationRunId: reviewCase.evaluationRunId,
      });
      if (!control)
        fail(
          'NOT_FOUND',
          'Control result does not belong to this exact evaluation run',
          HttpStatus.NOT_FOUND,
        );
      const saved = await m.getRepository(TechnicalReviewControlReview).save(
        m.getRepository(TechnicalReviewControlReview).create({
          caseId,
          controlResultId: control.id,
          outcome: dto.outcome,
          rationale: dto.rationale.trim(),
          scopeNote: dto.scopeNote?.trim() || null,
          reviewedBy: userId,
        }),
      );
      const latest = await this.bump(m, reviewCase);
      await this.event(
        m,
        caseId,
        'control_review_recorded',
        latest.state,
        latest.state,
        userId,
        null,
        { controlResultId: control.id, outcome: dto.outcome },
      );
      await this.auditAdmin(
        m,
        userId,
        'technical_review.control_review_recorded',
        caseId,
        { controlResultId: control.id, outcome: dto.outcome },
      );
      return saved;
    });
  }

  async createFinding(
    userId: string,
    caseId: string,
    dto: CreateTechnicalFindingDto,
  ) {
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      this.assertMutable(reviewCase);
      this.assertAssignedReviewer(reviewCase, userId);
      if (
        dto.category === 'Security' &&
        reviewCase.assignedSecurityReviewerId !== userId
      )
        fail(
          'FORBIDDEN',
          'Only the assigned security reviewer may create a security finding',
          HttpStatus.FORBIDDEN,
        );
      if (dto.controlResultId) {
        const control = await m
          .getRepository(EvaluationControlResult)
          .findOneBy({
            id: dto.controlResultId,
            evaluationRunId: reviewCase.evaluationRunId,
          });
        if (!control)
          fail(
            'NOT_FOUND',
            'Control result does not belong to this evaluation',
            HttpStatus.NOT_FOUND,
          );
      }
      if (dto.claimAssessmentId) {
        const claim = await m
          .getRepository(EvaluationClaimAssessment)
          .findOneBy({
            id: dto.claimAssessmentId,
            evaluationRunId: reviewCase.evaluationRunId,
          });
        if (!claim)
          fail(
            'NOT_FOUND',
            'Claim assessment does not belong to this evaluation',
            HttpStatus.NOT_FOUND,
          );
      }
      const saved = await m.getRepository(TechnicalReviewFinding).save(
        m.getRepository(TechnicalReviewFinding).create({
          caseId,
          controlResultId: dto.controlResultId ?? null,
          claimAssessmentId: dto.claimAssessmentId ?? null,
          severity: dto.severity,
          category: dto.category,
          creatorVisible: dto.creatorVisible,
          title: dto.title.trim(),
          description: dto.description.trim(),
          requiredAction: dto.requiredAction?.trim() || null,
          createdBy: userId,
        }),
      );
      const latest = await this.bump(m, reviewCase);
      await this.event(
        m,
        caseId,
        'finding_recorded',
        latest.state,
        latest.state,
        userId,
        null,
        {
          findingId: saved.id,
          category: saved.category,
          creatorVisible: saved.creatorVisible,
        },
      );
      await this.auditAdmin(
        m,
        userId,
        'technical_review.finding_recorded',
        caseId,
        {
          findingId: saved.id,
          category: saved.category,
          creatorVisible: saved.creatorVisible,
        },
      );
      return saved;
    });
  }

  async requestChanges(
    userId: string,
    caseId: string,
    dto: RequestTechnicalChangesDto,
  ) {
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      this.assertAssignedTechnical(reviewCase, userId);
      if (reviewCase.state !== 'InReview')
        fail(
          'INVALID_TRANSITION',
          'Changes can only be requested from active review',
          HttpStatus.CONFLICT,
          { state: reviewCase.state },
        );
      const findings = await m
        .getRepository(TechnicalReviewFinding)
        .findByIds(dto.findingIds);
      if (
        findings.length !== dto.findingIds.length ||
        findings.some(
          (item) =>
            item.caseId !== caseId ||
            !item.creatorVisible ||
            !item.requiredAction,
        )
      ) {
        fail(
          'FEEDBACK_REQUIRED',
          'Changes require one or more creator-visible actionable findings from this case',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const changes = await this.transition(
        m,
        reviewCase,
        'ChangesRequested',
        userId,
        'changes_requested',
        dto.rationale,
        { findingIds: dto.findingIds },
      );
      const awaiting = await this.transition(
        m,
        changes,
        'AwaitingCreatorResponse',
        userId,
        'awaiting_creator_response',
        null,
      );
      await this.decision(
        m,
        caseId,
        'ChangesRequested',
        dto.rationale,
        userId,
        dto.idempotencyKey,
      );
      await this.auditAdmin(
        m,
        userId,
        'technical_review.changes_requested',
        caseId,
        { findingIds: dto.findingIds },
      );
      return this.adminQueueCase(awaiting);
    });
  }

  async escalateSecurity(
    userId: string,
    caseId: string,
    dto: SecurityEscalationDto,
  ) {
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      this.assertAssignedTechnical(reviewCase, userId);
      if (reviewCase.state !== 'InReview')
        fail(
          'INVALID_TRANSITION',
          'Security escalation requires active technical review',
          HttpStatus.CONFLICT,
          { state: reviewCase.state },
        );
      const updated = await this.transition(
        m,
        reviewCase,
        'Escalated',
        userId,
        'security_escalated',
        dto.rationale,
      );
      await this.decision(
        m,
        caseId,
        'SecurityEscalated',
        dto.rationale,
        userId,
        dto.idempotencyKey,
      );
      await this.auditAdmin(
        m,
        userId,
        'technical_review.security_escalated',
        caseId,
        {},
      );
      return this.adminQueueCase(updated);
    });
  }

  async resolveSecurityEscalation(
    userId: string,
    caseId: string,
    dto: ReopenTechnicalReviewDto,
  ) {
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      if (reviewCase.state !== 'Escalated')
        fail(
          'INVALID_TRANSITION',
          'Only an escalated case can be returned to technical review',
          HttpStatus.CONFLICT,
          { state: reviewCase.state },
        );
      if (reviewCase.assignedSecurityReviewerId !== userId)
        fail(
          'FORBIDDEN',
          'Only the assigned security reviewer may resolve this escalation',
          HttpStatus.FORBIDDEN,
        );
      const updated = await this.transition(
        m,
        reviewCase,
        'InReview',
        userId,
        'security_escalation_resolved',
        dto.rationale,
      );
      await this.auditAdmin(
        m,
        userId,
        'technical_review.security_escalation_resolved',
        caseId,
        {},
      );
      return this.adminQueueCase(updated);
    });
  }

  async decide(userId: string, caseId: string, dto: TechnicalDecisionDto) {
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      this.assertAssignedTechnical(reviewCase, userId);
      if (reviewCase.state !== 'InReview')
        fail(
          'INVALID_TRANSITION',
          'A technical decision requires active review',
          HttpStatus.CONFLICT,
          { state: reviewCase.state },
        );
      if (dto.decision === 'reject') {
        const updated = await this.transition(
          m,
          reviewCase,
          'Rejected',
          userId,
          'technical_decision_rejected',
          dto.rationale,
        );
        await this.decision(
          m,
          caseId,
          'Rejected',
          dto.rationale,
          userId,
          dto.idempotencyKey,
        );
        await this.auditAdmin(
          m,
          userId,
          'technical_review.rejected',
          caseId,
          {},
        );
        return this.adminQueueCase(updated);
      }
      await this.assertApprovalGate(m, reviewCase);
      if (reviewCase.requiresSecondApproval) {
        await this.decision(
          m,
          caseId,
          'TechnicalApprovalProposed',
          dto.rationale,
          userId,
          dto.idempotencyKey,
        );
        const updated = await this.bump(m, reviewCase, {
          firstApprovalBy: userId,
        });
        await this.event(
          m,
          caseId,
          'technical_approval_proposed',
          updated.state,
          updated.state,
          userId,
          dto.rationale,
          { requiresSecondApproval: true },
        );
        await this.auditAdmin(
          m,
          userId,
          'technical_review.approval_proposed',
          caseId,
          { requiresSecondApproval: true },
        );
        return this.adminQueueCase(updated);
      }
      const updated = await this.transition(
        m,
        reviewCase,
        'TechnicallyApproved',
        userId,
        'technically_approved',
        dto.rationale,
      );
      await this.decision(
        m,
        caseId,
        'TechnicallyApproved',
        dto.rationale,
        userId,
        dto.idempotencyKey,
      );
      await this.auditAdmin(m, userId, 'technical_review.approved', caseId, {
        publicationChanged: false,
      });
      return this.adminQueueCase(updated);
    });
  }

  async secondApprove(
    userId: string,
    caseId: string,
    dto: ReopenTechnicalReviewDto,
  ) {
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      if (!reviewCase.requiresSecondApproval || !reviewCase.firstApprovalBy)
        fail(
          'INVALID_TRANSITION',
          'No independent second approval is pending for this case',
          HttpStatus.CONFLICT,
        );
      if (reviewCase.firstApprovalBy === userId)
        fail(
          'FORBIDDEN',
          'The first approver cannot supply the independent second approval',
          HttpStatus.FORBIDDEN,
        );
      if (reviewCase.state !== 'InReview')
        fail(
          'INVALID_TRANSITION',
          'Second approval requires active review',
          HttpStatus.CONFLICT,
          { state: reviewCase.state },
        );
      await this.assertApprovalGate(m, reviewCase);
      const updated = await this.transition(
        m,
        reviewCase,
        'TechnicallyApproved',
        userId,
        'technical_second_approval',
        dto.rationale,
      );
      await this.decision(
        m,
        caseId,
        'TechnicallyApproved',
        dto.rationale,
        userId,
        dto.idempotencyKey,
      );
      await this.auditAdmin(
        m,
        userId,
        'technical_review.second_approved',
        caseId,
        {
          firstApproverId: reviewCase.firstApprovalBy,
          publicationChanged: false,
        },
      );
      return this.adminQueueCase(updated);
    });
  }

  async reopen(userId: string, caseId: string, dto: ReopenTechnicalReviewDto) {
    return this.dataSource.transaction(async (m) => {
      const reviewCase = await this.lockCase(m, caseId);
      this.assertRevision(reviewCase, dto.expectedRevision);
      if (!['Rejected', 'TechnicallyApproved'].includes(reviewCase.state))
        fail(
          'INVALID_TRANSITION',
          'Only a final technical decision can be reopened',
          HttpStatus.CONFLICT,
          { state: reviewCase.state },
        );
      const updated = await this.transition(
        m,
        reviewCase,
        'InReview',
        userId,
        'technical_review_reopened',
        dto.rationale,
        { previousDecisionState: reviewCase.state },
      );
      await this.decision(
        m,
        caseId,
        'Reopened',
        dto.rationale,
        userId,
        dto.idempotencyKey,
      );
      await this.auditAdmin(m, userId, 'technical_review.reopened', caseId, {});
      return this.adminQueueCase(updated);
    });
  }

  private async createCase(
    m: EntityManager,
    creator: CreatorProfile,
    dto: CreateTechnicalReviewCaseDto,
    predecessorCaseId: string | null = null,
  ) {
    const [run, submission] = await Promise.all([
      m
        .getRepository(EvaluationRun)
        .findOneBy({ id: dto.evaluationRunId, creatorId: creator.id }),
      m
        .getRepository(AgentReviewSubmission)
        .findOneBy({ id: dto.reviewSubmissionId, creatorId: creator.id }),
    ]);
    if (!run || !submission)
      fail(
        'NOT_FOUND',
        'Evaluation run or review submission not found',
        HttpStatus.NOT_FOUND,
      );
    if (run.state !== 'Completed' || !run.finalStatus)
      fail(
        'UNPROCESSABLE',
        'Technical review requires a completed evaluation run',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (
      run.reviewSubmissionId !== submission.id ||
      run.agentId !== submission.agentId ||
      (submission.versionId && run.agentVersionId !== submission.versionId)
    ) {
      fail(
        'UNPROCESSABLE',
        'Evaluation and submission must have the same immutable product/version anchor',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const bound = await m
      .getRepository(TechnicalReviewCase)
      .findOneBy({ evaluationRunId: run.id });
    if (bound)
      fail(
        'CONFLICT',
        'This evaluation run is already bound to a technical review case',
        HttpStatus.CONFLICT,
        { caseId: bound.id },
      );
    const created = await m.getRepository(TechnicalReviewCase).save(
      m.getRepository(TechnicalReviewCase).create({
        agentId: run.agentId,
        creatorId: creator.id,
        agentVersionId: run.agentVersionId,
        reviewSubmissionId: submission.id,
        evaluationRunId: run.id,
        profile: run.profile,
        riskLevel: run.riskLevel,
        state: 'PendingReview',
        assignedTechnicalReviewerId: null,
        assignedSecurityReviewerId: null,
        firstApprovalBy: null,
        requiresSecondApproval: requiresIndependentSecondApproval(
          run.riskLevel,
        ),
        predecessorCaseId,
        supersededByCaseId: null,
        idempotencyKey: dto.idempotencyKey,
        revision: 1,
      }),
    );
    await this.event(
      m,
      created.id,
      'case_submitted',
      null,
      'PendingReview',
      creator.userId,
      null,
      {
        evaluationRunId: run.id,
        reviewSubmissionId: submission.id,
        riskLevel: run.riskLevel,
      },
    );
    return created;
  }

  private async assertApprovalGate(
    m: EntityManager,
    reviewCase: TechnicalReviewCase,
  ) {
    const [run, controls, unresolvedFindings] = await Promise.all([
      m
        .getRepository(EvaluationRun)
        .findOneBy({ id: reviewCase.evaluationRunId }),
      m
        .getRepository(EvaluationControlResult)
        .find({ where: { evaluationRunId: reviewCase.evaluationRunId } }),
      m
        .getRepository(TechnicalReviewFinding)
        .find({ where: { caseId: reviewCase.id, creatorVisible: true } }),
    ]);
    const blocking = controls.filter(
      (c) =>
        ['Mandatory', 'Conditional'].includes(c.requirement) &&
        !['Passed', 'NotApplicable'].includes(c.outcome),
    );
    if (
      !run ||
      run.state !== 'Completed' ||
      run.finalStatus !== 'Passed' ||
      blocking.length
    ) {
      fail(
        'REVIEW_GATE_FAILED',
        'Technical approval cannot override failed, blocked, inconclusive, cancelled, or unexecuted required automated controls',
        HttpStatus.UNPROCESSABLE_ENTITY,
        {
          finalStatus: run?.finalStatus ?? null,
          blockingControlIds: blocking.map((c) => c.controlId),
        },
      );
    }
    // All creator-visible actionable findings must have been handled through a new immutable retest case; this case cannot skip them.
    if (unresolvedFindings.length) {
      fail(
        'REVIEW_GATE_FAILED',
        'Technical approval cannot bypass creator-visible actionable findings in this case',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { findingIds: unresolvedFindings.map((f) => f.id) },
      );
    }
  }

  private async lockCase(m: EntityManager, caseId: string) {
    const found = await m
      .getRepository(TechnicalReviewCase)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :caseId', { caseId })
      .getOne();
    if (!found)
      fail(
        'NOT_FOUND',
        'Technical review case not found',
        HttpStatus.NOT_FOUND,
      );
    return found;
  }
  private async requireCase(caseId: string) {
    const item = await this.dataSource
      .getRepository(TechnicalReviewCase)
      .findOneBy({ id: caseId });
    if (!item)
      fail(
        'NOT_FOUND',
        'Technical review case not found',
        HttpStatus.NOT_FOUND,
      );
    return item;
  }
  private async requireCreator(m: EntityManager, userId: string) {
    const item = await m.getRepository(CreatorProfile).findOneBy({ userId });
    if (!item)
      fail('NOT_FOUND', 'Creator profile not found', HttpStatus.NOT_FOUND);
    return item;
  }
  private assertCreatorOwner(item: TechnicalReviewCase, creatorId: string) {
    if (item.creatorId !== creatorId)
      fail(
        'NOT_FOUND',
        'Technical review case not found',
        HttpStatus.NOT_FOUND,
      );
  }
  private assertRevision(item: TechnicalReviewCase, expected: number) {
    if (item.revision !== expected)
      fail(
        'STALE_STATE',
        'This technical review case changed. Refresh and try again.',
        HttpStatus.CONFLICT,
        { expectedRevision: expected, actualRevision: item.revision },
      );
  }
  private assertMutable(item: TechnicalReviewCase) {
    if (!MUTABLE_TECHNICAL_STATES.has(item.state))
      fail(
        'INVALID_TRANSITION',
        'This technical review case is no longer mutable',
        HttpStatus.CONFLICT,
        { state: item.state },
      );
  }
  private assertAssignedTechnical(item: TechnicalReviewCase, userId: string) {
    if (item.assignedTechnicalReviewerId !== userId)
      fail(
        'FORBIDDEN',
        'Only the assigned technical reviewer may take this action',
        HttpStatus.FORBIDDEN,
      );
  }
  private assertAssignedReviewer(item: TechnicalReviewCase, userId: string) {
    if (
      item.assignedTechnicalReviewerId !== userId &&
      item.assignedSecurityReviewerId !== userId
    )
      fail(
        'FORBIDDEN',
        'Only an assigned technical or security reviewer may take this action',
        HttpStatus.FORBIDDEN,
      );
  }
  private async requireReviewerPermission(
    userId: string,
    permission: Permission,
  ) {
    const principal = await this.adminAccess.principal(userId);
    if (!this.adminAccess.has(principal, permission))
      fail(
        'UNPROCESSABLE',
        'Assignee does not hold the required review capability',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }

  private async assignProjection(
    m: EntityManager,
    item: TechnicalReviewCase,
    type: 'Technical' | 'Security',
    assigneeId: string,
    assignedBy: string,
    reason: string,
  ) {
    await m.getRepository(TechnicalReviewAssignment).save(
      m.getRepository(TechnicalReviewAssignment).create({
        caseId: item.id,
        assignmentType: type,
        assigneeId,
        assignedBy,
        reason: reason.trim(),
      }),
    );
    const patch =
      type === 'Technical'
        ? {
            assignedTechnicalReviewerId: assigneeId,
            revision: item.revision + 1,
          }
        : {
            assignedSecurityReviewerId: assigneeId,
            revision: item.revision + 1,
          };
    await m.getRepository(TechnicalReviewCase).update(item.id, patch);
    Object.assign(item, patch);
  }
  private async transition(
    m: EntityManager,
    item: TechnicalReviewCase,
    to: TechnicalReviewCaseState,
    actorId: string,
    eventType: string,
    reason: string | null,
    metadata: Record<string, unknown> = {},
  ) {
    const from = item.state;
    const updated = await this.bump(m, item, { state: to });
    await this.event(
      m,
      item.id,
      eventType,
      from,
      to,
      actorId,
      reason,
      metadata,
    );
    return updated;
  }
  private async bump(
    m: EntityManager,
    item: TechnicalReviewCase,
    patch: Partial<TechnicalReviewCase> = {},
  ) {
    const next = item.revision + 1;
    await m
      .getRepository(TechnicalReviewCase)
      .update(item.id, { ...patch, revision: next });
    Object.assign(item, patch, { revision: next });
    return item;
  }
  private async event(
    m: EntityManager,
    caseId: string,
    type: string,
    fromState: string | null,
    toState: string | null,
    actorId: string | null,
    reason: string | null,
    metadata: Record<string, unknown> = {},
  ) {
    await m.getRepository(TechnicalReviewEvent).save(
      m.getRepository(TechnicalReviewEvent).create({
        caseId,
        type,
        fromState,
        toState,
        actorId,
        reason: reason?.slice(0, 500) ?? null,
        metadata,
      }),
    );
  }
  private async decision(
    m: EntityManager,
    caseId: string,
    decisionType: TechnicalDecisionType,
    rationale: string,
    actorId: string,
    idempotencyKey: string,
  ) {
    const existing = await m
      .getRepository(TechnicalReviewDecision)
      .findOneBy({ caseId, decidedBy: actorId, idempotencyKey });
    if (existing) return existing;
    return m.getRepository(TechnicalReviewDecision).save(
      m.getRepository(TechnicalReviewDecision).create({
        caseId,
        decisionType,
        rationale: rationale.trim(),
        decidedBy: actorId,
        idempotencyKey,
      }),
    );
  }
  private async auditAdmin(
    m: EntityManager,
    actorId: string,
    action: string,
    caseId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.audit.record(
      {
        category: 'ADMIN_ACTION',
        action,
        severity: 'notice',
        actor: { id: actorId, role: 'technical_review' },
        resourceType: 'technical_review_case',
        resourceId: caseId,
        metadata,
      },
      m,
    );
  }
  private async auditCreator(
    m: EntityManager,
    actorId: string,
    action: string,
    caseId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.audit.record(
      {
        category: 'ADMIN_ACTION',
        action,
        severity: 'info',
        actor: { id: actorId, role: 'creator' },
        resourceType: 'technical_review_case',
        resourceId: caseId,
        metadata,
      },
      m,
    );
  }

  private creatorCase(item: TechnicalReviewCase) {
    return {
      id: item.id,
      agentId: item.agentId,
      agentVersionId: item.agentVersionId,
      reviewSubmissionId: item.reviewSubmissionId,
      evaluationRunId: item.evaluationRunId,
      profile: item.profile,
      riskLevel: item.riskLevel,
      state: item.state,
      requiresSecondApproval: item.requiresSecondApproval,
      predecessorCaseId: item.predecessorCaseId,
      supersededByCaseId: item.supersededByCaseId,
      revision: item.revision,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
  private adminQueueCase(item: TechnicalReviewCase) {
    return {
      ...this.creatorCase(item),
      assignedTechnicalReviewerId: item.assignedTechnicalReviewerId,
      assignedSecurityReviewerId: item.assignedSecurityReviewerId,
      firstApprovalPending: Boolean(
        item.firstApprovalBy && item.state === 'InReview',
      ),
      firstApprovalBy: item.firstApprovalBy,
    };
  }
  private creatorFinding(item: TechnicalReviewFinding) {
    return {
      id: item.id,
      controlResultId: item.controlResultId,
      claimAssessmentId: item.claimAssessmentId,
      severity: item.severity,
      category: item.category,
      title: item.title,
      description: item.description,
      requiredAction: item.requiredAction,
      createdAt: item.createdAt,
    };
  }
  private safeEvaluation(
    run: EvaluationRun,
    controls: EvaluationControlResult[],
  ) {
    return {
      id: run.id,
      state: run.state,
      finalStatus: run.finalStatus,
      profile: run.profile,
      risk: { level: run.riskLevel, factors: run.riskFactors },
      resultSummary: run.resultSummary,
      controls: controls.map((item) => ({
        id: item.id,
        controlId: item.controlId,
        requirement: item.requirement,
        outcome: item.outcome,
        reasonCode: item.reasonCode,
        reason: item.reason,
        requiresHumanReview: item.requiresHumanReview,
        createdAt: item.createdAt,
      })),
    };
  }
  private releaseHandoff(item: TechnicalReviewCase, run: EvaluationRun | null) {
    return {
      technicalCaseId: item.id,
      agentId: item.agentId,
      agentVersionId: item.agentVersionId,
      reviewSubmissionId: item.reviewSubmissionId,
      evaluationRunId: item.evaluationRunId,
      technicalState: item.state,
      evaluationFinalStatus: run?.finalStatus ?? null,
      handoffEligible:
        item.state === 'TechnicallyApproved' && run?.finalStatus === 'Passed',
      note: 'This is evidence for Epic 3 release-gate evaluation only. It neither publishes nor authorizes release.',
    };
  }
}
