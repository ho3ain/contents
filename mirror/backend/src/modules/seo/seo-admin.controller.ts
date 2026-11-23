import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../../database/entities/identity/user.entity';
import { ContentLinksService } from './content-links.service';
import { ContentSeoService } from './content-seo.service';
import {
  AnalyzeContentDto,
  ApproveSuggestionDto,
  CreateLinkDto,
  GenerateSuggestionsDto,
  GraphQueryDto,
  RemoveRelationDto,
  SuggestionsQueryDto,
  TranslationLinkDto,
  UpsertContentSeoDto,
} from './dto/seo-admin.dto';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { LinkSuggestionsService } from './link-suggestions.service';

/**
 * SEO Studio + Knowledge Graph (admin). Route permissions: GET → `blog:view`,
 * everything else → `blog:manage` (route-permissions.ts); the global
 * RolesGuard enforces them — nothing here is UI-gated only.
 */
@ApiTags('admin-seo')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/seo')
export class SeoAdminController {
  constructor(
    private readonly seo: ContentSeoService,
    private readonly links: ContentLinksService,
    private readonly graph: KnowledgeGraphService,
    private readonly suggestions: LinkSuggestionsService,
  ) {}

  // ---- per-content metadata --------------------------------------------

  @Get('content/:type/:id')
  @ApiOperation({
    summary:
      'Stored + effective SEO metadata of an article/product (fallbacks marked)',
  })
  content(@Param('type') type: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.seo.view(this.graph.assertContentType(type), id);
  }

  @Put('content/:type/:id')
  @ApiOperation({
    summary: 'Upsert SEO metadata (partial; omitted fields unchanged)',
  })
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertContentSeoDto,
  ) {
    return this.seo.upsert(
      this.graph.assertContentType(type),
      id,
      dto,
      user.id,
    );
  }

  @Get('content/:type/:id/analysis')
  @ApiOperation({ summary: 'Analysis report of the SAVED state (basis=saved)' })
  savedAnalysis(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.seo.analyzeSaved(this.graph.assertContentType(type), id);
  }

  @Post('content/:type/:id/translations')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Link two items as translations (languages must differ)',
  })
  linkTranslation(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TranslationLinkDto,
  ) {
    return this.seo.linkTranslation(
      { type: this.graph.assertContentType(type), id },
      { type: dto.targetType, id: dto.targetId },
    );
  }

  @Delete('content/:type/:id/translations')
  @ApiOperation({ summary: 'Remove this item from its translation group' })
  unlinkTranslation(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.seo.unlinkTranslation({
      type: this.graph.assertContentType(type),
      id,
    });
  }

  // ---- analysis of unsaved editor content -----------------------------

  @Post('analyze')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Analyse editor content as typed (basis=unsaved); same engine as saved reports',
  })
  analyze(@Body() dto: AnalyzeContentDto) {
    return this.seo.analyze(dto, 'unsaved');
  }

  // ---- knowledge graph ------------------------------------------------

  @Get('graph')
  @ApiOperation({
    summary: 'Nodes/edges from real data with server-side filters and limits',
  })
  graphData(@Query() query: GraphQueryDto) {
    return this.graph.graph(query);
  }

  @Get('graph/nodes/:type/:id')
  @ApiOperation({
    summary:
      'Details of one node: links in/out, relations, issues, suggestions',
  })
  node(@Param('type') type: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.graph.node(this.graph.assertContentType(type), id);
  }

  // ---- links (content edits, server-confirmed) ------------------------

  @Post('links')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Create a real link (in-text when the anchor occurs, otherwise a confirmed relation)',
  })
  createLink(@CurrentUser() user: AuthUser, @Body() dto: CreateLinkDto) {
    return this.suggestions.createLink(dto, user.id);
  }

  @Delete('links/:id')
  @ApiOperation({ summary: 'Remove an in-text link from the article source' })
  deleteLink(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.suggestions.deleteLink(id, user.id);
  }

  @Post('relations/remove')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remove a confirmed relation (related post / featured product)',
  })
  removeRelation(
    @CurrentUser() user: AuthUser,
    @Body() dto: RemoveRelationDto,
  ) {
    return this.suggestions.removeRelation(dto, user.id);
  }

  @Post('links/rescan')
  @HttpCode(200)
  @ApiOperation({ summary: 'Re-extract links of every article (idempotent)' })
  rescan() {
    return this.links.rescan();
  }

  // ---- suggestions ----------------------------------------------------

  @Get('suggestions')
  @ApiOperation({
    summary: 'Link suggestions (pending/approved/rejected) with evidence',
  })
  listSuggestions(@Query() query: SuggestionsQueryDto) {
    return this.suggestions.list(query);
  }

  @Post('suggestions/generate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Compute suggestions from shared keywords, categories, title overlap and orphans',
  })
  generate(@Body() dto: GenerateSuggestionsDto) {
    return this.suggestions.generate(dto);
  }

  @Post('suggestions/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve: applies the link to the article content' })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveSuggestionDto,
  ) {
    return this.suggestions.approve(id, user.id, dto.anchor);
  }

  @Post('suggestions/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a suggestion (hidden, not regenerated)' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.suggestions.reject(id, user.id);
  }
}
