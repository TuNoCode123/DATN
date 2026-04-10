import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService, SectionResult, Skill } from '../scoring/scoring.service';
import { HskGradingService } from '../hsk-grading/hsk-grading.service';
import { CreditsService } from '../credits/credits.service';
import { UploadService } from '../upload/upload.service';
import { ToeicSwGradingService } from '../toeic-sw-grading/toeic-sw-grading.service';
import { AttemptMode, AttemptStatus, CreditReason, Prisma } from '@prisma/client';
import { matchAnswer } from './answer-matcher';

const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private prisma: PrismaService,
    private scoringService: ScoringService,
    private hskGradingService: HskGradingService,
    private creditsService: CreditsService,
    private uploadService: UploadService,
    @Optional()
    @Inject('ToeicSwGradingService')
    private toeicSwGradingService?: ToeicSwGradingService,
  ) {}

  async startAttempt(
    userId: string,
    testId: string,
    mode: AttemptMode,
    sectionIds?: string[],
    timeLimitMins?: number,
  ) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      include: { sections: true },
    });
    if (!test) throw new NotFoundException('Test not found');

    // Credit gate for TOEIC_SW and HSK writing tests
    const creditCost = this.getAttemptCreditCost(test.examType);
    if (creditCost > 0) {
      const sufficient = await this.creditsService.hasSufficientCredits(
        userId,
        creditCost,
      );
      if (!sufficient) {
        throw new BadRequestException(
          `Insufficient credits. This test requires ${creditCost} credits.`,
        );
      }
    }

    // Check for existing in-progress attempt
    const existing = await this.prisma.userAttempt.findFirst({
      where: { userId, testId, status: AttemptStatus.IN_PROGRESS },
    });

    if (existing) {
      const isStale = this.isHeartbeatStale(
        existing.lastHeartbeatAt,
        existing.startedAt,
      );
      if (isStale) {
        // Auto-submit the stale attempt before allowing a new one
        try {
          await this.submitAttempt(existing.id, userId);
        } catch {
          // If submission fails, force-close it
          await this.prisma.userAttempt.update({
            where: { id: existing.id },
            data: { status: AttemptStatus.SUBMITTED, submittedAt: new Date() },
          });
        }
      } else {
        throw new BadRequestException(
          'You already have an active attempt for this test in another tab.',
        );
      }
    }

    const selectedSections =
      mode === AttemptMode.FULL_TEST
        ? test.sections
        : test.sections.filter((s) => sectionIds?.includes(s.id));

    if (selectedSections.length === 0) {
      throw new BadRequestException('At least one section must be selected');
    }

    const attempt = await this.prisma.userAttempt.create({
      data: {
        userId,
        testId,
        mode,
        status: AttemptStatus.IN_PROGRESS,
        lastHeartbeatAt: new Date(),
        timeLimitMins:
          mode === AttemptMode.FULL_TEST
            ? test.durationMins
            : timeLimitMins || null,
        sections: {
          create: selectedSections.map((s) => ({ sectionId: s.id })),
        },
      },
      include: {
        sections: { include: { section: true } },
        test: { select: { id: true, title: true, durationMins: true, examType: true } },
      },
    });

    // Deduct credits after successful attempt creation
    if (creditCost > 0) {
      const reason =
        test.examType === 'TOEIC_SW' || test.examType === 'TOEIC_SPEAKING' || test.examType === 'TOEIC_WRITING'
          ? CreditReason.TOEIC_SW_ATTEMPT
          : CreditReason.HSK_WRITING_ATTEMPT;
      await this.creditsService
        .deduct(userId, creditCost, reason, attempt.id)
        .catch((err) =>
          this.logger.error('Failed to deduct attempt credits', err),
        );
    }

    return attempt;
  }

  async findById(attemptId: string, userId: string) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: { select: { id: true, title: true, durationMins: true, examType: true } },
        sections: {
          include: {
            section: {
              include: {
                passages: { orderBy: { orderIndex: 'asc' } },
                questionGroups: {
                  orderBy: { orderIndex: 'asc' },
                  include: {
                    questions: {
                      orderBy: { orderIndex: 'asc' },
                      select: {
                        id: true,
                        groupId: true,
                        questionNumber: true,
                        orderIndex: true,
                        stem: true,
                        options: true,
                        imageUrl: true,
                        audioUrl: true,
                        transcript: true,
                        imageLayout: true,
                        imageSize: true,
                        metadata: true,
                        correctAnswer: false,
                        explanation: false,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        answers: {
          select: {
            questionId: true,
            answerText: true,
          },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();

    return attempt;
  }

  async saveAnswer(attemptId: string, questionId: string, answerText: string) {
    const attempt = await this.prisma.userAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt already submitted');
    }

    return this.prisma.userAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId },
      },
      create: { attemptId, questionId, answerText },
      update: { answerText },
    });
  }

  async saveAnswersBulk(
    attemptId: string,
    answers: { questionId: string; answerText: string }[],
  ) {
    const attempt = await this.prisma.userAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt already submitted');
    }

    const operations = answers.map((a) =>
      this.prisma.userAnswer.upsert({
        where: {
          attemptId_questionId: { attemptId, questionId: a.questionId },
        },
        create: { attemptId, questionId: a.questionId, answerText: a.answerText },
        update: { answerText: a.answerText },
      }),
    );

    return this.prisma.$transaction(operations);
  }

  async heartbeat(attemptId: string, userId: string) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();

    // Idempotent: if already submitted, tell the client
    if (attempt.status === AttemptStatus.SUBMITTED) {
      return { alreadySubmitted: true };
    }

    await this.prisma.userAttempt.update({
      where: { id: attemptId },
      data: { lastHeartbeatAt: new Date() },
    });

    return { ok: true };
  }

  async submitAttempt(attemptId: string, userId: string) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: {
          include: {
            question: {
              include: {
                group: {
                  include: { section: { select: { skill: true } } },
                },
              },
            },
          },
        },
        sections: true,
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();

    // Idempotent: if already submitted, return existing result
    if (attempt.status === AttemptStatus.SUBMITTED) {
      return attempt;
    }

    // Grade each answer
    const TOEIC_SPEAKING_TYPES = [
      'READ_ALOUD',
      'DESCRIBE_PICTURE',
      'RESPOND_TO_QUESTIONS',
      'PROPOSE_SOLUTION',
      'EXPRESS_OPINION',
    ];
    const TOEIC_WRITING_TYPES = [
      'WRITE_SENTENCES',
      'RESPOND_WRITTEN_REQUEST',
      'WRITE_OPINION_ESSAY',
    ];

    let correctCount = 0;
    const correctBySkill = new Map<string, number>();
    const totalBySkill = new Map<string, number>();
    const pendingWritingAnswerIds: string[] = [];
    const pendingToeicWritingAnswerIds: string[] = [];
    const reorderScores: number[] = [];

    for (const answer of attempt.answers) {
      const skill = answer.question.group.section.skill;
      const questionType = answer.question.group.questionType;

      totalBySkill.set(skill, (totalBySkill.get(skill) || 0) + 1);

      if (TOEIC_SPEAKING_TYPES.includes(questionType)) {
        // Speaking answers are already graded during recording via WebSocket.
        // The answerText contains the stable transcript, assessment is in metadata.
        // Deduct AI grading credits (non-blocking).
        this.creditsService
          .deduct(attempt.userId, 3, CreditReason.AI_GRADING, answer.id)
          .catch(() => {});
        await this.prisma.userAnswer.update({
          where: { id: answer.id },
          data: { isCorrect: null }, // AI-graded, no simple correct/incorrect
        });
      } else if (TOEIC_WRITING_TYPES.includes(questionType)) {
        // Queue async AI grading for TOEIC writing answers
        pendingToeicWritingAnswerIds.push(answer.id);
        // Deduct AI grading credits (non-blocking)
        this.creditsService
          .deduct(attempt.userId, 2, CreditReason.AI_GRADING, answer.id)
          .catch(() => {});
        await this.prisma.userAnswer.update({
          where: { id: answer.id },
          data: { isCorrect: null },
        });
      } else if (questionType === 'SENTENCE_REORDER') {
        // Deterministic: normalize + compare with partial credit
        const meta = answer.question.metadata as { fragments: string[] };
        const result = this.hskGradingService.gradeSentenceReorder(
          answer.answerText,
          { correctAnswer: answer.question.correctAnswer || '', metadata: meta },
        );
        if (result.isCorrect) {
          correctCount++;
          correctBySkill.set(skill, (correctBySkill.get(skill) || 0) + 1);
        }
        reorderScores.push(result.score);
        await this.prisma.userAnswer.update({
          where: { id: answer.id },
          data: { isCorrect: result.isCorrect },
        });
      } else if (
        questionType === 'KEYWORD_COMPOSITION' ||
        questionType === 'PICTURE_COMPOSITION'
      ) {
        // AI-graded: mark as pending, queue async grading
        pendingWritingAnswerIds.push(answer.id);
        await this.prisma.userAnswer.update({
          where: { id: answer.id },
          data: { isCorrect: null },
        });
      } else {
        // Smart matching: supports [OR], /, (optional) syntax for fill-in-blank
        // Also backward-compatible with simple exact match for MCQ, T/F, matching
        const isCorrect = matchAnswer(
          answer.answerText,
          answer.question.correctAnswer,
        );
        if (isCorrect) {
          correctCount++;
          correctBySkill.set(skill, (correctBySkill.get(skill) || 0) + 1);
        }
        await this.prisma.userAnswer.update({
          where: { id: answer.id },
          data: { isCorrect },
        });
      }
    }

    // Queue AI grading for HSK writing composition questions
    if (pendingWritingAnswerIds.length > 0) {
      this.hskGradingService
        .queueWritingGrading(attemptId, pendingWritingAnswerIds)
        .catch((err) => this.logger.error('Failed to queue HSK writing grading', err));
    }

    // Queue AI grading for TOEIC SW writing questions
    if (pendingToeicWritingAnswerIds.length > 0 && this.toeicSwGradingService) {
      this.toeicSwGradingService
        .queueWritingGrading(attemptId, pendingToeicWritingAnswerIds)
        .catch((err) =>
          this.logger.error('Failed to queue TOEIC writing grading', err),
        );
    }

    // Count total questions from selected sections
    const sectionIds = attempt.sections.map((s) => s.sectionId);
    const totalQuestions = await this.prisma.question.count({
      where: {
        group: { sectionId: { in: sectionIds } },
      },
    });

    const scorePercent =
      totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

    // Get the test to determine exam type and section structure
    const test = await this.prisma.test.findUnique({
      where: { id: attempt.testId },
      include: {
        sections: {
          where: { id: { in: sectionIds } },
          include: {
            questionGroups: {
              include: { questions: { select: { id: true } } },
            },
          },
        },
      },
    });

    // Build per-section results for scoring
    const sectionResults: SectionResult[] = [];
    if (test?.sections) {
      const questionCountBySkill = new Map<string, number>();
      for (const section of test.sections) {
        const qCount = section.questionGroups.reduce(
          (sum, g) => sum + g.questions.length,
          0,
        );
        questionCountBySkill.set(
          section.skill,
          (questionCountBySkill.get(section.skill) || 0) + qCount,
        );
      }

      for (const [skill, total] of questionCountBySkill) {
        sectionResults.push({
          skill: skill as Skill,
          correct: correctBySkill.get(skill) || 0,
          total,
        });
      }
    }

    // Calculate exam-specific scores
    const examScores = test
      ? this.scoringService.calculateAttemptScores(
          test.examType,
          sectionResults,
        )
      : { bandScore: null, scaledScore: null, sectionScores: null };

    const updated = await this.prisma.userAttempt.update({
      where: { id: attemptId },
      data: {
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date(),
        totalQuestions,
        correctCount,
        scorePercent,
        bandScore: examScores.bandScore,
        scaledScore: examScores.scaledScore,
        sectionScores: examScores.sectionScores
          ? (examScores.sectionScores as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    await this.prisma.test.update({
      where: { id: attempt.testId },
      data: { attemptCount: { increment: 1 } },
    });

    return updated;
  }

  async getResult(attemptId: string, userId: string) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: { select: { id: true, title: true, examType: true } },
        sections: {
          include: {
            section: {
              include: {
                passages: { orderBy: { orderIndex: 'asc' } },
                questionGroups: {
                  orderBy: { orderIndex: 'asc' },
                  include: {
                    passage: true,
                    questions: {
                      orderBy: { orderIndex: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();
    if (attempt.status !== AttemptStatus.SUBMITTED) {
      throw new BadRequestException('Attempt not yet submitted');
    }

    return attempt;
  }

  async findByUserAndTest(userId: string, testId: string) {
    return this.prisma.userAttempt.findMany({
      where: { userId, testId, status: AttemptStatus.SUBMITTED },
      include: {
        sections: {
          include: {
            section: { select: { id: true, title: true, skill: true } },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.userAttempt.findMany({
      where: { userId },
      include: {
        test: {
          select: { id: true, title: true, examType: true, questionCount: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Auto-submit all stale IN_PROGRESS attempts.
   * Called by the cron job every minute.
   */
  async autoSubmitStaleAttempts() {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);

    const staleAttempts = await this.prisma.userAttempt.findMany({
      where: {
        status: AttemptStatus.IN_PROGRESS,
        OR: [
          // Heartbeat is stale
          { lastHeartbeatAt: { lt: staleThreshold } },
          // No heartbeat and started long ago
          { lastHeartbeatAt: null, startedAt: { lt: staleThreshold } },
        ],
      },
    });

    // Also find attempts that exceeded their time limit
    const timedOutAttempts = await this.prisma.userAttempt.findMany({
      where: {
        status: AttemptStatus.IN_PROGRESS,
        timeLimitMins: { not: null },
      },
    });

    const allStale = new Map<string, { id: string; userId: string }>();
    for (const a of staleAttempts) {
      allStale.set(a.id, { id: a.id, userId: a.userId });
    }
    for (const a of timedOutAttempts) {
      const deadline = new Date(
        a.startedAt.getTime() + (a.timeLimitMins! * 60 * 1000),
      );
      if (now > deadline) {
        allStale.set(a.id, { id: a.id, userId: a.userId });
      }
    }

    let submitted = 0;
    for (const { id, userId } of allStale.values()) {
      try {
        await this.submitAttempt(id, userId);
        submitted++;
      } catch (err) {
        this.logger.warn(`Failed to auto-submit attempt ${id}: ${err}`);
      }
    }

    if (submitted > 0) {
      this.logger.log(`Auto-submitted ${submitted} stale attempt(s)`);
    }

    return submitted;
  }

  async getAudioPresignUrl(
    attemptId: string,
    questionId: string,
    userId: string,
  ) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt not active');
    }

    const key = `uploads/answers/${attemptId}/${questionId}.webm`;
    const result = await this.uploadService.generatePresignedUrlForKey(
      key,
      'audio/webm',
    );

    // Save the audio URL to the answer
    await this.prisma.userAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      create: { attemptId, questionId, audioAnswerUrl: result.fileUrl },
      update: { audioAnswerUrl: result.fileUrl },
    });

    return result;
  }

  private getAttemptCreditCost(examType: string): number {
    if (examType === 'TOEIC_SW' || examType === 'TOEIC_SPEAKING' || examType === 'TOEIC_WRITING') return 10;
    if (
      examType.startsWith('HSK_') &&
      parseInt(examType.replace('HSK_', '')) >= 3
    )
      return 5;
    return 0;
  }

  private isHeartbeatStale(
    lastHeartbeatAt: Date | null,
    startedAt: Date,
  ): boolean {
    const now = Date.now();
    if (lastHeartbeatAt) {
      return now - lastHeartbeatAt.getTime() > STALE_THRESHOLD_MS;
    }
    return now - startedAt.getTime() > STALE_THRESHOLD_MS;
  }
}
