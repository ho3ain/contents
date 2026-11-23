import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../../database/entities/identity/user.entity';
import { AdminAccessService } from '../control-plane/authz/admin-access.service';
import { RequiresCapability } from '../control-plane/config/kill-switch.guard';
import { MEDIA_RULES } from '../storage/media-rules';
import { StorageService, type IncomingFile } from '../storage/storage.service';
import { BlogPostsService } from './blog-posts.service';
import { BlogPublicService } from './blog-public.service';
import { BlogTaxonomyService } from './blog-taxonomy.service';
import {
  BlogCategoryInputDto,
  BlogTagInputDto,
  BulkBlogPostsDto,
  CreateBlogPostDto,
  DeleteBlogCategoryDto,
  ListBlogAuthorsQueryDto,
  ListBlogPostsQueryDto,
  MergeBlogTagsDto,
  RenderMarkdownDto,
  ScheduleBlogPostDto,
  UpdateBlogCategoryDto,
  UpdateBlogPostDto,
  WorkflowNoteDto,
} from './dto/blog-admin.dto';

/**
 * Blog platform — CMS API. Authorisation is the central route table
 * (control-plane/authz/route-permissions.ts): `GET /admin/blog/**` needs
 * `blog:view`, the editorial sign-off routes (publish / schedule /
 * unpublish / request-changes / cancel-schedule) need `blog:publish`, and
 * every other write needs `blog:manage`.
 */
@ApiTags('admin-blog')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/blog')
export class BlogAdminController {
  constructor(
    private readonly posts: BlogPostsService,
    private readonly publicService: BlogPublicService,
    private readonly taxonomy: BlogTaxonomyService,
    private readonly storage: StorageService,
    private readonly access: AdminAccessService,
  ) {}

  // ---- dashboard ----------------------------------------------------------

  @Get('overview')
  @ApiOperation({
    summary: 'Counts by status, featured, stale and next scheduled article',
  })
  overview() {
    return this.posts.overview();
  }

  @Get('me')
  @ApiOperation({
    summary:
      'What the current admin may do in the blog CMS (UI gating only; routes enforce)',
  })
  async me(@CurrentUser() user: AuthUser) {
    const principal = await this.access.principal(user.id);
    return {
      can: {
        view: this.access.has(principal, 'blog:view'),
        manage: this.access.has(principal, 'blog:manage'),
        publish: this.access.has(principal, 'blog:publish'),
      },
    };
  }

  @Get('authors')
  @ApiOperation({
    summary: 'Staff users that may be credited as author / reviewer',
  })
  authors(@Query() query: ListBlogAuthorsQueryDto) {
    return this.posts.authorCandidates(query.q);
  }

  // ---- posts --------------------------------------------------------------

  @Get('posts')
  @ApiOperation({
    summary: 'Articles of every status — search, filters, sort, pagination',
  })
  list(@Query() query: ListBlogPostsQueryDto) {
    return this.posts.list(query);
  }

  @Post('posts')
  @ApiOperation({
    summary: 'Create a draft (slug derived from the title when omitted)',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBlogPostDto) {
    return this.posts.create(dto, user.id);
  }

  @Post('posts/bulk')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Bulk unpublish / archive / feature / set category — per-item rules apply, skipped items are reported',
  })
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkBlogPostsDto) {
    return this.posts.bulk(dto, user.id);
  }

  @Post('render')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Render Markdown to the structured block tree (editor preview)',
  })
  render(@Body() dto: RenderMarkdownDto) {
    return this.posts.render(dto.bodyMarkdown);
  }

  @Get('posts/:id')
  @ApiOperation({
    summary:
      'Full editable article incl. relations, readiness and available actions',
  })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.posts.detail(id);
  }

  @Patch('posts/:id')
  @ApiOperation({
    summary:
      'Save content/metadata. Requires the loaded `version`; 409 STALE_STATE on conflict.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogPostDto,
  ) {
    return this.posts.update(id, dto, user.id);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Delete a non-published article (a live article must be unpublished first)',
  })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.posts.remove(id, user.id);
  }

  @Get('posts/:id/preview')
  @ApiOperation({
    summary: 'Authorised preview — the public article shape for ANY status',
  })
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicService.preview(id);
  }

  // ---- workflow -----------------------------------------------------------

  @Post('posts/:id/submit-review')
  @HttpCode(200)
  @ApiOperation({ summary: 'draft → in_review' })
  submitReview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.posts.transition(id, 'submit_review', user.id);
  }

  @Post('posts/:id/request-changes')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'in_review / scheduled → draft with an editorial note (blog:publish)',
  })
  requestChanges(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkflowNoteDto,
  ) {
    return this.posts.transition(id, 'request_changes', user.id, {
      note: dto.note,
    });
  }

  @Post('posts/:id/publish')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Publish now (readiness checklist enforced; publishedAt set once) (blog:publish)',
  })
  publish(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.posts.transition(id, 'publish', user.id);
  }

  @Post('posts/:id/schedule')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Schedule publication at a future instant (blog:publish)',
  })
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleBlogPostDto,
  ) {
    return this.posts.transition(id, 'schedule', user.id, {
      scheduledFor: dto.scheduledFor,
    });
  }

  @Post('posts/:id/cancel-schedule')
  @HttpCode(200)
  @ApiOperation({ summary: 'scheduled → draft (blog:publish)' })
  cancelSchedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.posts.transition(id, 'cancel_schedule', user.id);
  }

  @Post('posts/:id/unpublish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take a live article offline immediately (blog:publish)',
  })
  unpublish(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkflowNoteDto,
  ) {
    return this.posts.transition(id, 'unpublish', user.id, { note: dto.note });
  }

  @Post('posts/:id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'draft / in_review / unpublished → archived' })
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.posts.transition(id, 'archive', user.id);
  }

  @Post('posts/:id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'archived → draft' })
  restore(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.posts.transition(id, 'restore', user.id);
  }

  // ---- revisions ----------------------------------------------------------

  @Get('posts/:id/revisions')
  @ApiOperation({ summary: 'Bounded content history (newest first)' })
  revisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.posts.listRevisions(id);
  }

  @Get('posts/:id/revisions/:revisionId')
  @ApiOperation({ summary: 'One revision snapshot' })
  async revision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ) {
    const rev = await this.posts.getRevision(id, revisionId);
    return {
      id: rev.id,
      version: rev.version,
      reason: rev.reason,
      createdAt: rev.createdAt,
      snapshot: rev.snapshot,
    };
  }

  @Post('posts/:id/revisions/:revisionId/restore')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Restore the content of a revision as a NEW version',
  })
  restoreRevision(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ) {
    return this.posts.restoreRevision(id, revisionId, user.id);
  }

  // ---- media --------------------------------------------------------------

  @Post('media')
  @RequiresCapability('UPLOADS_ENABLED')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MEDIA_RULES.blog.maxBytes + 1, files: 1, fields: 0 },
    }),
  )
  @ApiOperation({
    summary:
      'Upload an article image (PNG/JPEG/WebP by magic bytes, 480×270–4096px, ≤3MB). 503 STORAGE_DISABLED when no driver.',
  })
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: IncomingFile) {
    return this.storage.uploadBlogImage(user.id, file);
  }

  // ---- taxonomy -----------------------------------------------------------

  @Get('categories')
  @ApiOperation({ summary: 'Blog categories with post counts' })
  categories() {
    return this.taxonomy.listCategoriesAdmin();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a blog category' })
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body() dto: BlogCategoryInputDto,
  ) {
    return this.taxonomy.createCategory(dto, user.id);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Rename / move / (de)activate a blog category' })
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogCategoryDto,
  ) {
    return this.taxonomy.updateCategory(id, dto, user.id);
  }

  @Post('categories/:id/delete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a blog category after reassigning its articles',
  })
  deleteCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteBlogCategoryDto,
  ) {
    return this.taxonomy.deleteCategory(id, dto.reassignToId, user.id);
  }

  @Get('tags')
  @ApiOperation({ summary: 'Blog tags with post counts' })
  tags() {
    return this.taxonomy.listTagsAdmin();
  }

  @Post('tags')
  @ApiOperation({ summary: 'Create a blog tag' })
  createTag(@CurrentUser() user: AuthUser, @Body() dto: BlogTagInputDto) {
    return this.taxonomy.createTag(dto, user.id);
  }

  @Post('tags/merge')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Merge tags into one (articles move, sources are removed)',
  })
  mergeTags(@CurrentUser() user: AuthUser, @Body() dto: MergeBlogTagsDto) {
    return this.taxonomy.mergeTags(dto, user.id);
  }

  @Patch('tags/:id')
  @ApiOperation({ summary: 'Rename a blog tag' })
  updateTag(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlogTagInputDto,
  ) {
    return this.taxonomy.updateTag(id, dto, user.id);
  }

  @Delete('tags/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a blog tag (article links are removed)' })
  async deleteTag(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.taxonomy.deleteTag(id, user.id);
  }
}
