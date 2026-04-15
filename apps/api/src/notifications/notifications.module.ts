import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { NotificationsQueueService } from './notifications-queue.service';
import { NotificationsGateway } from './notifications.gateway';
import {
  AdminNotificationsController,
  NotificationsController,
} from './notifications.controller';

@Module({
  imports: [PrismaModule, RedisModule, AuthModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService, NotificationsQueueService, NotificationsGateway],
  exports: [NotificationsService, NotificationsQueueService],
})
export class NotificationsModule {}
