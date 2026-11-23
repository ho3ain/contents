import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { BLOG_POST_STATUSES, type BlogPostStatus } from '../domain/blog-status';
import { BLOG_BODY_MAX_CHARS, safeUrl } from '../domain/blog-markdown';

export const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MESSAGE =
  'slug may only contain lowercase latin letters, digits and single hyphens';

/** A link/image target the renderer may emit (see {@link safeUrl}). */
export function IsSafeLink(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSafeLink',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an http(s) URL or a site-relative path`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          value.length <= 2000 &&
          safeUrl(value) !== null,
      },
    });
  };
}

/** Absolute https URL only (canonical overrides point at another site). */
export function IsAbsoluteHttpsUrl(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAbsoluteHttpsUrl',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an absolute https URL`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string' || value.length > 2000) return false;
          try {
            const u = new URL(value);
            return u.protocol === 'https:' && !u.username && !u.password;
          } catch {
            return false;
          }
        },
      },
    });
  };
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
/** `''` from a cleared <select> means "no reference" (null), not a bad uuid. */
const emptyIdToNull = ({ value }: { value: unknown }): unknown =>
  value === '' ? null : value;

export class BlogSourceDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;

  @Transform(trim)
  @IsSafeLink()
  url: string;
}

/**
 * Content + metadata of an article. Every field is optional on PATCH; on
 * POST the service applies defaults (slug from title, author = caller).
 * Relationship arrays are FULL replacements when present and preserved when
 * omitted (the same contract as the creator product save).
 */
export class BlogPostInputDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(BLOG_SLUG_PATTERN, { message: SLUG_MESSAGE })
  @MaxLength(140)
  slug?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(400)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BLOG_BODY_MAX_CHARS)
  bodyMarkdown?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsSafeLink()
  featuredImageUrl?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(240)
  featuredImageAlt?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(240)
  featuredImageCaption?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'authorUserId must be a user id' })
  authorUserId?: string | null;

  @IsOptional()
  @Transform(emptyIdToNull)
  @IsUUID('4', { message: 'reviewerUserId must be a user id' })
  reviewerUserId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(170)
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
  @Transform(emptyIdToNull)
  @IsUUID('4')
  primaryCategoryId?: string | null;

  @IsOptional()
  @Transform(emptyIdToNull)
  @IsUUID('4')
  pillarPostId?: string | null;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  editorialNote?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BlogSourceDto)
  sources?: BlogSourceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUUID('4', { each: true })
  relatedPostIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  agentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  marketCategoryIds?: string[];
}

export class CreateBlogPostDto extends BlogPostInputDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  declare title: string;
}

export class UpdateBlogPostDto extends BlogPostInputDto {
  /** The version the editor loaded; a mismatch is a 409, never an overwrite. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  /** Autosaves never create a revision and never move contentUpdatedAt of a live post. */
  @IsOptional()
  @IsBoolean()
  autosave?: boolean;
}

export class ListBlogPostsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(BLOG_POST_STATUSES)
  status?: BlogPostStatus;

  @IsOptional()
  @IsUUID('4')
  category?: string;

  @IsOptional()
  @IsUUID('4')
  author?: string;

  @IsOptional()
  @IsUUID('4')
  tag?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsIn(['updated', 'created', 'published', 'title'])
  sort?: 'updated' | 'created' | 'published' | 'title' = 'updated';
}

export class ScheduleBlogPostDto {
  @IsISO8601(
    { strict: true },
    { message: 'scheduledFor must be an ISO-8601 instant' },
  )
  scheduledFor: string;
}

export class WorkflowNoteDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class BulkBlogPostsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ids: string[];

  @IsIn(['unpublish', 'archive', 'feature', 'unfeature', 'set_category'])
  action: 'unpublish' | 'archive' | 'feature' | 'unfeature' | 'set_category';

  @IsOptional()
  @Transform(emptyIdToNull)
  @IsUUID('4')
  categoryId?: string | null;
}

export class RenderMarkdownDto {
  @IsString()
  @MaxLength(BLOG_BODY_MAX_CHARS)
  bodyMarkdown: string;
}

export class BlogCategoryInputDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(BLOG_SLUG_PATTERN, { message: SLUG_MESSAGE })
  @MaxLength(110)
  slug?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  nameEn?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(600)
  description?: string | null;

  @IsOptional()
  @Transform(emptyIdToNull)
  @IsUUID('4')
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBlogCategoryDto extends BlogCategoryInputDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declare name: string;
}

export class DeleteBlogCategoryDto {
  /** Where the posts of the deleted category go (null = uncategorised). */
  @IsOptional()
  @Transform(emptyIdToNull)
  @IsUUID('4')
  reassignToId?: string | null;
}

export class BlogTagInputDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(BLOG_SLUG_PATTERN, { message: SLUG_MESSAGE })
  @MaxLength(110)
  slug?: string;
}

export class MergeBlogTagsDto {
  /** Tags that disappear; their posts move to the target. */
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  sourceIds: string[];

  @IsUUID('4')
  targetId: string;
}

export class ListBlogAuthorsQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  q?: string;
}
