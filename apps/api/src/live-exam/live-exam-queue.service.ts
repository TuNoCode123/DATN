import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Server } from 'socket.io';
import { Prisma, LiveExamQuestionType, LiveExamSessionStatus } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { LiveExamRedisStateService } from './live-exam-redis-state.service';
import { LiveExamLeaderboardService } from './live-exam-leaderboard.service';
import { LiveExamScoringService } from './live-exam-scoring.service';
import {
  QuestionPayload,
  buildDispatchPayload,
  buildRevealPayload,
  randomShufflePermutation,
  validateQuestionPayload,
} from './live-exam-question-types';

type AuthUser = {
  id: string;
  email: string;
  role: string;
  displayName?: string | null;
};

interface RuntimeQuestion {
  id: string;
  orderIndex: number;
  type: LiveExamQuestionType;
  prompt: string;
  payload: QuestionPayload;
  explanation: string | null;
  points: number;
  shuffle: number[] | null;
}

type JobType = 'next-question' | 'lock-question' | 'reveal-leaderboard' | 'duration-cap';

interface NextQuestionData {
  sid: string;
  expectedQIndex: number;
  expectedVersion: number;
}

interface LockQuestionData {
  sid: string;
  expectedQIndex: number;
  expectedVersion: number;
}

interface RevealLeaderboardData {
  sid: string;
  qIndex: number;
  expectedVersion: number;
}

interface DurationCapData {
  sid: string;
}

@Injectable()
export class LiveExamQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('LiveExamQueue');
  private queue!: Queue;
  private worker!: Worker;
  private server!: Server;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly redisState: LiveExamRedisStateService,
    private readonly leaderboard: LiveExamLeaderboardService,
    private readonly scoring: LiveExamScoringService,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  async onModuleInit() {
    const connection = this.redis.getConnectionOptions();

    this.queue = new Queue('live-exam', { connection });

    this.worker = new Worker(
      'live-exam',
      async (job: Job) => {
        try {
          switch (job.name as JobType) {
            case 'next-question':
              await this.processNextQuestion(job.data as NextQuestionData);
              break;
            case 'lock-question':
              await this.processLockQuestion(job.data as LockQuestionData);
              break;
            case 'reveal-leaderboard':
              await this.processRevealLeaderboard(job.data as RevealLeaderboardData);
              break;
            case 'duration-cap':
              await this.processDurationCap(job.data as DurationCapData);
              break;
          }
        } catch (err) {
          this.logger.error(`Job ${job.name} failed for ${job.data?.sid}`, err);
          throw err;
        }
      },
      { connection, concurrency: 10 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.name} [${job?.id}] failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  // ─── Public: enqueue jobs ─────────────────────────

  async enqueueNextQuestion(sid: string, expectedQIndex: number, expectedVersion: number) {
    await this.queue.add(
      'next-question',
      { sid, expectedQIndex, expectedVersion } satisfies NextQuestionData,
      { jobId: `next-${sid}-${expectedQIndex}` },
    );
  }

  async enqueueLockQuestion(sid: string, expectedQIndex: number, expectedVersion: number, delaySec: number) {
    await this.queue.add(
      'lock-question',
      { sid, expectedQIndex, expectedVersion } satisfies LockQuestionData,
      { jobId: `lock-${sid}-${expectedQIndex}`, delay: delaySec * 1000 },
    );
  }

  async enqueueRevealLeaderboard(sid: string, qIndex: number, expectedVersion: number) {
    await this.queue.add(
      'reveal-leaderboard',
      { sid, qIndex, expectedVersion } satisfies RevealLeaderboardData,
      { jobId: `reveal-${sid}-${qIndex}` },
    );
  }

  async enqueueDurationCap(sid: string, delaySec: number) {
    await this.queue.add(
      'duration-cap',
      { sid } satisfies DurationCapData,
      { jobId: `cap-${sid}`, delay: delaySec * 1000 },
    );
  }

  async removeSessionJobs(sid: string) {
    const state = await this.redisState.getState(sid);
    const totalQ = state?.totalQ ?? 0;
    const ids: string[] = [`cap-${sid}`];
    for (let i = 0; i <= totalQ; i++) {
      ids.push(`next-${sid}-${i}`, `lock-${sid}-${i}`, `reveal-${sid}-${i}`);
    }
    for (const id of ids) {
      try {
        const job = await this.queue.getJob(id);
        if (job) await job.remove();
      } catch {
        // job may be active or already gone
      }
    }
  }

  // ─── Workers ──────────────────────────────────────

  private async processNextQuestion(data: NextQuestionData) {
    const { sid, expectedQIndex, expectedVersion } = data;

    const result = await this.redisState.transitionToOpen(sid, expectedQIndex, expectedVersion);
    if (!result.ok) {
      this.logger.debug(`next-question no-op: ${sid} q${expectedQIndex} → ${result.reason}`);
      if (result.reason === 'ENDED') {
        await this.finalizeExam(sid, 'all_questions_done');
      }
      return;
    }

    const questions = await this.redisState.getQuestions<RuntimeQuestion>(sid);
    if (!questions) return;

    const q = questions[result.qIndex!];
    if (!q) return;

    // Generate shuffle for SENTENCE_REORDER at dispatch time
    if (q.type === 'SENTENCE_REORDER') {
      const p = q.payload as { fragments: string[] };
      q.shuffle = randomShufflePermutation(p.fragments.length);
      questions[result.qIndex!] = q;
      await this.redisState.setQuestions(sid, questions);
    } else {
      q.shuffle = null;
    }

    const state = await this.redisState.getState(sid);
    if (!state) return;

    await this.leaderboard.setQuestionState(sid, result.qIndex!, 'OPEN', result.qStartAt);

    const dispatch = buildDispatchPayload(q.type, q.payload, q.shuffle ?? undefined);
    const reveal = buildRevealPayload(q.type, q.payload);

    this.server.to(`live:${sid}`).emit('exam.question', {
      index: result.qIndex,
      question: { id: q.id, type: q.type, prompt: q.prompt, dispatch },
      dispatchedAt: result.qStartAt,
      perQuestionSec: state.perQSec,
      totalQuestions: state.totalQ,
      phase: 'OPEN',
    });

    this.server.to(`host:${sid}`).emit('host.questionView', {
      index: result.qIndex,
      question: { id: q.id, type: q.type, prompt: q.prompt, dispatch },
      reveal,
      dispatchedAt: result.qStartAt,
      perQuestionSec: state.perQSec,
      phase: 'OPEN',
    });

    // Thread version to next transition — lock job carries the version from OPEN transition
    await this.enqueueLockQuestion(sid, result.qIndex!, result.version!, state.perQSec);
  }

  private async processLockQuestion(data: LockQuestionData) {
    const { sid, expectedQIndex, expectedVersion } = data;

    const result = await this.redisState.transitionToLocked(sid, expectedQIndex, expectedVersion);
    if (!result.ok) {
      this.logger.debug(`lock-question no-op: ${sid} q${expectedQIndex} → ${result.reason}`);
      return;
    }

    await this.leaderboard.setQuestionState(sid, expectedQIndex, 'LOCKED');
    await this.closeOutQuestion(sid, expectedQIndex);
    await this.enqueueRevealLeaderboard(sid, expectedQIndex, result.version!);
  }

  private async processRevealLeaderboard(data: RevealLeaderboardData) {
    const { sid, qIndex, expectedVersion } = data;

    const result = await this.redisState.transitionToInterstitial(sid, qIndex, expectedVersion);
    if (!result.ok) {
      this.logger.debug(`reveal no-op: ${sid} q${qIndex} → ${result.reason}`);
      return;
    }

    await this.leaderboard.setQuestionState(sid, qIndex, 'INTERSTITIAL');

    const state = await this.redisState.getState(sid);
    if (!state) return;

    const questions = await this.redisState.getQuestions<RuntimeQuestion>(sid);
    const q = questions?.[qIndex];

    const top10 = await this.leaderboard.getTop(sid, 10);
    const all = await this.leaderboard.getAll(sid);

    this.server.to(`host:${sid}`).emit('host.fullLeaderboard', { rows: all });
    this.server.to(`host:${sid}`).emit('leaderboard.update', { top10 });

    const liveSockets = await this.server.in(`live:${sid}`).fetchSockets();
    for (const s of liveSockets) {
      const userId = (s.data?.user as AuthUser | undefined)?.id;
      if (!userId) continue;
      const rank = await this.leaderboard.getRank(sid, userId);
      const prevRank = await this.leaderboard.getPrevRank(sid, userId);
      const score = await this.leaderboard.getScore(sid, userId);
      const myAnswer = q
        ? await this.prisma.liveExamAnswer.findFirst({
            where: {
              questionId: q.id,
              participant: { sessionId: sid, userId },
            },
          })
        : null;
      s.emit('leaderboard.reveal', {
        top10,
        yourRank: rank,
        yourPrevRank: prevRank,
        yourDelta: prevRank && rank ? prevRank - rank : 0,
        yourScore: score,
        yourAwardedPoints: myAnswer?.awardedPoints ?? 0,
        yourIsCorrect: myAnswer?.isCorrect ?? false,
        interstitialSec: state.interSec,
      });
    }

    // Schedule next question after interstitial — thread version for CAS
    const nextIdx = qIndex + 1;
    await this.queue.add(
      'next-question',
      { sid, expectedQIndex: nextIdx, expectedVersion: result.version! } satisfies NextQuestionData,
      { jobId: `next-${sid}-${nextIdx}`, delay: state.interSec * 1000 },
    );
  }

  private async processDurationCap(data: DurationCapData) {
    const { sid } = data;
    const state = await this.redisState.getState(sid);
    if (!state || state.phase === 'ENDED') return;

    // Lock current question if still open
    if (state.phase === 'OPEN') {
      const lockResult = await this.redisState.transitionToLocked(sid, state.qIndex);
      if (lockResult.ok) {
        await this.leaderboard.setQuestionState(sid, state.qIndex, 'LOCKED');
        await this.closeOutQuestion(sid, state.qIndex);
      }
    }

    await this.finalizeExam(sid, 'duration_cap');
  }

  // ─── Shared logic ─────────────────────────────────

  async closeOutQuestionPublic(sid: string, qIndex: number) {
    return this.closeOutQuestion(sid, qIndex);
  }

  private async closeOutQuestion(sid: string, qIndex: number) {
    const questions = await this.redisState.getQuestions<RuntimeQuestion>(sid);
    const q = questions?.[qIndex];
    if (!q) return;

    const state = await this.redisState.getState(sid);
    if (!state) return;

    await this.leaderboard.capturePrevRanks(sid);

    const participants = await this.prisma.liveExamParticipant.findMany({
      where: { sessionId: sid },
    });
    const answered = await this.prisma.liveExamAnswer.findMany({
      where: { questionId: q.id },
    });
    const answeredIds = new Set(answered.map((a) => a.participantId));
    const missing = participants.filter((p) => !answeredIds.has(p.id));
    for (const p of missing) {
      await this.prisma.liveExamAnswer.create({
        data: {
          participantId: p.id,
          questionId: q.id,
          answerPayload: Prisma.JsonNull,
          isCorrect: false,
          answeredMs: state.perQSec * 1000,
          awardedPoints: 0,
        },
      });
    }

    const allAnswers = await this.prisma.liveExamAnswer.findMany({
      where: { questionId: q.id },
      include: { participant: true },
    });
    for (const a of allAnswers) {
      if (a.awardedPoints > 0) {
        await this.leaderboard.addPoints(sid, a.participant.userId, a.awardedPoints, true);
      } else {
        await this.leaderboard.addPoints(sid, a.participant.userId, 0, a.isCorrect);
      }
    }

    const reveal = buildRevealPayload(q.type, q.payload);
    this.server.to(`live:${sid}`).emit('exam.questionLocked', {
      index: qIndex,
      reveal,
      explanation: q.explanation,
    });
  }

  async finalizeExam(sid: string, reason: string, byUserId?: string) {
    const endResult = await this.redisState.transitionToEnded(sid);
    if (!endResult.ok && endResult.reason !== 'ALREADY_ENDED') return;

    await this.removeSessionJobs(sid);

    await this.prisma.liveExamSession.updateMany({
      where: { id: sid, status: LiveExamSessionStatus.LIVE },
      data: { status: LiveExamSessionStatus.ENDED, endedAt: new Date() },
    });
    await this.leaderboard.snapshot(sid);

    const finalTop3 = await this.prisma.liveExamParticipant.findMany({
      where: { sessionId: sid, finalRank: { lte: 3 } },
      orderBy: { finalRank: 'asc' },
    });

    const liveSockets = await this.server.in(`live:${sid}`).fetchSockets();
    for (const s of liveSockets) {
      const userId = (s.data?.user as AuthUser | undefined)?.id;
      if (!userId) continue;
      const me = await this.prisma.liveExamParticipant.findUnique({
        where: { sessionId_userId: { sessionId: sid, userId } },
      });
      s.emit('exam.ended', {
        reason,
        finalTop3,
        yourResult: me
          ? {
              finalScore: me.finalScore,
              finalRank: me.finalRank,
              correctCount: me.correctCount,
              wrongCount: me.wrongCount,
            }
          : null,
      });
    }
    this.server.to(`host:${sid}`).emit('exam.ended', { reason, finalTop3 });

    await this.prisma.liveExamEvent.create({
      data: {
        sessionId: sid,
        userId: byUserId ?? null,
        type: 'END',
        payload: { reason },
      },
    });

    await this.redisState.cleanup(sid);
  }
}
