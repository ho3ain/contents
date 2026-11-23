import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../../database/entities/identity/user.entity';
import { RuntimesService } from './runtimes.service';
import { RuntimeGatewayService } from './runtime-gateway.service';
import { EntitlementsService } from '../commerce/entitlements.service';
import { RequireRuntimeCredentialScope } from './runtime-credential-scope.decorator';
import { UsageMeteringService } from '../finance/usage-metering.service';
import {
  AdminRuntimeQueryDto,
  ConfigureRuntimeDto,
  CreateRuntimeReleaseDto,
  IssueRuntimeCredentialDto,
  PreflightRuntimeReleaseDto,
  RegisterRuntimeDto,
  RuntimeGatewayExecuteDto,
  RuntimeHeartbeatDto,
  RuntimeUsageReportDto,
} from './dto/runtime.dto';

@ApiTags('creator-runtimes')
@ApiBearerAuth()
@Roles(UserRole.CREATOR)
@Controller('creators/me/runtimes')
export class CreatorRuntimesController {
  constructor(private readonly runtimes: RuntimesService) {}

  @Get()
  @ApiOperation({ summary: 'My Runtime registrations (creator owner only)' })
  list(@CurrentUser() user: AuthUser) {
    return this.runtimes.listMine(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a Runtime for one of my products' })
  create(@CurrentUser() user: AuthUser, @Body() dto: RegisterRuntimeDto) {
    return this.runtimes.createForCreator({ ...dto, userId: user.id });
  }

  @Post(':id/configure')
  @ApiOperation({
    summary:
      'Configure an unverified Runtime; changes invalidate prior evidence',
  })
  configure(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfigureRuntimeDto,
  ) {
    return this.runtimes.configureForCreator(user.id, id, dto);
  }

  @Post(':id/credentials')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Issue or rotate a one-time-returned Runtime identity credential',
  })
  issueCredential(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueRuntimeCredentialDto,
  ) {
    return this.runtimes.issueCredential(user.id, id, dto);
  }

  @Get(':id/credentials')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'List Runtime credential metadata; credential material is never returned',
  })
  listCredentials(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtimes.listCredentialsForCreator(user.id, id);
  }

  @Post(':id/credentials/:credentialId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a Runtime identity credential' })
  async revokeCredential(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
  ): Promise<void> {
    await this.runtimes.revokeCredential(user.id, id, credentialId);
  }

  @Post(':id/releases/preflight')
  @ApiOperation({
    summary:
      'Validate a creator-owned Runtime release manifest without persisting it',
  })
  preflightRelease(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreflightRuntimeReleaseDto,
  ) {
    return this.runtimes.preflightReleaseForCreator(user.id, id, dto.manifest);
  }

  @Post(':id/releases')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a secret-free immutable Runtime release manifest',
  })
  release(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRuntimeReleaseDto,
  ) {
    return this.runtimes.createReleaseForCreator(user.id, id, dto);
  }
}

@ApiTags('admin-runtimes')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/runtimes')
export class AdminRuntimesController {
  constructor(private readonly runtimes: RuntimesService) {}

  @Get()
  @ApiOperation({
    summary: 'Runtime registry and verified control state (admin)',
  })
  list(@Query() query: AdminRuntimeQueryDto) {
    return this.runtimes.listAdmin(query.state);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Runtime record including safe operational state (admin)',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.runtimes.getAdmin(id);
  }

  @Post(':id/conformance')
  @ApiOperation({
    summary:
      'Run configuration-bound MESH Connector Protocol conformance checks',
  })
  conformance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtimes.runConformance(id, user.id);
  }

  @Post(':id/activate')
  @ApiOperation({
    summary:
      'Activate a Runtime only after matching passing conformance evidence',
  })
  activate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtimes.activate(id, user.id);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend Runtime traffic immediately' })
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtimes.suspend(id, user.id);
  }

  @Post(':id/revoke')
  @ApiOperation({
    summary: 'Revoke a Runtime permanently; it cannot be reactivated',
  })
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtimes.revoke(id, user.id);
  }

  @Post(':id/retire')
  @ApiOperation({
    summary: 'Retire a Runtime record after it has been revoked or suspended',
  })
  retire(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtimes.retire(id, user.id);
  }

  @Post(':id/restart')
  @ApiOperation({
    summary: 'Restart the eligible local managed reference Runtime',
  })
  restart(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtimes.restartManaged(id, user.id);
  }
}

/** Runtime-to-control-plane identity endpoint. Browser JWTs are intentionally not accepted here. */
@ApiTags('runtime-connector')
@Controller('runtime-connector/v1/runtimes')
export class RuntimeConnectorController {
  constructor(
    private readonly runtimes: RuntimesService,
    private readonly usage: UsageMeteringService,
  ) {}

  @Post(':id/heartbeat')
  @Public()
  @RequireRuntimeCredentialScope('health:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Connector Runtime identity heartbeat (opaque Runtime credential)',
  })
  async heartbeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: RuntimeHeartbeatDto,
  ): Promise<void> {
    const runtime = await this.runtimes.authenticateRuntimeCredential(
      authorization,
      id,
      'health:write',
    );
    await this.runtimes.heartbeat(runtime, dto.status);
  }

  @Post(':id/usage-events')
  @Public()
  @RequireRuntimeCredentialScope('usage:write')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Ingest a normalized Runtime consumption event (unverified provider cost observation only)',
  })
  usageEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: RuntimeUsageReportDto,
  ) {
    return this.runtimes
      .authenticateRuntimeCredential(authorization, id, 'usage:write')
      .then((runtime) =>
        this.usage.reportFromRuntime(runtime, {
          sourceEventId: dto.sourceEventId,
          occurredAt: new Date(dto.occurredAt),
          unit: dto.unit,
          quantity: dto.quantity,
          provider: dto.provider,
          model: dto.model,
          reportedCostMinor: dto.reportedCostMinor,
          reportedCostCurrency: dto.reportedCostCurrency,
        }),
      );
  }
}

/** Buyer-authenticated protected execution boundary; no direct reference workload endpoint is exposed. */
@ApiTags('runtime-gateway')
@ApiBearerAuth()
@Controller('runtime-gateway')
export class RuntimeGatewayController {
  constructor(
    private readonly gateway: RuntimeGatewayService,
    private readonly runtimes: RuntimesService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('agents/:agentId/execution')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Whether the caller can execute this product, and the runtime id to use',
  })
  async execution(
    @CurrentUser() user: AuthUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ) {
    // Entitlement is checked before anything is disclosed: an unentitled
    // caller must not be able to probe whether a runtime exists at all.
    const decision = await this.entitlements.decideAccess(
      user.id,
      agentId,
      'runtime',
    );
    if (!decision.allowed) {
      return {
        agentId,
        runtimeId: null,
        executionModel: null,
        executable: false,
        reasonCode: 'not_entitled' as const,
        entitlementReasonCode: decision.reasonCode ?? null,
      };
    }
    const descriptor = await this.runtimes.buyerExecutionDescriptor(agentId);
    return { ...descriptor, entitlementReasonCode: null };
  }

  @Post('runtimes/:id/execute')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Execute through the MESH protected Runtime gateway',
  })
  execute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RuntimeGatewayExecuteDto,
  ) {
    return this.gateway.execute({
      userId: user.id,
      runtimeId: id,
      payload: dto.input ?? {},
    });
  }
}
