import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  /**
   * OPTIONAL (phone-primary auth): a brand-new account registers with a
   * REQUIRED phone number; email stays unique when provided but is no
   * longer mandatory.
   */
  @ApiProperty({
    required: false,
    example: 'new.buyer@example.com',
    description:
      'Optional — unique when provided. Phone is the primary identifier.',
  })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @ApiProperty({
    example: 'StrongPass1',
    description: '8–72 characters, must contain a letter and a number',
    writeOnly: true,
  })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(72, { message: 'password must be at most 72 characters' })
  @Matches(/[a-zA-Z]/, { message: 'password must contain a letter' })
  @Matches(/[0-9]/, { message: 'password must contain a number' })
  password: string;

  @ApiProperty({
    example: 'new-buyer',
    description: 'Required: 3–30 chars, lowercase letters, digits, "-" and "_"',
  })
  @IsString({ message: 'username is required' })
  @MinLength(3, { message: 'username must be at least 3 characters' })
  @MaxLength(30, { message: 'username must be at most 30 characters' })
  @Matches(/^[a-z0-9][a-z0-9_-]*$/, {
    message: 'username may only contain lowercase letters, digits, "-" and "_"',
  })
  username: string;

  @ApiProperty({
    required: false,
    example: 'Ali Ahmadi',
    description: 'Display name (profile only, never used for auth)',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'full name must be at least 2 characters' })
  @MaxLength(100, { message: 'full name must be at most 100 characters' })
  fullName?: string;

  @ApiProperty({
    required: true,
    example: '+989121234567',
    description:
      'REQUIRED phone number — the primary login identifier. Normalized on save. No SMS verification in this phase.',
  })
  @IsString({ message: 'phone is required' })
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone: string;

  @ApiProperty({
    required: true,
    description:
      'Must be true for the current registration gate. The present backend records one legacy bundle timestamp/version; it does not establish per-document approval or lifecycle status.',
  })
  @IsBoolean({ message: 'terms acceptance is required' })
  @IsIn([true], { message: 'you must accept the Terms of Service' })
  acceptTerms: boolean;

  @ApiProperty({
    required: false,
    example: '2026-10-13',
    description:
      'Date-shaped identifier of the legacy Terms/Privacy registration bundle the client displayed (YYYY-MM-DD). ' +
      'When present it must equal the configured identifier for this registration gate (400 otherwise). ' +
      'It is recorded on the account but does not prove document approval or effectiveness.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'termsVersion must be a date identifier (YYYY-MM-DD)',
  })
  termsVersion?: string;

  @ApiProperty({
    required: false,
    example: 'fa',
    description:
      'Preferred language for transactional emails: fa (default) or en',
  })
  @IsOptional()
  @IsIn(['fa', 'en'], { message: 'locale must be fa or en' })
  locale?: 'fa' | 'en';
}
