import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

/* (express Request already provides ip and cookies) */

import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { ApiException } from '../../common/errors/api-error';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MfaLoginDto } from './dto/mfa.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  ConfirmPasswordResetDto,
  RequestPasswordResetDto,
} from './dto/password-reset.dto';
import {
  CompleteOnboardingDto,
  UsernameAvailableDto,
} from './dto/onboarding.dto';
import { UsersService } from '../users/users.service';
import { PublicUser } from '../users/user-view';

interface AuthenticatedResponse {
  user: PublicUser;
  accessToken: string;
}

/** Sign-in outcome when the account has two-step sign-in on (Phase 3). */
export interface MfaRequiredResponse {
  mfaRequired: true;
  challengeToken: string;
  expiresInSeconds: number;
}

/** Configurable login rate limit — see the @Throttle() note on the login route. */
const LOGIN_RATE_LIMIT_MAX =
  Number.parseInt(process.env.LOGIN_RATE_LIMIT_MAX ?? '10', 10) || 10;

// Same pattern as the login cap: read from the environment so Operations can
// move it without a release, and so a test run is not reported as a product
// failure when it legitimately exceeds the production default.
const EMAIL_RESEND_RATE_LIMIT_MAX =
  Number.parseInt(process.env.EMAIL_RESEND_RATE_LIMIT_MAX ?? '5', 10) || 5;

/**
 * Registrations per minute. Production default: 5. QA/browser-E2E
 * environments raise it via REGISTER_RATE_LIMIT_MAX (the Batch 8 suite
 * registers a fresh, uniquely-named account per journey through the real
 * form — see e2e/README.md).
 */
const REGISTER_RATE_LIMIT_MAX =
  Number.parseInt(process.env.REGISTER_RATE_LIMIT_MAX ?? '5', 10) || 5;

/**
 * Password-reset code requests per minute (AUTH upgrade). Production
 * default: 5. Test/QA environments raise it via PASSWORD_RESET_RATE_LIMIT_MAX
 * — the API e2e reset suite legitimately triggers more than 5 requests per
 * minute against its own app instance.
 */
const PASSWORD_RESET_REQUEST_LIMIT_MAX =
  Number.parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_MAX ?? '5', 10) || 5;

/**
 * Confirmation of a 6-digit code (email verification, password reset) per
 * minute and IP. The per-code attempt budget (5) is the real brute-force
 * limit; this keeps one address from spraying many accounts/codes.
 * Test/QA environments raise it via CODE_CONFIRM_RATE_LIMIT_MAX.
 */
const CODE_CONFIRM_RATE_LIMIT_MAX =
  Number.parseInt(process.env.CODE_CONFIRM_RATE_LIMIT_MAX ?? '10', 10) || 10;

/**
 * Phase C1 — the attribution id the public site stored in a first-party
 * cookie when the visitor landed. It is a plain, non-httpOnly id on purpose:
 * the SERVER set it, the server reads it back, and it carries no authority
 * (the endpoint it links to is authenticated). A forged or expired value is
 * simply ignored downstream.
 */
function attributionIdFrom(request: Request): string | null {
  const raw = (request.cookies as Record<string, string> | undefined)
    ?.ah_crm_attribution;
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    raw,
  )
    ? raw
    : null;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly refreshCookieName: string;
  private readonly refreshCookieSecure: boolean;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    config: ConfigService,
  ) {
    this.refreshCookieName = config.getOrThrow<string>('authCookieName');
    // Read the VALIDATED value (loadEnvironment): the raw AUTH_COOKIE_SECURE
    // env var is the string 'false', which is truthy and wrongly sets the
    // Secure flag on the refresh cookie over plain http.
    this.refreshCookieSecure = config.getOrThrow<boolean>('authCookieSecure');
    this.refreshTtlSeconds = config.getOrThrow<number>('jwtRefreshTtlSeconds');
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: REGISTER_RATE_LIMIT_MAX, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new buyer account (phone required, email optional)',
  })
  @ApiConflictResponse({
    description: 'EMAIL_TAKEN / USERNAME_TAKEN — unique fields already exist.',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR — invalid email/password/username.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Registration rate limit exceeded (default 5/min per IP).',
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedResponse> {
    const result = await this.authService.register(
      dto,
      this.sessionMeta(request),
      // Phase C1: the landing attribution id, if the browser captured one.
      { attributionId: attributionIdFrom(request) },
    );
    this.setRefreshCookie(response, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Public()
  @Post('login')
  // Login attempts per minute. Production default: 10. QA/browser-E2E
  // environments raise it via LOGIN_RATE_LIMIT_MAX (the suite signs in once
  // per test through the real form).
  @Throttle({ default: { limit: LOGIN_RATE_LIMIT_MAX, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with phone + password',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS — wrong phone/email or password.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Login rate limit exceeded (default 10/min per IP).',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedResponse | MfaRequiredResponse> {
    const result = await this.authService.login(dto, this.sessionMeta(request));
    if ('mfaRequired' in result) {
      // No session, no cookie: the second factor is still outstanding.
      return result;
    }
    this.setRefreshCookie(response, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Public()
  @Post('login/mfa')
  @Throttle({ default: { limit: LOGIN_RATE_LIMIT_MAX, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a two-step sign-in with an authenticator/recovery code',
  })
  async loginMfa(
    @Body() dto: MfaLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedResponse> {
    const result = await this.authService.completeMfaLogin(
      dto,
      this.sessionMeta(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange the refresh-token cookie for a new access token',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedResponse> {
    const rawToken = this.readRefreshCookie(request);
    const result = await this.authService.refresh(
      rawToken,
      this.sessionMeta(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const rawToken = this.readRefreshCookie(request);
    await this.authService.logout(rawToken, this.sessionMeta(request));
    this.clearRefreshCookie(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sign out everywhere: revoke every session of the caller, including this one',
  })
  async logoutAll(
    @CurrentUser() authUser: AuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ revoked: number }> {
    const revoked = await this.authService.logoutAll(
      authUser.id,
      this.sessionMeta(request),
    );
    this.clearRefreshCookie(response);
    return { revoked };
  }

  @Post('verify-email')
  @Throttle({ default: { limit: CODE_CONFIRM_RATE_LIMIT_MAX, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the email with the 6-digit code' })
  async verifyEmail(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: VerifyEmailDto,
  ): Promise<PublicUser> {
    return this.authService.verifyEmail(authUser.id, dto.code);
  }

  @Public()
  @Get('username-available')
  // Advisory availability probe for the registration form (AUTH upgrade).
  // Heavily throttled per IP: it is a cheap existence oracle for VALID
  // usernames only — malformed input is rejected by the DTO before the DB
  // is touched, and actual uniqueness is still enforced at register time.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Check whether a username is available (registration UX)',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR — malformed username.',
  })
  async usernameAvailable(@Query() query: UsernameAvailableDto): Promise<{
    available: boolean;
  }> {
    return {
      available: await this.authService.usernameAvailable(query.username),
    };
  }

  @Post('verify-email/resend')
  // Bounded resend: the old flow had NO backend route at all (the frontend
  // button was a no-op — see the AUTH upgrade bug register). Authenticated
  // only — the caller is the unverified user sitting on /verify-email.
  @Throttle({ default: { limit: EMAIL_RESEND_RATE_LIMIT_MAX, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend the email verification code (authenticated caller)',
  })
  async resendVerification(
    @CurrentUser() authUser: AuthUser,
  ): Promise<{ sent: boolean }> {
    const user = await this.usersService.findById(authUser.id);
    if (user) {
      await this.authService.resendEmailVerification(user);
    }
    return { sent: true };
  }

  @Post('onboarding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Save onboarding wizard progress and optionally mark it complete (AUTH upgrade)',
  })
  async saveOnboarding(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: CompleteOnboardingDto,
  ): Promise<PublicUser> {
    return this.authService.saveOnboarding(authUser.id, dto);
  }

  @Public()
  @Post('password-reset/request')
  @Throttle({
    default: { limit: PASSWORD_RESET_REQUEST_LIMIT_MAX, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset code' })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
  ): Promise<{ sent: boolean }> {
    await this.authService.requestPasswordReset(dto.email);
    return { sent: true };
  }

  @Public()
  @Post('password-reset/confirm')
  @Throttle({ default: { limit: CODE_CONFIRM_RATE_LIMIT_MAX, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password with the 6-digit reset code' })
  async confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
  ): Promise<{ ok: boolean }> {
    await this.authService.resetPassword(dto);
    return { ok: true };
  }

  private readRefreshCookie(request: Request): string {
    const raw: unknown = (
      request.cookies as Record<string, unknown> | undefined
    )?.[this.refreshCookieName];
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new ApiException(
        'TOKEN_INVALID',
        'No refresh token present',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return raw;
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(this.refreshCookieName, refreshToken, {
      httpOnly: true,
      secure: this.refreshCookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: this.refreshTtlSeconds * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    // Attributes must match those used to set the cookie, otherwise some
    // browsers will not treat this as the same cookie and will keep it.
    response.clearCookie(this.refreshCookieName, {
      httpOnly: true,
      secure: this.refreshCookieSecure,
      sameSite: 'lax',
      path: '/',
    });
  }

  private sessionMeta(request: Request) {
    // `request.ip` honours the configured `trust proxy` setting (see
    // configureApp): behind a trusted proxy Express resolves the real client
    // from the proxy-appended end of X-Forwarded-For, and without one it is the
    // TCP peer. Reading the header directly would let any client choose the
    // address stored on its session and used by the per-IP login lock.
    return {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };
  }
}
