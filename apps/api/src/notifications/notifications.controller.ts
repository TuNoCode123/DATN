import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsQueueService } from './notifications-queue.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationType } from '@prisma/client';

type AuthUser = { id: string; email: string; role: string; displayName?: string | null };

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly queue: NotificationsQueueService,
  ) {}

  // Admin: create + fan out
  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateNotificationDto) {
    const notification = await this.service.create(user.id, dto);
    if (dto.type === NotificationType.TARGETED) {
      await this.queue.enqueueTargeted(notification.id, dto.targetUserIds ?? []);
    } else {
      await this.queue.enqueueBroadcast(notification.id);
    }
    return notification;
  }

  // Learner: own inbox
  @Get('me')
  listMine(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.listInbox(user.id, {
      cursor,
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('me/unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.service.unreadCount(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markRead(user.id, id);
  }

  @Post('me/read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.softDelete(user.id, id);
  }
}

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminNotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.service.adminList({
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.adminGet(id);
  }
}
