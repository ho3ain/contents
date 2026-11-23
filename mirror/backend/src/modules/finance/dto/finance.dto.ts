import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { POLICY_KINDS } from '../domain/policy';

const MONEY = /^\d{1,18}(\.\d{1,6})?$/;
const MINOR_AMOUNT = /^\d{1,18}$/;

export class RequestPayoutDto {
  @ApiPropertyOptional({
    description:
      'Major units (e.g. "1500000"). Omit to take everything payable.',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'amount must be a plain decimal number' })
  amount?: string;

  @ApiProperty({
    description:
      'Client-generated key; repeating it never creates a second payout.',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9:_.-]{8,100}$/)
  idempotencyKey: string;
}

export class ReasonDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class OptionalReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SubmitKycDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  legalName: string;

  @ApiProperty({ description: 'Iranian national code (10 digits)' })
  @IsString()
  @MaxLength(40)
  nationalId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AddBankAccountDto {
  @ApiProperty({ description: 'Shaba (IR + 24 digits)' })
  @IsString()
  @MaxLength(60)
  iban: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  holderName: string;
}

export class MarkPaidDto {
  @ApiProperty({
    description: 'The bank transfer reference the operator received',
  })
  @IsString()
  @MaxLength(80)
  bankReference: string;
}

export class DisbursementDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  reference: string;
}

export class PublishPolicyDto {
  @ApiProperty({ enum: POLICY_KINDS })
  @IsIn(POLICY_KINDS)
  kind: (typeof POLICY_KINDS)[number];

  @ApiProperty({
    description: 'Kind-specific parameters (validated server-side)',
  })
  @IsObject()
  params: Record<string, unknown>;

  @ApiProperty()
  @IsDateString()
  effectiveFrom: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowBackdate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ReconRowDto {
  @IsString() @MaxLength(128) providerReference: string;
  @IsString() @Matches(MONEY) amount: string;
  @IsOptional() @IsString() @Matches(MONEY) fee?: string;
  @IsString() @MaxLength(20) status: string;
  @IsOptional() @IsDateString() occurredAt?: string;
}

export class ImportReconciliationDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9_-]{2,40}$/)
  provider: string;

  @ApiProperty()
  @IsString()
  @MaxLength(8)
  currency: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  sourceName: string;

  @ApiProperty({ type: [ReconRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ReconRowDto)
  rows: ReconRowDto[];
}

export class AdvanceReconciliationDto {
  @ApiProperty({ enum: ['CLASSIFIED', 'INVESTIGATING', 'RESOLVED'] })
  @IsIn(['CLASSIFIED', 'INVESTIGATING', 'RESOLVED'])
  to: 'CLASSIFIED' | 'INVESTIGATING' | 'RESOLVED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReverseLedgerDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class ResolveExceptionDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  note: string;
}

export class RebuildBalanceDto {
  @ApiPropertyOptional({
    description:
      'true = replace the PROJECTION with the replayed value (the ledger is never touched)',
  })
  @IsOptional()
  @IsBoolean()
  repair?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class StatementQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** Phase 4: only limits enforced at the MESH Runtime gateway are configurable. */
export class SetUsagePolicyDto {
  @IsUUID()
  agentId: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxExecutionsPerBuyer?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  periodDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_048_576)
  maxInputBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  enforcementNote?: string;
}

/** Phase 4: manual, permission-scoped cost evidence; this does not settle money. */
export class RecordUsageCostDto {
  @IsIn([
    'ESTIMATED',
    'RECONCILED_FINAL',
    'DISPUTED',
    'UNDER_INVESTIGATION',
    'UNKNOWN',
  ])
  state:
    | 'ESTIMATED'
    | 'RECONCILED_FINAL'
    | 'DISPUTED'
    | 'UNDER_INVESTIGATION'
    | 'UNKNOWN';

  @IsOptional()
  @IsString()
  @Matches(MINOR_AMOUNT)
  amountMinor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3,8}$/)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  priceReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceReference?: string;

  @IsString()
  @Matches(/^[A-Za-z0-9:_.-]{8,190}$/)
  idempotencyKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
