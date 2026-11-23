import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * Phone-primary auth: sign-in is ALWAYS phone + password — there is no
 * email identifier on this path.
 */
export class LoginDto {
  @ApiProperty({
    example: '+989121234567',
    description:
      'Phone number (the login identifier). Local formats like 0912… are accepted and canonicalized to +98…',
  })
  @IsString({ message: 'phone is required' })
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone: string;

  @ApiProperty({ example: 'Buyer@1234', writeOnly: true })
  @IsString()
  @MaxLength(72)
  password: string;
}
