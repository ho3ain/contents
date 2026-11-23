import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  RUNTIME_EXECUTION_MODELS,
  RUNTIME_STATES,
} from '../../../database/entities/runtime/runtime-registration.entity';
import type { RuntimeReleaseManifest } from '../../../database/entities/runtime/runtime-release.entity';

export class RegisterRuntimeDto {
  @IsUUID()
  agentId: string;

  @IsIn(RUNTIME_EXECUTION_MODELS)
  executionModel: (typeof RUNTIME_EXECUTION_MODELS)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  hostingProvider: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  environment: string;

  @ValidateIf(
    (dto: RegisterRuntimeDto) => dto.executionModel === 'mesh_connected',
  )
  @IsUrl({
    require_tld: false,
    protocols: ['https', 'http'],
    require_protocol: true,
  })
  @MaxLength(500)
  endpointUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  connectorVersion?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  declaredCapabilities?: string[];
}

export class ConfigureRuntimeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  hostingProvider: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  environment: string;

  @IsOptional()
  @IsUrl({
    require_tld: false,
    protocols: ['https', 'http'],
    require_protocol: true,
  })
  @MaxLength(500)
  endpointUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  connectorVersion?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  declaredCapabilities?: string[];
}

export class IssueRuntimeCredentialDto {
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays: number;

  @IsOptional()
  @IsUUID()
  rotateCredentialId?: string;
}

export class CreateRuntimeReleaseDto {
  @IsOptional()
  @IsUUID()
  agentVersionId?: string;

  /** Structural and profile validation occurs in the Runtime authority so it
   * also protects programmatic callers and future manifest schema versions. */
  @IsObject()
  manifest: RuntimeReleaseManifest;
}

/** Read-only creator manifest check. This does not register a release, execute
 * a connector, issue a credential, or change review/entitlement state. */
export class PreflightRuntimeReleaseDto {
  @IsObject()
  manifest: RuntimeReleaseManifest;
}

export class RuntimeHeartbeatDto {
  @IsIn(['ready', 'degraded'])
  status: 'ready' | 'degraded';
}

/** Secret-free normalized Runtime consumption report. Monetary values are
 * optional observation evidence in exact minor units, never a buyer charge. */
export class RuntimeUsageReportDto {
  @IsString()
  @Matches(/^[A-Za-z0-9:_.-]{8,160}$/)
  sourceEventId: string;

  @IsDateString()
  occurredAt: string;

  @IsIn([
    'execution',
    'input_bytes',
    'output_bytes',
    'tokens',
    'requests',
    'custom',
  ])
  unit:
    | 'execution'
    | 'input_bytes'
    | 'output_bytes'
    | 'tokens'
    | 'requests'
    | 'custom';

  @IsString()
  @Matches(/^\d{1,18}$/)
  quantity: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,18}$/)
  reportedCostMinor?: string;

  @ValidateIf(
    (dto: RuntimeUsageReportDto) => dto.reportedCostMinor !== undefined,
  )
  @IsString()
  @Matches(/^[A-Za-z]{3,8}$/)
  reportedCostCurrency?: string;
}

export class RuntimeGatewayExecuteDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

export class AdminRuntimeQueryDto {
  @IsOptional()
  @IsIn(RUNTIME_STATES)
  state?: (typeof RUNTIME_STATES)[number];
}
