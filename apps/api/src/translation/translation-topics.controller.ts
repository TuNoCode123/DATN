import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('translation/topics')
@UseGuards(JwtAuthGuard)
export class TranslationTopicsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findPublished() {
    return this.prisma.translationTopic.findMany({
      where: { isPublished: true },
      orderBy: { orderIndex: 'asc' },
    });
  }
}
