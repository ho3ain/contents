import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../../database/entities/identity/user.entity';
import { CrmAttributionService } from './crm-attribution.service';
import { CaptureAttributionDto, LinkAttributionDto } from './dto/crm.dto';

/**
 * Phase C1 — the public side of attribution (spec §7).
 *
 * Two routes, deliberately tiny:
 *
 *   POST /creator-attribution/capture  (public) — a landing page reports its
 *       UTM set. The server upserts one row per salted visitor hash and
 *       returns ONLY the row id; the browser keeps that in a first-party
 *       cookie. No PII, no raw IP, nothing a third party could read.
 *
 *   POST /creator-attribution/link     (authenticated) — called right after
 *       register/login, it links the captured row to the new user and copies
 *       the campaign onto the CRM lead, so "landing → signup → product →
 *       first sale" stays one attributable path.
 */
@ApiTags('crm-attribution')
@Controller('creator-attribution')
export class CrmAttributionController {
  constructor(private readonly attribution: CrmAttributionService) {}

  @Public()
  @Post('capture')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Capture a landing attribution (public, anonymous, idempotent)',
  })
  async capture(@Body() dto: CaptureAttributionDto, @Req() request: Request) {
    const captured = await this.attribution.capture({
      utmSource: dto.utmSource ?? null,
      utmMedium: dto.utmMedium ?? null,
      utmCampaign: dto.utmCampaign ?? null,
      utmContent: dto.utmContent ?? null,
      utmTerm: dto.utmTerm ?? null,
      landingPage: dto.landingPage ?? null,
      referrer: dto.referrer ?? null,
      visitorId: dto.visitorId ?? null,
      ip: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
    return {
      attributionId: captured.id,
      source: captured.source,
      campaign: captured.campaign,
    };
  }

  @Post('link')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Link a captured attribution to the signed-in user and their CRM lead',
  })
  async link(@CurrentUser() user: AuthUser, @Body() dto: LinkAttributionDto) {
    const result = await this.attribution.linkToUser(dto.attributionId, {
      id: user.id,
      email: user.email ?? null,
      phone: null,
    });
    return { linked: Boolean(result.leadId), leadId: result.leadId };
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The signed-in user’s own attribution (never another user’s)',
  })
  async mine(@CurrentUser() user: AuthUser) {
    const attribution = await this.attribution.forUser(user.id);
    if (!attribution)
      return { source: null, campaign: null, landingPage: null };
    return {
      source: attribution.source,
      campaign: attribution.campaign,
      landingPage: attribution.landingPage,
      firstSeenAt: attribution.firstSeenAt,
    };
  }

  @Get('admin/leads/:leadId')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Attribution history of one lead (admin)' })
  async forLead(@Param('leadId', ParseUUIDPipe) leadId: string) {
    const rows = await this.attribution.forLead(leadId);
    return {
      items: rows.map((row) => ({
        id: row.id,
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
        content: row.content,
        term: row.term,
        landingPage: row.landingPage,
        referrer: row.referrer,
        touchCount: row.touchCount,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        convertedAt: row.convertedAt,
      })),
      total: rows.length,
    };
  }
}
