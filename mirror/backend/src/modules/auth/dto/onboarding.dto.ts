import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Username availability probe (registration UX). Separate strict DTO: the
 * endpoint is public + throttled, so the input must be bounded and cheap.
 */
export class UsernameAvailableDto {
  @IsString()
  @MinLength(3, { message: 'username must be at least 3 characters' })
  @MaxLength(30, { message: 'username must be at most 30 characters' })
  @Matches(/^[a-z0-9][a-z0-9_-]*$/, {
    message: 'username may only contain lowercase letters, digits, "-" and "_"',
  })
  username: string;
}

/**
 * Onboarding wizard completion (AUTH upgrade). All profile data is optional;
 * `complete` marks the wizard finished (backend-authoritative
 * users.onboarding_completed_at).
 */
export class CompleteOnboardingDto {
  @ApiProperty({ required: false, example: 'ali.ahmadi' })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'username must be at least 3 characters' })
  @MaxLength(30, { message: 'username must be at most 30 characters' })
  @Matches(/^[a-z0-9][a-z0-9_-]*$/, {
    message: 'username may only contain lowercase letters, digits, "-" and "_"',
  })
  username?: string;

  @ApiProperty({ required: false, example: 'Ali Ahmadi' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiProperty({ required: false, example: '+989121234567' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @ApiProperty({ required: false, example: 'IR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'country must be an ISO 3166-1 code' })
  country?: string;

  /**
   * Marketplace category slugs the user is interested in (reuses the
   * existing taxonomy — no parallel interest system).
   */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(16)
  @IsString({ each: true })
  interests?: string[];

  /** Mark the wizard completed (false = save progress only). */
  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}
