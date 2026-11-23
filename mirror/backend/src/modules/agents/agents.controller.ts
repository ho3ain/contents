import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PublicCache } from '../../common/decorators/public-cache.decorator';
import { ApiException } from '../../common/errors/api-error';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuthTokensService } from '../auth/auth-tokens.service';
import { AgentsService } from './agents.service';
import { TrustDisclosureService } from '../evaluation-engine/trust-disclosure.service';
import {
  ContentSeoService,
  type PublicSeoMeta,
} from '../seo/content-seo.service';
import { AgentDetail, ReviewSummary } from './agents-views';
import {
  PromotionEventDto,
  RecordImpressionsDto,
  RecordViewDto,
} from './dto/record-view.dto';
import {
  AnalyticsEventsService,
  ViewResult,
} from '../analytics/analytics-events.service';
import { optionalViewer } from '../auth/optional-viewer';
import { BuyerEventsService } from '../discovery/buyer-events.service';
import { buyerDedupKey } from '../discovery/interest-scoring';

@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly tokensService: AuthTokensService,
    private readonly analytics: AnalyticsEventsService,
    private readonly buyerEvents: BuyerEventsService,
    private readonly contentSeo: ContentSeoService,
    private readonly trustDisclosure: TrustDisclosureService,
  ) {}

  @Get(':slug/reviews')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({ summary: 'Public reviews of an agent' })
  async reviews(
    @Param('slug') slug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<{ items: ReviewSummary[]; meta: unknown }> {
    return this.agentsService.listReviews(
      slug,
      query.page ?? 1,
      query.pageSize ?? 10,
    );
  }

  @Get(':slug/versions')
  @Public()
  @ApiOperation({
    summary:
      'Public version history of a live product (published/deprecated versions, buyer-facing changelog only)',
  })
  async versions(@Param('slug') slug: string) {
    const result = await this.agentsService.publicVersions(slug);
    if (!result) {
      throw new ApiException(
        'AGENT_NOT_FOUND',
        'Agent not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return result;
  }

  @Get(':slug/trust')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary:
      'What MESH actually verified about this product, and what it did not',
  })
  trust(@Param('slug') slug: string) {
    return this.trustDisclosure.forSlug(slug);
  }

  @Get(':slug')
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary: 'Agent detail page (trust disclosure, pricing, reviews)',
  })
  async detail(
    @Param('slug') slug: string,
    @Headers('authorization') authorization?: string,
  ): Promise<AgentDetail & { seo: PublicSeoMeta }> {
    const viewerId = optionalViewer(this.tokensService, authorization)?.sub;
    const detail = await this.agentsService.getBySlug(slug, viewerId);
    if (!detail) {
      throw new ApiException(
        'AGENT_NOT_FOUND',
        'Agent not found',
        HttpStatus.NOT_FOUND,
      );
    }
    // SEO Studio: effective public metadata (stored values or fallbacks).
    const seo = await this.contentSeo.publicMeta(
      await this.contentSeo.facts('agent', detail.id),
    );
    return { ...detail, seo };
  }

  @Post(':slug/demo-click')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record a demo interaction (analytics funnel)' })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async demoClick(
    @Param('slug') slug: string,
    @Body() dto: RecordViewDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    // Legacy raw counter (kept for existing screens) …
    const tracked = await this.agentsService.trackDemoClick(slug);
    if (!tracked) return;
    // … plus the de-duplicated `product_preview` funnel event (gap closure).
    const agent = await this.agentsService.findPublishedForAnalytics(slug);
    if (!agent) return;
    const viewer = optionalViewer(this.tokensService, authorization);
    await this.analytics
      .recordEngagement(agent, 'preview', {
        userId: viewer?.sub ?? null,
        role: viewer?.role ?? null,
        visitorId: dto?.visitorId ?? null,
        source: dto?.source ?? null,
        ip,
        userAgent: userAgent ?? null,
      })
      .catch(() => undefined);
  }

  /**
   * Gap closure — the usage guide (documentation) of a live product was
   * actually on screen (visibility beacon from the public page). Same
   * exclusions and daily de-duplication as views. 404 when not live.
   */
  @Post(':slug/documentation-view')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record a documentation view (analytics beacon)' })
  async documentationView(
    @Param('slug') slug: string,
    @Body() dto: RecordViewDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<ViewResult> {
    const agent = await this.agentsService.findPublishedForAnalytics(slug);
    if (!agent) {
      throw new ApiException(
        'AGENT_NOT_FOUND',
        'Agent not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const viewer = optionalViewer(this.tokensService, authorization);
    return this.analytics.recordEngagement(agent, 'documentation', {
      userId: viewer?.sub ?? null,
      role: viewer?.role ?? null,
      visitorId: dto.visitorId ?? null,
      source: dto.source ?? null,
      ip,
      userAgent: userAgent ?? null,
    });
  }

  /**
   * Phase A4 §16 — a REAL product-page view. Sent once by the rendered
   * public product page (not by the data GET, so API fetches, prefetches
   * and crawlers never count). De-duplicated per visitor per day; the
   * owner's and staff views are excluded. 404 for unpublished products.
   */
  @Post(':slug/view')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record a product page view (analytics beacon)' })
  async view(
    @Param('slug') slug: string,
    @Body() dto: RecordViewDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<ViewResult> {
    const agent = await this.agentsService.findPublishedForAnalytics(slug);
    if (!agent) {
      throw new ApiException(
        'AGENT_NOT_FOUND',
        'Agent not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const viewer = optionalViewer(this.tokensService, authorization);
    const result = await this.analytics.recordView(agent, {
      userId: viewer?.sub ?? null,
      role: viewer?.role ?? null,
      visitorId: dto.visitorId ?? null,
      source: dto.source ?? null,
      promotionId: dto.promotionId ?? null,
      ip,
      userAgent: userAgent ?? null,
    });
    // M12 — the same real view also feeds the buyer behaviour log (interest
    // signals). Crawlers, the owner and staff are excluded by the analytics
    // verdict above; nothing here can fail the beacon.
    if (result.counted || result.reason === 'duplicate') {
      await this.recordBuyerView(agent.id, viewer?.sub ?? null, dto);
    }
    return result;
  }

  private async recordBuyerView(
    agentId: string,
    userId: string | null,
    dto: RecordViewDto,
  ): Promise<void> {
    const visitorId = dto.visitorId?.toLowerCase() ?? null;
    const actor = userId ? `u:${userId}` : visitorId ? `v:${visitorId}` : null;
    if (actor) {
      const day = new Date().toISOString().slice(0, 10);
      await this.buyerEvents.recordSafe({
        type: 'product_view',
        userId,
        visitorKey: visitorId,
        agentId,
        source: dto.source ?? null,
        dedupKey: buyerDedupKey('product_view', actor, agentId, day),
      });
    }
  }

  /**
   * A5 §23/§25 — marketplace impressions: listing cards that were actually
   * visible on screen. De-duplicated per visitor per product per day;
   * unknown / unpublished slugs are silently ignored.
   */
  @Post('impressions')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record marketplace listing impressions (beacon)' })
  async impressions(
    @Body() dto: RecordImpressionsDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<{ recorded: number }> {
    const viewer = optionalViewer(this.tokensService, authorization);
    const recorded = await this.analytics.recordImpressions(dto.slugs, {
      userId: viewer?.sub ?? null,
      role: viewer?.role ?? null,
      visitorId: dto.visitorId ?? null,
      source: dto.source ?? 'marketplace',
      ip,
      userAgent: userAgent ?? null,
    });
    return { recorded };
  }

  /**
   * A5 §9 — sponsored placement funnel: a promoted card was shown or
   * clicked. Only an ACTIVE promotion records anything (a forged or
   * expired id is a silent no-op, never an error oracle).
   */
  @Post('promotions/:promotionId/:kind')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record a sponsored card impression / click' })
  async promotionEvent(
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
    @Param('kind') kind: string,
    @Body() dto: PromotionEventDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<{ recorded: boolean }> {
    if (kind !== 'impression' && kind !== 'click') {
      throw new ApiException('NOT_FOUND', 'Not found', HttpStatus.NOT_FOUND);
    }
    const viewer = optionalViewer(this.tokensService, authorization);
    const recorded = await this.analytics.recordPromotionEvent(
      promotionId,
      kind,
      {
        userId: viewer?.sub ?? null,
        role: viewer?.role ?? null,
        visitorId: dto.visitorId ?? null,
        ip,
        userAgent: userAgent ?? null,
      },
    );
    return { recorded };
  }
}
