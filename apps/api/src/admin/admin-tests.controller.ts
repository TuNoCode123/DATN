import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminTestsService } from './admin-tests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestMetadataDto } from './dto/update-test.dto';
import { CreateFromTemplateDto } from './dto/template.dto';
import { SyncTestDto } from './dto/sync-test.dto';
import { ExamType } from '@prisma/client';

@Controller('admin/tests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminTestsController {
  constructor(private service: AdminTestsService) {}

  @Get()
  findAll(
    @Query('examType') examType?: ExamType,
    @Query('isPublished') isPublished?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      examType,
      isPublished:
        isPublished !== undefined ? isPublished === 'true' : undefined,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  create(@Body() dto: CreateTestDto) {
    return this.service.create(dto);
  }

  @Post('from-template')
  createFromTemplate(@Body() dto: CreateFromTemplateDto) {
    return this.service.createFromTemplate(dto);
  }

  @Get(':id/validate')
  validate(@Param('id') id: string) {
    return this.service.validate(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateTestDto) {
    return this.service.update(id, dto);
  }

  @Put(':id/sync')
  syncTest(@Param('id') id: string, @Body() dto: SyncTestDto) {
    return this.service.syncTest(id, dto);
  }

  @Patch(':id')
  updateMetadata(@Param('id') id: string, @Body() dto: UpdateTestMetadataDto) {
    return this.service.updateMetadata(id, dto);
  }

  @Patch(':id/publish')
  togglePublish(@Param('id') id: string) {
    return this.service.togglePublish(id);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.service.duplicate(id);
  }

  @Post(':id/add-missing-sections')
  addMissingSections(@Param('id') id: string) {
    return this.service.addMissingSections(id);
  }

  @Post(':id/recount')
  recount(@Param('id') id: string) {
    return this.service.recount(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
