import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExamType } from '@prisma/client';
import { CreateBundleDto, UpdateBundleDto } from './dto/bundle.dto';

@Injectable()
export class AdminBundlesService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: { examType?: ExamType; search?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.examType) where.examType = filters.examType;
    if (filters.search) where.title = { contains: filters.search, mode: 'insensitive' };

    const bundles = await this.prisma.testBundle.findMany({
      where,
      include: {
        tests: {
          select: { id: true, title: true, bundleOrder: true },
          orderBy: { bundleOrder: 'asc' },
        },
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
    });

    return bundles;
  }

  async findById(id: string) {
    const bundle = await this.prisma.testBundle.findUnique({
      where: { id },
      include: {
        tests: {
          select: {
            id: true,
            title: true,
            examType: true,
            durationMins: true,
            sectionCount: true,
            questionCount: true,
            attemptCount: true,
            isPublished: true,
            bundleOrder: true,
          },
          orderBy: { bundleOrder: 'asc' },
        },
      },
    });
    if (!bundle) throw new NotFoundException('Bundle not found');
    return bundle;
  }

  async create(dto: CreateBundleDto) {
    const { testIds, ...data } = dto;

    const bundle = await this.prisma.testBundle.create({
      data: {
        ...data,
        orderIndex: data.orderIndex ?? 0,
      },
    });

    if (testIds?.length) {
      await this.assignTests(bundle.id, testIds);
    }

    return this.findById(bundle.id);
  }

  async update(id: string, dto: UpdateBundleDto) {
    const { testIds, ...data } = dto;

    await this.prisma.testBundle.update({
      where: { id },
      data,
    });

    if (testIds !== undefined) {
      await this.assignTests(id, testIds);
    }

    return this.findById(id);
  }

  async togglePublish(id: string) {
    const bundle = await this.prisma.testBundle.findUnique({ where: { id } });
    if (!bundle) throw new NotFoundException('Bundle not found');

    return this.prisma.testBundle.update({
      where: { id },
      data: { isPublished: !bundle.isPublished },
    });
  }

  async delete(id: string) {
    // Clear bundleId from all tests in this bundle before deleting
    await this.prisma.test.updateMany({
      where: { bundleId: id },
      data: { bundleId: null, bundleOrder: null },
    });

    await this.prisma.testBundle.delete({ where: { id } });
    return { deleted: true };
  }

  private async assignTests(bundleId: string, testIds: string[]) {
    // Clear existing assignments for this bundle
    await this.prisma.test.updateMany({
      where: { bundleId },
      data: { bundleId: null, bundleOrder: null },
    });

    // Assign new tests with order
    for (let i = 0; i < testIds.length; i++) {
      await this.prisma.test.update({
        where: { id: testIds[i] },
        data: { bundleId, bundleOrder: i },
      });
    }
  }
}
