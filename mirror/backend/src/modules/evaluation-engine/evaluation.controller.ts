import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../../database/entities/identity/user.entity';
import {
  CancelEvaluationDto,
  CreateEvaluationDto,
  EvaluationListQueryDto,
  EvaluationPageQueryDto,
} from './dto/evaluation.dto';
import { EvaluationPolicyService } from './evaluation-policy.service';
import { EvaluationService } from './evaluation.service';

@ApiTags('creator-evaluations')
@ApiBearerAuth()
@Roles(UserRole.CREATOR)
@Controller('creators/me/evaluations')
export class CreatorEvaluationsController {
  constructor(private readonly evaluations: EvaluationService) {}

  @Get()
  @ApiOperation({ summary: 'My version-bound product evaluation runs' })
  list(@CurrentUser() user: AuthUser, @Query() query: EvaluationListQueryDto) {
    return this.evaluations.listForCreator(user.id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an idempotent, evidence-based product evaluation',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEvaluationDto) {
    return this.evaluations.createForCreator(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One creator-owned evaluation run and frozen snapshots',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.evaluations.getForCreator(user.id, id);
  }

  @Get(':id/controls')
  @ApiOperation({ summary: 'Paginated creator-owned control results' })
  controls(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EvaluationPageQueryDto,
  ) {
    return this.evaluations.listControlsForCreator(user.id, id, query);
  }

  @Get(':id/evidence')
  @ApiOperation({
    summary: 'Paginated bounded/redacted creator-owned evidence',
  })
  evidence(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EvaluationPageQueryDto,
  ) {
    return this.evaluations.listEvidenceForCreator(user.id, id, query);
  }

  @Get(':id/claims')
  @ApiOperation({
    summary: 'Claim assessments with explicit scope limitations',
  })
  claims(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EvaluationPageQueryDto,
  ) {
    return this.evaluations.listClaimsForCreator(user.id, id, query);
  }

  @Post(':id/rerun')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Rerun against the same anchors, captured as a new immutable run',
  })
  rerun(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.evaluations.rerunForCreator(user.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary:
      'Cancel a queued/running evaluation without altering prior evidence',
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelEvaluationDto,
  ) {
    return this.evaluations.cancelForCreator(user.id, id, dto ?? {});
  }
}

@ApiTags('admin-evaluations')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/evaluations')
export class AdminEvaluationsController {
  constructor(
    private readonly evaluations: EvaluationService,
    private readonly policies: EvaluationPolicyService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Evaluation run list (read-only admin evidence view)',
  })
  list(@Query() query: EvaluationListQueryDto) {
    return this.evaluations.listAdmin(query);
  }

  @Get('policies')
  @ApiOperation({
    summary: 'Installed immutable evaluation policy versions (read-only)',
  })
  policyList() {
    return this.policies.list();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Evaluation run and frozen policy/input snapshots (read-only)',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.evaluations.getAdmin(id);
  }

  @Get(':id/controls')
  controls(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EvaluationPageQueryDto,
  ) {
    return this.evaluations.listControlsAdmin(id, query);
  }

  @Get(':id/evidence')
  evidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EvaluationPageQueryDto,
  ) {
    return this.evaluations.listEvidenceAdmin(id, query);
  }

  @Get(':id/claims')
  claims(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EvaluationPageQueryDto,
  ) {
    return this.evaluations.listClaimsAdmin(id, query);
  }
}
