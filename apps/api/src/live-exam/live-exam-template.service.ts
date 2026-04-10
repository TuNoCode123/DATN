import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LiveExamQuestionType,
  LiveExamTemplateStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLiveExamTemplateDto } from './dto/create-live-exam.dto';
import { UpdateLiveExamTemplateDto } from './dto/update-live-exam.dto';
import { CreateLiveExamQuestionDto } from './dto/create-live-exam-question.dto';
import {
  QuestionPayloadError,
  validateQuestionPayload,
} from './live-exam-question-types';

/**
 * CRUD for live exam TEMPLATES. A template is the host-authored
 * definition of a quiz. Templates can be in DRAFT (editable),
 * PUBLISHED (ready to spawn sessions), or ARCHIVED (read-only).
 *
 * Ownership is enforced on every mutating call via
 * `template.createdById === userId`.
 *
 * A template can only be edited while in DRAFT. Once PUBLISHED, the
 * author can archive it or spawn sessions from it but cannot alter
 * questions — this guarantees that any in-flight session (which
 * snapshots the questions) matches exactly what authors see in the
 * template detail view.
 */
@Injectable()
export class LiveExamTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CRUD ─────────────────────────────────────────

  async create(userId: string, dto: CreateLiveExamTemplateDto) {
    return this.prisma.liveExamTemplate.create({
      data: {
        title: dto.title,
        description: dto.description,
        durationSec: dto.durationSec,
        perQuestionSec: dto.perQuestionSec,
        interstitialSec: dto.interstitialSec ?? 5,
        createdById: userId,
      },
    });
  }

  async listMine(userId: string) {
    return this.prisma.liveExamTemplate.findMany({
      where: { createdById: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { questions: true, sessions: true } },
      },
    });
  }

  async findById(templateId: string, userId: string) {
    const template = await this.prisma.liveExamTemplate.findUnique({
      where: { id: templateId },
      include: {
        questions: { orderBy: { orderIndex: 'asc' } },
        _count: { select: { sessions: true } },
      },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (template.createdById !== userId) {
      throw new ForbiddenException('Not the owner of this template');
    }
    return template;
  }

  async update(templateId: string, userId: string, dto: UpdateLiveExamTemplateDto) {
    const t = await this.assertOwnerDraft(templateId, userId);
    return this.prisma.liveExamTemplate.update({
      where: { id: t.id },
      data: dto,
    });
  }

  async delete(templateId: string, userId: string) {
    const t = await this.assertOwner(templateId, userId);
    // Block deletion if any non-ENDED session references this template.
    // Ended sessions keep their snapshot via CASCADE on deletion would
    // wipe them, so we RESTRICT at FK level AND check here for clearer
    // error messaging.
    const activeSessions = await this.prisma.liveExamSession.count({
      where: {
        templateId: t.id,
        status: { in: ['LOBBY', 'LIVE'] },
      },
    });
    if (activeSessions > 0) {
      throw new ConflictException(
        'Cannot delete a template that has running sessions',
      );
    }
    const anySessions = await this.prisma.liveExamSession.count({
      where: { templateId: t.id },
    });
    if (anySessions > 0) {
      // Safer default: archive instead of hard-delete so historical
      // sessions remain valid (their templateId FK is RESTRICTed).
      return this.prisma.liveExamTemplate.update({
        where: { id: t.id },
        data: { status: LiveExamTemplateStatus.ARCHIVED },
      });
    }
    await this.prisma.liveExamTemplate.delete({ where: { id: t.id } });
    return { ok: true };
  }

  // ─── Questions ────────────────────────────────────

  async addQuestion(
    templateId: string,
    userId: string,
    dto: CreateLiveExamQuestionDto,
  ) {
    const t = await this.assertOwnerDraft(templateId, userId);
    const payload = this.validatePayloadOrBadRequest(dto.type, dto.payload);

    let orderIndex = dto.orderIndex;
    if (orderIndex === undefined) {
      const count = await this.prisma.liveExamTemplateQuestion.count({
        where: { templateId: t.id },
      });
      orderIndex = count;
    }

    return this.prisma.liveExamTemplateQuestion.create({
      data: {
        templateId: t.id,
        orderIndex,
        type: dto.type,
        prompt: dto.prompt,
        payload: payload as unknown as Prisma.InputJsonValue,
        explanation: dto.explanation,
        points: dto.points ?? 1000,
      },
    });
  }

  async updateQuestion(
    templateId: string,
    questionId: string,
    userId: string,
    dto: CreateLiveExamQuestionDto,
  ) {
    const t = await this.assertOwnerDraft(templateId, userId);
    const payload = this.validatePayloadOrBadRequest(dto.type, dto.payload);

    const existing = await this.prisma.liveExamTemplateQuestion.findUnique({
      where: { id: questionId },
    });
    if (!existing || existing.templateId !== t.id) {
      throw new NotFoundException('Question not found');
    }

    return this.prisma.liveExamTemplateQuestion.update({
      where: { id: questionId },
      data: {
        type: dto.type,
        prompt: dto.prompt,
        payload: payload as unknown as Prisma.InputJsonValue,
        explanation: dto.explanation,
        points: dto.points ?? 1000,
      },
    });
  }

  async deleteQuestion(templateId: string, questionId: string, userId: string) {
    const t = await this.assertOwnerDraft(templateId, userId);
    const existing = await this.prisma.liveExamTemplateQuestion.findUnique({
      where: { id: questionId },
    });
    if (!existing || existing.templateId !== t.id) {
      throw new NotFoundException('Question not found');
    }
    await this.prisma.liveExamTemplateQuestion.delete({
      where: { id: questionId },
    });
    // Re-sequence orderIndex values so there are no gaps. This keeps
    // snapshot cloning simple and the editor's drag-reorder logic
    // predictable. Uses a transaction with a temporary offset to avoid
    // violating the (templateId, orderIndex) unique constraint.
    const remaining = await this.prisma.liveExamTemplateQuestion.findMany({
      where: { templateId: t.id },
      orderBy: { orderIndex: 'asc' },
    });
    const OFFSET = 1_000_000;
    await this.prisma.$transaction([
      ...remaining.map((q, i) =>
        this.prisma.liveExamTemplateQuestion.update({
          where: { id: q.id },
          data: { orderIndex: i + OFFSET },
        }),
      ),
      ...remaining.map((q, i) =>
        this.prisma.liveExamTemplateQuestion.update({
          where: { id: q.id },
          data: { orderIndex: i },
        }),
      ),
    ]);
    return { ok: true };
  }

  // ─── Lifecycle ────────────────────────────────────

  async publish(templateId: string, userId: string) {
    const t = await this.assertOwner(templateId, userId);
    if (t.status !== LiveExamTemplateStatus.DRAFT) {
      throw new ConflictException('Only DRAFT templates can be published');
    }
    const questions = await this.prisma.liveExamTemplateQuestion.findMany({
      where: { templateId: t.id },
      orderBy: { orderIndex: 'asc' },
    });
    if (questions.length === 0) {
      throw new BadRequestException('Cannot publish a template with no questions');
    }
    // Re-validate every question payload at publish time — the DB row
    // might have been written before a validation bug was fixed, or
    // through direct SQL, etc. Defensive check.
    for (const q of questions) {
      try {
        validateQuestionPayload(q.type as LiveExamQuestionType, q.payload);
      } catch (err) {
        throw new BadRequestException(
          `Question #${q.orderIndex + 1} is invalid: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        );
      }
    }

    return this.prisma.liveExamTemplate.update({
      where: { id: t.id },
      data: { status: LiveExamTemplateStatus.PUBLISHED },
    });
  }

  async archive(templateId: string, userId: string) {
    const t = await this.assertOwner(templateId, userId);
    if (t.status === LiveExamTemplateStatus.ARCHIVED) return t;
    return this.prisma.liveExamTemplate.update({
      where: { id: t.id },
      data: { status: LiveExamTemplateStatus.ARCHIVED },
    });
  }

  async listSessionsForTemplate(templateId: string, userId: string) {
    await this.assertOwner(templateId, userId);
    return this.prisma.liveExamSession.findMany({
      where: { templateId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { participants: true } },
      },
    });
  }

  // ─── Helpers ──────────────────────────────────────

  private async assertOwner(templateId: string, userId: string) {
    const t = await this.prisma.liveExamTemplate.findUnique({
      where: { id: templateId },
    });
    if (!t) throw new NotFoundException('Template not found');
    if (t.createdById !== userId) {
      throw new ForbiddenException('Not the owner of this template');
    }
    return t;
  }

  private async assertOwnerDraft(templateId: string, userId: string) {
    const t = await this.assertOwner(templateId, userId);
    if (t.status !== LiveExamTemplateStatus.DRAFT) {
      throw new ConflictException('Can only edit DRAFT templates');
    }
    return t;
  }

  private validatePayloadOrBadRequest(
    type: LiveExamQuestionType,
    raw: unknown,
  ) {
    try {
      return validateQuestionPayload(type, raw);
    } catch (err) {
      if (err instanceof QuestionPayloadError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
