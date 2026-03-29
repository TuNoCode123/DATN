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
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { MessageType } from '@prisma/client';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('ChatGateway');

  // In-memory maps
  private presenceMap = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>(); // `convId:userId` -> timeout
  private rateLimitMap = new Map<string, number[]>(); // userId -> timestamps

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private chatService: ChatService,
  ) {}

  // ─── Connection ─────────────────────────────────────

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error('No token');

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      socket.data.user = { id: payload.sub, email: payload.email, role: payload.role };

      const userId = payload.sub;

      // Add to presence
      if (!this.presenceMap.has(userId)) {
        this.presenceMap.set(userId, new Set());
      }
      this.presenceMap.get(userId)!.add(socket.id);

      const socketCount = this.presenceMap.get(userId)!.size;
      this.logger.log(
        `[CONNECT] user=${userId} email=${payload.email} socket=${socket.id} ` +
        `activeSockets=${socketCount} totalOnline=${this.presenceMap.size}`,
      );

      // Broadcast online if first socket
      if (socketCount === 1) {
        this.server.emit('user_online', { userId });
        this.logger.log(`[ONLINE] user=${userId} — now online`);
      }
    } catch (err: any) {
      this.logger.warn(`[CONNECT_FAIL] socket=${socket.id} reason=${err.message}`);
      socket.emit('auth_error', { message: 'Token expired' });
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data?.user?.id;
    if (!userId) return;

    // Remove from presence
    const sockets = this.presenceMap.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        this.presenceMap.delete(userId);
        this.server.emit('user_offline', { userId, lastSeen: new Date().toISOString() });
        this.logger.log(
          `[DISCONNECT] user=${userId} socket=${socket.id} — now offline. totalOnline=${this.presenceMap.size}`,
        );
      } else {
        this.logger.log(
          `[DISCONNECT] user=${userId} socket=${socket.id} — still has ${sockets.size} socket(s)`,
        );
      }
    }

    // Clear typing timeouts for this user
    for (const [key, timeout] of this.typingTimeouts.entries()) {
      if (key.endsWith(`:${userId}`)) {
        clearTimeout(timeout);
        this.typingTimeouts.delete(key);
        const conversationId = key.split(':')[0];
        socket.to(`conversation:${conversationId}`).emit('user_stop_typing', { conversationId, userId });
      }
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

      // Log room members
      const room = (this.server.adapter as any).rooms?.get(`conversation:${data.conversationId}`);
      const roomSize = room?.size ?? 0;
      this.logger.log(
        `[JOIN] user=${userId} conversation=${data.conversationId} ` +
        `roomSize=${roomSize} socket=${socket.id}`,
      );
      return { success: true };
    } catch {
      this.logger.warn(`[JOIN_FAIL] user=${userId} conversation=${data.conversationId} — not a member`);
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

    const room = (this.server.adapter as any).rooms?.get(`conversation:${data.conversationId}`);
    const roomSize = room?.size ?? 0;
    this.logger.log(
      `[LEAVE] user=${userId ?? 'unknown'} conversation=${data.conversationId} ` +
      `roomSize=${roomSize} socket=${socket.id}`,
    );
    return { success: true };
  }

  // ─── Send Message ───────────────────────────────────

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: {
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

    // Rate limit: max 10 messages per 5 seconds
    const now = Date.now();
    const timestamps = this.rateLimitMap.get(userId) || [];
    const recent = timestamps.filter(t => now - t < 5000);
    if (recent.length >= 10) {
      this.logger.warn(`[RATE_LIMIT] user=${userId} conversation=${data.conversationId}`);
      return { success: false, error: 'RATE_LIMITED' };
    }
    recent.push(now);
    this.rateLimitMap.set(userId, recent);

    const type = data.type || MessageType.TEXT;

    // Validate
    if (!data.clientId) {
      return { success: false, error: 'VALIDATION_ERROR' };
    }
    if (type === MessageType.TEXT && (!data.content || data.content.length > 5000)) {
      return { success: false, error: 'VALIDATION_ERROR' };
    }
    if ((type === MessageType.IMAGE || type === MessageType.FILE) && !data.attachmentUrl) {
      return { success: false, error: 'ATTACHMENT_REQUIRED' };
    }

    try {
      await this.chatService.assertMember(data.conversationId, userId);
    } catch {
      this.logger.warn(`[SEND_FAIL] user=${userId} conversation=${data.conversationId} — not a member`);
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

      // Broadcast to room (excluding sender)
      socket.to(`conversation:${data.conversationId}`).emit('new_message', message);

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
      const result = await this.chatService.markRead(data.conversationId, userId, data.seqNumber);
      socket.to(`conversation:${data.conversationId}`).emit('message_read', {
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
    @MessageBody() data: { conversationId: string; messageId: string; content: string },
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

      socket.to(`conversation:${data.conversationId}`).emit('message_edited', {
        conversationId: data.conversationId,
        messageId: data.messageId,
        content: message.content,
        editedAt: message.editedAt,
      });

      return { success: true, message };
    } catch (error: any) {
      this.logger.warn(`[EDIT_FAIL] user=${userId} message=${data.messageId} error=${error.message}`);
      return { success: false, error: error.message || 'INTERNAL_ERROR' };
    }
  }

  // ─── Delete Message ────────────────────────────────

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string; messageId: string; mode: 'self' | 'everyone' },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return { success: false, error: 'NOT_AUTHENTICATED' };

    try {
      if (data.mode === 'everyone') {
        await this.chatService.deleteForEveryone(data.conversationId, data.messageId, userId);

        socket.to(`conversation:${data.conversationId}`).emit('message_deleted', {
          conversationId: data.conversationId,
          messageId: data.messageId,
          deletedForAll: true,
        });
      } else {
        await this.chatService.deleteForMe(data.conversationId, data.messageId, userId);
        // No broadcast for "delete for me" — local only
      }

      return { success: true };
    } catch (error: any) {
      this.logger.warn(`[DELETE_FAIL] user=${userId} message=${data.messageId} error=${error.message}`);
      return { success: false, error: error.message || 'INTERNAL_ERROR' };
    }
  }

  // ─── Reactions ─────────────────────────────────────

  @SubscribeMessage('toggle_reaction')
  async handleToggleReaction(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string; messageId: string; emoji: string },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return { success: false, error: 'NOT_AUTHENTICATED' };

    if (!data.emoji || data.emoji.length > 32) {
      return { success: false, error: 'VALIDATION_ERROR' };
    }

    try {
      // Check if reaction already exists — toggle
      const existing = await this.chatService['prisma'].messageReaction.findUnique({
        where: { messageId_userId_emoji: { messageId: data.messageId, userId, emoji: data.emoji } },
      });

      let result;
      let action: 'add' | 'remove';

      if (existing) {
        result = await this.chatService.removeReaction(data.conversationId, data.messageId, userId, data.emoji);
        action = 'remove';
      } else {
        result = await this.chatService.addReaction(data.conversationId, data.messageId, userId, data.emoji);
        action = 'add';
      }

      socket.to(`conversation:${data.conversationId}`).emit('reaction_updated', {
        conversationId: data.conversationId,
        messageId: data.messageId,
        emoji: data.emoji,
        userId,
        action,
        reactions: result.reactions,
      });

      return { success: true, action, reactions: result.reactions };
    } catch (error: any) {
      this.logger.warn(`[REACTION_FAIL] user=${userId} message=${data.messageId} error=${error.message}`);
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

    const key = `${data.conversationId}:${userId}`;

    // Clear existing timeout
    if (this.typingTimeouts.has(key)) {
      clearTimeout(this.typingTimeouts.get(key));
    }

    // Broadcast typing
    const displayName = socket.data.user?.email; // fallback
    socket.to(`conversation:${data.conversationId}`).emit('user_typing', {
      conversationId: data.conversationId,
      userId,
      displayName,
    });

    // Auto-expire after 5 seconds
    this.typingTimeouts.set(
      key,
      setTimeout(() => {
        this.typingTimeouts.delete(key);
        socket.to(`conversation:${data.conversationId}`).emit('user_stop_typing', {
          conversationId: data.conversationId,
          userId,
        });
      }, 5000),
    );
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) return;

    const key = `${data.conversationId}:${userId}`;
    if (this.typingTimeouts.has(key)) {
      clearTimeout(this.typingTimeouts.get(key));
      this.typingTimeouts.delete(key);
    }

    socket.to(`conversation:${data.conversationId}`).emit('user_stop_typing', {
      conversationId: data.conversationId,
      userId,
    });
  }

  // ─── Presence Query ─────────────────────────────────

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers(@ConnectedSocket() socket: Socket) {
    const userIds = Array.from(this.presenceMap.keys());
    this.logger.log(
      `[PRESENCE_QUERY] from=${socket.data.user?.id ?? socket.id} onlineUsers=${userIds.length}`,
    );
    return { success: true, userIds };
  }

  // ─── Helpers (used by ChatService via injection) ────

  emitToUser(userId: string, event: string, data: any) {
    const sockets = this.presenceMap.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit(event, data);
      }
    }
  }

  emitToRoom(conversationId: string, event: string, data: any) {
    this.server.to(`conversation:${conversationId}`).emit(event, data);
  }
}
