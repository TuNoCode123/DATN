import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  LiveExamQuestionType,
  LiveExamSessionStatus,
  Prisma,
} from '@prisma/client';
import { CognitoAuthService } from '../auth/cognito-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { LiveExamService } from './live-exam.service';
import { LiveExamLeaderboardService } from './live-exam-leaderboard.service';
import { LiveExamScoringService } from './live-exam-scoring.service';
import {
  AnswerPayload,
  DispatchPayload,
  QuestionPayload,
  QuestionPayloadError,
  RevealPayload,
  SentenceReorderAnswer,
  buildAnswerDisplay,
  buildDispatchPayload,
  buildRevealPayload,
  randomShufflePermutation,
  validateAnswerPayload,
  validateQuestionPayload,
} from './live-exam-question-types';

type ExamPhase = 'OPEN' | 'LOCKED' | 'INTERSTITIAL';

type AuthUser = {
  id: string;
  email: string;
  role: string;
  displayName?: string | null;
};

/**
 * In-memory runtime state for an active session. One RoomRuntime per
 * active session is held on whichever node first got the host.start
 * message. The Redis adapter fans socket events out to other nodes,
 * but the timer chain runs on exactly one node. Node failure recovery
 * is not implemented — see §14 of the original plan.
 *
 * For SENTENCE_REORDER questions we store the dispatch-time shuffle
 * permutation so:
 *   (a) players who rejoin mid-question see the same shuffled order
 *   (b) we can translate their submitted positions in the shuffled
 *       array back to original fragment indices for grading
 */
type RuntimeQuestion = {
  id: string;
  orderIndex: number;
  type: LiveExamQuestionType;
  prompt: string;
  payload: QuestionPayload;
  explanation: string | null;
  points: number;
  /**
   * Shuffle permutation used at dispatch time for SENTENCE_REORDER
   * questions. Generated fresh in `dispatchNextQuestion`. null for
   * other types (no shuffle needed).
   *
   * Semantics: `shuffle[shuffledIndex] = originalIndex`, i.e. element
   * at index `shuffledIndex` in the dispatched array corresponds to
   * fragment `payload.fragments[shuffle[shuffledIndex]]`.
   */
  shuffle: number[] | null;
};

type RoomRuntime = {
  sessionId: string;
  questions: RuntimeQuestion[];
  perQuestionSec: number;
  interstitialSec: number;
  durationSec: number;
  qIndex: number;
  phase: ExamPhase;
  qStartAt: number;
  timers: NodeJS.Timeout[];
  durationCap: NodeJS.Timeout | null;
};

@WebSocketGateway({
  namespace: '/live-exam',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class LiveExamGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger('LiveExamGateway');
  private readonly runtimes = new Map<string, RoomRuntime>();

  constructor(
    private readonly cognitoAuth: CognitoAuthService,
    private readonly prisma: PrismaService,
    private readonly examService: LiveExamService,
    private readonly leaderboard: LiveExamLeaderboardService,
    private readonly scoring: LiveExamScoringService,
  ) {}

  onModuleDestroy() {
    for (const r of this.runtimes.values()) this.cancelTimers(r);
  }

  // ─── Init — register auth as namespace middleware ──
  //
  // Auth MUST run as `server.use()` middleware, not inside handleConnection.
  // NestJS does not await handleConnection before @SubscribeMessage handlers
  // start firing, so doing async auth there creates a race: a client that
  // emits a message immediately after `connect` (e.g. the play page emitting
  // `lobby.join` on mount after a lobby→play navigation) can reach a handler
  // before `socket.data.user` is set, causing userOr401 to silently drop the
  // message and leave the player stuck on the WAITING screen. Middleware
  // registered via `server.use()` is awaited before the 'connect' handshake
  // completes, so by the time any handler runs the user is guaranteed set.
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const user = await this.authenticateSocket(socket);
        socket.data.user = user;
        next();
      } catch (err: any) {
        this.logger.warn(
          `[AUTH_FAIL] socket=${socket.id} reason=${err?.message ?? err}`,
        );
        next(new Error('Unauthorized'));
      }
    });
  }

  handleConnection(socket: Socket) {
    const u = socket.data?.user as AuthUser | undefined;
    if (u) this.logger.log(`[CONNECT] user=${u.id} socket=${socket.id}`);
  }

  async handleDisconnect(socket: Socket) {
    const u = socket.data?.user;
    if (u) this.logger.log(`[DISCONNECT] user=${u.id} socket=${socket.id}`);
  }

  // ─── Lobby ─────────────────────────────────────────

  @SubscribeMessage('lobby.join')
  async handleLobbyJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const user = this.userOr401(socket);
    if (!user) return;
    const sessionId = data.sessionId;

    try {
      const participant = await this.examService.join(
        sessionId,
        user.id,
        user.displayName ?? user.email,
      );
      const lobbyRoom = `lobby:${sessionId}`;
      socket.join(lobbyRoom);

      const snapshot = await this.getLobbySnapshot(sessionId);
      socket.emit('lobby.state', snapshot);
      socket.to(lobbyRoom).emit('lobby.playerJoined', {
        userId: user.id,
        displayName: participant.displayName,
      });

      // Mid-exam rejoin: the player navigated lobby → play (which tears down
      // the socket) and re-emitted lobby.join from the play page. At this
      // point the session is already LIVE, so the fresh socket must be put
      // into the live room and caught up to the current question, or it
      // will sit silent waiting for events that are only fanned out to
      // live:{id}.
      const session = await this.prisma.liveExamSession.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      if (session?.status === LiveExamSessionStatus.LIVE) {
        const liveRoom = `live:${sessionId}`;
        socket.join(liveRoom);

        const runtime = this.runtimes.get(sessionId);
        if (runtime) {
          socket.emit('exam.started', {
            serverStartAt: runtime.qStartAt,
            totalQuestions: runtime.questions.length,
          });
          const q = runtime.questions[runtime.qIndex];
          if (q) {
            const dispatch = buildDispatchPayload(
              q.type,
              q.payload,
              q.shuffle ?? undefined,
            );
            socket.emit('exam.question', {
              index: runtime.qIndex,
              question: {
                id: q.id,
                type: q.type,
                prompt: q.prompt,
                dispatch,
              },
              dispatchedAt: runtime.qStartAt,
              perQuestionSec: runtime.perQuestionSec,
              totalQuestions: runtime.questions.length,
              phase: runtime.phase,
            });
            if (runtime.phase !== 'OPEN') {
              const reveal = buildRevealPayload(q.type, q.payload);
              socket.emit('exam.questionLocked', {
                index: runtime.qIndex,
                reveal,
                explanation: q.explanation,
              });
            }
          }
        }
      }

      await this.prisma.liveExamEvent.create({
        data: {
          sessionId,
          userId: user.id,
          type: 'JOIN',
          payload: { displayName: participant.displayName },
        },
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage('lobby.leave')
  async handleLobbyLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const user = this.userOr401(socket);
    if (!user) return;
    const room = `lobby:${data.sessionId}`;
    socket.leave(room);
    socket.to(room).emit('lobby.playerLeft', { userId: user.id });
  }

  // ─── Host.watch — host joins host:{id} but NEVER live:{id} ──

  @SubscribeMessage('host.watch')
  async handleHostWatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const user = this.userOr401(socket);
    if (!user) return;
    const session = await this.prisma.liveExamSession.findUnique({
      where: { id: data.sessionId },
      select: { createdById: true },
    });
    if (!session || session.createdById !== user.id) {
      return { ok: false, error: 'FORBIDDEN' };
    }
    socket.join(`host:${data.sessionId}`);
    // Also join lobby so the host sees lobby state events.
    socket.join(`lobby:${data.sessionId}`);
    return { ok: true };
  }

  // ─── Host.start ───────────────────────────────────

  @SubscribeMessage('host.start')
  async handleHostStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const user = this.userOr401(socket);
    if (!user) return;
    const sessionId = data.sessionId;

    try {
      const session = await this.examService.start(sessionId, user.id);
      const questions = await this.prisma.liveExamSessionQuestion.findMany({
        where: { sessionId },
        orderBy: { orderIndex: 'asc' },
      });

      // Parse + validate each question payload up-front so we fail
      // fast on corrupt data rather than mid-exam.
      const runtimeQuestions: RuntimeQuestion[] = questions.map((q) => {
        const payload = validateQuestionPayload(
          q.type as LiveExamQuestionType,
          q.payload,
        );
        return {
          id: q.id,
          orderIndex: q.orderIndex,
          type: q.type as LiveExamQuestionType,
          prompt: q.prompt,
          payload,
          explanation: q.explanation,
          points: q.points,
          shuffle: null,
        };
      });

      // Move all lobby sockets into the live room.
      const lobbyRoom = `lobby:${sessionId}`;
      const liveRoom = `live:${sessionId}`;
      const lobbySockets = await this.server.in(lobbyRoom).fetchSockets();
      for (const s of lobbySockets) {
        const hostRoom = `host:${sessionId}`;
        if (s.rooms.has(hostRoom)) continue; // host watcher stays out
        s.join(liveRoom);
      }

      // Seed leaderboard with every participant.
      const participants = await this.prisma.liveExamParticipant.findMany({
        where: { sessionId },
      });
      for (const p of participants) {
        await this.leaderboard.initParticipant(
          sessionId,
          p.userId,
          p.displayName,
        );
      }

      const runtime: RoomRuntime = {
        sessionId,
        questions: runtimeQuestions,
        perQuestionSec: session.perQuestionSec,
        interstitialSec: session.interstitialSec,
        durationSec: session.durationSec,
        qIndex: -1,
        phase: 'OPEN',
        qStartAt: 0,
        timers: [],
        durationCap: null,
      };
      this.runtimes.set(sessionId, runtime);

      this.server.to(liveRoom).emit('exam.started', {
        serverStartAt: Date.now(),
        totalQuestions: runtimeQuestions.length,
      });

      // Hard cap: end the session unconditionally after durationSec.
      runtime.durationCap = setTimeout(() => {
        this.finalizeExam(runtime, 'duration_cap').catch((e) =>
          this.logger.error('duration cap finalize failed', e),
        );
      }, session.durationSec * 1000);

      await this.dispatchNextQuestion(runtime);

      await this.prisma.liveExamEvent.create({
        data: { sessionId, userId: user.id, type: 'START' },
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  // ─── Host.end ─────────────────────────────────────

  @SubscribeMessage('host.end')
  async handleHostEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const user = this.userOr401(socket);
    if (!user) return;
    const sessionId = data.sessionId;
    const runtime = this.runtimes.get(sessionId);
    if (runtime) {
      await this.closeOutCurrentQuestion(runtime, /* isForceEnd */ true);
      await this.finalizeExam(runtime, 'host_force_end', user.id);
    } else {
      // No runtime (e.g. still LOBBY) — delegate to service.
      await this.examService.forceEnd(sessionId, user.id, {
        reason: 'host_force_end',
      });
      this.server.to(`lobby:${sessionId}`).emit('exam.ended', {
        reason: 'host_force_end',
      });
    }
    return { ok: true };
  }

  // ─── Host.kick ────────────────────────────────────

  @SubscribeMessage('host.kick')
  async handleHostKick(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sessionId: string; userId: string },
  ) {
    const user = this.userOr401(socket);
    if (!user) return;
    const session = await this.prisma.liveExamSession.findUnique({
      where: { id: data.sessionId },
      select: { createdById: true, status: true },
    });
    if (!session || session.createdById !== user.id)
      return { ok: false, error: 'FORBIDDEN' };
    if (session.status !== LiveExamSessionStatus.LOBBY)
      return { ok: false, error: 'KICK_ONLY_IN_LOBBY' };

    await this.prisma.liveExamParticipant.deleteMany({
      where: { sessionId: data.sessionId, userId: data.userId },
    });
    this.server
      .to(`lobby:${data.sessionId}`)
      .emit('lobby.playerLeft', { userId: data.userId, kicked: true });
    await this.prisma.liveExamEvent.create({
      data: {
        sessionId: data.sessionId,
        userId: data.userId,
        type: 'KICK',
        payload: { byUserId: user.id },
      },
    });
    return { ok: true };
  }

  // ─── Answer submission ───────────────────────────

  @SubscribeMessage('exam.answer')
  async handleAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      sessionId: string;
      questionId: string;
      answer: unknown;
    },
  ) {
    const user = this.userOr401(socket);
    if (!user) return;

    const runtime = this.runtimes.get(data.sessionId);
    if (!runtime) {
      socket.emit('exam.answerError', { code: 'NO_RUNTIME' });
      return;
    }
    if (runtime.phase !== 'OPEN') {
      socket.emit('exam.answerError', { code: 'PHASE_CLOSED' });
      return;
    }
    // Host watcher cannot answer.
    if (socket.rooms.has(`host:${data.sessionId}`)) {
      socket.emit('exam.answerError', { code: 'FORBIDDEN_ROLE' });
      return;
    }

    const currentQ = runtime.questions[runtime.qIndex];
    if (!currentQ || currentQ.id !== data.questionId) {
      socket.emit('exam.answerError', { code: 'STALE_QUESTION' });
      return;
    }

    // Shape-validate the answer against the question type. On malformed
    // input, reject with a specific error code so the client can surface
    // it (though normally the client-side player widgets prevent this).
    let typedAnswer: AnswerPayload;
    try {
      typedAnswer = validateAnswerPayload(currentQ.type, data.answer);
    } catch (err) {
      socket.emit('exam.answerError', {
        code: 'INVALID_ANSWER',
        message: err instanceof QuestionPayloadError ? err.message : 'bad shape',
      });
      return;
    }

    // For SENTENCE_REORDER, the client sends positions in the
    // shuffled array it received; translate back to original indices
    // BEFORE persisting, so the answerPayload stored in Postgres lives
    // in the stable "original fragment index" space.
    if (currentQ.type === 'SENTENCE_REORDER' && currentQ.shuffle) {
      const a = typedAnswer as SentenceReorderAnswer;
      const shuffle = currentQ.shuffle;
      if (a.order.length !== shuffle.length) {
        socket.emit('exam.answerError', {
          code: 'INVALID_ANSWER',
          message: 'order length mismatch',
        });
        return;
      }
      const translated: number[] = [];
      for (const pos of a.order) {
        if (pos < 0 || pos >= shuffle.length) {
          socket.emit('exam.answerError', {
            code: 'INVALID_ANSWER',
            message: 'position out of range',
          });
          return;
        }
        translated.push(shuffle[pos]);
      }
      typedAnswer = { order: translated };
    }

    const participant = await this.prisma.liveExamParticipant.findUnique({
      where: {
        sessionId_userId: { sessionId: data.sessionId, userId: user.id },
      },
    });
    if (!participant) {
      socket.emit('exam.answerError', { code: 'NOT_PARTICIPANT' });
      return;
    }

    const answeredMs = Math.max(0, Date.now() - runtime.qStartAt);
    const { isCorrect, awardedPoints } = this.scoring.gradeAndScore({
      type: currentQ.type,
      payload: currentQ.payload,
      answer: typedAnswer,
      answeredMs,
      perQuestionSec: runtime.perQuestionSec,
      basePoints: currentQ.points,
    });

    try {
      await this.prisma.liveExamAnswer.create({
        data: {
          participantId: participant.id,
          questionId: currentQ.id,
          answerPayload: typedAnswer as unknown as Prisma.InputJsonValue,
          isCorrect,
          answeredMs,
          awardedPoints,
        },
      });
    } catch (err: any) {
      // Unique constraint = already answered.
      socket.emit('exam.answerError', { code: 'ALREADY_ANSWERED' });
      return;
    }

    // Answer is recorded but NOT yet scored into the leaderboard.
    // The ZSET is batch-updated in Phase 2 (closeOutCurrentQuestion).

    // Private ack — correctness is NOT revealed here.
    socket.emit('exam.answerAck', { recorded: true, answeredMs });

    // Host telemetry
    const totalPlayers = await this.prisma.liveExamParticipant.count({
      where: { sessionId: data.sessionId },
    });
    const answeredCount = await this.prisma.liveExamAnswer.count({
      where: { questionId: currentQ.id },
    });

    // Human-readable view of what the player picked/wrote, so the host
    // can see per-player answers in the console. We never reveal this
    // to players — it goes only to the host room.
    const display = buildAnswerDisplay(currentQ.type, currentQ.payload, typedAnswer);

    this.server.to(`host:${data.sessionId}`).emit('host.answerStream', {
      userId: user.id,
      displayName: participant.displayName,
      questionId: currentQ.id,
      answeredMs,
      answeredCount,
      totalPlayers,
      isCorrect,
      display,
    });
  }

  // ─── Phase loop engine ───────────────────────────

  private async dispatchNextQuestion(runtime: RoomRuntime) {
    runtime.qIndex++;
    if (runtime.qIndex >= runtime.questions.length) {
      await this.finalizeExam(runtime, 'all_questions_done');
      return;
    }

    const q = runtime.questions[runtime.qIndex];
    runtime.phase = 'OPEN';
    runtime.qStartAt = Date.now();

    // Shuffle fragments at dispatch time for SENTENCE_REORDER. The
    // permutation is stored on the runtime question so rejoining
    // players see the same shuffle and so we can translate answer
    // positions back to original indices at grading time.
    if (q.type === 'SENTENCE_REORDER') {
      const p = q.payload as { fragments: string[] };
      q.shuffle = randomShufflePermutation(p.fragments.length);
    } else {
      q.shuffle = null;
    }

    await this.leaderboard.setQuestionState(
      runtime.sessionId,
      runtime.qIndex,
      'OPEN',
      runtime.qStartAt,
    );

    const dispatch: DispatchPayload = buildDispatchPayload(
      q.type,
      q.payload,
      q.shuffle ?? undefined,
    );
    const reveal: RevealPayload = buildRevealPayload(q.type, q.payload);

    // Player-facing payload — no correct answer.
    this.server.to(`live:${runtime.sessionId}`).emit('exam.question', {
      index: runtime.qIndex,
      question: {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        dispatch,
      },
      dispatchedAt: runtime.qStartAt,
      perQuestionSec: runtime.perQuestionSec,
      totalQuestions: runtime.questions.length,
      phase: 'OPEN',
    });

    // Host-facing payload — includes the reveal so the host can
    // see the correct answer alongside the question.
    this.server.to(`host:${runtime.sessionId}`).emit('host.questionView', {
      index: runtime.qIndex,
      question: {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        dispatch,
      },
      reveal,
      dispatchedAt: runtime.qStartAt,
      perQuestionSec: runtime.perQuestionSec,
      phase: 'OPEN',
    });

    const t = setTimeout(() => {
      this.lockQuestion(runtime).catch((e) =>
        this.logger.error('lockQuestion failed', e),
      );
    }, runtime.perQuestionSec * 1000);
    runtime.timers.push(t);
  }

  private async lockQuestion(runtime: RoomRuntime) {
    if (runtime.phase !== 'OPEN') return;
    await this.closeOutCurrentQuestion(runtime, false);
  }

  /**
   * Finalize the current question: insert timeout rows for silent players,
   * batch-update the ZSET, emit `exam.questionLocked`, then schedule the
   * `INTERSTITIAL` reveal for the next tick.
   */
  private async closeOutCurrentQuestion(
    runtime: RoomRuntime,
    isForceEnd: boolean,
  ) {
    if (runtime.phase !== 'OPEN') return;
    runtime.phase = 'LOCKED';
    await this.leaderboard.setQuestionState(
      runtime.sessionId,
      runtime.qIndex,
      'LOCKED',
    );

    const q = runtime.questions[runtime.qIndex];
    if (!q) return;

    // Capture ranks BEFORE the ZSET update so delta arrows work.
    await this.leaderboard.capturePrevRanks(runtime.sessionId);

    // Insert timeout rows for any participant who did not answer.
    const participants = await this.prisma.liveExamParticipant.findMany({
      where: { sessionId: runtime.sessionId },
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
          answeredMs: runtime.perQuestionSec * 1000,
          awardedPoints: 0,
        },
      });
    }

    // Batch-apply ZSET updates for every answer on this question.
    const allAnswers = await this.prisma.liveExamAnswer.findMany({
      where: { questionId: q.id },
      include: { participant: true },
    });
    for (const a of allAnswers) {
      if (a.awardedPoints > 0) {
        await this.leaderboard.addPoints(
          runtime.sessionId,
          a.participant.userId,
          a.awardedPoints,
          true,
        );
      } else {
        await this.leaderboard.addPoints(
          runtime.sessionId,
          a.participant.userId,
          0,
          a.isCorrect,
        );
      }
    }

    const reveal = buildRevealPayload(q.type, q.payload);

    // Emit lock event with type-shaped reveal + explanation.
    this.server.to(`live:${runtime.sessionId}`).emit('exam.questionLocked', {
      index: runtime.qIndex,
      reveal,
      explanation: q.explanation,
    });

    if (isForceEnd) return; // finalizeExam will handle next steps

    const t = setTimeout(() => {
      this.revealLeaderboard(runtime).catch((e) =>
        this.logger.error('revealLeaderboard failed', e),
      );
    }, 0);
    runtime.timers.push(t);
  }

  private async revealLeaderboard(runtime: RoomRuntime) {
    runtime.phase = 'INTERSTITIAL';
    await this.leaderboard.setQuestionState(
      runtime.sessionId,
      runtime.qIndex,
      'INTERSTITIAL',
    );

    const top10 = await this.leaderboard.getTop(runtime.sessionId, 10);
    const all = await this.leaderboard.getAll(runtime.sessionId);
    const q = runtime.questions[runtime.qIndex];

    // Host-only full board
    this.server.to(`host:${runtime.sessionId}`).emit('host.fullLeaderboard', {
      rows: all,
    });
    this.server.to(`host:${runtime.sessionId}`).emit('leaderboard.update', {
      top10,
    });

    // Per-socket personalized reveal.
    const liveSockets = await this.server
      .in(`live:${runtime.sessionId}`)
      .fetchSockets();
    for (const s of liveSockets) {
      const userId = (s.data?.user as AuthUser | undefined)?.id;
      if (!userId) continue;
      const rank = await this.leaderboard.getRank(runtime.sessionId, userId);
      const prevRank = await this.leaderboard.getPrevRank(
        runtime.sessionId,
        userId,
      );
      const score = await this.leaderboard.getScore(runtime.sessionId, userId);
      const myAnswer = await this.prisma.liveExamAnswer.findFirst({
        where: {
          questionId: q.id,
          participant: { sessionId: runtime.sessionId, userId },
        },
      });
      s.emit('leaderboard.reveal', {
        top10,
        yourRank: rank,
        yourPrevRank: prevRank,
        yourDelta: prevRank && rank ? prevRank - rank : 0,
        yourScore: score,
        yourAwardedPoints: myAnswer?.awardedPoints ?? 0,
        yourIsCorrect: myAnswer?.isCorrect ?? false,
        interstitialSec: runtime.interstitialSec,
      });
    }

    const t = setTimeout(() => {
      this.dispatchNextQuestion(runtime).catch((e) =>
        this.logger.error('dispatchNextQuestion failed', e),
      );
    }, runtime.interstitialSec * 1000);
    runtime.timers.push(t);
  }

  // ─── Finalize ─────────────────────────────────────

  private async finalizeExam(
    runtime: RoomRuntime,
    reason: string,
    byUserId?: string,
  ) {
    if (!this.runtimes.has(runtime.sessionId)) return;
    this.cancelTimers(runtime);
    this.runtimes.delete(runtime.sessionId);

    await this.prisma.liveExamSession.updateMany({
      where: { id: runtime.sessionId, status: LiveExamSessionStatus.LIVE },
      data: { status: LiveExamSessionStatus.ENDED, endedAt: new Date() },
    });
    await this.leaderboard.snapshot(runtime.sessionId);

    const finalTop3 = await this.prisma.liveExamParticipant.findMany({
      where: { sessionId: runtime.sessionId, finalRank: { lte: 3 } },
      orderBy: { finalRank: 'asc' },
    });

    // Per-socket yourResult
    const liveSockets = await this.server
      .in(`live:${runtime.sessionId}`)
      .fetchSockets();
    for (const s of liveSockets) {
      const userId = (s.data?.user as AuthUser | undefined)?.id;
      if (!userId) continue;
      const me = await this.prisma.liveExamParticipant.findUnique({
        where: {
          sessionId_userId: { sessionId: runtime.sessionId, userId },
        },
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
    this.server.to(`host:${runtime.sessionId}`).emit('exam.ended', {
      reason,
      finalTop3,
    });

    await this.prisma.liveExamEvent.create({
      data: {
        sessionId: runtime.sessionId,
        userId: byUserId ?? null,
        type: 'END',
        payload: { reason },
      },
    });
  }

  private cancelTimers(runtime: RoomRuntime) {
    for (const t of runtime.timers) clearTimeout(t);
    runtime.timers = [];
    if (runtime.durationCap) {
      clearTimeout(runtime.durationCap);
      runtime.durationCap = null;
    }
  }

  // ─── Helpers ──────────────────────────────────────

  private userOr401(socket: Socket): AuthUser | null {
    const u = socket.data?.user as AuthUser | undefined;
    if (!u) {
      socket.emit('auth_error', { message: 'Not authenticated' });
      return null;
    }
    return u;
  }

  private async getLobbySnapshot(sessionId: string) {
    const participants = await this.prisma.liveExamParticipant.findMany({
      where: { sessionId },
      orderBy: { joinedAt: 'asc' },
    });
    return {
      players: participants.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        joinedAt: p.joinedAt,
      })),
      count: participants.length,
    };
  }

  private async authenticateSocket(socket: Socket): Promise<AuthUser> {
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = this.parseCookies(cookieHeader);
    const token = cookies['access_token'];
    if (!token) throw new Error('No authentication token');

    const payload = await this.cognitoAuth.verifyCognitoJwt(token);
    const user = await this.cognitoAuth.findOrCreateFromCognito(
      payload.sub,
      payload.email ?? payload.username ?? '',
      payload['cognito:groups'],
    );
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    };
  }

  private parseCookies(header?: string): Record<string, string> {
    if (!header) return {};
    return Object.fromEntries(
      header.split(';').map((c) => {
        const [key, ...val] = c.trim().split('=');
        return [key, val.join('=')];
      }),
    );
  }
}
