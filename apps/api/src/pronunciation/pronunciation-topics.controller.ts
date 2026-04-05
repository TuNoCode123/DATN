import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('pronunciation/topics')
@UseGuards(JwtAuthGuard)
export class PronunciationTopicsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findPublished() {
    return this.prisma.pronunciationTopic.findMany({
      where: { isPublished: true },
      orderBy: { orderIndex: 'asc' },
    });
  }
}
