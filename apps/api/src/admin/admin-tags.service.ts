import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminTagsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.tag.findMany({
      include: { _count: { select: { tests: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: { name: string }) {
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const existing = await this.prisma.tag.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Tag already exists');

    return this.prisma.tag.create({
      data: { name: data.name, slug },
    });
  }

  async update(id: string, data: { name: string }) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');

    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    return this.prisma.tag.update({
      where: { id },
      data: { name: data.name, slug },
    });
  }

  async delete(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');

    await this.prisma.tag.delete({ where: { id } });
    return { deleted: true };
  }
}
