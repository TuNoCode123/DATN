import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { BundlesService } from './bundles.service';
import { ExamType } from '@prisma/client';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('bundles')
export class BundlesController {
  constructor(private service: BundlesService) {}

  @Get()
  findAll(@Query('examType') examType?: ExamType) {
    return this.service.findAll({ examType });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Get(':id/progress')
  @UseGuards(OptionalJwtAuthGuard)
  getProgress(
    @Param('id') id: string,
    @CurrentUser('id') userId: string | null,
  ) {
    return this.service.getProgress(id, userId ?? null);
  }
}
