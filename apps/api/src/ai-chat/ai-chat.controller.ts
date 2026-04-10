import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiChatService } from './ai-chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('ai-chat')
@UseGuards(JwtAuthGuard)
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Get('conversations')
  listConversations(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.aiChatService.listConversations(
      userId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post('conversations')
  createConversation(@CurrentUser('id') userId: string) {
    return this.aiChatService.createConversation(userId);
  }

  @Get('conversations/:id')
  getConversation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.aiChatService.getConversation(userId, id);
  }

  @Delete('conversations/:id')
  deleteConversation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.aiChatService.deleteConversation(userId, id);
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    for await (const data of this.aiChatService.sendMessage(
      userId,
      id,
      dto.message,
    )) {
      res.write(`data: ${data}\n\n`);
    }

    res.end();
  }
}
