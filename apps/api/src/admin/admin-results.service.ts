import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, AttemptStatus } from '@prisma/client';

@Injectable()
export class AdminResultsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: {
    testId?: string;
    userId?: string;
    status?: AttemptStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserAttemptWhereInput = {};

    if (filters.testId) where.testId = filters.testId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        {
          user: {
            displayName: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          user: {
            email: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          test: {
            title: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.userAttempt.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          test: {
            select: { id: true, title: true, examType: true },
          },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userAttempt.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        test: {
          select: { id: true, title: true, examType: true },
        },
        answers: {
          include: {
            question: {
              include: {
                group: {
                  select: {
                    questionType: true,
                    section: { select: { title: true, skill: true } },
                  },
                },
              },
            },
          },
          orderBy: { question: { questionNumber: 'asc' } },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }
}
