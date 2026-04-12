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
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateCommentDto } from './create-comment.dto';
import { UpdateCommentDto } from './update-comment.dto';
import { QueryCommentsDto } from './query-comments.dto';
import { ReportCommentDto } from './report-comment.dto';

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

  // ─── Report ────────────────────────────────────────────

  @Post('comments/:id/report')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  report(
    @Param('id') commentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReportCommentDto,
  ) {
    return this.commentsService.report(commentId, userId, dto.reason);
  }

  // ─── Admin Moderation ─────────────────────────────────

  @Get('admin/comments/queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getQueue(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commentsService.findPendingQueue(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('admin/comments/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  approve(@Param('id') commentId: string) {
    return this.commentsService.adminApprove(commentId);
  }

  @Post('admin/comments/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(@Param('id') commentId: string) {
    return this.commentsService.adminReject(commentId);
  }

  @Delete('admin/comments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  adminDelete(@Param('id') commentId: string) {
    return this.commentsService.adminDelete(commentId);
  }
}
