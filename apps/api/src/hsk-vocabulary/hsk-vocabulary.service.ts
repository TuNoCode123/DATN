import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HskVocabularyService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    level?: number;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { level, search, page = 1, limit = 50 } = params;
    const where: any = {};

    if (level) where.level = level;
    if (search) {
      where.OR = [
        { simplified: { contains: search } },
        { traditional: { contains: search } },
        { pinyin: { contains: search, mode: 'insensitive' } },
        { meaningEn: { contains: search, mode: 'insensitive' } },
        { meaningVi: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.hskVocabulary.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ level: 'asc' }, { simplified: 'asc' }],
      }),
      this.prisma.hskVocabulary.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data: {
    level: number;
    simplified: string;
    traditional: string;
    pinyin: string;
    meaningEn: string;
    meaningVi?: string;
    partOfSpeech?: string;
  }) {
    return this.prisma.hskVocabulary.create({ data });
  }

  async bulkCreate(
    items: {
      level: number;
      simplified: string;
      traditional: string;
      pinyin: string;
      meaningEn: string;
      meaningVi?: string;
      partOfSpeech?: string;
    }[],
  ) {
    return this.prisma.hskVocabulary.createMany({
      data: items,
      skipDuplicates: true,
    });
  }

  async update(
    id: string,
    data: Partial<{
      level: number;
      simplified: string;
      traditional: string;
      pinyin: string;
      meaningEn: string;
      meaningVi: string;
      partOfSpeech: string;
    }>,
  ) {
    const existing = await this.prisma.hskVocabulary.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Vocabulary entry not found');
    return this.prisma.hskVocabulary.update({ where: { id }, data });
  }

  async delete(id: string) {
    const existing = await this.prisma.hskVocabulary.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Vocabulary entry not found');
    return this.prisma.hskVocabulary.delete({ where: { id } });
  }

  async getStats() {
    const stats = await this.prisma.hskVocabulary.groupBy({
      by: ['level'],
      _count: { id: true },
      orderBy: { level: 'asc' },
    });
    return stats.map((s) => ({ level: s.level, count: s._count.id }));
  }

  async search(query: string) {
    return this.prisma.hskVocabulary.findMany({
      where: {
        OR: [
          { simplified: { contains: query } },
          { traditional: { contains: query } },
          { pinyin: { contains: query, mode: 'insensitive' } },
          { meaningEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { level: 'asc' },
    });
  }
}
