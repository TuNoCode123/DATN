import {
  Controller,
  Get,
  Post,
  Patch,
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
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateCommentDto } from './create-comment.dto';
import { UpdateCommentDto } from './update-comment.dto';
import { QueryCommentsDto } from './query-comments.dto';

@Controller()
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get('tests/:testId/comments')
  @UseGuards(OptionalJwtAuthGuard)
  findByTest(
    @Param('testId') testId: string,
    @Query() query: QueryCommentsDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.commentsService.findByTest(
      testId,
      query.page ? parseInt(query.page, 10) : 1,
      query.limit ? parseInt(query.limit, 10) : 20,
      query.sort || 'newest',
      userId,
    );
  }

  @Post('tests/:testId/comments')
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser('id') userId: string,
    @Param('testId') testId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(userId, testId, dto.body, dto.parentId);
  }

  @Get('comments/:id/replies')
  @UseGuards(OptionalJwtAuthGuard)
  findReplies(
    @Param('id') commentId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.commentsService.findReplies(
      commentId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      userId,
    );
  }

  @Patch('comments/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') commentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(commentId, userId, dto.body);
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
