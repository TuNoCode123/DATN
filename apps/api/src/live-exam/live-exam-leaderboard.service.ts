import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

const KEY = {
  board: (examId: string) => `liveexam:${examId}:board`,
  meta: (examId: string, uid: string) => `liveexam:${examId}:meta:${uid}`,
  lobby: (examId: string) => `liveexam:${examId}:lobby`,
  qstart: (examId: string) => `liveexam:${examId}:qstart`,
  qphase: (examId: string) => `liveexam:${examId}:qphase`,
  qindex: (examId: string) => `liveexam:${examId}:qindex`,
  prevRank: (examId: string, uid: string) => `liveexam:${examId}:prevRank:${uid}`,
};

export type LeaderboardRow = {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  correct: number;
  wrong: number;
};

/**
 * Redis ZSET-backed leaderboard.
 * ZSET score = points, member = userId.
 * Metadata (displayName, correctCount, wrongCount) lives in a parallel HASH.
 */
@Injectable()
export class LiveExamLeaderboardService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /** Initialise a participant's row with score=0 and metadata. */
  async initParticipant(
    examId: string,
    userId: string,
    displayName: string,
  ): Promise<void> {
    const client = this.redis.getClient();
    await client.zadd(KEY.board(examId), 'NX', 0, userId);
    await client.hset(KEY.meta(examId, userId), {
      displayName,
      correct: '0',
      wrong: '0',
    });
  }

  async addPoints(
    examId: string,
    userId: string,
    delta: number,
    wasCorrect: boolean,
  ): Promise<number> {
    const client = this.redis.getClient();
    const newScore = await client.zincrby(KEY.board(examId), delta, userId);
    await client.hincrby(KEY.meta(examId, userId), wasCorrect ? 'correct' : 'wrong', 1);
    return Number(newScore);
  }

  async getRank(examId: string, userId: string): Promise<number | null> {
    const client = this.redis.getClient();
    const rank = await client.zrevrank(KEY.board(examId), userId);
    return rank === null ? null : rank + 1;
  }

  async getScore(examId: string, userId: string): Promise<number> {
    const client = this.redis.getClient();
    const s = await client.zscore(KEY.board(examId), userId);
    return s ? Number(s) : 0;
  }

  async getTop(examId: string, n = 10): Promise<LeaderboardRow[]> {
    const client = this.redis.getClient();
    const raw = await client.zrevrange(KEY.board(examId), 0, n - 1, 'WITHSCORES');
    const rows: LeaderboardRow[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const userId = raw[i];
      const score = Number(raw[i + 1]);
      const meta = await client.hgetall(KEY.meta(examId, userId));
      rows.push({
        rank: i / 2 + 1,
        userId,
        displayName: meta.displayName ?? 'Player',
        score,
        correct: Number(meta.correct ?? 0),
        wrong: Number(meta.wrong ?? 0),
      });
    }
    return rows;
  }

  async getTop3(examId: string): Promise<LeaderboardRow[]> {
    return this.getTop(examId, 3);
  }

  async getAll(examId: string): Promise<LeaderboardRow[]> {
    const client = this.redis.getClient();
    const total = await client.zcard(KEY.board(examId));
    return this.getTop(examId, total);
  }

  async capturePrevRanks(examId: string): Promise<void> {
    const client = this.redis.getClient();
    const all = await client.zrevrange(KEY.board(examId), 0, -1);
    const pipe = client.pipeline();
    all.forEach((uid, idx) => {
      pipe.set(KEY.prevRank(examId, uid), String(idx + 1));
    });
    await pipe.exec();
  }

  async getPrevRank(examId: string, userId: string): Promise<number | null> {
    const v = await this.redis.get(KEY.prevRank(examId, userId));
    return v ? Number(v) : null;
  }

  async setQuestionState(
    examId: string,
    qindex: number,
    phase: 'OPEN' | 'LOCKED' | 'INTERSTITIAL',
    startedAt?: number,
  ): Promise<void> {
    const client = this.redis.getClient();
    await client.set(KEY.qindex(examId), String(qindex));
    await client.set(KEY.qphase(examId), phase);
    if (startedAt !== undefined) {
      await client.set(KEY.qstart(examId), String(startedAt));
    }
  }

  async getQuestionState(examId: string): Promise<{
    qindex: number | null;
    phase: string | null;
    qstart: number | null;
  }> {
    const client = this.redis.getClient();
    const [qindex, phase, qstart] = await Promise.all([
      client.get(KEY.qindex(examId)),
      client.get(KEY.qphase(examId)),
      client.get(KEY.qstart(examId)),
    ]);
    return {
      qindex: qindex !== null ? Number(qindex) : null,
      phase,
      qstart: qstart !== null ? Number(qstart) : null,
    };
  }

  /**
   * Persist final ranks/scores to Postgres and clear all Redis keys for the session.
   */
  async snapshot(sessionId: string): Promise<void> {
    const client = this.redis.getClient();
    const all = await this.getAll(sessionId);

    // Persist finalScore/finalRank/correctCount/wrongCount
    for (const row of all) {
      await this.prisma.liveExamParticipant.updateMany({
        where: { sessionId, userId: row.userId },
        data: {
          finalScore: row.score,
          finalRank: row.rank,
          correctCount: row.correct,
          wrongCount: row.wrong,
        },
      });
    }

    // Wipe all keys for this session
    const patterns = [
      KEY.board(sessionId),
      KEY.lobby(sessionId),
      KEY.qstart(sessionId),
      KEY.qphase(sessionId),
      KEY.qindex(sessionId),
    ];
    await Promise.all(patterns.map((k) => client.del(k)));

    // Meta + prevRank use scan-and-delete (bounded by participant count)
    for (const row of all) {
      await client.del(KEY.meta(sessionId, row.userId));
      await client.del(KEY.prevRank(sessionId, row.userId));
    }
  }
}
