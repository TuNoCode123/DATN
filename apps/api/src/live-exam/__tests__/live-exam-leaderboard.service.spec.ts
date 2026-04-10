import Redis from 'ioredis';
import { LiveExamLeaderboardService } from '../live-exam-leaderboard.service';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Integration test hitting a real Redis (DB 15 to avoid trampling dev data).
 * Flushes the test DB between tests. Prisma is mocked — snapshot() persistence
 * is asserted via spies, not a live Postgres.
 */
describe('LiveExamLeaderboardService', () => {
  let redisClient: Redis;
  let redisService: RedisService;
  let prismaMock: Partial<PrismaService>;
  let svc: LiveExamLeaderboardService;

  const EXAM_ID = 'exam-test-1';
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });

  beforeAll(() => {
    // Separate DB for tests (15) so we don't touch dev data.
    process.env.REDIS_URL =
      process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  });

  beforeEach(async () => {
    await redisClient.flushdb();
    redisService = new RedisService();
    prismaMock = {
      liveExamParticipant: { updateMany } as any,
    } as any;
    svc = new LiveExamLeaderboardService(redisService, prismaMock as PrismaService);
    updateMany.mockClear();
  });

  afterEach(async () => {
    await (redisService as any).client.quit();
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  it('initParticipant seeds score=0 and metadata', async () => {
    await svc.initParticipant(EXAM_ID, 'u1', 'Alice');
    expect(await svc.getScore(EXAM_ID, 'u1')).toBe(0);
    const top = await svc.getTop(EXAM_ID, 10);
    expect(top).toHaveLength(1);
    expect(top[0]).toEqual(
      expect.objectContaining({ userId: 'u1', displayName: 'Alice', score: 0 }),
    );
  });

  it('addPoints accumulates across multiple calls', async () => {
    await svc.initParticipant(EXAM_ID, 'u1', 'Alice');
    await svc.addPoints(EXAM_ID, 'u1', 500, true);
    await svc.addPoints(EXAM_ID, 'u1', 250, true);
    expect(await svc.getScore(EXAM_ID, 'u1')).toBe(750);
  });

  it('getTop returns entries sorted descending by score', async () => {
    await svc.initParticipant(EXAM_ID, 'u1', 'Alice');
    await svc.initParticipant(EXAM_ID, 'u2', 'Bob');
    await svc.initParticipant(EXAM_ID, 'u3', 'Carol');
    await svc.addPoints(EXAM_ID, 'u1', 300, true);
    await svc.addPoints(EXAM_ID, 'u2', 900, true);
    await svc.addPoints(EXAM_ID, 'u3', 600, true);

    const top = await svc.getTop(EXAM_ID, 10);
    expect(top.map((r) => r.userId)).toEqual(['u2', 'u3', 'u1']);
    expect(top.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('getTop3 returns at most 3 rows', async () => {
    for (let i = 0; i < 5; i++) {
      await svc.initParticipant(EXAM_ID, `u${i}`, `User${i}`);
      await svc.addPoints(EXAM_ID, `u${i}`, (i + 1) * 100, true);
    }
    const podium = await svc.getTop3(EXAM_ID);
    expect(podium).toHaveLength(3);
    expect(podium[0].userId).toBe('u4');
    expect(podium[2].userId).toBe('u2');
  });

  it('getRank is 1-indexed and null for unknown users', async () => {
    await svc.initParticipant(EXAM_ID, 'u1', 'Alice');
    await svc.initParticipant(EXAM_ID, 'u2', 'Bob');
    await svc.addPoints(EXAM_ID, 'u2', 100, true);
    expect(await svc.getRank(EXAM_ID, 'u2')).toBe(1);
    expect(await svc.getRank(EXAM_ID, 'u1')).toBe(2);
    expect(await svc.getRank(EXAM_ID, 'ghost')).toBeNull();
  });

  it('addPoints tracks correct/wrong counts in meta', async () => {
    await svc.initParticipant(EXAM_ID, 'u1', 'Alice');
    await svc.addPoints(EXAM_ID, 'u1', 500, true);
    await svc.addPoints(EXAM_ID, 'u1', 0, false);
    await svc.addPoints(EXAM_ID, 'u1', 300, true);
    const [row] = await svc.getTop(EXAM_ID, 10);
    expect(row.correct).toBe(2);
    expect(row.wrong).toBe(1);
  });

  it('capturePrevRanks stores the pre-update rank for every participant', async () => {
    await svc.initParticipant(EXAM_ID, 'u1', 'Alice');
    await svc.initParticipant(EXAM_ID, 'u2', 'Bob');
    await svc.addPoints(EXAM_ID, 'u1', 500, true);
    await svc.addPoints(EXAM_ID, 'u2', 300, true);
    await svc.capturePrevRanks(EXAM_ID);
    expect(await svc.getPrevRank(EXAM_ID, 'u1')).toBe(1);
    expect(await svc.getPrevRank(EXAM_ID, 'u2')).toBe(2);
  });

  it('concurrency: 100 parallel addPoints calls produce a correct cumulative sum', async () => {
    await svc.initParticipant(EXAM_ID, 'u1', 'Alice');
    const ops = Array.from({ length: 100 }, () =>
      svc.addPoints(EXAM_ID, 'u1', 10, true),
    );
    await Promise.all(ops);
    expect(await svc.getScore(EXAM_ID, 'u1')).toBe(1000);
  });

  it('snapshot persists finalScore/finalRank into Prisma and clears Redis', async () => {
    await svc.initParticipant(EXAM_ID, 'u1', 'Alice');
    await svc.initParticipant(EXAM_ID, 'u2', 'Bob');
    await svc.addPoints(EXAM_ID, 'u1', 800, true);
    await svc.addPoints(EXAM_ID, 'u2', 500, true);

    await svc.snapshot(EXAM_ID);

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: EXAM_ID, userId: 'u1' },
        data: expect.objectContaining({ finalScore: 800, finalRank: 1, correctCount: 1 }),
      }),
    );

    // Redis should be wiped
    const all = await svc.getAll(EXAM_ID);
    expect(all).toHaveLength(0);
  });

  it('setQuestionState and getQuestionState round-trip phase + qindex + qstart', async () => {
    const started = Date.now();
    await svc.setQuestionState(EXAM_ID, 3, 'OPEN', started);
    const state = await svc.getQuestionState(EXAM_ID);
    expect(state.qindex).toBe(3);
    expect(state.phase).toBe('OPEN');
    expect(state.qstart).toBe(started);
  });
});
