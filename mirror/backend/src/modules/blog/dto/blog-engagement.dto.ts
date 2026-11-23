import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  BLOG_COMMENT_MAX_LENGTH,
  BLOG_COMMENT_MIN_LENGTH,
  BLOG_COMMENT_REPORT_REASONS,
  BLOG_COMMENT_STATUSES,
  BLOG_RATING_MAX,
  BLOG_RATING_MIN,
  type BlogCommentReportReason,
  type BlogCommentStatus,
} from '../../../database/entities/blog/blog-engagement.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const bool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : value;

// ---- reader -----------------------------------------------------------------

export class RateBlogPostDto {
  @Type(() => Number)
  @IsInt({ message: 'rating must be an integer' })
  @Min(BLOG_RATING_MIN, { message: `rating must be >= ${BLOG_RATING_MIN}` })
  @Max(BLOG_RATING_MAX, { message: `rating must be <= ${BLOG_RATING_MAX}` })
  rating: number;
}

export const BLOG_COMMENT_SORTS = ['newest', 'oldest', 'top'] as const;
export type BlogCommentSort = (typeof BLOG_COMMENT_SORTS)[number];

export class ListBlogCommentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(BLOG_COMMENT_SORTS)
  sort: BlogCommentSort = 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must be >= 1' })
  @Max(50, { message: 'pageSize must be <= 50' })
  pageSize: number = 20;
}

export class CreateBlogCommentDto {
  @Transform(trim)
  @IsString()
  @MinLength(BLOG_COMMENT_MIN_LENGTH, {
    message: `body must be at least ${BLOG_COMMENT_MIN_LENGTH} characters`,
  })
  @MaxLength(BLOG_COMMENT_MAX_LENGTH, {
    message: `body must be at most ${BLOG_COMMENT_MAX_LENGTH} characters`,
  })
  body: string;

  /** Reply target — must be a published top-level comment of the same article. */
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}

export class UpdateBlogCommentDto {
  @Transform(trim)
  @IsString()
  @MinLength(BLOG_COMMENT_MIN_LENGTH, {
    message: `body must be at least ${BLOG_COMMENT_MIN_LENGTH} characters`,
  })
  @MaxLength(BLOG_COMMENT_MAX_LENGTH, {
    message: `body must be at most ${BLOG_COMMENT_MAX_LENGTH} characters`,
  })
  body: string;
}

export class ReportBlogCommentDto {
  @IsIn(BLOG_COMMENT_REPORT_REASONS)
  reason: BlogCommentReportReason;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ---- admin ------------------------------------------------------------------

export class AdminListBlogCommentsQueryDto extends PaginationQueryDto {
  /** Comment status; omitted = every status. */
  @IsOptional()
  @IsIn(BLOG_COMMENT_STATUSES)
  status?: BlogCommentStatus;

  /** `true` = only comments with at least one OPEN report. */
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  reported?: boolean;

  @IsOptional()
  @IsUUID('4')
  postId?: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must be >= 1' })
  @Max(50, { message: 'pageSize must be <= 50' })
  pageSize: number = 20;
}

export class RemoveBlogCommentDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class CreateBlogCommentBanDto {
  @IsUUID('4')
  userId: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(240)
  reason?: string;
}
