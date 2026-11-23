import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;
/**
 * Deepest page a client may request. An unbounded page turns into an
 * unbounded OFFSET (a cheap way to make the database scan and discard
 * millions of rows) and, past 2^63, into a database error that surfaced as a
 * 500. 10,000 pages is far beyond anything a person browses.
 */
export const MAX_PAGE = 10_000;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be >= 1' })
  @Max(MAX_PAGE, { message: `page must be <= ${MAX_PAGE}` })
  page: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must be >= 1' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize must be <= ${MAX_PAGE_SIZE}` })
  pageSize: number = DEFAULT_PAGE_SIZE;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
) {
  return { items, meta: buildPaginationMeta(page, pageSize, total) };
}
