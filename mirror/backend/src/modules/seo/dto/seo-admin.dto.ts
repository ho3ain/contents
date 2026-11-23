import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SEO_CONTENT_TYPES,
  SEO_LANGUAGES,
  SUGGESTION_STATUSES,
  TWITTER_CARDS,
  type SeoContentType,
  type SeoLanguage,
  type TwitterCard,
} from '../../../database/entities/seo';
import { BLOG_BODY_MAX_CHARS } from '../../blog/domain/blog-markdown';
import {
  IsAbsoluteHttpsUrl,
  IsSafeLink,
  emptyToNull,
} from '../../blog/dto/blog-admin.dto';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : value;

const toList = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : undefined;

export class UpsertContentSeoDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(160)
  seoDescription?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsAbsoluteHttpsUrl()
  canonicalUrl?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsSafeLink()
  ogImageUrl?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(95)
  ogTitle?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  ogDescription?: string | null;

  @IsOptional()
  @IsIn(TWITTER_CARDS)
  twitterCard?: TwitterCard;

  @IsOptional()
  @IsBoolean()
  robotsIndex?: boolean;

  @IsOptional()
  @IsBoolean()
  robotsFollow?: boolean;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  focusKeyword?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  relatedKeywords?: string[];

  @IsOptional()
  @IsIn(SEO_LANGUAGES)
  language?: SeoLanguage;
}

export class TranslationLinkDto {
  @IsIn(SEO_CONTENT_TYPES)
  targetType: SeoContentType;

  @IsUUID('4')
  targetId: string;
}

export class AnalyzeContentDto {
  @IsIn(SEO_CONTENT_TYPES)
  contentType: SeoContentType;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID('4')
  contentId?: string | null;

  @IsIn(SEO_LANGUAGES)
  language: SeoLanguage;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(180)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BLOG_BODY_MAX_CHARS)
  bodyMarkdown?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(170)
  seoTitle?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(400)
  seoDescription?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  canonicalUrl?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  ogImageUrl?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  featuredImageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  robotsIndex?: boolean;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  focusKeyword?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  relatedKeywords?: string[];
}

export class GraphQueryDto {
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsIn(['post', 'agent', 'keyword', 'category'], { each: true })
  types?: Array<'post' | 'agent' | 'keyword' | 'category'>;

  @IsOptional()
  @IsIn(SEO_LANGUAGES)
  language?: SeoLanguage;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z_]+$/)
  status?: string;

  @IsOptional()
  @IsUUID('4')
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsIn(
    ['link', 'relation', 'keyword', 'category', 'suggestion', 'translation'],
    { each: true },
  )
  relations?: Array<
    'link' | 'relation' | 'keyword' | 'category' | 'suggestion' | 'translation'
  >;

  @IsOptional()
  @IsIn(['no-inbound', 'no-outbound'])
  orphans?: 'no-inbound' | 'no-outbound';

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  broken?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  suggested?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(post|agent|keyword|category):[A-Za-z0-9\u0600-\u06FF %:_-]+$/u)
  focus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(400)
  limit?: number;
}

export class CreateLinkDto {
  @IsIn(SEO_CONTENT_TYPES)
  sourceType: SeoContentType;

  @IsUUID('4')
  sourceId: string;

  @IsIn(SEO_CONTENT_TYPES)
  targetType: SeoContentType;

  @IsUUID('4')
  targetId: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(300)
  anchor?: string | null;
}

export class RemoveRelationDto {
  @IsUUID('4')
  sourceId: string;

  @IsIn(SEO_CONTENT_TYPES)
  targetType: SeoContentType;

  @IsUUID('4')
  targetId: string;
}

export class SuggestionsQueryDto {
  @IsOptional()
  @IsIn(SUGGESTION_STATUSES)
  status?: string;

  @IsOptional()
  @IsUUID('4')
  sourceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class GenerateSuggestionsDto {
  @IsOptional()
  @IsUUID('4')
  sourceId?: string;
}

export class ApproveSuggestionDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(300)
  anchor?: string | null;
}
