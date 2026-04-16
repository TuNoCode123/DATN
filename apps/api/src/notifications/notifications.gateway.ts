import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AlbJwtService } from '../auth/alb-jwt.service';
import { AlbUserService } from '../auth/alb-user.service';
import { NotificationsService } from './notifications.service';
import { NotificationsQueueService } from './notifications-queue.service';

type AuthUser = {
  id: string;
  email: string;
  role: string;
  displayName?: string | null;
};

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger('NotificationsGateway');

  constructor(
    private readonly albJwtService: AlbJwtService,
    private readonly albUserService: AlbUserService,
    private readonly service: NotificationsService,
    private readonly queueService: NotificationsQueueService,
  ) {}

  afterInit(server: Server) {
    this.queueService.setServer(server);

    server.use(async (socket, next) => {
      try {
        const user = await this.authenticateSocket(socket);
        socket.data.user = user;
        next();
      } catch (err: any) {
        this.logger.warn(
          `[AUTH_FAIL] socket=${socket.id} reason=${err?.message ?? err}`,
        );
        next(new Error('Unauthorized'));
      }
    });
  }

  async handleConnection(socket: Socket) {
    const u = socket.data?.user as AuthUser | undefined;
    if (!u) return;
    socket.join(`user:${u.id}`);
    const { count } = await this.service.unreadCount(u.id);
    socket.emit('notification:unread-count', { count });
  }

  handleDisconnect(socket: Socket) {
    // rooms auto-clean
  }

  @SubscribeMessage('notification:markRead')
  async handleMarkRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { id: string },
  ) {
    const user = socket.data?.user as AuthUser | undefined;
    if (!user) return { ok: false };
    try {
      await this.service.markRead(user.id, data.id);
      const { count } = await this.service.unreadCount(user.id);
      socket.emit('notification:unread-count', { count });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('notification:markAllRead')
  async handleMarkAllRead(@ConnectedSocket() socket: Socket) {
    const user = socket.data?.user as AuthUser | undefined;
    if (!user) return { ok: false };
    await this.service.markAllRead(user.id);
    socket.emit('notification:unread-count', { count: 0 });
    return { ok: true };
  }

  // ─── auth helpers (mirror live-exam.gateway) ──────

  private async authenticateSocket(socket: Socket): Promise<AuthUser> {
    const albToken = socket.handshake.headers['x-amzn-oidc-data'] as string | undefined;
    const claims = await this.albJwtService.verify(albToken);
    if (!claims) throw new Error('Not authenticated');

    const user = await this.albUserService.resolveUser(claims);
    return { id: user.id, email: user.email, role: claims.role, displayName: user.displayName };
  }
}
