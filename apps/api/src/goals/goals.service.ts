import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExamType, AttemptStatus } from '@prisma/client';
import { UpsertGoalDto } from './dto/upsert-goal.dto';
import { getScoreFormat, validateTargetScore } from './exam-score-format';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  async getMine(userId: string) {
    const goal = await this.prisma.learningGoal.findUnique({ where: { userId } });
    if (!goal) return { goal: null, progress: null };

    const progress = await this.computeProgress(userId, goal.examType, goal.targetScore, goal.targetDate);
    return { goal, progress };
  }

  async upsertMine(userId: string, dto: UpsertGoalDto) {
    if (!validateTargetScore(dto.examType, dto.targetScore)) {
      const fmt = getScoreFormat(dto.examType);
      throw new BadRequestException(
        `targetScore must be between ${fmt.min} and ${fmt.max} in steps of ${fmt.step}`,
      );
    }

    const targetDate = new Date(dto.targetDate);
    if (Number.isNaN(targetDate.getTime())) {
      throw new BadRequestException('targetDate is not a valid date');
    }
    if (targetDate.getTime() <= Date.now()) {
      throw new BadRequestException('targetDate must be in the future');
    }

    const goal = await this.prisma.learningGoal.upsert({
      where: { userId },
      create: {
        userId,
        examType: dto.examType,
        targetScore: dto.targetScore,
        targetDate,
      },
      update: {
        examType: dto.examType,
        targetScore: dto.targetScore,
        targetDate,
      },
    });

    const progress = await this.computeProgress(userId, goal.examType, goal.targetScore, goal.targetDate);
    return { goal, progress };
  }

  async deleteMine(userId: string) {
    await this.prisma.learningGoal.deleteMany({ where: { userId } });
    return { goal: null, progress: null };
  }

  async getHistory(userId: string) {
    const goal = await this.prisma.learningGoal.findUnique({ where: { userId } });
    if (!goal) return { examType: null, attempts: [] };

    const fmt = getScoreFormat(goal.examType);
    const attempts = await this.prisma.userAttempt.findMany({
      where: {
        userId,
        status: AttemptStatus.SUBMITTED,
        test: { examType: goal.examType },
      },
      orderBy: { submittedAt: 'asc' },
      select: {
        id: true,
        testId: true,
        submittedAt: true,
        bandScore: true,
        scaledScore: true,
        scorePercent: true,
        test: { select: { title: true } },
      },
    });

    const points = attempts.map((a) => ({
      attemptId: a.id,
      testId: a.testId,
      testTitle: a.test.title,
      submittedAt: a.submittedAt,
      score: a[fmt.field],
    }));

    return { examType: goal.examType, scoreField: fmt.field, attempts: points };
  }

  private async computeProgress(
    userId: string,
    examType: ExamType,
    targetScore: number,
    targetDate: Date,
  ) {
    const fmt = getScoreFormat(examType);
    const agg = await this.prisma.userAttempt.aggregate({
      where: {
        userId,
        status: AttemptStatus.SUBMITTED,
        test: { examType },
      },
      _max: { [fmt.field]: true } as any,
      _count: { _all: true },
    });

    const currentScore = (agg._max as any)?.[fmt.field] ?? null;
    const attemptCount = agg._count._all;
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.ceil((targetDate.getTime() - Date.now()) / msPerDay);
    const percentToTarget =
      currentScore == null || targetScore <= 0
        ? 0
        : Math.max(0, Math.min(100, (currentScore / targetScore) * 100));

    return {
      currentScore,
      currentScoreField: fmt.field,
      attemptCount,
      daysRemaining,
      percentToTarget,
    };
  }
}
