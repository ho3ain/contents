import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class MfaLoginDto {
  @ApiProperty({ description: 'challengeToken returned by POST /auth/login' })
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  challengeToken: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit authenticator code, or a recovery code',
  })
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code: string;
}

export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code: string;
}

export class TwoFactorDisableDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MaxLength(72)
  password: string;

  @ApiProperty({ description: 'Current authenticator or recovery code' })
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code: string;
}
