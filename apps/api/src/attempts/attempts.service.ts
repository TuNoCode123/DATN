import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService, SectionResult, Skill } from '../scoring/scoring.service';
import { AttemptMode, AttemptStatus, Prisma } from '@prisma/client';

const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private prisma: PrismaService,
    private scoringService: ScoringService,
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

    return this.prisma.userAttempt.create({
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
        test: { select: { id: true, title: true, durationMins: true } },
      },
    });
  }

  async findById(attemptId: string, userId: string) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: { select: { id: true, title: true, durationMins: true } },
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
    let correctCount = 0;
    const correctBySkill = new Map<string, number>();
    const totalBySkill = new Map<string, number>();

    for (const answer of attempt.answers) {
      const skill = answer.question.group.section.skill;
      const isCorrect =
        answer.answerText?.trim().toLowerCase() ===
        answer.question.correctAnswer.trim().toLowerCase();
      if (isCorrect) {
        correctCount++;
        correctBySkill.set(skill, (correctBySkill.get(skill) || 0) + 1);
      }
      // Track total answered per skill
      totalBySkill.set(skill, (totalBySkill.get(skill) || 0) + 1);

      await this.prisma.userAnswer.update({
        where: { id: answer.id },
        data: { isCorrect },
      });
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
        test: { select: { id: true, title: true } },
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
