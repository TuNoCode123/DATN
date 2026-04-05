import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { PronunciationService } from './pronunciation.service';
import { TtsService } from './tts.service';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreditReason } from '@prisma/client';
import type { TranscribeItem } from './pronunciation.gateway';

@Controller('pronunciation')
@UseGuards(JwtAuthGuard)
export class PronunciationController {
  constructor(
    private pronunciation: PronunciationService,
    private tts: TtsService,
    private credits: CreditsService,
    private prisma: PrismaService,
  ) {}

  @Post('tts')
  async getTts(
    @CurrentUser('id') userId: string,
    @Body('sentence') sentence: string,
  ) {
    const result = await this.tts.getAudioUrl(sentence);

    // Deduct 1 credit only on cache miss
    if (!result.cached) {
      try {
        await this.credits.deduct(userId, 1, CreditReason.POLLY_TTS, undefined, {
          sentence: sentence.substring(0, 100),
        });
      } catch {
        // Don't fail TTS if credit deduction fails
      }
    }

    return { audioUrl: result.url, cached: result.cached };
  }

  @Post('assess')
  async assess(
    @CurrentUser('id') userId: string,
    @Body() body: {
      target: string;
      spoken: string;
      items?: TranscribeItem[];
      attemptId?: string;
      questionId?: string;
    },
  ) {
    const assessment = await this.pronunciation.assess(body.target, body.spoken, body.items);

    try {
      await this.credits.deduct(userId, 2, CreditReason.AI_GRADING);
    } catch {
      // Don't block assessment if credit deduction fails
    }

    // Save to attempt if provided
    if (body.attemptId && body.questionId) {
      await this.pronunciation.saveResult(
        body.attemptId,
        body.questionId,
        body.spoken,
        assessment,
      );
    }

    return assessment;
  }

  @Post('generate-sentences')
  async generateSentences(
    @CurrentUser('id') userId: string,
    @Body() body: { topicId: string; customRequirements?: string; difficulty?: string },
  ) {
    const topic = await this.prisma.pronunciationTopic.findUnique({
      where: { id: body.topicId },
    });
    if (!topic || !topic.isPublished) {
      throw new NotFoundException('Topic not found');
    }

    // Use user-selected difficulty if provided, otherwise fall back to topic default
    const difficulty = body.difficulty && ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(body.difficulty)
      ? body.difficulty
      : topic.difficulty;

    // Deduct 3 credits for sentence generation
    try {
      await this.credits.deduct(
        userId,
        3,
        CreditReason.AI_GRADING,
        undefined,
        { action: 'generate-sentences', topicId: body.topicId },
      );
    } catch {
      // Don't block generation
    }

    const sentences = await this.pronunciation.generateSentences(
      topic.name,
      difficulty,
      body.customRequirements,
    );

    return { sentences, topic: { id: topic.id, name: topic.name, difficulty: topic.difficulty } };
  }

  // ─── Session & History ──────────────────────────────────

  @Post('sessions')
  async createSession(
    @CurrentUser('id') userId: string,
    @Body() body: { topicId: string; sentences: string[] },
  ) {
    return this.pronunciation.createSession(userId, body.topicId, body.sentences);
  }

  @Post('sessions/:sessionId/results')
  async saveSessionResult(
    @CurrentUser('id') _userId: string,
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      sentenceIndex: number;
      targetSentence: string;
      spokenText: string;
      assessment: any;
    },
  ) {
    return this.pronunciation.saveSessionResult(
      sessionId,
      body.sentenceIndex,
      body.targetSentence,
      body.spokenText,
      body.assessment,
    );
  }

  @Get('history')
  async getHistory(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.pronunciation.getHistory(
      userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('history/:sessionId')
  async getSessionDetail(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.pronunciation.getSessionDetail(sessionId, userId);
  }
}
