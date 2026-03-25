import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateSectionBodyDto, UpdateSectionDto } from './dto/section.dto';
import { CreatePassageBodyDto, UpdatePassageDto } from './dto/passage.dto';

@Injectable()
export class AdminSectionsService {
  constructor(private prisma: PrismaService) {}

  // ─── Sections ─────────────────────────────────────────

  async createSection(testId: string, dto: CreateSectionBodyDto) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException('Test not found');

    // Get next orderIndex
    const maxOrder = await this.prisma.testSection.aggregate({
      where: { testId },
      _max: { orderIndex: true },
    });
    const orderIndex = (maxOrder._max.orderIndex ?? -1) + 1;

    const section = await this.prisma.testSection.create({
      data: {
        testId,
        title: dto.title,
        skill: dto.skill,
        orderIndex,
        instructions: dto.instructions,
        audioUrl: dto.audioUrl,
        durationMins: dto.durationMins,
      },
      include: { passages: true, questionGroups: { include: { questions: true } } },
    });

    await this.recountTest(testId);
    return section;
  }

  async getSection(id: string) {
    const section = await this.prisma.testSection.findUnique({
      where: { id },
      include: {
        passages: { orderBy: { orderIndex: 'asc' } },
        questionGroups: {
          orderBy: { orderIndex: 'asc' },
          include: { questions: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }

  async updateSection(id: string, dto: UpdateSectionDto) {
    const section = await this.prisma.testSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Section not found');

    return this.prisma.testSection.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.skill !== undefined && { skill: dto.skill }),
        ...(dto.instructions !== undefined && { instructions: dto.instructions }),
        ...(dto.audioUrl !== undefined && { audioUrl: dto.audioUrl }),
        ...(dto.durationMins !== undefined && { durationMins: dto.durationMins }),
      },
      include: { passages: true, questionGroups: { include: { questions: true } } },
    });
  }

  async deleteSection(id: string) {
    const section = await this.prisma.testSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Section not found');

    await this.prisma.testSection.delete({ where: { id } });
    await this.recountTest(section.testId);
    // Re-index remaining sections
    await this.reindexSections(section.testId);
    return { deleted: true };
  }

  async reorderSections(testId: string, order: string[]) {
    await this.prisma.$transaction(
      order.map((id, index) =>
        this.prisma.testSection.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
    );
    return { reordered: true };
  }

  // ─── Passages ─────────────────────────────────────────

  async createPassage(sectionId: string, dto: CreatePassageBodyDto) {
    const section = await this.prisma.testSection.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Section not found');

    const maxOrder = await this.prisma.passage.aggregate({
      where: { sectionId },
      _max: { orderIndex: true },
    });
    const orderIndex = (maxOrder._max.orderIndex ?? -1) + 1;

    return this.prisma.passage.create({
      data: {
        sectionId,
        title: dto.title,
        contentHtml: dto.contentHtml,
        orderIndex,
      },
    });
  }

  async updatePassage(id: string, dto: UpdatePassageDto) {
    const passage = await this.prisma.passage.findUnique({ where: { id } });
    if (!passage) throw new NotFoundException('Passage not found');

    return this.prisma.passage.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.contentHtml !== undefined && { contentHtml: dto.contentHtml }),
      },
    });
  }

  async deletePassage(id: string) {
    const passage = await this.prisma.passage.findUnique({ where: { id } });
    if (!passage) throw new NotFoundException('Passage not found');

    await this.prisma.passage.delete({ where: { id } });
    // Re-index remaining passages
    const remaining = await this.prisma.passage.findMany({
      where: { sectionId: passage.sectionId },
      orderBy: { orderIndex: 'asc' },
    });
    await this.prisma.$transaction(
      remaining.map((p, i) =>
        this.prisma.passage.update({ where: { id: p.id }, data: { orderIndex: i } }),
      ),
    );
    return { deleted: true };
  }

  // ─── Helpers ──────────────────────────────────────────

  private async reindexSections(testId: string) {
    const sections = await this.prisma.testSection.findMany({
      where: { testId },
      orderBy: { orderIndex: 'asc' },
    });
    await this.prisma.$transaction(
      sections.map((s, i) =>
        this.prisma.testSection.update({ where: { id: s.id }, data: { orderIndex: i } }),
      ),
    );
  }

  private async recountTest(testId: string) {
    const sections = await this.prisma.testSection.findMany({
      where: { testId },
      include: { questionGroups: { include: { questions: { select: { id: true } } } } },
    });
    const sectionCount = sections.length;
    const questionCount = sections.reduce(
      (sum, s) => sum + s.questionGroups.reduce((gs, g) => gs + g.questions.length, 0),
      0,
    );
    // Also update per-section counts
    for (const s of sections) {
      const qc = s.questionGroups.reduce((gs, g) => gs + g.questions.length, 0);
      await this.prisma.testSection.update({
        where: { id: s.id },
        data: { questionCount: qc },
      });
    }
    await this.prisma.test.update({
      where: { id: testId },
      data: { sectionCount, questionCount },
    });
  }
}
