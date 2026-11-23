import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PublicCache } from '../../common/decorators/public-cache.decorator';
import { ApiException } from '../../common/errors/api-error';
import type { AuthUser } from '../../common/types/auth-user';
import { BlogEngagementService } from './blog-engagement.service';
import { BLOG_SLUG_PATTERN } from './dto/blog-admin.dto';
import {
  CreateBlogCommentDto,
  ListBlogCommentsQueryDto,
  RateBlogPostDto,
  ReportBlogCommentDto,
  UpdateBlogCommentDto,
} from './dto/blog-engagement.dto';

function assertSlug(slug: string): string {
  if (!BLOG_SLUG_PATTERN.test(slug) || slug.length > 140) {
    throw new ApiException('NOT_FOUND', 'Not found', HttpStatus.NOT_FOUND);
  }
  return slug;
}

const WRITE_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

/**
 * Blog engagement — reader ratings and comments on published articles.
 *
 * Reads (`engagement`, `comments`) are anonymous and ETag-revalidated; the
 * reader's own state lives on a separate authenticated route
 * (`engagement/me`) because the global guard has no "optional auth" mode,
 * so the public payload never varies per user and stays cacheable. Every
 * write requires a signed-in account (any role).
 */
@ApiTags('blog')
@Controller('blog')
export class BlogEngagementController {
  constructor(private readonly service: BlogEngagementService) {}

  // ---- ratings ------------------------------------------------------------

  @Get('posts/:slug/engagement')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary:
      'Rating average/count/distribution and comment count of a published article',
  })
  summary(@Param('slug') slug: string) {
    return this.service.summary(assertSlug(slug));
  }

  @Get('posts/:slug/engagement/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'The signed-in reader’s own state on an article: my rating, my comment ids, liked/reported comment ids, canComment',
  })
  me(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.service.me(assertSlug(slug), user.id);
  }

  @Put('posts/:slug/rating')
  @ApiBearerAuth()
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({
    summary: 'Rate a published article 1–5 (upsert; answers the new summary)',
  })
  rate(
    @Param('slug') slug: string,
    @Body() dto: RateBlogPostDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.rate(assertSlug(slug), user.id, dto.rating);
  }

  @Delete('posts/:slug/rating')
  @ApiBearerAuth()
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Withdraw my rating (answers the new summary)' })
  unrate(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.service.unrate(assertSlug(slug), user.id);
  }

  // ---- comments -----------------------------------------------------------

  @Get('posts/:slug/comments')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary:
      'Top-level comments of a published article with their replies; sort newest|oldest|top; paginated (max 50)',
  })
  list(@Param('slug') slug: string, @Query() query: ListBlogCommentsQueryDto) {
    return this.service.list(assertSlug(slug), query);
  }

  @Post('posts/:slug/comments')
  @ApiBearerAuth()
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({
    summary:
      'Post a comment (or a reply with parentId). Publishes immediately; 403 when the account is barred, 429 on bursts, 409 on an identical repeat',
  })
  create(
    @Param('slug') slug: string,
    @Body() dto: CreateBlogCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(assertSlug(slug), user.id, dto);
  }

  @Patch('comments/:id')
  @ApiBearerAuth()
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Edit my own comment (marks it as edited)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, user.id, dto.body);
  }

  @Delete('comments/:id')
  @ApiBearerAuth()
  @Throttle(WRITE_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Withdraw my own comment (hidden; replies stay under a placeholder)',
  })
  async withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.service.withdraw(id, user.id);
  }

  @Post('comments/:id/like')
  @ApiBearerAuth()
  @Throttle(WRITE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Like a comment (idempotent)' })
  like(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.like(id, user.id);
  }

  @Delete('comments/:id/like')
  @ApiBearerAuth()
  @Throttle(WRITE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove my like (idempotent)' })
  unlike(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.unlike(id, user.id);
  }

  @Post('comments/:id/report')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Report a comment (spam|abuse|off_topic|other, optional note). One report per reader per comment; own comments 409',
  })
  report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportBlogCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.report(id, user.id, dto);
  }
}
