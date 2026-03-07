import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AttemptMode } from '@prisma/client';

@Controller('attempts')
@UseGuards(JwtAuthGuard)
export class AttemptsController {
  constructor(private attemptsService: AttemptsService) {}

  @Post()
  start(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      testId: string;
      mode: AttemptMode;
      sectionIds?: string[];
      timeLimitMins?: number;
    },
  ) {
    return this.attemptsService.startAttempt(
      userId,
      body.testId,
      body.mode,
      body.sectionIds,
      body.timeLimitMins,
    );
  }

  @Get('in-progress')
  findInProgress(
    @CurrentUser('id') userId: string,
    @Query('testId') testId: string,
  ) {
    return this.attemptsService.findInProgress(userId, testId);
  }

  @Get(':id')
  findOne(
    @Param('id') attemptId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.attemptsService.findById(attemptId, userId);
  }

  @Get(':id/result')
  getResult(
    @Param('id') attemptId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.attemptsService.getResult(attemptId, userId);
  }

  @Post(':id/answers')
  saveAnswer(
    @Param('id') attemptId: string,
    @Body() body: { questionId: string; answerText: string },
  ) {
    return this.attemptsService.saveAnswer(
      attemptId,
      body.questionId,
      body.answerText,
    );
  }

  @Post(':id/answers/bulk')
  saveAnswersBulk(
    @Param('id') attemptId: string,
    @Body() body: { answers: { questionId: string; answerText: string }[] },
  ) {
    return this.attemptsService.saveAnswersBulk(attemptId, body.answers);
  }

  @Post(':id/submit')
  submit(
    @Param('id') attemptId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.attemptsService.submitAttempt(attemptId, userId);
  }

  @Post(':id/abandon')
  @HttpCode(HttpStatus.OK)
  abandon(
    @Param('id') attemptId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.attemptsService.abandonAttempt(attemptId, userId);
  }

  @Get()
  findMine(@CurrentUser('id') userId: string) {
    return this.attemptsService.findByUser(userId);
  }
}
