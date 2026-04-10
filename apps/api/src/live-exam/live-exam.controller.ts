import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import { LiveExamService } from './live-exam.service';
import { LiveExamTemplateService } from './live-exam-template.service';
import { CreateLiveExamTemplateDto } from './dto/create-live-exam.dto';
import { UpdateLiveExamTemplateDto } from './dto/update-live-exam.dto';
import { CreateLiveExamQuestionDto } from './dto/create-live-exam-question.dto';
import { CreateLiveExamSessionDto } from './dto/create-live-exam-session.dto';
import { HistoryQueryDto } from './dto/history.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LiveExamSessionStatus } from '@prisma/client';

type AuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
  role: string;
};

/**
 * Live exam REST controller. Routes split into:
 *   /live-exams/templates/*  — template CRUD, publish, spawn sessions
 *   /live-exams/sessions/*   — session lifecycle, join, host view, results
 *   /live-exams/history/*    — both sides of history
 *   /live-exams/by-code, /by-slug — public join lookups
 *
 * Templates are authored once, then a host spawns any number of
 * sessions from a PUBLISHED template. Sessions snapshot the template's
 * questions so in-flight runs are immutable.
 */
@Controller('live-exams')
@UseGuards(JwtAuthGuard)
export class LiveExamController {
  constructor(
    private readonly service: LiveExamService,
    private readonly templates: LiveExamTemplateService,
  ) {}

  // ─── Templates ────────────────────────────────────

  @Post('templates')
  createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLiveExamTemplateDto,
  ) {
    return this.templates.create(user.id, dto);
  }

  @Get('templates/mine')
  listMyTemplates(@CurrentUser() user: AuthUser) {
    return this.templates.listMine(user.id);
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.templates.findById(id, user.id);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateLiveExamTemplateDto,
  ) {
    return this.templates.update(id, user.id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.templates.delete(id, user.id);
  }

  @Post('templates/:id/questions')
  addTemplateQuestion(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLiveExamQuestionDto,
  ) {
    return this.templates.addQuestion(id, user.id, dto);
  }

  @Patch('templates/:id/questions/:qid')
  updateTemplateQuestion(
    @Param('id') id: string,
    @Param('qid') qid: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLiveExamQuestionDto,
  ) {
    return this.templates.updateQuestion(id, qid, user.id, dto);
  }

  @Delete('templates/:id/questions/:qid')
  deleteTemplateQuestion(
    @Param('id') id: string,
    @Param('qid') qid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templates.deleteQuestion(id, qid, user.id);
  }

  @Post('templates/:id/publish')
  publishTemplate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.templates.publish(id, user.id);
  }

  @Post('templates/:id/archive')
  archiveTemplate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.templates.archive(id, user.id);
  }

  @Get('templates/:id/sessions')
  listTemplateSessions(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templates.listSessionsForTemplate(id, user.id);
  }

  // ─── Sessions ─────────────────────────────────────

  @Post('sessions')
  createSession(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLiveExamSessionDto,
  ) {
    return this.service.createFromTemplate(user.id, dto.templateId);
  }

  @Get('sessions/mine')
  listMySessions(@CurrentUser() user: AuthUser) {
    return this.service.listMyHostedSessions(user.id);
  }

  // ─── History ──────────────────────────────────────
  // Keep these BEFORE :id catch-alls so they are matched first.

  @Get('history/mine')
  historyMine(@CurrentUser() user: AuthUser, @Query() q: HistoryQueryDto) {
    return this.service.getMyHistory(user.id, q.take ?? 20, q.cursor);
  }

  @Get('history/hosted')
  historyHosted(@CurrentUser() user: AuthUser, @Query() q: HistoryQueryDto) {
    return this.service.getHostedHistory(user.id, q.take ?? 20, q.cursor);
  }

  // ─── Join lookups ─────────────────────────────────

  @Get('by-slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.service.getBySlug(slug);
  }

  @Get('by-code/:code')
  getByCode(@Param('code') code: string) {
    return this.service.getByCode(code);
  }

  // ─── Per-session ──────────────────────────────────

  @Get('sessions/:id')
  findSession(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Delete('sessions/:id')
  removeSession(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.delete(id, user.id);
  }

  @Post('sessions/:id/end')
  endSession(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.forceEnd(id, user.id);
  }

  @Post('sessions/:id/join')
  join(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.join(id, user.id, user.displayName ?? user.email);
  }

  @Get('sessions/:id/host-view')
  hostView(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getHostView(id, user.id);
  }

  @Get('sessions/:id/qr')
  async qr(@Param('id') id: string, @Res() res: Response) {
    const session = await this.service.findById(id);
    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    const inviteUrl = session.inviteSlug
      ? `${base}/live/join/${session.inviteSlug}`
      : `${base}/live/join`;
    const png = await QRCode.toBuffer(inviteUrl, { width: 512, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(png);
  }

  @Get('sessions/:id/result/me')
  resultMe(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getPlayerResult(id, user.id);
  }

  @Get('sessions/:id/result/host')
  resultHost(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getHostResult(id, user.id);
  }
}

// ─── Admin (observer-only + force-end) ───────────────

@Controller('admin/live-exams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminLiveExamController {
  constructor(private readonly service: LiveExamService) {}

  @Get('templates')
  listTemplates(@Query('take') take?: string) {
    return this.service.adminListTemplates(take ? parseInt(take, 10) : undefined);
  }

  @Get('sessions')
  listSessions(
    @Query('status') status?: LiveExamSessionStatus,
    @Query('take') take?: string,
  ) {
    return this.service.adminListSessions({
      status,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get('stats')
  stats() {
    return this.service.adminStats();
  }

  @Get('sessions/:id')
  sessionDetail(@Param('id') id: string) {
    return this.service.adminSessionDetail(id);
  }

  @Get('sessions/:id/events')
  sessionEvents(@Param('id') id: string) {
    return this.service.adminEvents(id);
  }

  @Post('sessions/:id/force-end')
  forceEnd(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.forceEnd(id, user.id, { isAdmin: true });
  }
}
