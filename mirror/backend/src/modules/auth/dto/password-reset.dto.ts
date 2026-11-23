import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email: string;
}

/**
 * Password reset confirmation — 6-digit CODE flow (AUTH upgrade).
 *
 * The old long-token flow showed the raw token to the user in the UI; the
 * code flow matches the email-verification experience, is never displayed
 * anywhere by the backend, and is one-time with bounded attempts.
 */
export class ConfirmPasswordResetDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(72, { message: 'password must be at most 72 characters' })
  @Matches(/[a-zA-Z]/, { message: 'password must contain a letter' })
  @Matches(/[0-9]/, { message: 'password must contain a number' })
  newPassword: string;
}
