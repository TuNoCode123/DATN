import { Controller, Get, Param, Query } from '@nestjs/common';
import { TestsService } from './tests.service';
import { ExamType, TestFormat } from '@prisma/client';

@Controller('tests')
export class TestsController {
  constructor(private testsService: TestsService) {}

  @Get()
  findAll(
    @Query('examType') examType?: ExamType,
    @Query('format') format?: TestFormat,
    @Query('tags') tags?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.testsService.findAll({
      examType,
      format,
      tagSlugs: tags ? tags.split(',') : undefined,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.testsService.findById(id);
  }
}
