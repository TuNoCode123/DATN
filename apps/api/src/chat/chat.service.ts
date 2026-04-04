import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatUploadService } from './chat-upload.service';
import { ConversationType, MessageType, MemberRole } from '@prisma/client';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

const userSelect = { id: true, displayName: true, avatarUrl: true };

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private chatUpload: ChatUploadService,
  ) {}

  // ─── Membership ───────────────────────────────────────

  async assertMember(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('NOT_MEMBER');
    return member;
  }

  async assertAdmin(conversationId: string, userId: string) {
    const member = await this.assertMember(conversationId, userId);
    if (member.role !== MemberRole.ADMIN) throw new ForbiddenException('NOT_ADMIN');
    return member;
  }

  private assertGroup(conversation: { type: ConversationType }) {
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('NOT_GROUP');
    }
  }

  async getMemberIds(conversationId: string): Promise<string[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return members.map(m => m.userId);
  }

  // ─── Conversations ───────────────────────────────────

  async createConversation(currentUserId: string, dto: CreateConversationDto) {
    if (dto.type === ConversationType.DIRECT) {
      return this.getOrCreateDirect(currentUserId, dto.memberId);
    }
    return this.createGroup(currentUserId, dto);
  }

  async getOrCreateDirect(currentUserId: string, targetUserId?: string) {
    if (!targetUserId) throw new BadRequestException('memberId is required for DIRECT');
    if (currentUserId === targetUserId) throw new BadRequestException('SELF_CONVERSATION');

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId, isActive: true },
    });
    if (!target) throw new NotFoundException('USER_NOT_FOUND');

    const [userA, userB] = [currentUserId, targetUserId].sort();

    return this.prisma.conversation.upsert({
      where: { directUserA_directUserB: { directUserA: userA, directUserB: userB } },
      create: {
        type: ConversationType.DIRECT,
        directUserA: userA,
        directUserB: userB,
        members: { create: [{ userId: userA }, { userId: userB }] },
      },
      update: {},
      include: {
        members: { include: { user: { select: userSelect } } },
      },
    });
  }

  async createGroup(currentUserId: string, dto: CreateConversationDto) {
    if (!dto.name) throw new BadRequestException('NAME_REQUIRED');
    if (!dto.memberIds || dto.memberIds.length < 1) throw new BadRequestException('MIN_MEMBERS');

    // Validate all members exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.memberIds }, isActive: true },
    });
    if (users.length !== dto.memberIds.length) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const uniqueMembers = [...new Set([...dto.memberIds])].filter(id => id !== currentUserId);

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name: dto.name,
        createdBy: currentUserId,
        members: {
          create: [
            { userId: currentUserId, role: MemberRole.ADMIN },
            ...uniqueMembers.map(id => ({ userId: id, role: MemberRole.MEMBER })),
          ],
        },
      },
      include: {
        members: { include: { user: { select: userSelect } } },
      },
    });
  }

  async listConversations(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { members: { some: { userId } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          members: {
            include: { user: { select: userSelect } },
          },
          messages: {
            orderBy: { seqNumber: 'desc' },
            take: 1,
            include: { sender: { select: userSelect } },
          },
        },
      }),
      this.prisma.conversation.count({
        where: { members: { some: { userId } } },
      }),
    ]);

    return {
      data: conversations.map(conv => {
        const currentMember = conv.members.find(m => m.userId === userId);
        const unreadCount = conv.lastMessageSeq - (currentMember?.lastReadSeq ?? 0);
        const lastMessage = conv.messages[0]
          ? {
              id: conv.messages[0].id,
              content: conv.messages[0].content,
              type: conv.messages[0].type,
              senderId: conv.messages[0].senderId,
              senderName: conv.messages[0].sender?.displayName,
              createdAt: conv.messages[0].createdAt,
            }
          : null;

        // For DIRECT, exclude self from members list
        const members =
          conv.type === ConversationType.DIRECT
            ? conv.members.filter(m => m.userId !== userId)
            : conv.members;

        return {
          id: conv.id,
          type: conv.type,
          name: conv.name,
          avatarUrl: conv.avatarUrl,
          lastMessageSeq: conv.lastMessageSeq,
          updatedAt: conv.updatedAt,
          unreadCount: Math.max(0, unreadCount),
          lastMessage,
          members: members.map(m => ({
            userId: m.userId,
            displayName: m.user.displayName,
            avatarUrl: m.user.avatarUrl,
            role: m.role,
          })),
        };
      }),
      total,
      page,
      limit,
    };
  }

  async getConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: { user: { select: userSelect } },
        },
      },
    });
    if (!conversation) throw new NotFoundException('NOT_FOUND');

    const isMember = conversation.members.some(m => m.userId === userId);
    if (!isMember) throw new ForbiddenException('NOT_MEMBER');

    return conversation;
  }

  async updateGroup(conversationId: string, userId: string, dto: UpdateGroupDto) {
    const conversation = await this.getConversation(conversationId, userId);
    this.assertGroup(conversation);
    await this.assertAdmin(conversationId, userId);

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { ...(dto.name && { name: dto.name }), ...(dto.avatarUrl && { avatarUrl: dto.avatarUrl }) },
      include: { members: { include: { user: { select: userSelect } } } },
    });
  }

  async addMembers(conversationId: string, adminUserId: string, userIds: string[]) {
    const conversation = await this.getConversation(conversationId, adminUserId);
    this.assertGroup(conversation);
    await this.assertAdmin(conversationId, adminUserId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
    });
    if (users.length !== userIds.length) throw new NotFoundException('USER_NOT_FOUND');

    const admin = await this.prisma.user.findUnique({ where: { id: adminUserId } });

    await this.prisma.conversationMember.createMany({
      data: userIds.map(id => ({ conversationId, userId: id })),
      skipDuplicates: true,
    });

    // Insert system messages for each added member
    for (const user of users) {
      await this.createSystemMessage(
        conversationId,
        `${admin?.displayName || 'Admin'} added ${user.displayName || 'a user'}`,
      );
    }

    return {
      added: users.map(u => ({ userId: u.id, displayName: u.displayName })),
    };
  }

  async removeMember(conversationId: string, currentUserId: string, targetUserId: string) {
    const conversation = await this.getConversation(conversationId, currentUserId);
    this.assertGroup(conversation);

    const isSelf = currentUserId === targetUserId;
    if (!isSelf) {
      await this.assertAdmin(conversationId, currentUserId);
    }

    // Check target is actually a member
    await this.assertMember(conversationId, targetUserId);

    // Delete the member
    await this.prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });

    // Count remaining members
    const remainingCount = await this.prisma.conversationMember.count({
      where: { conversationId },
    });

    // Last member leaves -> delete conversation
    if (remainingCount === 0) {
      await this.prisma.conversation.delete({ where: { id: conversationId } });
      return { message: 'Conversation deleted' };
    }

    // If an admin left, promote longest-tenured member
    const removedMember = conversation.members.find(m => m.userId === targetUserId);
    if (removedMember?.role === MemberRole.ADMIN) {
      const adminsLeft = await this.prisma.conversationMember.count({
        where: { conversationId, role: MemberRole.ADMIN },
      });
      if (adminsLeft === 0) {
        const oldest = await this.prisma.conversationMember.findFirst({
          where: { conversationId },
          orderBy: { joinedAt: 'asc' },
        });
        if (oldest) {
          await this.prisma.conversationMember.update({
            where: { id: oldest.id },
            data: { role: MemberRole.ADMIN },
          });
        }
      }
    }

    // System message
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    const targetName = targetUser?.displayName || 'a user';
    if (isSelf) {
      await this.createSystemMessage(conversationId, `${targetName} left the group`);
    } else {
      const admin = await this.prisma.user.findUnique({ where: { id: currentUserId } });
      await this.createSystemMessage(
        conversationId,
        `${admin?.displayName || 'Admin'} removed ${targetName}`,
      );
    }

    return { message: 'Member removed' };
  }

  // ─── Messages ────────────────────────────────────────

  async createMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: MessageType,
    clientId: string,
    attachment?: {
      attachmentUrl?: string;
      attachmentName?: string;
      attachmentSize?: number;
      attachmentType?: string;
    },
  ) {
    // Validate attachment for IMAGE/FILE types
    if ((type === MessageType.IMAGE || type === MessageType.FILE) && !attachment?.attachmentUrl) {
      throw new BadRequestException('Attachment URL is required for IMAGE/FILE messages');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const conv = await tx.conversation.update({
          where: { id: conversationId },
          data: { lastMessageSeq: { increment: 1 }, updatedAt: new Date() },
        });

        const msg = await tx.message.create({
          data: {
            conversationId,
            senderId,
            type,
            content: content || '',
            clientId,
            seqNumber: conv.lastMessageSeq,
            ...(attachment && {
              attachmentUrl: attachment.attachmentUrl,
              attachmentName: attachment.attachmentName,
              attachmentSize: attachment.attachmentSize,
              attachmentType: attachment.attachmentType,
            }),
          },
          include: {
            sender: { select: userSelect },
            reactions: true,
          },
        });

        return this.signAttachment(msg);
      });
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('clientId')) {
        const existing = await this.prisma.message.findFirst({
          where: { conversationId, clientId },
          include: { sender: { select: userSelect }, reactions: true },
        });
        return existing ? this.signAttachment(existing) : existing;
      }
      throw error;
    }
  }

  async createSystemMessage(conversationId: string, content: string) {
    return this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageSeq: { increment: 1 }, updatedAt: new Date() },
      });

      return tx.message.create({
        data: {
          conversationId,
          senderId: null,
          type: MessageType.SYSTEM,
          content,
          seqNumber: conv.lastMessageSeq,
        },
      });
    });
  }

  async getMessages(conversationId: string, userId: string, limit: number = 30, before?: string) {
    await this.assertMember(conversationId, userId);

    const where: any = {
      conversationId,
      NOT: { deletedFor: { has: userId } },
    };
    if (before) where.id = { lt: before };

    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: {
        sender: { select: userSelect },
        reactions: true,
      },
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    const data = await Promise.all(
      messages.map(async (msg) => {
        // Redact content for deletedForAll messages
        if (msg.deletedForAll) {
          return {
            ...msg,
            content: '',
            attachmentUrl: null,
            attachmentName: null,
            attachmentSize: null,
            attachmentType: null,
            reactions: [],
          };
        }
        const signed = await this.signAttachment({
          ...msg,
          reactions: this.groupReactions(msg.reactions, userId),
        });
        return signed;
      }),
    );

    return { data, hasMore };
  }

  async markRead(conversationId: string, userId: string, seqNumber: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('NOT_FOUND');

    const member = await this.assertMember(conversationId, userId);

    // Validate: not future, not backwards
    if (seqNumber > conversation.lastMessageSeq || seqNumber < member.lastReadSeq) {
      return { lastReadSeq: member.lastReadSeq };
    }

    const updated = await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadSeq: seqNumber },
    });

    return { lastReadSeq: updated.lastReadSeq };
  }

  // ─── Edit Message ──────────────────────────────────

  async editMessage(conversationId: string, messageId: string, userId: string, newContent: string) {
    await this.assertMember(conversationId, userId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }
    if (message.senderId !== userId) {
      throw new ForbiddenException('NOT_SENDER');
    }
    if (message.type === MessageType.SYSTEM) {
      throw new BadRequestException('CANNOT_EDIT_SYSTEM');
    }
    if (message.deletedForAll) {
      throw new BadRequestException('CANNOT_EDIT_DELETED');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: newContent,
        isEdited: true,
        editedAt: new Date(),
      },
      include: {
        sender: { select: userSelect },
        reactions: true,
      },
    });
  }

  // ─── Delete Message ────────────────────────────────

  async deleteForMe(conversationId: string, messageId: string, userId: string) {
    await this.assertMember(conversationId, userId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }

    // Add userId to deletedFor if not already present
    if (!message.deletedFor.includes(userId)) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { deletedFor: { push: userId } },
      });
    }

    return { success: true };
  }

  async deleteForEveryone(conversationId: string, messageId: string, userId: string) {
    await this.assertMember(conversationId, userId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }
    if (message.senderId !== userId) {
      throw new ForbiddenException('NOT_SENDER');
    }
    if (message.type === MessageType.SYSTEM) {
      throw new BadRequestException('CANNOT_DELETE_SYSTEM');
    }

    // Check time limit: 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (message.createdAt < oneHourAgo) {
      throw new BadRequestException('DELETE_TIME_EXPIRED');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedForAll: true,
        content: '',
        attachmentUrl: null,
        attachmentName: null,
        attachmentSize: null,
        attachmentType: null,
      },
    });

    return { success: true };
  }

  // ─── Reactions ─────────────────────────────────────

  async addReaction(conversationId: string, messageId: string, userId: string, emoji: string) {
    await this.assertMember(conversationId, userId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }
    if (message.deletedForAll || message.deletedFor.includes(userId)) {
      throw new BadRequestException('CANNOT_REACT_DELETED');
    }

    // Upsert — idempotent
    await this.prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji },
      update: {},
    });

    return { reactions: await this.getReactionsGrouped(messageId, userId) };
  }

  async removeReaction(conversationId: string, messageId: string, userId: string, emoji: string) {
    await this.assertMember(conversationId, userId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }

    await this.prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });

    return { reactions: await this.getReactionsGrouped(messageId, userId) };
  }

  async getReactionsGrouped(messageId: string, currentUserId: string) {
    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    });
    return this.groupReactions(reactions, currentUserId);
  }

  /** Sign attachmentUrl on a message (mutates in place, returns same ref) */
  private async signAttachment<T extends { attachmentUrl?: string | null }>(msg: T): Promise<T> {
    if (msg.attachmentUrl) {
      msg.attachmentUrl = await this.chatUpload.signUrl(msg.attachmentUrl);
    }
    return msg;
  }

  private groupReactions(
    reactions: Array<{ emoji: string; userId: string }>,
    currentUserId: string,
  ) {
    const map = new Map<string, { emoji: string; count: number; userIds: string[]; reacted: boolean }>();

    for (const r of reactions) {
      const existing = map.get(r.emoji);
      if (existing) {
        existing.count++;
        existing.userIds.push(r.userId);
        if (r.userId === currentUserId) existing.reacted = true;
      } else {
        map.set(r.emoji, {
          emoji: r.emoji,
          count: 1,
          userIds: [r.userId],
          reacted: r.userId === currentUserId,
        });
      }
    }

    return Array.from(map.values());
  }
}
