import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiException } from '../../common/errors/api-error';
import type { AuthUser } from '../../common/types/auth-user';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Notification } from '../../database/entities/platform/notification.entity';
import {
  NotificationsService,
  type NotificationFilter,
} from './notifications.service';

/**
 * A real class (not `PaginationQueryDto & {...}`): the ValidationPipe only
 * validates class metatypes, and an intersection type reflects as `Object`, so
 * `page=abc` / `pageSize=0` used to reach the query and return a 500.
 * `filter` and `type` stay lenient — an unknown value is ignored, as before.
 */
class NotificationListQueryDto extends PaginationQueryDto {
  // The route's long-standing default (the shared DTO default is 24).
  declare pageSize: number;

  constructor() {
    super();
    this.pageSize = 20;
  }

  @IsOptional()
  @IsString()
  @MaxLength(48)
  filter?: NotificationFilter;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  type?: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'My notifications (optional unread/read filter)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query()
    query: NotificationListQueryDto,
  ): Promise<{ items: Notification[]; meta: unknown }> {
    const type =
      typeof query.type === 'string' && /^[a-z_]{1,48}$/.test(query.type)
        ? query.type
        : undefined;
    return this.notificationsService.listForUser(
      user.id,
      query.page ?? 1,
      query.pageSize ?? 20,
      query.filter === 'unread' || query.filter === 'read'
        ? query.filter
        : 'all',
      type,
    );
  }

  @Get('types')
  @ApiOperation({ summary: 'Notification types I have (filter bar)' })
  async types(@CurrentUser() user: AuthUser): Promise<{ types: string[] }> {
    return { types: await this.notificationsService.typesOf(user.id) };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications' })
  async unreadCount(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    const count = await this.notificationsService.unreadCount(user.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: boolean }> {
    const updated = await this.notificationsService.markRead(user.id, id);
    if (!updated) {
      throw new ApiException('NOT_FOUND', 'Notification not found', 404);
    }
    return { ok: true };
  }

  @Patch(':id/unread')
  @ApiOperation({ summary: 'Mark one notification as unread again' })
  async markUnread(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: boolean }> {
    const ok = await this.notificationsService.markUnread(user.id, id);
    if (!ok) {
      throw new ApiException('NOT_FOUND', 'Notification not found', 404);
    }
    return { ok: true };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentUser() user: AuthUser): Promise<{ ok: boolean }> {
    await this.notificationsService.markAllRead(user.id);
    return { ok: true };
  }
}
