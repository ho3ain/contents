import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { BlogEngagementService } from './blog-engagement.service';
import {
  AdminListBlogCommentsQueryDto,
  CreateBlogCommentBanDto,
  RemoveBlogCommentDto,
} from './dto/blog-engagement.dto';

/**
 * Blog comment moderation (CMS). Authorisation is the central route table
 * (control-plane/authz/route-permissions.ts): `GET /admin/blog/**` needs
 * `blog:view`, every write under `/admin/blog/**` needs `blog:manage` — the
 * same rules as the rest of the blog CMS, nothing added.
 */
@ApiTags('admin-blog')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/blog')
export class BlogCommentsAdminController {
  constructor(private readonly service: BlogEngagementService) {}

  @Get('comments/overview')
  @ApiOperation({
    summary: 'Comment counts by status, open reports and active bans',
  })
  overview() {
    return this.service.adminOverview();
  }

  @Get('comments')
  @ApiOperation({
    summary:
      'Moderation queue: comments with their reports; filter status, reported (open reports only), postId, userId, q; paginated (max 50)',
  })
  list(@Query() query: AdminListBlogCommentsQueryDto) {
    return this.service.adminList(query);
  }

  @Post('comments/:id/remove')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Remove a comment (moderation): resolves its open reports and notifies the author with the reason',
  })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveBlogCommentDto,
  ) {
    return this.service.adminRemove(id, user.id, dto.reason);
  }

  @Post('comments/:id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Put a hidden/removed comment back online' })
  restore(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.adminRestore(id, user.id);
  }

  @Post('comments/:id/dismiss-reports')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reports reviewed, comment stays: open reports → dismissed',
  })
  dismissReports(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.adminDismissReports(id, user.id);
  }

  @Get('comment-bans')
  @ApiOperation({ summary: 'Accounts barred from commenting on the blog' })
  bans() {
    return this.service.adminListBans();
  }

  @Post('comment-bans')
  @ApiOperation({
    summary:
      'Bar an account from commenting (ratings stay allowed; admins cannot be barred)',
  })
  ban(@CurrentUser() user: AuthUser, @Body() dto: CreateBlogCommentBanDto) {
    return this.service.adminBan(user.id, dto);
  }

  @Delete('comment-bans/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Lift a comment ban' })
  async unban(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.service.adminUnban(user.id, userId);
  }
}
