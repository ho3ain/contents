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
  CreateTechnicalReviewCaseDto,
  CreatorResponseDto,
  CreatorTechnicalReviewQueryDto,
  ResubmitTechnicalReviewDto,
} from './dto/technical-review.dto';
import { TechnicalReviewService } from './technical-review.service';

@ApiTags('creator-technical-reviews')
@ApiBearerAuth()
@Roles(UserRole.CREATOR)
@Controller('creators/me/technical-reviews')
export class CreatorTechnicalReviewsController {
  constructor(private readonly cases: TechnicalReviewService) {}
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Submit an exact completed evaluation and review submission to technical review',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTechnicalReviewCaseDto,
  ) {
    return this.cases.createForCreator(user.id, dto);
  }
  @Get()
  @ApiOperation({
    summary:
      'List my technical review cases without internal reviewer/security data',
  })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: CreatorTechnicalReviewQueryDto,
  ) {
    return this.cases.listForCreator(user.id, query);
  }
  @Get(':id')
  @ApiOperation({
    summary:
      'Read creator-visible technical findings, responses and decision status',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cases.getForCreator(user.id, id);
  }
  @Post(':id/responses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Respond to a creator-visible technical finding with bounded text/reference',
  })
  response(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatorResponseDto,
  ) {
    return this.cases.respondForCreator(user.id, id, dto);
  }
  @Post(':id/resubmit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a successor case bound to a new exact submission and evaluation run',
  })
  resubmit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResubmitTechnicalReviewDto,
  ) {
    return this.cases.resubmitForCreator(user.id, id, dto);
  }
}
