import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { CognitoAuthService } from '../auth/cognito-auth.service';
import { RedisService } from '../redis/redis.service';
import { MessageType } from '@prisma/client';

// ── Redis key helpers (chat-scoped) ─────────────────
const KEY = {
  /** User presence: JSON { connectedAt, lastSeen } — TTL 120s */
  presence: (uid: string) => `chat:presence:${uid}`,
  /** Typing indicator — TTL 3s */
  typing: (convId: string, uid: string) => `chat:typing:${convId}:${uid}`,
  /** Rate limit: list of timestamps — TTL 10s */
  rateLimit: (uid: string) => `chat:ratelimit:${uid}`,
  /** Set of all online user IDs */
  onlineSet: () => `chat:online`,
};

const TTL = {
  PRESENCE: 120, // 2 min, refreshed by heartbeat
  TYPING: 5, // 5 seconds auto-expire
  RATE_LIMIT: 10, // 10s sliding window
};

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('ChatGateway');

  constructor(
    private chatService: ChatService,
    private cognitoAuthService: CognitoAuthService,
    private redis: RedisService,
  ) {}

  // ─── Connection ─────────────────────────────────────

  async handleConnection(socket: Socket) {
    try {
      const user = await this.authenticateSocket(socket);
      socket.data.user = user;

      const userId = user.id;

      // Join personal room — delivers events regardless of which conversation is open
      socket.join(`user:${userId}`);

      await this.redis.sadd(KEY.onlineSet(), userId);
      await this.redis.setJson(
        KEY.presence(userId),
        { connectedAt: Date.now(), lastSeen: Date.now() },
        TTL.PRESENCE,
      );

      // Live count from Socket.IO adapter — works cluster-wide via Redis adapter
      // and is self-cleaning (no orphans across server restarts).
      const liveSockets = await this.server
        .in(`user:${userId}`)
        .fetchSockets();
      const socketCount = liveSockets.length;

      this.logger.log(
        `[CONNECT] user=${userId} email=${user.email} socket=${socket.id} ` +
          `activeSockets=${socketCount}`,
      );

      // Broadcast online if first socket
      if (socketCount === 1) {
        this.server.emit('user_online', { userId });
        this.logger.log(`[ONLINE] user=${userId} — now online`);
      }
    } catch (err: any) {
      this.logger.warn(
        `[CONNECT_FAIL] socket=${socket.id} reason=${err.message}`,
      );
      socket.emit('auth_error', { message: 'Token expired' });
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data?.user?.id;
    if (!userId) return;

    // Authoritative live count: by the time `disconnect` fires, Socket.IO has
    // already removed this socket from its rooms in the adapter, so fetchSockets
    // returns only the OTHER live sockets for this user (across the cluster).
    const liveSockets = await this.server
      .in(`user:${userId}`)
      .fetchSockets();

    if (liveSockets.length === 0) {
      // Last socket — user is offline
      await this.redis.srem(KEY.onlineSet(), userId);
      await this.redis.del(KEY.presence(userId));

      this.server.emit('user_offline', {
        userId,
        lastSeen: new Date().toISOString(),
      });
      this.logger.log(
        `[DISCONNECT] user=${userId} socket=${socket.id} — now offline`,
      );
    } else {
      this.logger.log(
        `[DISCONNECT] user=${userId} socket=${socket.id} — still has ${liveSockets.length} socket(s)`,
      );
    }

    // Clear typing for this user in all conversations they were in
    // (typing keys auto-expire via TTL, but emit stop-typing for immediate UX)
    for (const room of socket.rooms) {
      if (room.startsWith('conversation:')) {
        const convId = room.replace('conversation:', '');
        await this.redis.del(KEY.typing(convId, userId));
        socket
          .to(room)
          .emit('user_stop_typing', { conversationId: convId, userId });
      }
    }
  }

  // ─── Heartbeat (presence refresh) ───────────────────

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() socket: Socket) {
    const userId = socket.data.user?.id;
    if (!userId) return;

    const data = await this.redis.getJson<any>(KEY.presence(userId));
    if (data) {
      data.lastSeen = Date.now();
      await this.redis.setJson(KEY.presence(userId), data, TTL.PRESENCE);
    }
  }

  // ─── Join / Leave Rooms ─────────────────────────────

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) {
      this.logger.warn(`[JOIN_FAIL] socket=${socket.id} — not authenticated`);
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }

    try {
      await this.chatService.assertMember(data.conversationId, userId);
      socket.join(`conversation:${data.conversationId}`);

      const sockets = await this.server
        .in(`conversation:${data.conversationId}`)
        .fetchSockets();
      const roomSize = sockets.length;
      this.logger.log(
        `[JOIN] user=${userId} conversation=${data.conversationId} ` +
          `roomSize=${roomSize} socket=${socket.id}`,
      );
      return { success: true };
    } catch {
      this.logger.warn(
        `[JOIN_FAIL] user=${userId} conversation=${data.conversationId} — not a member`,
      );
      return { success: false, error: 'NOT_MEMBER' };
    }
  }

  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = socket.data.user?.id;
    socket.leave(`conversation:${data.conversationId}`);

    this.logger.log(
      `[LEAVE] user=${userId ?? 'unknown'} conversation=${data.conversationId} socket=${socket.id}`,
    );
    return { success: true };
  }

  // ─── Send Message ───────────────────────────────────

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      content?: string;
      type?: MessageType;
      clientId: string;
      attachmentUrl?: string;
      attachmentName?: string;
      attachmentSize?: number;
      attachmentType?: string;
    },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return { success: false, error: 'NOT_AUTHENTICATED' };

    // Rate limit via Redis: max 10 messages per 5 seconds
    const rateLimited = await this.checkRateLimit(userId);
    if (rateLimited) {
      this.logger.warn(
        `[RATE_LIMIT] user=${userId} conversation=${data.conversationId}`,
      );
      return { success: false, error: 'RATE_LIMITED' };
    }

    const type = data.type || MessageType.TEXT;

    // Validate
    if (!data.clientId) {
      return { success: false, error: 'VALIDATION_ERROR' };
    }
    if (
      type === MessageType.TEXT &&
      (!data.content || data.content.length > 5000)
    ) {
      return { success: false, error: 'VALIDATION_ERROR' };
    }
    if (
      (type === MessageType.IMAGE || type === MessageType.FILE) &&
      !data.attachmentUrl
    ) {
      return { success: false, error: 'ATTACHMENT_REQUIRED' };
    }

    try {
      await this.chatService.assertMember(data.conversationId, userId);
    } catch {
      this.logger.warn(
        `[SEND_FAIL] user=${userId} conversation=${data.conversationId} — not a member`,
      );
      return { success: false, error: 'NOT_MEMBER' };
    }

    try {
      const attachment = data.attachmentUrl
        ? {
            attachmentUrl: data.attachmentUrl,
            attachmentName: data.attachmentName,
            attachmentSize: data.attachmentSize,
            attachmentType: data.attachmentType,
          }
        : undefined;

      const message = await this.chatService.createMessage(
        data.conversationId,
        userId,
        data.content || '',
        type,
        data.clientId,
        attachment,
      );

      // Notify ALL conversation members (except sender) regardless of room
      this.notifyAllMembers(data.conversationId, userId, 'new_message', message);

      return { success: true, message };
    } catch (error: any) {
      this.logger.error(
        `[SEND_ERROR] user=${userId} conversation=${data.conversationId} error=${error.message}`,
      );
      return { success: false, error: 'INTERNAL_ERROR' };
    }
  }

  // ─── Mark Read ──────────────────────────────────────

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string; seqNumber: number },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return { success: false, error: 'NOT_AUTHENTICATED' };

    try {
      const result = await this.chatService.markRead(
        data.conversationId,
        userId,
        data.seqNumber,
      );
      socket
        .to(`conversation:${data.conversationId}`)
        .emit('message_read', {
          conversationId: data.conversationId,
          userId,
          lastReadSeq: result.lastReadSeq,
        });
      return { success: true, ...result };
    } catch {
      return { success: false, error: 'ERROR' };
    }
  }

  // ─── Edit Message ──────────────────────────────────

  @SubscribeMessage('edit_message')
  async handleEditMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: { conversationId: string; messageId: string; content: string },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return { success: false, error: 'NOT_AUTHENTICATED' };

    if (!data.content || data.content.length > 5000) {
      return { success: false, error: 'VALIDATION_ERROR' };
    }

    try {
      const message = await this.chatService.editMessage(
        data.conversationId,
        data.messageId,
        userId,
        data.content,
      );

      this.notifyAllMembers(data.conversationId, userId, 'message_edited', {
        conversationId: data.conversationId,
        messageId: data.messageId,
        content: message.content,
        editedAt: message.editedAt,
      });

      return { success: true, message };
    } catch (error: any) {
      this.logger.warn(
        `[EDIT_FAIL] user=${userId} message=${data.messageId} error=${error.message}`,
      );
      return { success: false, error: error.message || 'INTERNAL_ERROR' };
    }
  }

  // ─── Delete Message ────────────────────────────────

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      messageId: string;
      mode: 'self' | 'everyone';
    },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return { success: false, error: 'NOT_AUTHENTICATED' };

    try {
      if (data.mode === 'everyone') {
        await this.chatService.deleteForEveryone(
          data.conversationId,
          data.messageId,
          userId,
        );

        this.notifyAllMembers(data.conversationId, userId, 'message_deleted', {
          conversationId: data.conversationId,
          messageId: data.messageId,
          deletedForAll: true,
        });
      } else {
        await this.chatService.deleteForMe(
          data.conversationId,
          data.messageId,
          userId,
        );
        // No broadcast for "delete for me" — local only
      }

      return { success: true };
    } catch (error: any) {
      this.logger.warn(
        `[DELETE_FAIL] user=${userId} message=${data.messageId} error=${error.message}`,
      );
      return { success: false, error: error.message || 'INTERNAL_ERROR' };
    }
  }

  // ─── Reactions ─────────────────────────────────────

  @SubscribeMessage('toggle_reaction')
  async handleToggleReaction(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: { conversationId: string; messageId: string; emoji: string },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return { success: false, error: 'NOT_AUTHENTICATED' };

    if (!data.emoji || data.emoji.length > 32) {
      return { success: false, error: 'VALIDATION_ERROR' };
    }

    try {
      // Check if reaction already exists — toggle
      const existing = await this.chatService['prisma'].messageReaction.findUnique({
        where: {
          messageId_userId_emoji: {
            messageId: data.messageId,
            userId,
            emoji: data.emoji,
          },
        },
      });

      let result;
      let action: 'add' | 'remove';

      if (existing) {
        result = await this.chatService.removeReaction(
          data.conversationId,
          data.messageId,
          userId,
          data.emoji,
        );
        action = 'remove';
      } else {
        result = await this.chatService.addReaction(
          data.conversationId,
          data.messageId,
          userId,
          data.emoji,
        );
        action = 'add';
      }

      socket
        .to(`conversation:${data.conversationId}`)
        .emit('reaction_updated', {
          conversationId: data.conversationId,
          messageId: data.messageId,
          emoji: data.emoji,
          userId,
          action,
          reactions: result.reactions,
        });

      return { success: true, action, reactions: result.reactions };
    } catch (error: any) {
      this.logger.warn(
        `[REACTION_FAIL] user=${userId} message=${data.messageId} error=${error.message}`,
      );
      return { success: false, error: error.message || 'INTERNAL_ERROR' };
    }
  }

  // ─── Typing ─────────────────────────────────────────

  @SubscribeMessage('typing_start')
  async handleTypingStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return;

    // Set typing key with TTL — auto-expires, no cleanup needed
    await this.redis.set(
      KEY.typing(data.conversationId, userId),
      '1',
      TTL.TYPING,
    );

    const displayName = socket.data.user?.email;
    socket
      .to(`conversation:${data.conversationId}`)
      .emit('user_typing', {
        conversationId: data.conversationId,
        userId,
        displayName,
      });
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return;

    await this.redis.del(KEY.typing(data.conversationId, userId));

    socket
      .to(`conversation:${data.conversationId}`)
      .emit('user_stop_typing', {
        conversationId: data.conversationId,
        userId,
      });
  }

  // ─── Presence Query ─────────────────────────────────

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers(@ConnectedSocket() socket: Socket) {
    const userIds = await this.redis.smembers(KEY.onlineSet());
    this.logger.log(
      `[PRESENCE_QUERY] from=${socket.data.user?.id ?? socket.id} onlineUsers=${userIds.length}`,
    );
    return { success: true, userIds };
  }

  // ─── Helpers (used by ChatController via injection) ──

  emitToUser(userId: string, event: string, data: any) {
    // Personal room is joined on connect; the Redis adapter fans this out
    // to whichever cluster node holds the user's live sockets.
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToRoom(conversationId: string, event: string, data: any) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit(event, data);
  }

  // ─── Socket Authentication ──────────────────────────────

  /**
   * Authenticate a socket connection.
   * Tries cookie-based Cognito auth first, falls back to legacy JWT auth.
   */
  private async authenticateSocket(
    socket: Socket,
  ): Promise<{ id: string; email: string; role: string }> {
    // 1. Try cookie-based auth (Cognito) — browser sends cookies on WS upgrade
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = this.parseCookies(cookieHeader);
    const cookieToken = cookies['access_token'];

    if (cookieToken) {
      const payload =
        await this.cognitoAuthService.verifyCognitoJwt(cookieToken);
      const user = await this.cognitoAuthService.findOrCreateFromCognito(
        payload.sub,
        payload.email ?? payload.username ?? '',
        payload['cognito:groups'],
      );
      return { id: user.id, email: user.email, role: user.role };
    }

    throw new Error('No authentication token');
  }

  private parseCookies(header?: string): Record<string, string> {
    if (!header) return {};
    return Object.fromEntries(
      header.split(';').map((c) => {
        const [key, ...val] = c.trim().split('=');
        return [key, val.join('=')];
      }),
    );
  }

  // ─── Notify all conversation members via personal rooms ──

  private async notifyAllMembers(
    conversationId: string,
    excludeUserId: string,
    event: string,
    data: any,
  ) {
    try {
      const memberIds = await this.chatService.getMemberIds(conversationId);
      for (const memberId of memberIds) {
        if (memberId === excludeUserId) continue;
        // Emit to user:{memberId} room — works across servers via Redis adapter
        this.server.to(`user:${memberId}`).emit(event, data);
      }
    } catch (err: any) {
      this.logger.warn(
        `[NOTIFY_MEMBERS] error=${err.message} conversation=${conversationId}`,
      );
    }
  }

  // ─── Rate Limiter (Redis-backed) ────────────────────

  private async checkRateLimit(userId: string): Promise<boolean> {
    const key = KEY.rateLimit(userId);
    const now = Date.now();

    // Push current timestamp and trim old entries
    await this.redis.lpush(key, now.toString());
    await this.redis.ltrim(key, 0, 9); // Keep max 10 entries
    await this.redis.expire(key, TTL.RATE_LIMIT);

    // Check if 10th entry is within 5 seconds
    const timestamps = await this.redis.lrange(key, 0, 9);
    if (timestamps.length >= 10) {
      const oldest = parseInt(timestamps[timestamps.length - 1], 10);
      if (now - oldest < 5000) {
        return true; // rate limited
      }
    }

    return false;
  }
}
