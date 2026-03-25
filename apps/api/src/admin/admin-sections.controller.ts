import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminSectionsService } from './admin-sections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateSectionBodyDto, UpdateSectionDto, ReorderDto } from './dto/section.dto';
import { CreatePassageBodyDto, UpdatePassageDto } from './dto/passage.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminSectionsController {
  constructor(private service: AdminSectionsService) {}

  // ─── Sections ─────────────────────────────────────────

  @Post('tests/:testId/sections')
  createSection(
    @Param('testId') testId: string,
    @Body() dto: CreateSectionBodyDto,
  ) {
    return this.service.createSection(testId, dto);
  }

  @Get('tests/:testId/sections/:id')
  getSection(@Param('id') id: string) {
    return this.service.getSection(id);
  }

  @Patch('tests/:testId/sections/:id')
  updateSection(
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.service.updateSection(id, dto);
  }

  @Delete('tests/:testId/sections/:id')
  deleteSection(@Param('id') id: string) {
    return this.service.deleteSection(id);
  }

  @Post('tests/:testId/sections/reorder')
  reorderSections(
    @Param('testId') testId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.service.reorderSections(testId, dto.order);
  }

  // ─── Passages ─────────────────────────────────────────

  @Post('sections/:sectionId/passages')
  createPassage(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreatePassageBodyDto,
  ) {
    return this.service.createPassage(sectionId, dto);
  }

  @Patch('passages/:id')
  updatePassage(
    @Param('id') id: string,
    @Body() dto: UpdatePassageDto,
  ) {
    return this.service.updatePassage(id, dto);
  }

  @Delete('passages/:id')
  deletePassage(@Param('id') id: string) {
    return this.service.deletePassage(id);
  }
}
