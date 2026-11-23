import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { businessEvent } from '../../common/logging/app-logger';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { ReviewAccessGrant } from '../../database/entities/technical-review/review-access-grant.entity';
import { TechnicalReviewCase } from '../../database/entities/technical-review/technical-review-case.entity';
import { RuntimeRegistration } from '../../database/entities/runtime/runtime-registration.entity';
import { isServingModel } from '../runtime/runtime-domain';
import {
  denialsForIssue,
  grantUsability,
  isGrantLive,
  normalizeGrantLimits,
  type ReviewAccessDenialReason,
} from './domain/review-access';

export interface IssueReviewAccessInput {
  runtimeId: string;
  reviewerId: string;
  reason: string;
  ttlMinutes?: number;
  maxInvocations?: number;
}

/**
 * Issues and enforces reviewer trial access.
 *
 * Security posture:
 *  - a grant is minted only by an admin, only for an assigned reviewer, only
 *    on an open case, only for a serving runtime bound to the case's agent;
 *  - consumption is an atomic conditional UPDATE, so a concurrent burst cannot
 *    exceed the invocation budget;
 *  - no commercial entitlement row is ever created or touched;
 *  - every mint, refusal, use and revocation is audited.
 */
@Injectable()
export class ReviewAccessService {
  constructor(
    @InjectRepository(ReviewAccessGrant)
    private readonly grants: Repository<ReviewAccessGrant>,
    @InjectRepository(TechnicalReviewCase)
    private readonly cases: Repository<TechnicalReviewCase>,
    @InjectRepository(RuntimeRegistration)
    private readonly runtimes: Repository<RuntimeRegistration>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  private refuse(denials: ReviewAccessDenialReason[]): never {
    throw new ApiException(
      'REVIEW_ACCESS_NOT_PERMITTED',
      'Review access cannot be granted for this combination',
      HttpStatus.CONFLICT,
      { denials },
    );
  }

  async issue(
    actorId: string,
    caseId: string,
    input: IssueReviewAccessInput,
  ): Promise<ReviewAccessGrant> {
    const reviewCase = await this.cases.findOneBy({ id: caseId });
    if (!reviewCase) {
      throw new ApiException(
        'NOT_FOUND',
        'Technical review case not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const runtime = await this.runtimes.findOneBy({ id: input.runtimeId });
    if (!runtime) {
      throw new ApiException(
        'NOT_FOUND',
        'Runtime not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const limits = normalizeGrantLimits(input);
    const denials = denialsForIssue({
      caseState: reviewCase.state,
      assignedTechnicalReviewerId: reviewCase.assignedTechnicalReviewerId,
      assignedSecurityReviewerId: reviewCase.assignedSecurityReviewerId,
      reviewerId: input.reviewerId,
      caseAgentId: reviewCase.agentId,
      runtimeAgentId: runtime.agentId,
      runtimeIsServing: isServingModel(runtime.executionModel),
      ttlMinutes: limits.ttlMinutes,
      maxInvocations: limits.maxInvocations,
    });

    if (denials.length) {
      await this.audit.record({
        action: AUDIT_ACTIONS.REVIEW_ACCESS_DENIED,
        entity: AUDIT_ENTITIES.REVIEW_ACCESS_GRANT,
        entityId: caseId,
        metadata: { denials, runtimeId: input.runtimeId },
        context: { actorId },
      });
      this.refuse(denials);
    }

    const grant = await this.grants.save(
      this.grants.create({
        technicalReviewCaseId: reviewCase.id,
        agentId: reviewCase.agentId,
        agentVersionId: reviewCase.agentVersionId,
        runtimeId: runtime.id,
        reviewerId: input.reviewerId,
        grantedBy: actorId,
        reason: input.reason,
        expiresAt: new Date(Date.now() + limits.ttlMinutes * 60_000),
        maxInvocations: limits.maxInvocations,
        usedInvocations: 0,
      }),
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.REVIEW_ACCESS_GRANTED,
      entity: AUDIT_ENTITIES.REVIEW_ACCESS_GRANT,
      entityId: grant.id,
      metadata: {
        technicalReviewCaseId: reviewCase.id,
        agentId: reviewCase.agentId,
        agentVersionId: reviewCase.agentVersionId,
        runtimeId: runtime.id,
        reviewerId: input.reviewerId,
        expiresAt: grant.expiresAt.toISOString(),
        maxInvocations: grant.maxInvocations,
      },
      context: { actorId },
    });

    return grant;
  }

  async revoke(
    actorId: string,
    grantId: string,
    reason: string,
  ): Promise<ReviewAccessGrant> {
    const grant = await this.grants.findOneBy({ id: grantId });
    if (!grant) {
      throw new ApiException(
        'NOT_FOUND',
        'Review access grant not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (grant.revokedAt) return grant;

    grant.revokedAt = new Date();
    grant.revokedBy = actorId;
    grant.revokeReason = reason;
    const saved = await this.grants.save(grant);

    await this.audit.record({
      action: AUDIT_ACTIONS.REVIEW_ACCESS_REVOKED,
      entity: AUDIT_ENTITIES.REVIEW_ACCESS_GRANT,
      entityId: grant.id,
      metadata: { reason, runtimeId: grant.runtimeId },
      context: { actorId },
    });
    return saved;
  }

  async listForCase(caseId: string): Promise<ReviewAccessGrant[]> {
    return this.grants.find({
      where: { technicalReviewCaseId: caseId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Grants this reviewer can still use right now, for UI affordances only. */
  async liveGrantsForReviewer(
    reviewerId: string,
    caseId: string,
  ): Promise<ReviewAccessGrant[]> {
    const now = new Date();
    const rows = await this.grants.find({
      where: { reviewerId, technicalReviewCaseId: caseId },
      order: { createdAt: 'DESC' },
    });
    return rows.filter((row) => isGrantLive(row, now));
  }

  /**
   * Atomically consumes one invocation.
   *
   * The budget check lives in the UPDATE predicate rather than in JS, so two
   * concurrent requests can never both pass a read-then-write check. Returns
   * null when no usable grant exists; the caller must then deny.
   */
  async consume(input: {
    reviewerId: string;
    runtimeId: string;
  }): Promise<ReviewAccessGrant | null> {
    const now = new Date();
    const candidates = await this.grants.find({
      where: { reviewerId: input.reviewerId, runtimeId: input.runtimeId },
      order: { createdAt: 'DESC' },
    });

    for (const candidate of candidates) {
      const failure = grantUsability(candidate, input, now);
      if (failure) continue;

      const updated = await this.dataSource
        .createQueryBuilder()
        .update(ReviewAccessGrant)
        .set({
          usedInvocations: () => '"used_invocations" + 1',
          lastUsedAt: now,
        })
        .where('id = :id', { id: candidate.id })
        .andWhere('revoked_at IS NULL')
        .andWhere('expires_at > :now', { now })
        .andWhere('used_invocations < max_invocations')
        .returning('*')
        .execute();

      const row = (updated.raw as ReviewAccessGrant[])[0];
      if (!row) continue; // Lost the race; try the next candidate grant.

      await this.audit.record({
        action: AUDIT_ACTIONS.REVIEW_ACCESS_USED,
        entity: AUDIT_ENTITIES.REVIEW_ACCESS_GRANT,
        entityId: candidate.id,
        metadata: {
          runtimeId: input.runtimeId,
          agentId: candidate.agentId,
          agentVersionId: candidate.agentVersionId,
          technicalReviewCaseId: candidate.technicalReviewCaseId,
        },
        context: { actorId: input.reviewerId },
      });
      businessEvent.info(
        'review_access.used',
        'Reviewer executed a product under a review access grant',
        {
          runtimeId: input.runtimeId,
          grantId: candidate.id,
        },
      );
      return candidate;
    }

    return null;
  }
}
