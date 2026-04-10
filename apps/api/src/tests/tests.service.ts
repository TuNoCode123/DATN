import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExamType, Prisma } from '@prisma/client';

@Injectable()
export class TestsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: {
    examType?: ExamType;
    tagSlugs?: string[];
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TestWhereInput = {
      isPublished: true,
    };

    if (filters.examType) {
      // TOEIC_SW is a composite filter that matches SW, Speaking, and Writing tests
      if (filters.examType === 'TOEIC_SW') {
        where.examType = { in: ['TOEIC_SW', 'TOEIC_SPEAKING', 'TOEIC_WRITING'] };
      } else {
        where.examType = filters.examType;
      }
    }
    if (filters.search) {
      where.title = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters.tagSlugs?.length) {
      where.tags = {
        some: { tag: { slug: { in: filters.tagSlugs } } },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.test.findMany({
        where,
        include: {
          tags: { include: { tag: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.test.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
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
                    explanation: false,
                    correctAnswer: false,
                  },
                },
              },
            },
          },
        },
        tags: { include: { tag: true } },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async findByIdFull(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            passages: { orderBy: { orderIndex: 'asc' } },
            questionGroups: {
              orderBy: { orderIndex: 'asc' },
              include: {
                questions: { orderBy: { orderIndex: 'asc' } },
              },
            },
          },
        },
        tags: { include: { tag: true } },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }
}
