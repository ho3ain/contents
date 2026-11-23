import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  HUMAN_CONTROL_OUTCOMES,
  TECHNICAL_FINDING_SEVERITIES,
} from '../domain/technical-review.types';

class CaseCommandDto {
  @Type(() => Number) @IsInt() @Min(1) expectedRevision: number;
  @IsString() @Matches(/^[A-Za-z0-9:_.-]{8,120}$/) idempotencyKey: string;
}

export class CreateTechnicalReviewCaseDto {
  @IsUUID() reviewSubmissionId: string;
  @IsUUID() evaluationRunId: string;
  @IsString() @Matches(/^[A-Za-z0-9:_.-]{8,120}$/) idempotencyKey: string;
}

export class CreatorTechnicalReviewQueryDto {
  @IsOptional()
  @IsIn([
    'PendingReview',
    'InReview',
    'ChangesRequested',
    'AwaitingCreatorResponse',
    'AwaitingRetest',
    'Escalated',
    'TechnicallyApproved',
    'Rejected',
    'Superseded',
  ])
  state?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class AdminTechnicalReviewQueryDto extends CreatorTechnicalReviewQueryDto {
  @IsOptional() @IsIn(['Low', 'Medium', 'High']) riskLevel?: string;
  @IsOptional()
  @IsIn([
    'managed_runtime',
    'connected_runtime',
    'independent_deliverable',
    'external_unconnected_service',
  ])
  profile?: string;
  @IsOptional() @IsUUID() assignedTo?: string;
}

export class AssignTechnicalReviewDto extends CaseCommandDto {
  @IsUUID() reviewerId: string;
  @IsIn(['Technical', 'Security']) assignmentType: 'Technical' | 'Security';
  @IsString() @MaxLength(300) reason: string;
}

export class ReviewControlDto extends CaseCommandDto {
  @IsUUID() controlResultId: string;
  @IsIn(HUMAN_CONTROL_OUTCOMES)
  outcome: (typeof HUMAN_CONTROL_OUTCOMES)[number];
  @IsString() @MaxLength(2000) rationale: string;
  @IsOptional() @IsString() @MaxLength(1000) scopeNote?: string;
}

export class CreateTechnicalFindingDto extends CaseCommandDto {
  @IsOptional() @IsUUID() controlResultId?: string;
  @IsOptional() @IsUUID() claimAssessmentId?: string;
  @IsIn(TECHNICAL_FINDING_SEVERITIES)
  severity: (typeof TECHNICAL_FINDING_SEVERITIES)[number];
  @IsIn(['Technical', 'Security', 'Policy']) category:
    'Technical' | 'Security' | 'Policy';
  @IsBoolean() creatorVisible: boolean;
  @IsString() @MaxLength(180) title: string;
  @IsString() @MaxLength(2000) description: string;
  @IsOptional() @IsString() @MaxLength(2000) requiredAction?: string;
}

export class RequestTechnicalChangesDto extends CaseCommandDto {
  @IsUUID('4', { each: true }) findingIds: string[];
  @IsString() @MaxLength(2000) rationale: string;
}

export class SecurityEscalationDto extends CaseCommandDto {
  @IsString() @MaxLength(1000) rationale: string;
}

export class TechnicalDecisionDto extends CaseCommandDto {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
  @IsString() @MaxLength(2000) rationale: string;
}

export class ReopenTechnicalReviewDto extends CaseCommandDto {
  @IsString() @MaxLength(2000) rationale: string;
}

export class CreatorResponseDto extends CaseCommandDto {
  @IsUUID() findingId: string;
  @IsString() @MaxLength(2000) response: string;
  /** A local/safe identifier, not an uploaded document, URL, token or secret. */
  @IsOptional() @Matches(/^[A-Za-z0-9:_.-]{1,160}$/) evidenceReference?: string;
}

export class ResubmitTechnicalReviewDto extends CreateTechnicalReviewCaseDto {
  @Type(() => Number) @IsInt() @Min(1) expectedRevision: number;
}

/** Caller-supplied limits are clamped server-side by `normalizeGrantLimits`. */
export class IssueReviewAccessDto {
  @IsUUID()
  runtimeId: string;

  @IsUUID()
  reviewerId: string;

  @IsString()
  @MaxLength(300)
  reason: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  ttlMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxInvocations?: number;
}

export class RevokeReviewAccessDto {
  @IsString()
  @MaxLength(300)
  reason: string;
}
