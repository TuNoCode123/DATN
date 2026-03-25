import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  SectionSkill,
  QuestionType,
  ExamType,
} from '@prisma/client';

@Injectable()
export class AdminQuestionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: {
    skill?: SectionSkill;
    questionType?: QuestionType;
    examType?: ExamType;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.QuestionWhereInput = {};

    if (filters.search) {
      where.stem = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters.questionType) {
      where.group = { questionType: filters.questionType };
    }
    if (filters.skill) {
      where.group = {
        ...((where.group as Prisma.QuestionGroupWhereInput) || {}),
        section: { skill: filters.skill },
      };
    }
    if (filters.examType) {
      where.group = {
        ...((where.group as Prisma.QuestionGroupWhereInput) || {}),
        section: {
          ...((
            (where.group as Prisma.QuestionGroupWhereInput)
              ?.section as Prisma.TestSectionWhereInput
          ) || {}),
          test: { examType: filters.examType },
        },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        include: {
          group: {
            select: {
              id: true,
              questionType: true,
              section: {
                select: {
                  id: true,
                  title: true,
                  skill: true,
                  test: {
                    select: {
                      id: true,
                      title: true,
                      examType: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { questionNumber: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.question.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}
