import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExamType } from '@prisma/client';

export interface BundleTestProgress {
  id: string;
  title: string;
  examType: string;
  durationMins: number;
  questionCount: number;
  sectionCount: number;
  bundleOrder: number | null;
  latestAttempt: {
    id: string;
    correctCount: number;
    totalQuestions: number;
    bandScore: number | null;
    scorePercent: number;
    submittedAt: string;
    mode: string;
  } | null;
}

@Injectable()
export class BundlesService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: { examType?: ExamType }) {
    const where: Record<string, unknown> = { isPublished: true };
    if (filters.examType) where.examType = filters.examType;

    return this.prisma.testBundle.findMany({
      where,
      include: {
        _count: { select: { tests: true } },
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findById(id: string) {
    const bundle = await this.prisma.testBundle.findUnique({
      where: { id, isPublished: true },
      include: {
        tests: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            examType: true,
            durationMins: true,
            sectionCount: true,
            questionCount: true,
            attemptCount: true,
            commentCount: true,
            bundleOrder: true,
            tags: { include: { tag: true } },
          },
          orderBy: { bundleOrder: 'asc' },
        },
      },
    });

    if (!bundle) throw new NotFoundException('Bundle not found');
    return bundle;
  }

  async getProgress(bundleId: string, userId: string | null): Promise<{ bundle: { id: string; title: string; examType: string }; tests: BundleTestProgress[] }> {
    const bundle = await this.prisma.testBundle.findUnique({
      where: { id: bundleId, isPublished: true },
      select: {
        id: true,
        title: true,
        examType: true,
        tests: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            examType: true,
            durationMins: true,
            questionCount: true,
            sectionCount: true,
            bundleOrder: true,
          },
          orderBy: { bundleOrder: 'asc' },
        },
      },
    });

    if (!bundle) throw new NotFoundException('Bundle not found');

    const tests: BundleTestProgress[] = await Promise.all(
      bundle.tests.map(async (test) => {
        let latestAttempt = null;

        if (userId) {
          const attempt = await this.prisma.userAttempt.findFirst({
            where: { testId: test.id, userId, status: 'SUBMITTED' },
            orderBy: { submittedAt: 'desc' },
            select: {
              id: true,
              correctCount: true,
              totalQuestions: true,
              bandScore: true,
              scorePercent: true,
              submittedAt: true,
              mode: true,
            },
          });

          if (attempt) {
            latestAttempt = {
              id: attempt.id,
              correctCount: attempt.correctCount ?? 0,
              totalQuestions: attempt.totalQuestions ?? 0,
              bandScore: attempt.bandScore ? Number(attempt.bandScore) : null,
              scorePercent: attempt.scorePercent ? Number(attempt.scorePercent) : 0,
              submittedAt: attempt.submittedAt!.toISOString(),
              mode: attempt.mode,
            };
          }
        }

        return { ...test, latestAttempt };
      }),
    );

    return { bundle: { id: bundle.id, title: bundle.title, examType: bundle.examType }, tests };
  }
}
