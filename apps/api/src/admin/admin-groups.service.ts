import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateGroupBodyDto, UpdateGroupDto } from './dto/group.dto';
import { CreateQuestionBodyDto, UpdateQuestionDto } from './dto/question.dto';

@Injectable()
export class AdminGroupsService {
  constructor(private prisma: PrismaService) {}

  // ─── Question Groups ──────────────────────────────────

  async createGroup(sectionId: string, dto: CreateGroupBodyDto) {
    const section = await this.prisma.testSection.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Section not found');

    const maxOrder = await this.prisma.questionGroup.aggregate({
      where: { sectionId },
      _max: { orderIndex: true },
    });
    const orderIndex = (maxOrder._max.orderIndex ?? -1) + 1;

    if (dto.passageId) {
      const passage = await this.prisma.passage.findUnique({ where: { id: dto.passageId } });
      if (!passage || passage.sectionId !== sectionId) {
        throw new BadRequestException('Passage must belong to the same section');
      }
    }

    const group = await this.prisma.questionGroup.create({
      data: {
        sectionId,
        questionType: dto.questionType,
        orderIndex,
        instructions: dto.instructions,
        matchingOptions: dto.matchingOptions ?? Prisma.DbNull,
        audioUrl: dto.audioUrl,
        imageUrl: dto.imageUrl,
        passageId: dto.passageId || null,
      },
      include: { questions: true },
    });

    return group;
  }

  async getGroup(id: string) {
    const group = await this.prisma.questionGroup.findUnique({
      where: { id },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!group) throw new NotFoundException('Question group not found');
    return group;
  }

  async updateGroup(id: string, dto: UpdateGroupDto) {
    const group = await this.prisma.questionGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Question group not found');

    if (dto.passageId) {
      const passage = await this.prisma.passage.findUnique({ where: { id: dto.passageId } });
      if (!passage || passage.sectionId !== group.sectionId) {
        throw new BadRequestException('Passage must belong to the same section');
      }
    }

    return this.prisma.questionGroup.update({
      where: { id },
      data: {
        ...(dto.questionType !== undefined && { questionType: dto.questionType }),
        ...(dto.instructions !== undefined && { instructions: dto.instructions }),
        ...(dto.matchingOptions !== undefined && {
          matchingOptions: dto.matchingOptions ?? Prisma.DbNull,
        }),
        ...(dto.audioUrl !== undefined && { audioUrl: dto.audioUrl }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.passageId !== undefined && { passageId: dto.passageId || null }),
      },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async deleteGroup(id: string) {
    const group = await this.prisma.questionGroup.findUnique({
      where: { id },
      include: { section: true },
    });
    if (!group) throw new NotFoundException('Question group not found');

    await this.prisma.questionGroup.delete({ where: { id } });

    // Re-index remaining groups
    const remaining = await this.prisma.questionGroup.findMany({
      where: { sectionId: group.sectionId },
      orderBy: { orderIndex: 'asc' },
    });
    await this.prisma.$transaction(
      remaining.map((g, i) =>
        this.prisma.questionGroup.update({ where: { id: g.id }, data: { orderIndex: i } }),
      ),
    );

    await this.recountSection(group.sectionId);
    return { deleted: true };
  }

  async reorderGroups(sectionId: string, order: string[]) {
    await this.prisma.$transaction(
      order.map((id, index) =>
        this.prisma.questionGroup.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
    );
    return { reordered: true };
  }

  // ─── Questions ────────────────────────────────────────

  async createQuestions(groupId: string, dtos: CreateQuestionBodyDto[]) {
    const group = await this.prisma.questionGroup.findUnique({
      where: { id: groupId },
      include: {
        questions: { orderBy: { orderIndex: 'desc' }, take: 1 },
        section: { include: { test: true } },
      },
    });
    if (!group) throw new NotFoundException('Question group not found');

    const startOrder = (group.questions[0]?.orderIndex ?? -1) + 1;

    // Get max questionNumber across the entire test
    const maxQNum = await this.prisma.question.aggregate({
      where: { group: { section: { testId: group.section.testId } } },
      _max: { questionNumber: true },
    });
    let nextQNum = (maxQNum._max.questionNumber ?? 0) + 1;

    const questions = await this.prisma.$transaction(
      dtos.map((dto, i) =>
        this.prisma.question.create({
          data: {
            groupId,
            questionNumber: nextQNum + i,
            orderIndex: startOrder + i,
            stem: dto.stem,
            options: dto.options ?? Prisma.DbNull,
            correctAnswer: dto.correctAnswer,
            explanation: dto.explanation,
            imageUrl: dto.imageUrl,
            audioUrl: dto.audioUrl,
            metadata: dto.metadata ?? Prisma.DbNull,
          },
        }),
      ),
    );

    await this.recountSection(group.sectionId);
    return questions;
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException('Question not found');

    return this.prisma.question.update({
      where: { id },
      data: {
        ...(dto.stem !== undefined && { stem: dto.stem }),
        ...(dto.options !== undefined && { options: dto.options ?? Prisma.DbNull }),
        ...(dto.correctAnswer !== undefined && { correctAnswer: dto.correctAnswer }),
        ...(dto.explanation !== undefined && { explanation: dto.explanation }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.audioUrl !== undefined && { audioUrl: dto.audioUrl }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata ?? Prisma.DbNull }),
      },
    });
  }

  async deleteQuestion(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: { group: { include: { section: true } } },
    });
    if (!question) throw new NotFoundException('Question not found');

    await this.prisma.question.delete({ where: { id } });

    // Re-index remaining questions in the group
    const remaining = await this.prisma.question.findMany({
      where: { groupId: question.groupId },
      orderBy: { orderIndex: 'asc' },
    });
    await this.prisma.$transaction(
      remaining.map((q, i) =>
        this.prisma.question.update({ where: { id: q.id }, data: { orderIndex: i } }),
      ),
    );

    await this.recountSection(question.group.sectionId);
    return { deleted: true };
  }

  async bulkDeleteQuestions(ids: string[]) {
    // Get section info before deleting
    const first = await this.prisma.question.findFirst({
      where: { id: { in: ids } },
      include: { group: { include: { section: true } } },
    });

    await this.prisma.question.deleteMany({ where: { id: { in: ids } } });

    if (first) {
      await this.recountSection(first.group.sectionId);
    }
    return { deleted: ids.length };
  }

  async reorderQuestions(groupId: string, order: string[]) {
    await this.prisma.$transaction(
      order.map((id, index) =>
        this.prisma.question.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
    );
    return { reordered: true };
  }

  async renumberTestQuestions(testId: string) {
    const sections = await this.prisma.testSection.findMany({
      where: { testId },
      orderBy: { orderIndex: 'asc' },
      include: {
        questionGroups: {
          orderBy: { orderIndex: 'asc' },
          include: { questions: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });

    let qNum = 1;
    for (const section of sections) {
      for (const group of section.questionGroups) {
        for (const question of group.questions) {
          if (question.questionNumber !== qNum) {
            await this.prisma.question.update({
              where: { id: question.id },
              data: { questionNumber: qNum },
            });
          }
          qNum++;
        }
      }
    }

    return { totalQuestions: qNum - 1 };
  }

  // ─── Helpers ──────────────────────────────────────────

  private async recountSection(sectionId: string) {
    const section = await this.prisma.testSection.findUnique({
      where: { id: sectionId },
      include: { questionGroups: { include: { questions: { select: { id: true } } } } },
    });
    if (!section) return;

    const questionCount = section.questionGroups.reduce(
      (sum, g) => sum + g.questions.length,
      0,
    );

    await this.prisma.testSection.update({
      where: { id: sectionId },
      data: { questionCount },
    });

    // Also update test-level count
    const allSections = await this.prisma.testSection.findMany({
      where: { testId: section.testId },
    });
    const totalQuestions = allSections.reduce((sum, s) => sum + s.questionCount, 0);

    await this.prisma.test.update({
      where: { id: section.testId },
      data: {
        questionCount: totalQuestions,
        sectionCount: allSections.length,
      },
    });
  }
}
