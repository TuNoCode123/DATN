import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CreditReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BedrockService } from '../bedrock/bedrock.service';
import { CreditsService } from '../credits/credits.service';
import { AI_CHAT_SYSTEM_PROMPT } from './ai-chat.prompts';

const MAX_CONTEXT_MESSAGES = 20;

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private prisma: PrismaService,
    private bedrock: BedrockService,
    private credits: CreditsService,
  ) {}

  async listConversations(userId: string, limit = 20, offset = 0) {
    const [conversations, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
        },
      }),
      this.prisma.aiConversation.count({ where: { userId } }),
    ]);

    return {
      data: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        lastMessage: c.messages[0] || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
    };
  }

  async createConversation(userId: string) {
    return this.prisma.aiConversation.create({
      data: { userId },
    });
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId)
      throw new ForbiddenException('Not your conversation');

    return conversation;
  }

  async deleteConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId)
      throw new ForbiddenException('Not your conversation');

    await this.prisma.aiConversation.delete({
      where: { id: conversationId },
    });
  }

  async *sendMessage(
    userId: string,
    conversationId: string,
    userMessage: string,
  ): AsyncGenerator<string> {
    // Validate ownership
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId)
      throw new ForbiddenException('Not your conversation');

    // Check credits
    const hasCredits = await this.credits.hasSufficientCredits(userId, 1);
    if (!hasCredits) {
      yield JSON.stringify({ error: 'INSUFFICIENT_CREDITS' });
      return;
    }

    // Save user message
    await this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'user',
        content: userMessage,
      },
    });

    // Load context (last N messages)
    const contextMessages = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: MAX_CONTEXT_MESSAGES,
      select: { role: true, content: true },
    });

    // Build messages for Bedrock
    const messages = contextMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Stream response
    let fullResponse = '';
    try {
      for await (const chunk of this.bedrock.streamConverse({
        system: AI_CHAT_SYSTEM_PROMPT,
        messages,
        max_tokens: 2048,
        temperature: 0.7,
      })) {
        fullResponse += chunk;
        yield JSON.stringify({ token: chunk });
      }

      // Save assistant message
      const savedMessage = await this.prisma.aiMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: fullResponse,
        },
      });

      // Auto-generate title from first message
      if (!conversation.title) {
        const title =
          userMessage.length > 50
            ? userMessage.substring(0, 50) + '...'
            : userMessage;
        await this.prisma.aiConversation.update({
          where: { id: conversationId },
          data: { title },
        });
      }

      // Update conversation timestamp
      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      // Deduct credit
      const remaining = await this.credits.deduct(
        userId,
        1,
        CreditReason.AI_CHAT,
        conversationId,
      );

      yield JSON.stringify({
        done: true,
        messageId: savedMessage.id,
        creditsRemaining: remaining,
      });
    } catch (error) {
      this.logger.error(`AI chat stream error: ${error.message}`, error.stack);
      yield JSON.stringify({ error: 'STREAM_ERROR' });
    }
  }
}
