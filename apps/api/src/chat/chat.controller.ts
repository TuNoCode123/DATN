import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatUploadService } from './chat-upload.service';
import { ChatGateway } from './chat.gateway';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddMembersDto } from './dto/add-members.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { ReactionDto } from './dto/reaction.dto';
import { ChatUploadDto } from './dto/chat-upload.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chatService: ChatService,
    private chatUploadService: ChatUploadService,
    private chatGateway: ChatGateway,
  ) {}

  @Post('conversations')
  async createConversation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createConversation(userId, dto);
  }

  @Get('conversations')
  async listConversations(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.listConversations(
      userId,
      page ? parseInt(page) : 1,
      limit ? Math.min(parseInt(limit), 50) : 20,
    );
  }

  @Get('conversations/:id')
  async getConversation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.chatService.getConversation(id, userId);
  }

  @Patch('conversations/:id')
  async updateGroup(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.chatService.updateGroup(id, userId, dto);
  }

  @Post('conversations/:id/members')
  @HttpCode(HttpStatus.CREATED)
  async addMembers(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AddMembersDto,
  ) {
    const result = await this.chatService.addMembers(id, userId, dto.userIds);

    // Notify existing members in the conversation room
    this.chatGateway.emitToRoom(id, 'member_added', {
      conversationId: id,
      addedBy: userId,
      added: result.added,
    });

    // Notify newly added users so the conversation appears in their list
    for (const added of result.added) {
      this.chatGateway.emitToUser(added.userId, 'conversation_added', {
        conversationId: id,
      });
    }

    return result;
  }

  @Delete('conversations/:id/members/:userId')
  async removeMember(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    const result = await this.chatService.removeMember(id, userId, targetUserId);

    // Notify remaining members in the conversation room
    this.chatGateway.emitToRoom(id, 'member_removed', {
      conversationId: id,
      userId: targetUserId,
      removedBy: userId,
      isSelf: userId === targetUserId,
    });

    // Notify the removed user so their conversation list updates
    this.chatGateway.emitToUser(targetUserId, 'conversation_removed', {
      conversationId: id,
    });

    return result;
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query() query: QueryMessagesDto,
  ) {
    return this.chatService.getMessages(id, userId, query.limit, query.before);
  }

  @Patch('conversations/:id/read')
  async markRead(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.chatService.markRead(id, userId, dto.seqNumber);
  }

  // ─── Upload ────────────────────────────────────────

  @Post('upload/presign')
  async presignUpload(@Body() dto: ChatUploadDto) {
    return this.chatUploadService.generatePresignedUrl(dto.fileName, dto.contentType);
  }

  // ─── Edit Message ──────────────────────────────────

  @Patch('conversations/:id/messages/:messageId')
  async editMessage(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.chatService.editMessage(conversationId, messageId, userId, dto.content);
  }

  // ─── Delete Message ────────────────────────────────

  @Delete('conversations/:id/messages/:messageId')
  async deleteMessage(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Query('mode') mode: string = 'self',
  ) {
    if (mode === 'everyone') {
      return this.chatService.deleteForEveryone(conversationId, messageId, userId);
    }
    return this.chatService.deleteForMe(conversationId, messageId, userId);
  }

  // ─── Reactions ─────────────────────────────────────

  @Put('conversations/:id/messages/:messageId/reactions')
  async addReaction(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReactionDto,
  ) {
    return this.chatService.addReaction(conversationId, messageId, userId, dto.emoji);
  }

  @Delete('conversations/:id/messages/:messageId/reactions')
  async removeReaction(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReactionDto,
  ) {
    return this.chatService.removeReaction(conversationId, messageId, userId, dto.emoji);
  }
}
