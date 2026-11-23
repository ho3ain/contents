import { Transform } from 'class-transformer';
import { stripControlChars } from '../search/search-text';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuggestQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? stripControlChars(value).trim() : value,
  )
  @IsString()
  @MaxLength(80)
  q?: string;
}
