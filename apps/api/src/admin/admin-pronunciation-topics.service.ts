import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, DifficultyLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface TopicFilters {
  search?: string;
  difficulty?: DifficultyLevel;
  isPublished?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class AdminPronunciationTopicsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: TopicFilters = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PronunciationTopicWhereInput = {};
    if (filters.difficulty) where.difficulty = filters.difficulty;
    if (filters.isPublished !== undefined) where.isPublished = filters.isPublished;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.pronunciationTopic.findMany({
        where,
        orderBy: { orderIndex: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.pronunciationTopic.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const topic = await this.prisma.pronunciationTopic.findUnique({
      where: { id },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    return topic;
  }

  async create(data: {
    name: string;
    description?: string;
    difficulty?: DifficultyLevel;
    tags?: string[];
    isPublished?: boolean;
  }) {
    const existing = await this.prisma.pronunciationTopic.findUnique({
      where: { name: data.name },
    });
    if (existing) throw new ConflictException('Topic name already exists');

    // Auto-assign orderIndex
    const maxOrder = await this.prisma.pronunciationTopic.aggregate({
      _max: { orderIndex: true },
    });

    return this.prisma.pronunciationTopic.create({
      data: {
        name: data.name,
        description: data.description,
        difficulty: data.difficulty || 'INTERMEDIATE',
        tags: data.tags || [],
        isPublished: data.isPublished ?? false,
        orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      difficulty?: DifficultyLevel;
      tags?: string[];
      isPublished?: boolean;
      orderIndex?: number;
    },
  ) {
    const topic = await this.prisma.pronunciationTopic.findUnique({
      where: { id },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    return this.prisma.pronunciationTopic.update({
      where: { id },
      data,
    });
  }

  async togglePublish(id: string) {
    const topic = await this.prisma.pronunciationTopic.findUnique({
      where: { id },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    return this.prisma.pronunciationTopic.update({
      where: { id },
      data: { isPublished: !topic.isPublished },
    });
  }

  async delete(id: string) {
    const topic = await this.prisma.pronunciationTopic.findUnique({
      where: { id },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    await this.prisma.pronunciationTopic.delete({ where: { id } });
    return { deleted: true };
  }
}
