import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminResultsService } from './admin-results.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AttemptStatus } from '@prisma/client';

@Controller('admin/results')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminResultsController {
  constructor(private service: AdminResultsService) {}

  @Get()
  findAll(
    @Query('testId') testId?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: AttemptStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      testId,
      userId,
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
