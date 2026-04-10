import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LiveExamQuestionType,
  LiveExamSessionStatus,
  LiveExamTemplateStatus,
  Prisma,
} from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { LiveExamLeaderboardService } from './live-exam-leaderboard.service';
import {
  QuestionPayload,
  buildRevealPayload,
  validateQuestionPayload,
} from './live-exam-question-types';

const nano6 = customAlphabet('0123456789', 6);
const nanoSlug = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  10,
);

/**
 * LiveExamService owns the SESSION lifecycle. Templates live in
 * LiveExamTemplateService; sessions are spawned from a PUBLISHED
 * template and run through LOBBY → LIVE → ENDED.
 *
 * A session snapshots its template's questions at creation time into
 * LiveExamSessionQuestion rows. After that, edits to the template
 * never mutate the running session — this is the whole point of the
 * refactor.
 */
@Injectable()
export class LiveExamService {
  private readonly logger = new Logger('LiveExamService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LiveExamLeaderboardService,
  ) {}

  // ─── Session creation ────────────────────────────

  /**
   * Spawn a new session from a PUBLISHED template. Clones questions
   * into LiveExamSessionQuestion, generates a fresh joinCode and
   * inviteSlug, and returns the new session in LOBBY status.
   */
  async createFromTemplate(userId: string, templateId: string) {
    const template = await this.prisma.liveExamTemplate.findUnique({
      where: { id: templateId },
      include: {
        questions: { orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (template.createdById !== userId) {
      throw new ForbiddenException('Not the owner of this template');
    }
    if (template.status !== LiveExamTemplateStatus.PUBLISHED) {
      throw new ConflictException('Template must be PUBLISHED to spawn a session');
    }
    if (template.questions.length === 0) {
      throw new BadRequestException('Template has no questions');
    }

    const joinCode = await this.generateUniqueJoinCode();
    const inviteSlug = await this.generateUniqueSlug();

    return this.prisma.liveExamSession.create({
      data: {
        templateId: template.id,
        title: template.title,
        description: template.description,
        durationSec: template.durationSec,
        perQuestionSec: template.perQuestionSec,
        interstitialSec: template.interstitialSec,
        joinCode,
        inviteSlug,
        status: LiveExamSessionStatus.LOBBY,
        createdById: userId,
        questions: {
          create: template.questions.map((q) => ({
            orderIndex: q.orderIndex,
            type: q.type,
            prompt: q.prompt,
            payload: q.payload as unknown as Prisma.InputJsonValue,
            explanation: q.explanation,
            points: q.points,
          })),
        },
      },
      include: {
        questions: { orderBy: { orderIndex: 'asc' } },
      },
    });
  }

  // ─── Read ────────────────────────────────────────

  async listMyHostedSessions(userId: string) {
    return this.prisma.liveExamSession.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        template: { select: { id: true, title: true } },
        _count: { select: { questions: true, participants: true } },
      },
    });
  }

  async findById(sessionId: string) {
    const session = await this.prisma.liveExamSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: { orderBy: { orderIndex: 'asc' } },
        _count: { select: { participants: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private async assertOwner(sessionId: string, userId: string) {
    const s = await this.prisma.liveExamSession.findUnique({
      where: { id: sessionId },
      select: { id: true, createdById: true, status: true },
    });
    if (!s) throw new NotFoundException('Session not found');
    if (s.createdById !== userId) {
      throw new ForbiddenException('Not the host of this session');
    }
    return s;
  }

  async delete(sessionId: string, userId: string) {
    const s = await this.assertOwner(sessionId, userId);
    if (s.status !== LiveExamSessionStatus.LOBBY) {
      throw new ConflictException(
        'Can only delete sessions that have not started',
      );
    }
    await this.prisma.liveExamSession.delete({ where: { id: sessionId } });
    return { ok: true };
  }

  // ─── Lifecycle ────────────────────────────────────

  /**
   * Transition LOBBY → LIVE. Called from the WS gateway on `host.start`,
   * which also owns the per-question timer chain.
   */
  async start(sessionId: string, userId: string) {
    const s = await this.assertOwner(sessionId, userId);
    if (s.status !== LiveExamSessionStatus.LOBBY) {
      throw new ConflictException('Can only start from LOBBY');
    }

    const participantCount = await this.prisma.liveExamParticipant.count({
      where: { sessionId },
    });
    if (participantCount === 0) {
      throw new BadRequestException('Cannot start with no participants');
    }

    return this.prisma.liveExamSession.update({
      where: { id: sessionId },
      data: { status: LiveExamSessionStatus.LIVE, startedAt: new Date() },
    });
  }

  /**
   * Force-end entrypoint. Used by host REST POST, host WS `host.end`,
   * and admin POST. Idempotent: returns the existing row unchanged if
   * the session is already ENDED.
   */
  async forceEnd(
    sessionId: string,
    userId: string | null,
    opts: { isAdmin?: boolean; reason?: string } = {},
  ) {
    const s = await this.prisma.liveExamSession.findUnique({
      where: { id: sessionId },
    });
    if (!s) throw new NotFoundException('Session not found');
    if (!opts.isAdmin && s.createdById !== userId) {
      throw new ForbiddenException('Not the host of this session');
    }
    if (s.status === LiveExamSessionStatus.ENDED) return s;
    if (s.status === LiveExamSessionStatus.CANCELLED) {
      throw new ConflictException('Session was cancelled');
    }

    const ended = await this.prisma.liveExamSession.update({
      where: { id: sessionId },
      data: { status: LiveExamSessionStatus.ENDED, endedAt: new Date() },
    });

    // Persist final leaderboard + clear Redis state.
    await this.leaderboard.snapshot(sessionId);

    await this.prisma.liveExamEvent.create({
      data: {
        sessionId,
        userId: userId ?? null,
        type: 'END',
        payload: {
          reason: opts.reason ?? (opts.isAdmin ? 'admin_force_end' : 'host_force_end'),
        },
      },
    });

    return ended;
  }

  // ─── Join by code / slug ──────────────────────────

  async getBySlug(slug: string) {
    const s = await this.prisma.liveExamSession.findUnique({
      where: { inviteSlug: slug },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        joinCode: true,
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  async getByCode(code: string) {
    const s = await this.prisma.liveExamSession.findUnique({
      where: { joinCode: code },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        inviteSlug: true,
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  async join(sessionId: string, userId: string, displayName: string) {
    const s = await this.prisma.liveExamSession.findUnique({
      where: { id: sessionId },
    });
    if (!s) throw new NotFoundException('Session not found');
    if (
      s.status !== LiveExamSessionStatus.LOBBY &&
      s.status !== LiveExamSessionStatus.LIVE
    ) {
      throw new ConflictException('Session is not joinable');
    }

    const existing = await this.prisma.liveExamParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (existing) return existing;

    return this.prisma.liveExamParticipant.create({
      data: { sessionId, userId, displayName },
    });
  }

  async getHostView(sessionId: string, userId: string) {
    await this.assertOwner(sessionId, userId);
    const session = await this.prisma.liveExamSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: { orderBy: { orderIndex: 'asc' } },
        participants: {
          orderBy: { finalRank: 'asc' },
          include: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    const leaderboard = await this.leaderboard.getAll(sessionId);
    const phaseState = await this.leaderboard.getQuestionState(sessionId);

    return { session, leaderboard, phaseState };
  }

  // ─── History ──────────────────────────────────────

  async getMyHistory(userId: string, take = 20, cursor?: string) {
    const rows = await this.prisma.liveExamParticipant.findMany({
      where: {
        userId,
        session: { status: LiveExamSessionStatus.ENDED },
      },
      orderBy: { session: { endedAt: 'desc' } },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        session: {
          select: {
            id: true,
            title: true,
            endedAt: true,
            _count: { select: { participants: true } },
          },
        },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items: items.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        title: r.session.title,
        endedAt: r.session.endedAt,
        myScore: r.finalScore ?? 0,
        myRank: r.finalRank ?? null,
        correctCount: r.correctCount,
        wrongCount: r.wrongCount,
        totalPlayers: r.session._count.participants,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async getHostedHistory(userId: string, take = 20, cursor?: string) {
    const sessions = await this.prisma.liveExamSession.findMany({
      where: {
        createdById: userId,
        status: LiveExamSessionStatus.ENDED,
      },
      orderBy: { endedAt: 'desc' },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        participants: {
          orderBy: { finalRank: 'asc' },
          take: 1,
          include: { user: { select: { displayName: true, email: true } } },
        },
        _count: { select: { participants: true } },
      },
    });

    const hasMore = sessions.length > take;
    const items = hasMore ? sessions.slice(0, take) : sessions;
    const aggregated = await Promise.all(
      items.map(async (session) => {
        const agg = await this.prisma.liveExamParticipant.aggregate({
          where: { sessionId: session.id },
          _avg: { finalScore: true },
          _max: { finalScore: true },
        });
        const topPlayer = session.participants[0];
        return {
          sessionId: session.id,
          title: session.title,
          endedAt: session.endedAt,
          playerCount: session._count.participants,
          avgScore: Math.round(agg._avg.finalScore ?? 0),
          topScore: agg._max.finalScore ?? 0,
          topPlayerName:
            topPlayer?.user.displayName ?? topPlayer?.user.email ?? null,
        };
      }),
    );

    return {
      items: aggregated,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  // ─── Results (post-ENDED) ─────────────────────────

  async getPlayerResult(sessionId: string, userId: string) {
    const participant = await this.prisma.liveExamParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      include: {
        session: {
          include: { questions: { orderBy: { orderIndex: 'asc' } } },
        },
        answers: true,
      },
    });
    if (!participant) throw new NotFoundException('No participation record');

    const leaderboard = await this.prisma.liveExamParticipant.findMany({
      where: { sessionId },
      orderBy: [{ finalRank: 'asc' }, { finalScore: 'desc' }],
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });

    const answersByQuestion = new Map(
      participant.answers.map((a) => [a.questionId, a]),
    );
    const breakdown = participant.session.questions.map((q) => {
      const a = answersByQuestion.get(q.id);
      const reveal = buildRevealPayload(
        q.type as LiveExamQuestionType,
        validateQuestionPayload(q.type as LiveExamQuestionType, q.payload),
      );
      return {
        questionId: q.id,
        orderIndex: q.orderIndex,
        type: q.type,
        prompt: q.prompt,
        payload: q.payload,
        reveal,
        explanation: q.explanation,
        yourAnswer: a?.answerPayload ?? null,
        isCorrect: a?.isCorrect ?? false,
        answeredMs: a?.answeredMs ?? null,
        awardedPoints: a?.awardedPoints ?? 0,
      };
    });

    return {
      session: {
        id: participant.session.id,
        title: participant.session.title,
        endedAt: participant.session.endedAt,
      },
      me: {
        userId: participant.userId,
        displayName: participant.displayName,
        finalScore: participant.finalScore ?? 0,
        finalRank: participant.finalRank ?? null,
        correctCount: participant.correctCount,
        wrongCount: participant.wrongCount,
      },
      leaderboard: leaderboard.map((p, i) => ({
        rank: p.finalRank ?? i + 1,
        userId: p.userId,
        displayName: p.displayName,
        score: p.finalScore ?? 0,
        correct: p.correctCount,
        wrong: p.wrongCount,
      })),
      breakdown,
    };
  }

  async getHostResult(sessionId: string, userId: string) {
    await this.assertOwner(sessionId, userId);

    const session = await this.prisma.liveExamSession.findUnique({
      where: { id: sessionId },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Session not found');

    const leaderboard = await this.prisma.liveExamParticipant.findMany({
      where: { sessionId },
      orderBy: [{ finalRank: 'asc' }, { finalScore: 'desc' }],
    });

    // Per-question aggregates. We only compute total/correct/avgMs here —
    // per-option distribution only makes sense for MULTIPLE_CHOICE, so
    // it's computed conditionally.
    const questionStats = await Promise.all(
      session.questions.map(async (q) => {
        const answers = await this.prisma.liveExamAnswer.findMany({
          where: { questionId: q.id },
        });
        const total = answers.length;
        const correct = answers.filter((a) => a.isCorrect).length;
        const avgMs =
          total > 0
            ? Math.round(
                answers.reduce((sum, a) => sum + a.answeredMs, 0) / total,
              )
            : 0;

        let optionDistribution: Record<string, number> | null = null;
        if (q.type === 'MULTIPLE_CHOICE') {
          optionDistribution = { _timeout: 0 };
          const payload = validateQuestionPayload(
            'MULTIPLE_CHOICE',
            q.payload,
          ) as { options: Array<{ id: string }>; correctOptionId: string };
          for (const opt of payload.options) {
            optionDistribution[opt.id] = 0;
          }
          for (const a of answers) {
            const picked = (a.answerPayload as { optionId?: string } | null)
              ?.optionId;
            if (picked && optionDistribution[picked] !== undefined) {
              optionDistribution[picked]++;
            } else {
              optionDistribution._timeout++;
            }
          }
        }

        const reveal = buildRevealPayload(
          q.type as LiveExamQuestionType,
          validateQuestionPayload(q.type as LiveExamQuestionType, q.payload),
        );

        return {
          questionId: q.id,
          orderIndex: q.orderIndex,
          type: q.type,
          prompt: q.prompt,
          reveal,
          correctRate: total > 0 ? correct / total : 0,
          avgAnsweredMs: avgMs,
          optionDistribution,
        };
      }),
    );

    return {
      session: {
        id: session.id,
        title: session.title,
        endedAt: session.endedAt,
        playerCount: leaderboard.length,
      },
      leaderboard: leaderboard.map((p, i) => ({
        rank: p.finalRank ?? i + 1,
        userId: p.userId,
        displayName: p.displayName,
        score: p.finalScore ?? 0,
        correct: p.correctCount,
        wrong: p.wrongCount,
      })),
      questionStats,
    };
  }

  // ─── Admin ─────────────────────────────────────────

  async adminListSessions(filters: {
    status?: LiveExamSessionStatus;
    take?: number;
  }) {
    return this.prisma.liveExamSession.findMany({
      where: filters.status ? { status: filters.status } : {},
      orderBy: { createdAt: 'desc' },
      take: filters.take ?? 50,
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        template: { select: { id: true, title: true } },
        _count: { select: { participants: true, questions: true } },
      },
    });
  }

  async adminListTemplates(take = 50) {
    return this.prisma.liveExamTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        _count: { select: { questions: true, sessions: true } },
      },
    });
  }

  async adminStats() {
    const [sessionGrouped, templateGrouped] = await Promise.all([
      this.prisma.liveExamSession.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.liveExamTemplate.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    return {
      sessions: Object.fromEntries(
        sessionGrouped.map((g) => [g.status, g._count._all]),
      ),
      templates: Object.fromEntries(
        templateGrouped.map((g) => [g.status, g._count._all]),
      ),
    };
  }

  async adminSessionDetail(sessionId: string) {
    const session = await this.prisma.liveExamSession.findUnique({
      where: { id: sessionId },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        template: { select: { id: true, title: true } },
        questions: { orderBy: { orderIndex: 'asc' } },
        participants: {
          include: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    let liveLeaderboard: Awaited<
      ReturnType<LiveExamLeaderboardService['getAll']>
    > = [];
    if (
      session.status === LiveExamSessionStatus.LIVE ||
      session.status === LiveExamSessionStatus.LOBBY
    ) {
      liveLeaderboard = await this.leaderboard.getAll(sessionId);
    }
    return { session, liveLeaderboard };
  }

  async adminEvents(sessionId: string, take = 200) {
    return this.prisma.liveExamEvent.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ─── Helpers ──────────────────────────────────────

  private async generateUniqueJoinCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = nano6();
      const exists = await this.prisma.liveExamSession.findUnique({
        where: { joinCode: code },
      });
      if (!exists) return code;
    }
    throw new Error('Could not generate unique join code');
  }

  private async generateUniqueSlug(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const slug = nanoSlug();
      const exists = await this.prisma.liveExamSession.findUnique({
        where: { inviteSlug: slug },
      });
      if (!exists) return slug;
    }
    throw new Error('Could not generate unique slug');
  }
}
