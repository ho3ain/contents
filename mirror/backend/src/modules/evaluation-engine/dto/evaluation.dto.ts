import { Type } from 'class-transformer';
import {
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

export class CreateEvaluationDto {
  @IsUUID()
  agentId: string;

  /** Required so the engine can freeze one exact version/draft content snapshot. */
  @IsUUID()
  agentVersionId: string;

  @IsOptional()
  @IsUUID()
  reviewSubmissionId?: string;

  @IsOptional()
  @IsUUID()
  runtimeId?: string;

  @IsOptional()
  @IsUUID()
  runtimeReleaseId?: string;

  /** Scoped server-side to the authenticated creator; never sent to another authority. */
  @IsString()
  @Matches(/^[A-Za-z0-9:_.-]{8,120}$/)
  idempotencyKey: string;
}

export class EvaluationListQueryDto {
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsIn(['Queued', 'Running', 'Completed', 'Cancelled'])
  state?: 'Queued' | 'Running' | 'Completed' | 'Cancelled';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class EvaluationPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  controlId?: string;
}

export class CancelEvaluationDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
