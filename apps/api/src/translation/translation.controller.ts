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
import { TranslationService } from './translation.service';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('translation')
@UseGuards(JwtAuthGuard)
export class TranslationController {
  constructor(
    private translation: TranslationService,
    private credits: CreditsService,
    private prisma: PrismaService,
  ) {}

  @Post('generate-sentences')
  async generateSentences(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      topicId: string;
      customRequirements?: string;
      difficulty?: string;
    },
  ) {
    const topic = await this.prisma.translationTopic.findUnique({
      where: { id: body.topicId },
    });
    if (!topic || !topic.isPublished) {
      throw new NotFoundException('Topic not found');
    }

    const difficulty =
      body.difficulty &&
      ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(body.difficulty)
        ? body.difficulty
        : topic.difficulty;

    const sentences = await this.translation.generateSentencePairs(
      userId,
      topic.name,
      difficulty,
      body.customRequirements,
    );

    return {
      sentences,
      topic: { id: topic.id, name: topic.name, difficulty: topic.difficulty },
    };
  }

  @Post('assess')
  async assess(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      vietnamese: string;
      referenceEnglish: string;
      userTranslation: string;
    },
  ) {
    return this.translation.assess(
      userId,
      body.vietnamese,
      body.referenceEnglish,
      body.userTranslation,
    );
  }

  // ─── Session & History ──────────────────────────────────

  @Post('sessions')
  async createSession(
    @CurrentUser('id') userId: string,
    @Body() body: { topicId: string; sentencePairs: { vietnamese: string; english: string }[] },
  ) {
    return this.translation.createSession(userId, body.topicId, body.sentencePairs);
  }

  @Post('sessions/:sessionId/results')
  async saveSessionResult(
    @CurrentUser('id') _userId: string,
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      sentenceIndex: number;
      vietnameseSentence: string;
      referenceEnglish: string;
      userTranslation: string;
      assessment: any;
    },
  ) {
    return this.translation.saveSessionResult(
      sessionId,
      body.sentenceIndex,
      body.vietnameseSentence,
      body.referenceEnglish,
      body.userTranslation,
      body.assessment,
    );
  }

  @Get('history')
  async getHistory(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.translation.getHistory(
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
    return this.translation.getSessionDetail(sessionId, userId);
  }
}
