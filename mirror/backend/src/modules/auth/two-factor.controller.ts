import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UsersService } from '../users/users.service';
import { TwoFactorDisableDto, TwoFactorCodeDto } from './dto/mfa.dto';
import { TwoFactorService } from './two-factor.service';
import type { TwoFactorStatus } from './two-factor.service';

/**
 * Self-service two-step sign-in management (TOTP + recovery codes). Any
 * authenticated user; admins additionally need it for step-up (Phase 3).
 * An impersonating admin can never reach these (see impersonation policy).
 */
@ApiTags('auth')
@Controller('auth/two-factor')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Two-step sign-in status of the current user' })
  async status(@CurrentUser() user: AuthUser): Promise<TwoFactorStatus> {
    return this.twoFactor.status(user.id);
  }

  @Post('setup')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Begin authenticator setup (returns the seed once)',
  })
  async setup(
    @CurrentUser() user: AuthUser,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const account = await this.users.findById(user.id);
    return this.twoFactor.beginSetup(
      user.id,
      account?.email ?? account?.username ?? user.id,
    );
  }

  @Post('confirm')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm setup with a first code; returns recovery codes once',
  })
  async confirm(
    @CurrentUser() user: AuthUser,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<{ recoveryCodes: string[] }> {
    return {
      recoveryCodes: await this.twoFactor.confirmSetup(user.id, dto.code),
    };
  }

  @Post('disable')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Turn two-step sign-in off (password + code)' })
  async disable(
    @CurrentUser() user: AuthUser,
    @Body() dto: TwoFactorDisableDto,
    @Req() request: Request,
  ): Promise<{ disabled: true }> {
    await this.twoFactor.disable(
      user.id,
      dto.password,
      dto.code,
      request.ip ?? null,
    );
    return { disabled: true };
  }

  @Post('recovery-codes')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate recovery codes (password + code)' })
  async recovery(
    @CurrentUser() user: AuthUser,
    @Body() dto: TwoFactorDisableDto,
    @Req() request: Request,
  ): Promise<{ recoveryCodes: string[] }> {
    return {
      recoveryCodes: await this.twoFactor.regenerateRecoveryCodes(
        user.id,
        dto.password,
        dto.code,
        request.ip ?? null,
      ),
    };
  }
}
