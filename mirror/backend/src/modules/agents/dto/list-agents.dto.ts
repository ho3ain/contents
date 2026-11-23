import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { stripControlChars } from '../search/search-text';

const BOOLEAN_QUERY = /^(true|false)$/;
const PRICE_QUERY = /^\d+(\.\d{1,2})?$/;
const RATING_QUERY = /^[0-5](\.\d{1,2})?$/;
/**
 * Comma-separated multi-select: up to 12 values of 1–80 chars. The control
 * characters are excluded on purpose (they never belong in a filter value).
 */
const CSV_QUERY =
  // eslint-disable-next-line no-control-regex
  /^[^,\u0000-\u001f\u007f]{1,80}(,[^,\u0000-\u001f\u007f]{1,80}){0,11}$/;
const COUNT_QUERY = /^\d{1,5}$/;

/**
 * `?industry=` / `?category=,,` (a cleared multi-select, a hand-edited URL)
 * means "no filter", not a 400: empty values and empty CSV parts are dropped
 * before validation. Anything non-empty still has to match CSV_QUERY.
 */
const emptyCsvAsUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length === 0 ? undefined : parts.join(',');
};

export const SETUP_DIFFICULTIES = ['easy', 'medium', 'advanced'] as const;
export type SetupDifficulty = (typeof SETUP_DIFFICULTIES)[number] | 'unknown';

export const AGENT_SORTS = [
  'recommended',
  'relevance',
  'popular',
  'price_asc',
  'price_desc',
  'rating',
  'reviews',
  'newest',
] as const;
export type AgentSort = (typeof AGENT_SORTS)[number];

/**
 * Query parameters for GET /agents. `free`, `verified`, `securityReviewed`,
 * `verifiedCreator`, `clearDataPolicy` and `noSensitiveData` are strict
 * "true" strings; price and rating filters are numeric strings — parsing is
 * done in the service so the transport stays unambiguous.
 *
 * Trust filters map 1:1 to REAL data: the historic `securityReviewed` name
 * means the latest granted listing review (`agent_verification`), not a
 * security certification; verifiedCreator = creator verification;
 * clearDataPolicy/noSensitiveData = the agent's declared data policy.
 * `verified` is kept as a legacy alias of `securityReviewed`.
 *
 * Buyer Discovery: category / productType / deliveryModel / executionModel /
 * integration / industry / setupDifficulty / requirement are COMMA-SEPARATED multi-selects
 * (OR inside one facet, AND between facets). `setupDifficulty` is derived from
 * real requirements, integrations and delivery — never creator-claimed.
 */
export class ListAgentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? stripControlChars(value).trim() : value,
  )
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @Transform(emptyCsvAsUndefined)
  @Matches(CSV_QUERY, {
    message: 'category must be up to 12 comma-separated slugs',
  })
  category?: string;

  /** Comma-separated Product Contract types (automation, ai_agent, …). */
  @IsOptional()
  @IsString()
  @Transform(emptyCsvAsUndefined)
  @Matches(CSV_QUERY, { message: 'productType must be comma-separated values' })
  productType?: string;

  @IsOptional()
  @IsString()
  @Transform(emptyCsvAsUndefined)
  @Matches(CSV_QUERY, {
    message: 'deliveryModel must be comma-separated values',
  })
  deliveryModel?: string;

  @IsOptional()
  @IsString()
  @Transform(emptyCsvAsUndefined)
  @Matches(CSV_QUERY, {
    message: 'executionModel must be comma-separated values',
  })
  executionModel?: string;

  /** Derived setup difficulty: easy | medium | advanced (comma-separated). */
  @IsOptional()
  @IsString()
  @Matches(/^(easy|medium|advanced)(,(easy|medium|advanced)){0,2}$/, {
    message: 'setupDifficulty must be easy, medium and/or advanced',
  })
  setupDifficulty?: string;

  /** Requirement types the buyer must supply (api_key, infrastructure, …). */
  @IsOptional()
  @IsString()
  @Transform(emptyCsvAsUndefined)
  @Matches(CSV_QUERY, { message: 'requirement must be comma-separated values' })
  requirement?: string;

  /** Matches the creator-declared use cases (normalized, contains). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  useCase?: string;

  @IsOptional()
  @IsString()
  @Matches(COUNT_QUERY, {
    message: 'minReviews must be a non-negative integer',
  })
  minReviews?: string;

  @IsOptional()
  @IsString()
  @Matches(BOOLEAN_QUERY, { message: 'popular must be "true" or "false"' })
  popular?: string;

  @IsOptional()
  @IsString()
  @Matches(BOOLEAN_QUERY, { message: 'free must be "true" or "false"' })
  free?: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_QUERY, { message: 'minPrice must be a non-negative number' })
  minPrice?: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_QUERY, { message: 'maxPrice must be a non-negative number' })
  maxPrice?: string;

  @IsOptional()
  @IsString()
  @Matches(RATING_QUERY, { message: 'ratingMin must be between 0 and 5' })
  ratingMin?: string;

  @IsOptional()
  @IsString()
  @Matches(BOOLEAN_QUERY, { message: 'verified must be "true" or "false"' })
  verified?: string;

  @IsOptional()
  @IsString()
  @Matches(BOOLEAN_QUERY, {
    message: 'securityReviewed must be "true" or "false"',
  })
  securityReviewed?: string;

  @IsOptional()
  @IsString()
  @Matches(BOOLEAN_QUERY, {
    message: 'verifiedCreator must be "true" or "false"',
  })
  verifiedCreator?: string;

  @IsOptional()
  @IsString()
  @Matches(BOOLEAN_QUERY, {
    message: 'clearDataPolicy must be "true" or "false"',
  })
  clearDataPolicy?: string;

  @IsOptional()
  @IsString()
  @Matches(BOOLEAN_QUERY, {
    message: 'noSensitiveData must be "true" or "false"',
  })
  noSensitiveData?: string;

  @IsOptional()
  @IsString()
  @Transform(emptyCsvAsUndefined)
  @Matches(CSV_QUERY, { message: 'integration must be comma-separated slugs' })
  integration?: string;

  /** Taxonomy v2 — industry slugs, comma-separated (OR inside, AND with others). */
  @IsOptional()
  @IsString()
  @Transform(emptyCsvAsUndefined)
  @Matches(CSV_QUERY, { message: 'industry must be comma-separated slugs' })
  industry?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? stripControlChars(value).trim() : value,
  )
  @IsString()
  @MaxLength(120)
  creator?: string;

  @IsOptional()
  @IsIn(AGENT_SORTS, {
    message:
      'sort must be one of recommended, relevance, popular, price_asc, price_desc, rating, reviews, newest',
  })
  sort?: AgentSort;
}
