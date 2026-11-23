import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { BLOG_SLUG_PATTERN } from './blog-admin.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** `GET /blog/posts` — every filter is validated; unknown slugs simply match nothing. */
export class PublicBlogListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(BLOG_SLUG_PATTERN)
  @MaxLength(110)
  category?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(BLOG_SLUG_PATTERN)
  @MaxLength(110)
  tag?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{1,64}$/)
  author?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  featured?: boolean;

  /**
   * Reading-time bucket: short ≤ 3 min, medium 4–8 min, long ≥ 9 min
   * (`reading_minutes` as computed by the renderer at 200 wpm).
   */
  @IsOptional()
  @IsIn(['short', 'medium', 'long'])
  reading?: 'short' | 'medium' | 'long';

  /**
   * `relevance` ranks title > excerpt > body matches and needs `q`; without
   * a query it falls back to `newest`.
   */
  @IsOptional()
  @IsIn(['relevance', 'newest', 'oldest', 'updated', 'popular'])
  sort?: 'relevance' | 'newest' | 'oldest' | 'updated' | 'popular';
}

export const READING_BUCKETS: Record<
  'short' | 'medium' | 'long',
  { min: number | null; max: number | null }
> = {
  short: { min: null, max: 3 },
  medium: { min: 4, max: 8 },
  long: { min: 9, max: null },
};
