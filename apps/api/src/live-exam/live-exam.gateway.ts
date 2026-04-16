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
import { AlbJwtService } from '../auth/alb-jwt.service';
import { AlbUserService } from '../auth/alb-user.service';
import { PrismaService } from '../prisma/prisma.service';
import { LiveExamService } from './live-exam.service';
import { LiveExamLeaderboardService } from './live-exam-leaderboard.service';
import { LiveExamScoringService } from './live-exam-scoring.service';
import { LiveExamRedisStateService } from './live-exam-redis-state.service';
import { LiveExamQueueService } from './live-exam-queue.service';
import {
  AnswerPayload,
  QuestionPayload,
  QuestionPayloadError,
  SentenceReorderAnswer,
  buildAnswerDisplay,
  buildDispatchPayload,
  buildRevealPayload,
  validateAnswerPayload,
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

  constructor(
    private readonly albJwtService: AlbJwtService,
    private readonly albUserService: AlbUserService,
    private readonly prisma: PrismaService,
    private readonly examService: LiveExamService,
    private readonly leaderboard: LiveExamLeaderboardService,
    private readonly scoring: LiveExamScoringService,
    private readonly redisState: LiveExamRedisStateService,
    private readonly queueService: LiveExamQueueService,
  ) {}

  onModuleDestroy() {
    // BullMQ handles cleanup via its own onModuleDestroy
  }

  afterInit(server: Server) {
    // Socket.IO Redis adapter is configured globally in main.ts via RedisIoAdapter.
    // Give the BullMQ worker access to the Socket.IO server for emitting events.
    this.queueService.setServer(server);

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

      // Mid-exam rejoin: read state from Redis instead of in-memory runtime
      const session = await this.prisma.liveExamSession.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      if (session?.status === LiveExamSessionStatus.ENDED) {
        socket.emit('exam.ended', { reason: 'session_already_ended' });
      } else if (session?.status === LiveExamSessionStatus.LIVE) {
        const liveRoom = `live:${sessionId}`;
        socket.join(liveRoom);

        const state = await this.redisState.getState(sessionId);
        if (state && state.phase !== 'ENDED') {
          socket.emit('exam.started', {
            serverStartAt: state.qStartAt,
            totalQuestions: state.totalQ,
          });

          const questions = await this.redisState.getQuestions<RuntimeQuestion>(sessionId);
          const q = questions?.[state.qIndex];
          if (q) {
            const dispatch = buildDispatchPayload(
              q.type,
              q.payload,
              q.shuffle ?? undefined,
            );
            socket.emit('exam.question', {
              index: state.qIndex,
              question: {
                id: q.id,
                type: q.type,
                prompt: q.prompt,
                dispatch,
              },
              dispatchedAt: state.qStartAt,
              perQuestionSec: state.perQSec,
              totalQuestions: state.totalQ,
              phase: state.phase,
            });
            if (state.phase !== 'OPEN') {
              const reveal = buildRevealPayload(q.type, q.payload);
              socket.emit('exam.questionLocked', {
                index: state.qIndex,
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

      // Acquire single-dispatch lock
      const nodeId = `${process.pid}-${Date.now()}`;
      const locked = await this.redisState.acquireStartLock(sessionId, nodeId);
      if (!locked) return { ok: false, error: 'ALREADY_STARTING' };

      // Write initial state and frozen questions to Redis
      await this.redisState.initState(sessionId, {
        totalQ: runtimeQuestions.length,
        perQSec: session.perQuestionSec,
        interSec: session.interstitialSec,
        durationSec: session.durationSec,
      });
      await this.redisState.setQuestions(sessionId, runtimeQuestions);

      // Move lobby sockets into live room
      const lobbyRoom = `lobby:${sessionId}`;
      const liveRoom = `live:${sessionId}`;
      const lobbySockets = await this.server.in(lobbyRoom).fetchSockets();
      for (const s of lobbySockets) {
        if (s.rooms.has(`host:${sessionId}`)) continue;
        s.join(liveRoom);
      }

      // Seed leaderboard
      const participants = await this.prisma.liveExamParticipant.findMany({
        where: { sessionId },
      });
      for (const p of participants) {
        await this.leaderboard.initParticipant(sessionId, p.userId, p.displayName);
      }

      this.server.to(liveRoom).emit('exam.started', {
        serverStartAt: Date.now(),
        totalQuestions: runtimeQuestions.length,
      });

      // Enqueue duration cap and first question via BullMQ
      // version=0 matches the INIT state written by initState()
      await this.queueService.enqueueDurationCap(sessionId, session.durationSec);
      await this.queueService.enqueueNextQuestion(sessionId, 0, 0);

      await this.prisma.liveExamEvent.create({
        data: { sessionId, userId: user.id, type: 'START' },
      });

      this.server.to('admin:global').emit('admin.sessionUpdate', {
        sessionId,
        status: 'LIVE',
        title: session.title,
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

    const state = await this.redisState.getState(sessionId);
    if (state && state.phase !== 'ENDED') {
      // Lock current question if open and grade unanswered players
      if (state.phase === 'OPEN') {
        const lockResult = await this.redisState.transitionToLocked(sessionId, state.qIndex);
        if (lockResult.ok) {
          await this.leaderboard.setQuestionState(sessionId, state.qIndex, 'LOCKED');
          await this.queueService.closeOutQuestionPublic(sessionId, state.qIndex);
        }
      }
      await this.queueService.finalizeExam(sessionId, 'host_force_end', user.id);
    } else {
      await this.examService.forceEnd(sessionId, user.id, { reason: 'host_force_end' });
      this.server.to(`lobby:${sessionId}`).emit('exam.ended', { reason: 'host_force_end' });
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

  // ─── Admin WS events ──────────────────────────────

  @SubscribeMessage('admin.watchAll')
  handleAdminWatchAll(@ConnectedSocket() socket: Socket) {
    const user = this.userOr401(socket);
    if (!user || user.role !== 'ADMIN') return { ok: false, error: 'FORBIDDEN' };
    socket.join('admin:global');
    return { ok: true };
  }

  @SubscribeMessage('admin.watch')
  async handleAdminWatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const user = this.userOr401(socket);
    if (!user || user.role !== 'ADMIN') return { ok: false, error: 'FORBIDDEN' };
    const sid = data.sessionId;
    socket.join(`lobby:${sid}`);
    socket.join(`host:${sid}`);
    socket.join(`live:${sid}`);
    const snapshot = await this.getLobbySnapshot(sid);
    socket.emit('lobby.state', snapshot);
    return { ok: true };
  }

  @SubscribeMessage('admin.forceEnd')
  async handleAdminForceEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const user = this.userOr401(socket);
    if (!user || user.role !== 'ADMIN') return { ok: false, error: 'FORBIDDEN' };
    const sessionId = data.sessionId;

    try {
      const state = await this.redisState.getState(sessionId);
      if (state && state.phase !== 'ENDED') {
        if (state.phase === 'OPEN') {
          const lockResult = await this.redisState.transitionToLocked(
            sessionId,
            state.qIndex,
          );
          if (lockResult.ok) {
            await this.leaderboard.setQuestionState(sessionId, state.qIndex, 'LOCKED');
            await this.queueService.closeOutQuestionPublic(sessionId, state.qIndex);
          }
        }
        await this.queueService.finalizeExam(sessionId, 'admin_force_end', user.id);
      } else {
        await this.examService.forceEnd(sessionId, user.id, { isAdmin: true });
        this.server
          .to(`lobby:${sessionId}`)
          .emit('exam.ended', { reason: 'admin_force_end' });
        this.server.to('admin:global').emit('admin.sessionUpdate', {
          sessionId,
          status: 'ENDED',
        });
      }

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
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

    // Read phase from Redis — source of truth
    const state = await this.redisState.getState(data.sessionId);
    if (!state) {
      socket.emit('exam.answerError', { code: 'NO_RUNTIME' });
      return;
    }
    if (state.phase !== 'OPEN') {
      socket.emit('exam.answerError', { code: 'PHASE_CLOSED' });
      return;
    }
    if (socket.rooms.has(`host:${data.sessionId}`)) {
      socket.emit('exam.answerError', { code: 'FORBIDDEN_ROLE' });
      return;
    }

    const questions = await this.redisState.getQuestions<RuntimeQuestion>(data.sessionId);
    if (!questions) {
      socket.emit('exam.answerError', { code: 'NO_RUNTIME' });
      return;
    }

    const currentQ = questions[state.qIndex];
    if (!currentQ || currentQ.id !== data.questionId) {
      socket.emit('exam.answerError', { code: 'STALE_QUESTION' });
      return;
    }

    // Check time window
    const now = Date.now();
    if (now > state.qEndAt) {
      socket.emit('exam.answerError', { code: 'PHASE_CLOSED' });
      return;
    }

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

    // Translate SENTENCE_REORDER shuffled positions to original indices
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

    const answeredMs = Math.max(0, now - state.qStartAt);
    const { isCorrect, awardedPoints } = this.scoring.gradeAndScore({
      type: currentQ.type,
      payload: currentQ.payload,
      answer: typedAnswer,
      answeredMs,
      perQuestionSec: state.perQSec,
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
      socket.emit('exam.answerError', { code: 'ALREADY_ANSWERED' });
      return;
    }

    socket.emit('exam.answerAck', { recorded: true, answeredMs });

    const totalPlayers = await this.prisma.liveExamParticipant.count({
      where: { sessionId: data.sessionId },
    });
    const answeredCount = await this.prisma.liveExamAnswer.count({
      where: { questionId: currentQ.id },
    });

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
    const albToken = socket.handshake.headers['x-amzn-oidc-data'] as string | undefined;
    const claims = await this.albJwtService.verify(albToken);
    if (!claims) throw new Error('Not authenticated');

    const user = await this.albUserService.resolveUser(claims);
    return { id: user.id, email: user.email, role: claims.role, displayName: user.displayName };
  }
}
