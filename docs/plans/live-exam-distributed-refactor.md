# Live Exam → Multi-Instance Refactor Plan

> Refactor `apps/api/src/live-exam/live-exam.gateway.ts` from an in-memory state machine to a distributed, production-safe architecture using Redis (source of truth) + BullMQ (timing) + Socket.IO Redis adapter (broadcast).

## Current State (mapped from code)

- `live-exam.gateway.ts` holds `runtimes: Map<string, RoomRuntime>` (line 111).
- `RoomRuntime` carries `phase`, `qIndex`, `qStartAt`, `timers[]`, `durationCap`.
- Phase loop driven by `setTimeout` chains at lines 367, 660, 752, 811.
- `live-exam-leaderboard.service.ts` already uses some Redis keys (`liveexam:{sid}:qindex`, `:qphase`, `:qstart`) but they're written *after* in-memory state, not as the source of truth.
- No BullMQ in the project yet.
- Prisma `LiveExamAnswer` has `unique(participantId, questionId)` — keep as the answer-idempotency boundary.

## Problems

- `runtime.phase` is in memory → inconsistent across instances.
- `setTimeout` runs on every node that holds the runtime → duplicate lock/reveal.
- Race conditions when multiple nodes process the same session.
- No atomic guarantee for phase transitions.

---

## 1. Architecture Overview

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Node A      │   │  Node B      │   │  Node C      │
│  Gateway     │   │  Gateway     │   │  Gateway     │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │
       └────────┬─────────┴─────────┬────────┘
                │                   │
        ┌───────▼────────┐  ┌───────▼────────┐
        │ Redis (state + │  │ Redis pub/sub  │
        │ Lua + ZSET)    │  │ (SIO adapter)  │
        └───────┬────────┘  └────────────────┘
                │
        ┌───────▼────────┐
        │ BullMQ worker  │  ← lock / reveal / next jobs
        │ (1+ instances) │
        └────────────────┘
```

Three responsibilities split:

- **Redis** = source of truth for `phase`, `qIndex`, `qStartAt`, `qEndAt`, frozen question list.
- **BullMQ** = the *only* thing that fires phase transitions (replaces every `setTimeout`). Jobs use **deterministic jobIds** so duplicates collapse.
- **Socket.IO Redis adapter** = fan-out. Whichever node the BullMQ worker runs on emits via `server.to(room).emit(...)` and clients on every node receive it.

**Key principle:** only the BullMQ worker writes phase/qIndex. Gateways (the things players connect to) only *read* state and *enqueue* the initial `host.start` job. This eliminates the "two nodes both fire `lockQuestion`" class of bug entirely.

---

## 2. Redis Schema

Single hash per session for hot state, plus a few discrete keys:

```
exam:{sid}:state    HASH {
  phase      : OPEN | LOCKED | INTERSTITIAL | ENDED
  qIndex     : 0..N-1
  qStartAt   : unix ms
  qEndAt     : unix ms              # qStartAt + perQuestionSec*1000
  totalQ     : N
  perQSec    : 20
  interSec   : 5
  version    : monotonic counter    # bumped on every transition (CAS guard)
}
exam:{sid}:questions  STRING (JSON)  # frozen snapshot built at host.start
exam:{sid}:lock:start STRING NX EX 60  # SETNX guard for host.start (single dispatch)
```

Keep the existing `liveexam:{sid}:board` ZSET. Pick one prefix (`exam:` or `liveexam:`) and rename in step 4 for consistency.

**Why one HASH:** lets you read all hot state in one `HGETALL` (~0.2ms) and mutate atomically inside a Lua script. No multi-key races.

**TTL:** 6h on every key at creation; explicit cleanup on `exam.ended`.

---

## 3. Refactored Flow (before / after)

### `host.start` (gateway.ts:290)

**Before:** builds `RoomRuntime`, stores in Map, calls `dispatchNextQuestion()` which sets `setTimeout(lockQuestion, perQ)`.

**After:**
```ts
// Acquire single-dispatch lock
const ok = await redis.set(`exam:${sid}:lock:start`, nodeId, 'NX', 'EX', 60);
if (!ok) return; // another node already started this session

// Freeze questions, write initial state
await redis.hset(`exam:${sid}:state`, {
  phase: 'INIT', qIndex: -1, totalQ: questions.length,
  perQSec, interSec, version: 0,
});
await redis.set(`exam:${sid}:questions`, JSON.stringify(questions), 'EX', 21600);

// Enqueue first dispatch — deterministic jobId
await examQueue.add('next-question',
  { sid, expectedQIndex: 0 },
  { jobId: `next:${sid}:0`, removeOnComplete: true },
);
```

The `jobId: next:${sid}:0` is the duplicate guard — BullMQ rejects a second job with the same id.

### `dispatchNextQuestion` → BullMQ `next-question` worker

```ts
worker.process('next-question', async (job) => {
  const { sid, expectedQIndex } = job.data;

  const result = await transitionToOpen(redis, sid, expectedQIndex); // Lua, see §4
  if (!result.ok) return; // version mismatch — another worker advanced. No-op.

  const { qIndex, qStartAt, qEndAt } = result;
  const question = await loadQuestion(sid, qIndex); // from JSON snapshot

  io.to(`live:${sid}`).emit('exam.question', { qIndex, qStartAt, qEndAt, question });
  io.to(`host:${sid}`).emit('host.questionView', { ...withReveal });

  // Schedule lock — delayed job, deterministic id
  await examQueue.add('lock-question',
    { sid, expectedQIndex: qIndex },
    { jobId: `lock:${sid}:${qIndex}`, delay: perQSec * 1000, removeOnComplete: true },
  );
});
```

`lock-question` worker: runs `transitionToLocked`, emits `exam.questionLocked`, enqueues `reveal-leaderboard` (delay 0 or inline).
`reveal-leaderboard` worker: runs `transitionToInterstitial`, emits `leaderboard.reveal`, then enqueues the next `next-question` with `delay: interSec * 1000`.

### `handleAnswer` (gateway.ts:447) — stays on the gateway

```ts
async handleAnswer(client, payload) {
  const state = await redis.hgetall(`exam:${sid}:state`);
  if (state.phase !== 'OPEN') return ack({ ok: false, reason: 'CLOSED' });
  if (Number(payload.qIndex) !== Number(state.qIndex)) return ack({ ok: false, reason: 'STALE' });

  const now = Date.now();
  if (now > Number(state.qEndAt)) return ack({ ok: false, reason: 'LATE' });

  // Existing DB write — unique(participantId, questionId) handles double-submit
  await examService.recordAnswer(...);
  await leaderboard.applyScore(...);
  ack({ ok: true });
}
```

No more reading `runtime.phase`. Just `HGETALL` + integer compares. Sub-millisecond on local Redis.

> If `HGETALL` per answer ever feels heavy on huge rooms, cache `state` in process for ~250ms. Only after measuring. 1k answers/sec on a single Redis is not a problem.

---

## 4. Atomic Transitions (Lua)

The point of Lua here is **CAS on `version`**: a worker only transitions if the state it observed is still current. Otherwise it's a safe no-op — solving "two workers fire the same lock" cleanly.

```lua
-- transition_to_open.lua
-- KEYS[1] = exam:{sid}:state
-- ARGV[1] = expectedQIndex
-- ARGV[2] = perQSec
-- ARGV[3] = now (ms)
-- ARGV[4] = totalQ

local cur     = redis.call('HMGET', KEYS[1], 'qIndex', 'phase', 'version', 'totalQ')
local qIndex  = tonumber(cur[1]) or -1
local phase   = cur[2]
local version = tonumber(cur[3]) or 0
local totalQ  = tonumber(cur[4]) or tonumber(ARGV[4])

local nextIdx = tonumber(ARGV[1])

-- Already advanced past this question? no-op
if qIndex >= nextIdx and phase ~= 'INIT' then
  return {0, 'ALREADY_ADVANCED'}
end

-- End of exam
if nextIdx >= totalQ then
  redis.call('HSET', KEYS[1], 'phase', 'ENDED', 'version', version + 1)
  return {0, 'ENDED'}
end

local now    = tonumber(ARGV[3])
local perMs  = tonumber(ARGV[2]) * 1000
local qEndAt = now + perMs

redis.call('HSET', KEYS[1],
  'phase',    'OPEN',
  'qIndex',   nextIdx,
  'qStartAt', now,
  'qEndAt',   qEndAt,
  'version',  version + 1)

return {1, nextIdx, now, qEndAt}
```

`transition_to_locked.lua` is the same shape: only flip `OPEN → LOCKED` if `phase=='OPEN' AND qIndex==expected`. Same for `LOCKED → INTERSTITIAL`. Each script is ~15 lines.

Load once on boot:
```ts
const sha = await redis.scriptLoad(luaSrc);
await redis.evalsha(sha, 1, key, ...args);
```

Combined with deterministic BullMQ `jobId`, the transition is doubly idempotent: BullMQ usually prevents the duplicate from running at all, and Lua makes it a safe no-op if it ever does.

---

## 5. Single-Dispatch Guarantees

Three layers stacked on `dispatchNextQuestion`:

1. **Lock at host.start** — `SET exam:{sid}:lock:start <nodeId> NX EX 60`. Only one node ever enqueues the first job.
2. **Deterministic jobId** — `next:${sid}:${qIndex}`. BullMQ refuses a second job with the same id while the first is in queue/active.
3. **Lua CAS on version** — if a job ever does run twice (failed + retried after success), the second hits `ALREADY_ADVANCED` and returns silently.

All three together ≈ zero chance of double-dispatch without any heavy distributed-lock library.

---

## 6. Event Broadcast (Socket.IO)

Install `@socket.io/redis-adapter`:

```ts
import { createAdapter } from '@socket.io/redis-adapter';

afterInit(server: Server) {
  const pub = redis.duplicate();
  const sub = redis.duplicate();
  server.adapter(createAdapter(pub, sub));
}
```

After this, `server.to('live:123').emit(...)` from the worker node fans out to clients connected to *every* node. Existing room logic (`lobby:`, `live:`, `host:`) keeps working unchanged.

The BullMQ worker needs access to the Socket.IO `server`. Two clean options:

- **(Simple, recommended)** Run the worker inside the same NestJS process as the gateway. `Worker` from BullMQ is just a class — register it in `LiveExamModule`, inject the gateway/server. All nodes are workers; BullMQ load-balances jobs across them.
- **(Cleaner, later)** Separate worker process. The worker doesn't import the gateway; it connects its own Socket.IO client to the redis adapter and emits. Skip until actually needed.

Start with the first.

---

## 7. Migration Plan (incremental, doesn't break the live demo)

Four PRs over a couple of days, each independently shippable.

### Step 1 — Phase to Redis (parallel write, memory still authoritative)
- Add `exam:{sid}:state` HASH writes inside existing `dispatchNextQuestion` / `closeOutCurrentQuestion` / `revealLeaderboard` (gateway.ts:593, 678, 760).
- `handleAnswer` reads from Redis but **also** checks in-memory `runtime.phase` — fail-closed if either says LOCKED.
- Deploy. Verify Redis state matches memory in production logs.

### Step 2 — Replace setTimeout with BullMQ (still single-instance)
- Add BullMQ + queue + worker registered in `LiveExamModule`. Reuse existing IORedis connection.
- Replace the three `setTimeout` chains (gateway.ts:367, 660, 752, 811) with `examQueue.add(...)` using deterministic jobIds.
- Worker calls the **existing** `dispatchNextQuestion` / `lockQuestion` / `revealLeaderboard` methods. Don't refactor them yet — just change what fires them.
- Still single-instance; you're just swapping the timer mechanism. Easy to verify.

### Step 3 — Atomic transitions (multi-instance safe)
- Add the three Lua scripts. Load on `onModuleInit`.
- Move phase/qIndex *writes* exclusively into Lua. `dispatchNextQuestion` becomes: call Lua, if `ok=0` return, else emit + enqueue lock.
- Add SETNX guard in `host.start`.
- Remove in-memory `runtime.phase` / `runtime.qIndex` reads. Keep `runtimes` Map only as a cache for `questions[]` and config (or recompute from JSON snapshot — pick one).
- Add Socket.IO Redis adapter.
- Deploy with **2 instances** behind a load balancer. Smoke-test with 50 fake players.

### Step 4 — Cleanup
- Delete `runtime.timers[]`, `cancelTimers()`, `RoomRuntime` type, `runtimes` Map.
- Rename Redis keys to a single prefix.
- Delete dead in-memory paths.
- Update `docs/realtime-live-exam-flow.md` §9 — remove the "single node only" caveat.

After step 3 you're already multi-instance safe. Step 4 is hygiene.

---

## What's deliberately *not* recommended

- **No Redlock / distributed lock library.** Lua + version CAS + deterministic jobIds is sufficient and an order of magnitude simpler.
- **No event-sourcing / CQRS.** This is a 4-phase state machine, not a domain model.
- **No separate worker service yet.** Same NestJS process, separate `Worker` class. Split later if workers need to scale independently of gateways.
- **No replacing Prisma writes in `handleAnswer`.** The `unique(participantId, questionId)` constraint is the right idempotency boundary for answers.
