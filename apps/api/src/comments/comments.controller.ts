import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get('tests/:testId/comments')
  findByTest(
    @Param('testId') testId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commentsService.findByTest(
      testId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('tests/:testId/comments')
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser('id') userId: string,
    @Param('testId') testId: string,
    @Body() body: { body: string; parentId?: string },
  ) {
    return this.commentsService.create(userId, testId, body.body, body.parentId);
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.commentsService.delete(commentId, userId);
  }

  @Post('comments/:id/like')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  like(
    @Param('id') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.commentsService.like(commentId, userId);
  }

  @Delete('comments/:id/like')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unlike(
    @Param('id') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.commentsService.unlike(commentId, userId);
  }
}
