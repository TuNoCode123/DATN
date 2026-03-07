import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptMode, AttemptStatus } from '@prisma/client';

@Injectable()
export class AttemptsService {
  constructor(private prisma: PrismaService) {}

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
      throw new BadRequestException(
        'You already have an in-progress attempt for this test. Resume or abandon it first.',
      );
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
                        mcqOptions: true,
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

  async submitAttempt(attemptId: string, userId: string) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: { include: { question: true } },
        sections: true,
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt already submitted');
    }

    let correctCount = 0;
    for (const answer of attempt.answers) {
      const isCorrect =
        answer.answerText?.trim().toLowerCase() ===
        answer.question.correctAnswer.trim().toLowerCase();
      if (isCorrect) correctCount++;
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

    const updated = await this.prisma.userAttempt.update({
      where: { id: attemptId },
      data: {
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date(),
        totalQuestions,
        correctCount,
        scorePercent,
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
                questionGroups: {
                  orderBy: { orderIndex: 'asc' },
                  include: {
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

  async abandonAttempt(attemptId: string, userId: string) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Can only abandon in-progress attempts');
    }

    return this.prisma.userAttempt.update({
      where: { id: attemptId },
      data: { status: AttemptStatus.ABANDONED },
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

  async findInProgress(userId: string, testId: string) {
    return this.prisma.userAttempt.findFirst({
      where: { userId, testId, status: AttemptStatus.IN_PROGRESS },
      include: { sections: true },
    });
  }
}
