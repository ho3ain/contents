import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { ApiException } from '../../common/errors/api-error';
import { UserRole } from '../../database/entities/identity/user.entity';
import { MEDIA_MAX_BYTES } from './media-rules';
import { STORAGE_KEY_RE } from './storage.provider';
import { StorageService, type IncomingFile } from './storage.service';
import { RequiresCapability } from '../control-plane/config/kill-switch.guard';

class UploadMediaDto {
  @IsString()
  @MaxLength(16)
  kind: string;
}

@ApiTags('storage')
@Controller()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('storage/capabilities')
  @Public()
  @ApiOperation({
    summary:
      'Whether file uploads are enabled, accepted image types and per-kind limits (video: false)',
  })
  capabilities() {
    return this.storage.capabilities();
  }

  @Post('creators/me/agents/:id/media')
  @RequiresCapability('UPLOADS_ENABLED')
  @Roles(UserRole.CREATOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      // Hard ceiling at the parser (per-kind limits are checked after).
      limits: { fileSize: MEDIA_MAX_BYTES + 1, files: 1, fields: 4 },
    }),
  )
  @ApiOperation({
    summary:
      'Upload a product image (logo / cover / screenshot). Type from magic bytes (PNG/JPEG/WebP), size + dimensions validated. 503 STORAGE_DISABLED when no driver is configured.',
  })
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadMediaDto,
    @UploadedFile() file?: IncomingFile,
  ) {
    return this.storage.upload(user.id, id, dto.kind, file);
  }

  /**
   * §13 — creator PROFILE picture. Wired to the same real upload path as
   * product images (driver + magic bytes + size/dimension rules + DB row),
   * because a button that looks like an upload must actually be one. When no
   * storage driver is configured the endpoint answers 503 STORAGE_DISABLED and
   * the UI falls back to the image-URL field instead of pretending.
   */
  @Post('creators/me/avatar')
  @RequiresCapability('UPLOADS_ENABLED')
  @Roles(UserRole.CREATOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MEDIA_MAX_BYTES + 1, files: 1, fields: 0 },
    }),
  )
  @ApiOperation({
    summary:
      'Upload the creator profile picture. Type from magic bytes (PNG/JPEG/WebP), 96–2048px square-ish, ≤1MB. 503 STORAGE_DISABLED when no driver is configured.',
  })
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: IncomingFile,
  ) {
    return this.storage.uploadAvatar(user.id, file);
  }

  @Get('media/:key')
  @Public()
  @ApiOperation({ summary: 'Serve a stored media file' })
  async serve(@Param('key') key: string, @Res() res: Response) {
    const file = STORAGE_KEY_RE.test(key) ? await this.storage.read(key) : null;
    if (!file) {
      throw new ApiException(
        'NOT_FOUND',
        'File not found',
        HttpStatus.NOT_FOUND,
      );
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(HttpStatus.OK).end(file.body);
  }
}
