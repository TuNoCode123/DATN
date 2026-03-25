import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminQuestionsService } from './admin-questions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SectionSkill, QuestionType, ExamType } from '@prisma/client';

@Controller('admin/questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminQuestionsController {
  constructor(private service: AdminQuestionsService) {}

  @Get()
  findAll(
    @Query('skill') skill?: SectionSkill,
    @Query('questionType') questionType?: QuestionType,
    @Query('examType') examType?: ExamType,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      skill,
      questionType,
      examType,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
