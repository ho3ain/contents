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
import { AdminPermission } from '../control-plane/authz/admin-decorators';
import {
  AdminTechnicalReviewQueryDto,
  AssignTechnicalReviewDto,
  CreateTechnicalFindingDto,
  ReopenTechnicalReviewDto,
  RequestTechnicalChangesDto,
  ReviewControlDto,
  SecurityEscalationDto,
  TechnicalDecisionDto,
  IssueReviewAccessDto,
  RevokeReviewAccessDto,
} from './dto/technical-review.dto';
import { TechnicalReviewService } from './technical-review.service';
import { ReviewAccessService } from './review-access.service';

@ApiTags('admin-technical-reviews')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/technical-reviews')
export class AdminTechnicalReviewsController {
  constructor(
    private readonly cases: TechnicalReviewService,
    private readonly reviewAccess: ReviewAccessService,
  ) {}
  @Get()
  @AdminPermission('technical_review:view')
  @ApiOperation({
    summary: 'Technical review queue with state/profile/risk/assignee filters',
  })
  list(@Query() query: AdminTechnicalReviewQueryDto) {
    return this.cases.listForAdmin(query);
  }
  @Get(':id')
  @AdminPermission('technical_review:view_sensitive')
  @ApiOperation({
    summary:
      'Case workspace with bounded automated evidence, controls and internal records',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.cases.getForAdmin(id);
  }
  @Post(':id/claim')
  @AdminPermission('technical_review:claim')
  @HttpCode(HttpStatus.OK)
  claim(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenTechnicalReviewDto,
  ) {
    return this.cases.claim(user.id, id, dto);
  }
  @Post(':id/assign')
  @AdminPermission('technical_review:manage')
  @HttpCode(HttpStatus.OK)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTechnicalReviewDto,
  ) {
    return this.cases.assign(user.id, id, dto);
  }
  @Post(':id/control-reviews')
  @AdminPermission('technical_review:review')
  @HttpCode(HttpStatus.CREATED)
  control(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewControlDto,
  ) {
    return this.cases.reviewControl(user.id, id, dto);
  }
  @Post(':id/findings')
  @AdminPermission('technical_review:review')
  @HttpCode(HttpStatus.CREATED)
  finding(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTechnicalFindingDto,
  ) {
    return this.cases.createFinding(user.id, id, dto);
  }
  @Post(':id/request-changes')
  @AdminPermission('technical_review:review')
  @HttpCode(HttpStatus.OK)
  changes(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestTechnicalChangesDto,
  ) {
    return this.cases.requestChanges(user.id, id, dto);
  }
  @Post(':id/escalate-security')
  @AdminPermission('technical_review:review')
  @HttpCode(HttpStatus.OK)
  escalate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SecurityEscalationDto,
  ) {
    return this.cases.escalateSecurity(user.id, id, dto);
  }
  @Post(':id/resolve-security-escalation')
  @AdminPermission('technical_review:security_review')
  @HttpCode(HttpStatus.OK)
  resolveEscalation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenTechnicalReviewDto,
  ) {
    return this.cases.resolveSecurityEscalation(user.id, id, dto);
  }
  @Post(':id/decision')
  @AdminPermission('technical_review:decide')
  @HttpCode(HttpStatus.OK)
  decision(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TechnicalDecisionDto,
  ) {
    return this.cases.decide(user.id, id, dto);
  }
  @Post(':id/second-approval')
  @AdminPermission('technical_review:second_approve')
  @HttpCode(HttpStatus.OK)
  secondApproval(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenTechnicalReviewDto,
  ) {
    return this.cases.secondApprove(user.id, id, dto);
  }
  @Post(':id/reopen')
  @AdminPermission('technical_review:manage')
  @HttpCode(HttpStatus.OK)
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenTechnicalReviewDto,
  ) {
    return this.cases.reopen(user.id, id, dto);
  }

  @Get(':id/review-access')
  @AdminPermission('technical_review:view')
  @ApiOperation({
    summary: 'Reviewer trial-access grants issued on this case',
  })
  listReviewAccess(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewAccess.listForCase(id);
  }

  @Post(':id/review-access')
  @HttpCode(HttpStatus.CREATED)
  @AdminPermission('technical_review:decide')
  @ApiOperation({
    summary:
      'Grant one assigned reviewer capped, revocable execution access without any commercial entitlement',
  })
  issueReviewAccess(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueReviewAccessDto,
  ) {
    return this.reviewAccess.issue(user.id, id, dto);
  }

  @Post(':id/review-access/:grantId/revoke')
  @AdminPermission('technical_review:decide')
  @ApiOperation({ summary: 'Immediately revoke a reviewer trial-access grant' })
  revokeReviewAccess(
    @CurrentUser() user: AuthUser,
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @Body() dto: RevokeReviewAccessDto,
  ) {
    return this.reviewAccess.revoke(user.id, grantId, dto.reason);
  }
}
