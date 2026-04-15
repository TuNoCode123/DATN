import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Server } from 'socket.io';
import { Prisma } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

type JobType = 'fanout-broadcast' | 'fanout-batch' | 'fanout-targeted';

interface FanoutBroadcastData {
  notificationId: string;
}

interface FanoutBatchData {
  notificationId: string;
  userIds: string[];
}

interface FanoutTargetedData {
  notificationId: string;
  userIds: string[];
}

const BATCH_SIZE = 500;

@Injectable()
export class NotificationsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NotificationsQueue');
  private queue!: Queue;
  private worker!: Worker;
  private server: Server | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  async onModuleInit() {
    const connection = this.redis.getConnectionOptions();

    this.queue = new Queue('notifications', { connection });

    this.worker = new Worker(
      'notifications',
      async (job: Job) => {
        switch (job.name as JobType) {
          case 'fanout-broadcast':
            return this.processBroadcast(job.data as FanoutBroadcastData);
          case 'fanout-batch':
            return this.processBatch(job.data as FanoutBatchData);
          case 'fanout-targeted':
            return this.processTargeted(job.data as FanoutTargetedData);
        }
      },
      { connection, concurrency: 5 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.name} [${job?.id}] failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  // ─── Public enqueue ──────────────────────────────

  async enqueueBroadcast(notificationId: string) {
    await this.queue.add(
      'fanout-broadcast',
      { notificationId } satisfies FanoutBroadcastData,
      {
        jobId: `broadcast-${notificationId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  }

  async enqueueTargeted(notificationId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    await this.queue.add(
      'fanout-targeted',
      { notificationId, userIds } satisfies FanoutTargetedData,
      {
        jobId: `targeted-${notificationId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  }

  // ─── Workers ─────────────────────────────────────

  private async processBroadcast(data: FanoutBroadcastData) {
    const { notificationId } = data;
    let cursor: string | undefined;
    let batchIndex = 0;

    while (true) {
      const users = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (users.length === 0) break;

      const userIds = users.map((u) => u.id);
      await this.queue.add(
        'fanout-batch',
        { notificationId, userIds } satisfies FanoutBatchData,
        {
          jobId: `batch-${notificationId}-${batchIndex}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      cursor = users[users.length - 1].id;
      batchIndex++;
      if (users.length < BATCH_SIZE) break;
    }

    this.logger.log(`Broadcast ${notificationId} fanned out into ${batchIndex} batch(es)`);
  }

  private async processBatch(data: FanoutBatchData) {
    await this.insertAndEmit(data.notificationId, data.userIds);
  }

  private async processTargeted(data: FanoutTargetedData) {
    // Chunk to avoid huge createMany in a single call.
    for (let i = 0; i < data.userIds.length; i += BATCH_SIZE) {
      const slice = data.userIds.slice(i, i + BATCH_SIZE);
      await this.insertAndEmit(data.notificationId, slice);
    }
  }

  private async insertAndEmit(notificationId: string, userIds: string[]) {
    if (userIds.length === 0) return;

    const rows: Prisma.NotificationRecipientCreateManyInput[] = userIds.map((userId) => ({
      notificationId,
      userId,
    }));
    await this.prisma.notificationRecipient.createMany({
      data: rows,
      skipDuplicates: true,
    });

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) return;

    // Fetch the recipient rows we can emit with stable IDs.
    const recipients = await this.prisma.notificationRecipient.findMany({
      where: { notificationId, userId: { in: userIds } },
      select: { id: true, userId: true, createdAt: true },
    });

    if (!this.server) return;

    const payloadBase = {
      notificationId: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      metadata: notification.metadata,
    };

    for (const r of recipients) {
      this.server.to(`user:${r.userId}`).emit('notification:new', {
        id: r.id,
        createdAt: r.createdAt,
        readAt: null,
        ...payloadBase,
      });
    }
  }
}
