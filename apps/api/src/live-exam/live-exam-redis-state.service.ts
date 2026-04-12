import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export type ExamPhase = 'INIT' | 'OPEN' | 'LOCKED' | 'INTERSTITIAL' | 'ENDED';

export interface ExamState {
  phase: ExamPhase;
  qIndex: number;
  qStartAt: number;
  qEndAt: number;
  totalQ: number;
  perQSec: number;
  interSec: number;
  durationSec: number;
  version: number;
}

export interface TransitionResult {
  ok: boolean;
  reason?: string;
  qIndex?: number;
  qStartAt?: number;
  qEndAt?: number;
  version?: number;
}

const KEYS = {
  state: (sid: string) => `exam:${sid}:state`,
  questions: (sid: string) => `exam:${sid}:questions`,
  lockStart: (sid: string) => `exam:${sid}:lock:start`,
};

const TTL = 6 * 3600; // 6 hours

// ─── Lua Scripts ────────────────────────────────────────────────────

const TRANSITION_TO_OPEN_LUA = `
local cur     = redis.call('HMGET', KEYS[1], 'qIndex', 'phase', 'version', 'totalQ', 'perQSec')
local qIndex  = tonumber(cur[1]) or -1
local phase   = cur[2]
local version = tonumber(cur[3]) or 0
local totalQ  = tonumber(cur[4]) or 0
local perQSec = tonumber(cur[5]) or 0

local nextIdx         = tonumber(ARGV[1])
local now             = tonumber(ARGV[2])
local expectedVersion = tonumber(ARGV[3]) or 0

-- Terminal guard: never resurrect a finished exam
if phase == 'ENDED' then
  return {0, 'ALREADY_ENDED'}
end

-- Phase whitelist: only INIT or INTERSTITIAL may transition to OPEN
if phase ~= 'INIT' and phase ~= 'INTERSTITIAL' then
  return {0, 'INVALID_PHASE'}
end

-- Strict qIndex: INIT must start at 0, INTERSTITIAL must increment by 1
if phase == 'INIT' and nextIdx ~= 0 then
  return {0, 'MUST_START_AT_0'}
end
if phase == 'INTERSTITIAL' and nextIdx ~= qIndex + 1 then
  return {0, 'MUST_INCREMENT_BY_1'}
end

-- CAS: reject stale jobs (skip check when expectedVersion=0 for backwards compat)
if expectedVersion > 0 and version ~= expectedVersion then
  return {0, 'VERSION_MISMATCH'}
end

if nextIdx >= totalQ then
  redis.call('HSET', KEYS[1], 'phase', 'ENDED', 'version', version + 1)
  return {0, 'ENDED'}
end

local perMs  = perQSec * 1000
local qEndAt = now + perMs

redis.call('HSET', KEYS[1],
  'phase',    'OPEN',
  'qIndex',   nextIdx,
  'qStartAt', now,
  'qEndAt',   qEndAt,
  'version',  version + 1)

return {1, tostring(nextIdx), tostring(now), tostring(qEndAt), tostring(version + 1)}
`;

const TRANSITION_TO_LOCKED_LUA = `
local cur     = redis.call('HMGET', KEYS[1], 'qIndex', 'phase', 'version')
local qIndex  = tonumber(cur[1]) or -1
local phase   = cur[2]
local version = tonumber(cur[3]) or 0

local expected        = tonumber(ARGV[1])
local expectedVersion = tonumber(ARGV[2]) or 0

-- Terminal guard
if phase == 'ENDED' then
  return {0, 'ALREADY_ENDED'}
end

-- Already locked for this question — idempotent success
if phase == 'LOCKED' and qIndex == expected then
  return {0, 'ALREADY_LOCKED'}
end

-- Phase whitelist: only OPEN may transition to LOCKED
if phase ~= 'OPEN' then
  return {0, 'INVALID_PHASE'}
end

if qIndex ~= expected then
  return {0, 'STALE'}
end

-- CAS
if expectedVersion > 0 and version ~= expectedVersion then
  return {0, 'VERSION_MISMATCH'}
end

redis.call('HSET', KEYS[1],
  'phase',   'LOCKED',
  'version', version + 1)

return {1, tostring(version + 1)}
`;

const TRANSITION_TO_INTERSTITIAL_LUA = `
local cur     = redis.call('HMGET', KEYS[1], 'qIndex', 'phase', 'version')
local qIndex  = tonumber(cur[1]) or -1
local phase   = cur[2]
local version = tonumber(cur[3]) or 0

local expected        = tonumber(ARGV[1])
local expectedVersion = tonumber(ARGV[2]) or 0

-- Terminal guard
if phase == 'ENDED' then
  return {0, 'ALREADY_ENDED'}
end

-- Already in interstitial for this question — idempotent
if phase == 'INTERSTITIAL' and qIndex == expected then
  return {0, 'ALREADY_INTERSTITIAL'}
end

-- Phase whitelist: only LOCKED may transition to INTERSTITIAL
if phase ~= 'LOCKED' then
  return {0, 'INVALID_PHASE'}
end

if qIndex ~= expected then
  return {0, 'STALE'}
end

-- CAS
if expectedVersion > 0 and version ~= expectedVersion then
  return {0, 'VERSION_MISMATCH'}
end

redis.call('HSET', KEYS[1],
  'phase',   'INTERSTITIAL',
  'version', version + 1)

return {1, tostring(version + 1)}
`;

const TRANSITION_TO_ENDED_LUA = `
local cur     = redis.call('HMGET', KEYS[1], 'phase', 'version')
local phase   = cur[1]
local version = tonumber(cur[2]) or 0

if phase == 'ENDED' then
  return {0, 'ALREADY_ENDED'}
end

redis.call('HSET', KEYS[1],
  'phase',   'ENDED',
  'version', version + 1)

return {1, tostring(version + 1)}
`;

@Injectable()
export class LiveExamRedisStateService implements OnModuleInit {
  private readonly logger = new Logger('LiveExamRedisState');
  private shaOpen!: string;
  private shaLocked!: string;
  private shaInterstitial!: string;
  private shaEnded!: string;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    const client = this.redis.getClient();
    [this.shaOpen, this.shaLocked, this.shaInterstitial, this.shaEnded] =
      await Promise.all([
        client.script('LOAD', TRANSITION_TO_OPEN_LUA) as Promise<string>,
        client.script('LOAD', TRANSITION_TO_LOCKED_LUA) as Promise<string>,
        client.script('LOAD', TRANSITION_TO_INTERSTITIAL_LUA) as Promise<string>,
        client.script('LOAD', TRANSITION_TO_ENDED_LUA) as Promise<string>,
      ]);
    this.logger.log('Lua scripts loaded');
  }

  async acquireStartLock(sid: string, nodeId: string): Promise<boolean> {
    const client = this.redis.getClient();
    const ok = await client.set(KEYS.lockStart(sid), nodeId, 'EX', 60, 'NX');
    return ok === 'OK';
  }

  async initState(
    sid: string,
    opts: { totalQ: number; perQSec: number; interSec: number; durationSec: number },
  ): Promise<void> {
    const client = this.redis.getClient();
    await client.hmset(KEYS.state(sid), {
      phase: 'INIT',
      qIndex: '-1',
      qStartAt: '0',
      qEndAt: '0',
      totalQ: String(opts.totalQ),
      perQSec: String(opts.perQSec),
      interSec: String(opts.interSec),
      durationSec: String(opts.durationSec),
      version: '0',
    });
    await client.expire(KEYS.state(sid), TTL);
  }

  async setQuestions(sid: string, questions: unknown[]): Promise<void> {
    const client = this.redis.getClient();
    await client.set(KEYS.questions(sid), JSON.stringify(questions), 'EX', TTL);
  }

  async getQuestions<T = unknown>(sid: string): Promise<T[] | null> {
    const client = this.redis.getClient();
    const raw = await client.get(KEYS.questions(sid));
    return raw ? JSON.parse(raw) : null;
  }

  async getState(sid: string): Promise<ExamState | null> {
    const client = this.redis.getClient();
    const raw = await client.hgetall(KEYS.state(sid));
    if (!raw || !raw.phase) return null;
    return {
      phase: raw.phase as ExamPhase,
      qIndex: Number(raw.qIndex),
      qStartAt: Number(raw.qStartAt),
      qEndAt: Number(raw.qEndAt),
      totalQ: Number(raw.totalQ),
      perQSec: Number(raw.perQSec),
      interSec: Number(raw.interSec),
      durationSec: Number(raw.durationSec),
      version: Number(raw.version),
    };
  }

  async transitionToOpen(
    sid: string,
    expectedQIndex: number,
    expectedVersion = 0,
  ): Promise<TransitionResult> {
    const client = this.redis.getClient();

    const result = (await client.evalsha(
      this.shaOpen,
      1,
      KEYS.state(sid),
      String(expectedQIndex),
      String(Date.now()),
      String(expectedVersion),
    )) as (string | number)[];

    if (Number(result[0]) === 0) {
      return { ok: false, reason: String(result[1]) };
    }
    return {
      ok: true,
      qIndex: Number(result[1]),
      qStartAt: Number(result[2]),
      qEndAt: Number(result[3]),
      version: Number(result[4]),
    };
  }

  async transitionToLocked(
    sid: string,
    expectedQIndex: number,
    expectedVersion = 0,
  ): Promise<TransitionResult> {
    const client = this.redis.getClient();
    const result = (await client.evalsha(
      this.shaLocked,
      1,
      KEYS.state(sid),
      String(expectedQIndex),
      String(expectedVersion),
    )) as (string | number)[];

    if (Number(result[0]) === 0) {
      return { ok: false, reason: String(result[1]) };
    }
    return { ok: true, version: Number(result[1]) };
  }

  async transitionToInterstitial(
    sid: string,
    expectedQIndex: number,
    expectedVersion = 0,
  ): Promise<TransitionResult> {
    const client = this.redis.getClient();
    const result = (await client.evalsha(
      this.shaInterstitial,
      1,
      KEYS.state(sid),
      String(expectedQIndex),
      String(expectedVersion),
    )) as (string | number)[];

    if (Number(result[0]) === 0) {
      return { ok: false, reason: String(result[1]) };
    }
    return { ok: true, version: Number(result[1]) };
  }

  async transitionToEnded(sid: string): Promise<TransitionResult> {
    const client = this.redis.getClient();
    const result = (await client.evalsha(
      this.shaEnded,
      1,
      KEYS.state(sid),
    )) as (string | number)[];

    if (Number(result[0]) === 0) {
      return { ok: false, reason: String(result[1]) };
    }
    return { ok: true, version: Number(result[1]) };
  }

  async cleanup(sid: string): Promise<void> {
    const client = this.redis.getClient();
    await Promise.all([
      client.del(KEYS.state(sid)),
      client.del(KEYS.questions(sid)),
      client.del(KEYS.lockStart(sid)),
    ]);
  }
}
