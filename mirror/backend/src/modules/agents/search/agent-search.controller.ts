import { Controller, Get, Headers, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { PublicCache } from '../../../common/decorators/public-cache.decorator';
import { AuthTokensService } from '../../auth/auth-tokens.service';
import { optionalViewer } from '../../auth/optional-viewer';
import { ListAgentsQueryDto } from '../dto/list-agents.dto';
import { SuggestQueryDto } from '../dto/search-discovery.dto';
import {
  AgentFacets,
  AgentListResult,
  AgentSearchService,
  NoResultsGuidance,
  SearchSuggestions,
} from './agent-search.service';
import { PublicQueryCache } from '../../../common/cache/public-query-cache';

/**
 * Marketplace discovery endpoints. Registered BEFORE AgentsController so the
 * literal segments (`suggest`, `facets`, `discovery/…`) are never
 * swallowed by the `:slug` detail route. Everything here is public and only
 * ever reads PUBLISHED listings.
 */
@ApiTags('agents')
@Controller('agents')
export class AgentSearchController {
  constructor(
    private readonly search: AgentSearchService,
    private readonly tokens: AuthTokensService,
    private readonly cache: PublicQueryCache,
  ) {}

  @Get()
  @Public()
  @PublicCache('revalidate')
  @ApiOperation({
    summary:
      'Browse published agents: tolerant search, multi-select filters, sorting, pagination',
  })
  list(
    @Query() query: ListAgentsQueryDto,
    @Headers('authorization') authorization?: string,
  ): Promise<AgentListResult> {
    const viewerId = optionalViewer(this.tokens, authorization)?.sub ?? null;
    // A signed-in viewer may get a personalised order: never share that.
    if (viewerId) return this.search.search(query, viewerId);
    return this.cache.get('list', query, () => this.search.search(query, null));
  }

  @Get('suggest')
  @Public()
  @PublicCache('revalidate')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Autocomplete: products, categories, use cases, popular searches',
  })
  suggest(@Query() query: SuggestQueryDto): Promise<SearchSuggestions> {
    return this.cache.get('suggest', query.q ?? '', () =>
      this.search.suggest(query.q ?? ''),
    );
  }

  @Get('facets')
  @Public()
  @PublicCache('revalidate')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Filter facets with counts for the current query/filters (a facet ignores its own filter)',
  })
  facets(@Query() query: ListAgentsQueryDto): Promise<AgentFacets> {
    return this.cache.get('facets', query, () => this.search.facets(query));
  }

  @Get('discovery/no-results')
  @Public()
  @PublicCache('revalidate')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Zero-result guidance: closest matches, categories and popular products',
  })
  noResults(@Query() query: ListAgentsQueryDto): Promise<NoResultsGuidance> {
    return this.cache.get('no_results', query, () =>
      this.search.noResults(query),
    );
  }
}
