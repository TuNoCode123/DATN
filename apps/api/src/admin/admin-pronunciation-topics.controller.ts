import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DifficultyLevel } from '@prisma/client';
import { AdminPronunciationTopicsService } from './admin-pronunciation-topics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/pronunciation-topics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminPronunciationTopicsController {
  constructor(private service: AdminPronunciationTopicsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('difficulty') difficulty?: DifficultyLevel,
    @Query('isPublished') isPublished?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      search,
      difficulty,
      isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      difficulty?: DifficultyLevel;
      tags?: string[];
      isPublished?: boolean;
    },
  ) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      difficulty?: DifficultyLevel;
      tags?: string[];
      isPublished?: boolean;
      orderIndex?: number;
    },
  ) {
    return this.service.update(id, body);
  }

  @Patch(':id/publish')
  togglePublish(@Param('id') id: string) {
    return this.service.togglePublish(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
