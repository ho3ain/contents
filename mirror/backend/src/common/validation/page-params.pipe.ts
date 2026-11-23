import { HttpStatus, Injectable, PipeTransform } from '@nestjs/common';
import { ApiException } from '../errors/api-error';
import { MAX_PAGE } from '../dto/pagination.dto';

/**
 * Validation for routes that bind `@Query('page')` / `@Query('pageSize')`
 * individually (because they also take filters and cannot use the whole-object
 * `PaginationQueryDto`). They used to do `Number(page)`: `abc` became NaN,
 * `0` / `-1` became a negative OFFSET or LIMIT, and the database error came
 * back as a 500 (and `pageSize=0` meant "no limit" to TypeORM — the entire
 * table in one response).
 *
 * Same rules as `PaginationQueryDto`: a whole positive number, `page` at most
 * MAX_PAGE. A `pageSize` above the route's maximum is clamped to it (the
 * long-standing behaviour); anything not a positive whole number is a 400.
 */
const WHOLE_NUMBER = /^\d{1,9}$/;

function parse(raw: unknown, field: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw invalid(field, `${field} must be a single whole number`);
  }
  const text = String(raw);
  if (!WHOLE_NUMBER.test(text) || Number(text) < 1) {
    throw invalid(field, `${field} must be a whole number >= 1`);
  }
  return Number(text);
}

function invalid(field: string, message: string): ApiException {
  return new ApiException('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, {
    field,
  });
}

@Injectable()
export class PageParamPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    const page = parse(value, 'page') ?? 1;
    if (page > MAX_PAGE) throw invalid('page', `page must be <= ${MAX_PAGE}`);
    return page;
  }
}

export class PageSizeParamPipe implements PipeTransform<unknown, number> {
  constructor(
    private readonly defaultSize: number,
    private readonly maxSize: number,
    /** Name reported in the 400 (the query parameter this pipe is bound to). */
    private readonly field: string = 'pageSize',
  ) {}

  transform(value: unknown): number {
    const size = parse(value, this.field) ?? this.defaultSize;
    return Math.min(size, this.maxSize);
  }
}
