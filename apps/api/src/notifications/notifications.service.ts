import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createdById: string, dto: CreateNotificationDto) {
    if (dto.type === NotificationType.TARGETED) {
      if (!dto.targetUserIds || dto.targetUserIds.length === 0) {
        throw new BadRequestException('targetUserIds is required for TARGETED notifications');
      }
    }
    return this.prisma.notification.create({
      data: {
        type: dto.type,
        title: dto.title,
        body: dto.body,
        link: dto.link,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        createdById,
      },
    });
  }

  async listInbox(userId: string, opts: { cursor?: string; limit?: number; unreadOnly?: boolean }) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const where: Prisma.NotificationRecipientWhereInput = {
      userId,
      deletedAt: null,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    };
    const rows = await this.prisma.notificationRecipient.findMany({
      where,
      include: { notification: true },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((r) => ({
        id: r.id,
        notificationId: r.notificationId,
        type: r.notification.type,
        title: r.notification.title,
        body: r.notification.body,
        link: r.notification.link,
        metadata: r.notification.metadata,
        readAt: r.readAt,
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notificationRecipient.count({
      where: { userId, readAt: null, deletedAt: null },
    });
    return { count };
  }

  async markRead(userId: string, recipientId: string) {
    const row = await this.prisma.notificationRecipient.findUnique({
      where: { id: recipientId },
    });
    if (!row || row.userId !== userId) throw new NotFoundException();
    if (row.readAt) return row;
    return this.prisma.notificationRecipient.update({
      where: { id: recipientId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notificationRecipient.updateMany({
      where: { userId, readAt: null, deletedAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async softDelete(userId: string, recipientId: string) {
    const row = await this.prisma.notificationRecipient.findUnique({
      where: { id: recipientId },
    });
    if (!row || row.userId !== userId) throw new NotFoundException();
    return this.prisma.notificationRecipient.update({
      where: { id: recipientId },
      data: { deletedAt: new Date() },
    });
  }

  async adminList(opts: { cursor?: string; limit?: number }) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const rows = await this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        _count: { select: { recipients: true } },
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async adminGet(id: string) {
    const n = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!n) throw new NotFoundException();
    const total = await this.prisma.notificationRecipient.count({
      where: { notificationId: id },
    });
    const readCount = await this.prisma.notificationRecipient.count({
      where: { notificationId: id, readAt: { not: null } },
    });
    return { ...n, stats: { total, readCount, readRate: total ? readCount / total : 0 } };
  }
}
