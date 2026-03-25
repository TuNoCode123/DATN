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
import { AdminGroupsService } from './admin-groups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateGroupBodyDto, UpdateGroupDto } from './dto/group.dto';
import {
  CreateQuestionBodyDto,
  BulkCreateQuestionsDto,
  UpdateQuestionDto,
  BulkDeleteDto,
} from './dto/question.dto';
import { ReorderDto } from './dto/section.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminGroupsController {
  constructor(private service: AdminGroupsService) {}

  // ─── Question Groups ──────────────────────────────────

  @Post('sections/:sectionId/groups')
  createGroup(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateGroupBodyDto,
  ) {
    return this.service.createGroup(sectionId, dto);
  }

  @Get('groups/:id')
  getGroup(@Param('id') id: string) {
    return this.service.getGroup(id);
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.service.updateGroup(id, dto);
  }

  @Delete('groups/:id')
  deleteGroup(@Param('id') id: string) {
    return this.service.deleteGroup(id);
  }

  @Post('sections/:sectionId/groups/reorder')
  reorderGroups(
    @Param('sectionId') sectionId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.service.reorderGroups(sectionId, dto.order);
  }

  // ─── Questions ────────────────────────────────────────

  @Post('groups/:groupId/questions')
  createQuestions(
    @Param('groupId') groupId: string,
    @Body() dto: BulkCreateQuestionsDto,
  ) {
    return this.service.createQuestions(groupId, dto.questions);
  }

  @Patch('questions/:id')
  updateQuestion(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.service.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string) {
    return this.service.deleteQuestion(id);
  }

  @Post('questions/bulk-delete')
  bulkDeleteQuestions(@Body() dto: BulkDeleteDto) {
    return this.service.bulkDeleteQuestions(dto.ids);
  }

  @Post('groups/:groupId/questions/reorder')
  reorderQuestions(
    @Param('groupId') groupId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.service.reorderQuestions(groupId, dto.order);
  }

  @Post('tests/:testId/renumber')
  renumberQuestions(@Param('testId') testId: string) {
    return this.service.renumberTestQuestions(testId);
  }
}
