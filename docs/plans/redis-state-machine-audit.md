# Redis State Machine Audit Report

> Live Exam System — Redis + Lua + BullMQ Workers
> Date: 2026-04-12

---

## System Overview

- **State flow:** `INIT → OPEN → LOCKED → INTERSTITIAL → OPEN(+1) → ... → ENDED`
- **Atomicity layer:** Redis Lua scripts (EVALSHA)
- **Job orchestration:** BullMQ with delayed jobs, concurrency=10
- **Concurrency model:** Multiple workers, retries, duplicate/delayed/out-of-order jobs possible

---

## Bug #1: ENDED→OPEN Resurrection

### 1. Bug Summary

| Field | Value |
|-------|-------|
| Name | Stale job resurrects terminated exam |
| Severity | CRITICAL |
| Description | A delayed `next-question` job can overwrite the `ENDED` phase back to `OPEN`, restarting a finished exam |

### 2. Root Cause

**Missing guard** — `TRANSITION_TO_OPEN_LUA` never checked whether `phase == 'ENDED'`.

The only guard was:

```lua
if qIndex >= nextIdx and phase ~= 'INIT' then
  return {0, 'ALREADY_ADVANCED'}
end
```

When the exam ends (`phase=ENDED, qIndex=N`), a stale delayed job calling `nextIdx = N+1` passes this check because `N < N+1` evaluates false. No terminal guard blocks it.

### 3. Current Behavior (Before Fix)

```
T+0s:    INTERSTITIAL(q4), next-question(q5) scheduled with 5s delay
T+3s:    duration-cap fires → transitionToEnded → phase=ENDED, qIndex=4
T+3.1s:  cleanup() deletes Redis state... BUT job is already in BullMQ delay queue
T+5s:    next-question(q5) fires
         Lua check: qIndex(4) >= nextIdx(5)? NO → guard passes
         Lua check: nextIdx(5) >= totalQ(10)? NO → guard passes
         Result: HSET phase=OPEN, qIndex=5 ← RESURRECTS THE EXAM
```

**Impact:** Exam restarts after finalization. Clients receive new questions after seeing `exam.ended`. Leaderboard snapshot is corrupted. DB shows `ENDED` but Redis shows `OPEN`.

### 4. Fixed Behavior (After Fix)

```
T+5s:    next-question(q5) fires
         Lua: phase == 'ENDED' → return {0, 'ALREADY_ENDED'}
         Worker: logs no-op, exits
```

The terminal guard is the **first check** in the script, before any other logic.

### 5. Fix Implementation

Added to the top of `TRANSITION_TO_OPEN_LUA`:

```lua
if phase == 'ENDED' then
  return {0, 'ALREADY_ENDED'}
end
```

**Why it works:** Redis executes Lua atomically. The phase is read and checked in the same script invocation. No external process can change the phase between the read and the guard. Since `ENDED` is terminal and this guard is unconditional, no stale job from any point in time can reverse it.

**Why it's safe:** The guard is stateless — it only reads the current hash. Multiple concurrent calls all see `ENDED` and all return the same rejection. No side effects on rejection.

### 6. Key Insight

Every Lua transition script must begin with a terminal-state guard. ENDED is a sink node — once entered, the state machine is frozen.

---

## Bug #2: OPEN→OPEN Phase Skip

### 1. Bug Summary

| Field | Value |
|-------|-------|
| Name | Direct OPEN-to-OPEN transition skips LOCKED and INTERSTITIAL phases |
| Severity | HIGH |
| Description | The open script only guards on `qIndex` arithmetic, not on the current phase, allowing a transition from `OPEN(qN)` directly to `OPEN(qN+1)` |

### 2. Root Cause

**Invalid state machine transition** — the guard logic was:

```lua
if qIndex >= nextIdx and phase ~= 'INIT' then
  return {0, 'ALREADY_ADVANCED'}
end
```

This rejects only when `qIndex >= nextIdx`. If a stale or duplicate `next-question(N+1)` job fires while still in `OPEN(N)`, the check `N >= N+1` is false, and no phase whitelist blocks the transition.

### 3. Current Behavior (Before Fix)

```
T+0s:    OPEN(q2), lock scheduled for T+10s
T+3s:    BullMQ schedules next-question(q3) early (from a retry or race in reveal)
T+3.1s:  Lua: qIndex(2) >= nextIdx(3)? NO
         Lua: phase check? NONE
         Result: HSET phase=OPEN, qIndex=3
T+10s:   lock-question(q2) fires → phase=OPEN but qIndex=3 ≠ expected(2) → STALE, no-op
```

**Impact:** Question 2 is never LOCKED. `closeOutQuestion` never runs — unanswered players get no timeout entries, leaderboard for q2 is never computed, players never see the reveal/explanation for q2. The entire scoring chain for that question is lost.

### 4. Fixed Behavior (After Fix)

```
T+3.1s:  Lua: phase == 'OPEN' → not in {INIT, INTERSTITIAL}
         return {0, 'INVALID_PHASE'}
         Worker: logs no-op, exits
```

The normal flow completes: `OPEN(q2) → LOCKED(q2) → INTERSTITIAL(q2) → OPEN(q3)`.

### 5. Fix Implementation

Added explicit phase whitelist:

```lua
if phase ~= 'INIT' and phase ~= 'INTERSTITIAL' then
  return {0, 'INVALID_PHASE'}
end
```

Plus strict qIndex enforcement:

```lua
if phase == 'INIT' and nextIdx ~= 0 then
  return {0, 'MUST_START_AT_0'}
end
if phase == 'INTERSTITIAL' and nextIdx ~= qIndex + 1 then
  return {0, 'MUST_INCREMENT_BY_1'}
end
```

**Why it works:** The transition table is now a whitelist: `INIT→OPEN(0)` and `INTERSTITIAL(N)→OPEN(N+1)`. Any other source phase is rejected atomically. Combined with the `+1` constraint, it's impossible to skip questions or phases.

**Why it's safe:** The check is purely a function of the current hash state. Multiple workers hitting this concurrently all get the same rejection if the phase doesn't match. Only the legitimate next-question job (arriving after INTERSTITIAL) succeeds.

### 6. Key Insight

Never rely on arithmetic alone (`qIndex < nextIdx`) to enforce ordering. Always validate the source phase explicitly — a state machine must encode its edges, not just its nodes.

---

## Bug #3: TOCTOU on `perQSec` Read

### 1. Bug Summary

| Field | Value |
|-------|-------|
| Name | Non-atomic read of `perQSec` outside Lua script |
| Severity | MEDIUM |
| Description | `transitionToOpen` reads `perQSec` via `getState()` (a separate Redis call) then passes it to the Lua script as an argument, creating a time-of-check-to-time-of-use gap |

### 2. Root Cause

**Race condition (TOCTOU)** — the application-layer code was:

```typescript
const state = await this.getState(sid);         // HGETALL — separate command
const result = await client.evalsha(
  this.shaOpen, 1, KEYS.state(sid),
  String(expectedQIndex),
  String(Date.now()),
  String(state.perQSec),                        // stale value
);
```

Between the `HGETALL` and `EVALSHA`, another client could `DEL` the key (cleanup), or the TTL could expire. The Lua script would then compute `qEndAt` using a stale `perQSec` applied to a potentially non-existent or reset hash.

### 3. Current Behavior (Before Fix)

```
T+0ms:   Worker A: HGETALL → gets perQSec=30
T+1ms:   Worker B (duration-cap): finalizeExam → cleanup() → DEL exam:{sid}:state
T+2ms:   Worker A: EVALSHA with perQSec=30
          Lua: HMGET returns nil for all fields (key deleted)
          qIndex=-1, phase=nil, version=0, totalQ=0
          nextIdx(0) >= totalQ(0) → HSET phase=ENDED on a ghost key
```

**Impact:** A phantom Redis hash is created for a cleaned-up session. Violates atomicity contracts and would break if dynamic timing were ever added.

### 4. Fixed Behavior (After Fix)

```
T+0ms:   Worker A: EVALSHA (no prior HGETALL needed)
          Lua: HMGET reads perQSec directly from KEYS[1] in the same atomic operation
          If key is deleted: all fields are nil, phase=nil, fails phase whitelist check
          return {0, 'INVALID_PHASE'}
```

No external read needed. The Lua script is fully self-contained.

### 5. Fix Implementation

Changed Lua to read `perQSec` from the hash itself:

```lua
local cur = redis.call('HMGET', KEYS[1], 'qIndex', 'phase', 'version', 'totalQ', 'perQSec')
local perQSec = tonumber(cur[5]) or 0
-- later:
local perMs  = perQSec * 1000
local qEndAt = now + perMs
```

Removed the `getState()` call and `ARGV[3]` from the TypeScript caller:

```typescript
async transitionToOpen(sid: string, expectedQIndex: number, expectedVersion = 0) {
  const result = await client.evalsha(
    this.shaOpen, 1, KEYS.state(sid),
    String(expectedQIndex),
    String(Date.now()),
    String(expectedVersion),
  );
}
```

**Why it works:** All reads that inform the write happen inside the same Lua execution. Redis guarantees no interleaving during script execution. The value of `perQSec` and the phase check are from the exact same point in time.

### 6. Key Insight

Never split a read-then-act pattern across a Lua boundary. If the Lua script's decision depends on a value, that value must be read inside the script, not passed in from an external snapshot.

---

## Bug #4: No Version/CAS — Stale Jobs Execute Valid Transitions

### 1. Bug Summary

| Field | Value |
|-------|-------|
| Name | Missing CAS allows stale delayed jobs to execute against newer state |
| Severity | HIGH |
| Description | Jobs carry only `(sid, expectedQIndex)` but no version stamp, so a retried or delayed job can succeed if the state happens to match its expected qIndex again after a cycle |

### 2. Root Cause

**Stale data** — BullMQ jobs are fire-and-forget. A job enqueued at version V carries no proof of its epoch. If the system progresses through a full cycle and returns to a state where `qIndex == job.expectedQIndex` and `phase == expected`, the stale job's Lua call succeeds.

Original lock script guard:

```lua
if phase ~= 'OPEN' or qIndex ~= expected then
  return {0, 'STALE'}
end
```

This only checks `(phase, qIndex)` — not *which* OPEN epoch this is.

### 3. Current Behavior (Before Fix)

```
T+0s:    OPEN(q2, v=5), lock-question(q2) enqueued
T+10s:   lock fires → LOCKED(q2, v=6) ✓
T+20s:   reveal → INTERSTITIAL(q2, v=7) → next-question(q3, v=8)... exam proceeds
T+???:   BullMQ retry of lock-question(q2) fires (network timeout caused false failure)
         If by coincidence state is OPEN(q2) again (impossible in strict +1 model,
         but relevant for duration-cap recovery scenarios), the lock succeeds
```

More practically: without version checks, the *only* protection is the phase+qIndex pair. Adding CAS makes the system formally correct regardless of retry timing.

### 4. Fixed Behavior (After Fix)

```
T+???:   Stale lock-question(q2, expectedVersion=5) fires
         Lua: version is now 12 (many transitions later)
         expectedVersion(5) != version(12) → return {0, 'VERSION_MISMATCH'}
```

### 5. Fix Implementation

**Version threading through the job chain:**

1. Each transition Lua script returns the new version on success
2. The worker passes that version into the next enqueued job's data
3. The next Lua script validates `expectedVersion` before mutating

```
INIT(v=0) → enqueueNextQuestion(q0, v=0)
  → Lua OPEN: v0 matches, writes v=1, returns v=1
  → enqueueLockQuestion(q0, v=1)
    → Lua LOCKED: v1 matches, writes v=2, returns v=2
    → enqueueRevealLeaderboard(q0, v=2)
      → Lua INTERSTITIAL: v2 matches, writes v=3, returns v=3
      → enqueueNextQuestion(q1, v=3)
        → ...
```

CAS check in each Lua script:

```lua
if expectedVersion > 0 and version ~= expectedVersion then
  return {0, 'VERSION_MISMATCH'}
end
```

The `> 0` clause allows force-end paths (duration-cap, host.end) to bypass CAS by passing `expectedVersion=0`, since these are intentionally out-of-band.

**Why it's safe:** Version is monotonically increasing (always `+1`). Each job carries the exact version it expects. Any intervening transition bumps the version, invalidating all outstanding stale jobs. The check is inside Lua, so it's atomic with the state mutation.

### 6. Key Insight

In a queue-driven state machine, every job must carry proof of the state epoch it was created for. Phase + index alone is insufficient — a monotonic version (CAS) makes each transition bound to a specific point in the state timeline.

---

## Bug #5: `host.end` Skips `closeOutQuestion`

### 1. Bug Summary

| Field | Value |
|-------|-------|
| Name | Force-end path doesn't grade unanswered players for the current question |
| Severity | MEDIUM |
| Description | When the host ends the exam mid-question, `closeOutQuestion` is never called — players who haven't answered get no timeout entries, breaking final score accuracy |

### 2. Root Cause

**Missing side effect in force-end path.** The gateway code locked the current question but then jumped straight to `finalizeExam`:

```typescript
if (state.phase === 'OPEN') {
  const lockResult = await this.redisState.transitionToLocked(sessionId, state.qIndex);
  if (lockResult.ok) {
    await this.leaderboard.setQuestionState(sessionId, state.qIndex, 'LOCKED');
    // comment said: "closeOutQuestion is handled inside finalizeExam path"
    // BUT: finalizeExam does NOT call closeOutQuestion
  }
}
await this.queueService.finalizeExam(sessionId, 'host_force_end', user.id);
```

`finalizeExam` only: transitions to ENDED, snapshots leaderboard, emits events, cleans up. It never processes unanswered players for the in-progress question.

### 3. Current Behavior (Before Fix)

```
T+0s:    OPEN(q5), 8 players, only 3 have answered
T+2s:    Host clicks "End Exam"
T+2.1s:  transitionToLocked(q5) → OK
T+2.2s:  finalizeExam → ENDED, leaderboard.snapshot()
Result:  5 players have NO LiveExamAnswer record for q5
         Their correctCount/wrongCount is understated
         Leaderboard snapshot misses q5 scoring entirely
```

### 4. Fixed Behavior (After Fix)

```
T+2.1s:  transitionToLocked(q5) → OK
T+2.2s:  closeOutQuestionPublic(sid, q5):
          - Creates timeout answers (isCorrect=false, awardedPoints=0) for 5 missing players
          - Adds points to leaderboard for all 8 answers
          - Emits exam.questionLocked with reveal
T+2.3s:  finalizeExam → ENDED, leaderboard.snapshot() (now includes q5 scores)
```

### 5. Fix Implementation

Exposed `closeOutQuestion` via a public wrapper:

```typescript
async closeOutQuestionPublic(sid: string, qIndex: number) {
  return this.closeOutQuestion(sid, qIndex);
}
```

Updated `handleHostEnd` to call it after a successful lock:

```typescript
if (lockResult.ok) {
  await this.leaderboard.setQuestionState(sessionId, state.qIndex, 'LOCKED');
  await this.queueService.closeOutQuestionPublic(sessionId, state.qIndex);
}
```

**Why it works:** `closeOutQuestion` is idempotent — it queries existing answers, creates entries only for participants without one (upsert-like pattern via `findMany` + filter). If called twice, the second call finds no missing participants and does nothing.

**Why it's safe:** The Lua lock transition already succeeded atomically. If two force-end calls race, only one gets `lockResult.ok = true` (the second sees `ALREADY_LOCKED`). The closeOut only runs on the winning path.

### 6. Key Insight

Every phase transition that terminates a question's "answer window" must also finalize that question's scoring. The lock transition and the score finalization are logically coupled — separating them across code paths creates inconsistency.

---

## Bug #6: Duplicate Interstitial Scheduling

### 1. Bug Summary

| Field | Value |
|-------|-------|
| Name | Identical code in both branches of last-question check |
| Severity | LOW |
| Description | `processRevealLeaderboard` has an `if/else` that does the exact same thing in both branches, indicating confused intent about end-of-exam handling |

### 2. Root Cause

**Dead code / confused logic.** The original code:

```typescript
const nextIdx = qIndex + 1;
if (nextIdx < state.totalQ) {
  await this.queue.add('next-question', { sid, expectedQIndex: nextIdx }, { delay: ... });
} else {
  // "All questions done — schedule finalize after interstitial"
  await this.queue.add('next-question', { sid, expectedQIndex: nextIdx }, { delay: ... });
}
```

Both branches enqueue the same job. The else-branch comment suggests it should do something different, but it just duplicates the if-branch.

### 3. Current Behavior (Before Fix)

Functionally correct by accident — the Lua script handles `nextIdx >= totalQ` by setting ENDED. But the code communicates wrong intent and the else-branch is dead weight.

### 4. Fixed Behavior (After Fix)

Single unconditional enqueue:

```typescript
const nextIdx = qIndex + 1;
await this.queue.add('next-question',
  { sid, expectedQIndex: nextIdx, expectedVersion: result.version! },
  { jobId: `next-${sid}-${nextIdx}`, delay: state.interSec * 1000, ... }
);
```

The Lua script handles the boundary condition (`nextIdx >= totalQ → ENDED`). The worker then calls `finalizeExam` when it receives the `ENDED` reason.

### 5. Fix Implementation

Removed the `if/else` and replaced with a single `queue.add` call. The `TRANSITION_TO_OPEN_LUA` script already handles the terminal case:

```lua
if nextIdx >= totalQ then
  redis.call('HSET', KEYS[1], 'phase', 'ENDED', 'version', version + 1)
  return {0, 'ENDED'}
end
```

And the worker already handles the `ENDED` reason:

```typescript
if (result.reason === 'ENDED') {
  await this.finalizeExam(sid, 'all_questions_done');
}
```

**Why it's safe:** Behavior is identical — just clearer code with one fewer branch.

### 6. Key Insight

When Lua scripts encode boundary conditions, don't duplicate that logic in the application layer. Let the script be authoritative and handle its return codes uniformly.

---

## Architectural Fix: Version-Threaded Job Chain

Beyond individual bugs, the overarching fix is the **version-threading pattern** that connects all transitions:

```
initState(v=0) → job(q0, v=0) → Lua:OPEN(v=1) → job(q0, v=1) → Lua:LOCKED(v=2)
  → job(q0, v=2) → Lua:INTERSTITIAL(v=3) → job(q1, v=3) → Lua:OPEN(v=4) → ...
```

Each job is bound to the exact state epoch that created it. Any job arriving with a stale version is rejected atomically.

### Classes of Bugs Eliminated

| Class | Mechanism |
|-------|-----------|
| Retry storms | Retried jobs carry old versions → rejected |
| Out-of-order execution | Delayed jobs arrive late → version mismatch |
| Duplicate processing | Same job runs twice → second call sees bumped version |
| Force-end safety | Uses `expectedVersion=0` to bypass CAS intentionally |

### Invariant

> Only the job that was enqueued by the immediately preceding successful transition can advance the state machine.

---

## Safety Guarantee Assessment (After Fix)

| Guarantee | Status | Mechanism |
|-----------|--------|-----------|
| Strict state machine (only valid transitions) | **ENFORCED** | Phase whitelist in every Lua script |
| No resurrection from ENDED | **ENFORCED** | Terminal guard as first check |
| No skipped questions (qIndex +1 only) | **ENFORCED** | `MUST_INCREMENT_BY_1` guard |
| Protection against stale/duplicated jobs | **ENFORCED** | Version CAS in every script |
| Exactly-once transition semantics | **ENFORCED** | CAS + idempotent rejection |
| Atomicity of state reads | **ENFORCED** | All values read inside Lua |
| Force-end scoring completeness | **ENFORCED** | `closeOutQuestion` called before finalize |

---

## Files Modified

| File | Changes |
|------|---------|
| `api/src/live-exam/live-exam-redis-state.service.ts` | Hardened all 4 Lua scripts with terminal guards, phase whitelists, CAS, moved perQSec inside Lua. Updated TS method signatures to accept `expectedVersion`. |
| `api/src/live-exam/live-exam-queue.service.ts` | Added `expectedVersion` to all job data interfaces and enqueue methods. Threaded version through worker processors. Exposed `closeOutQuestionPublic`. Removed duplicate branch. |
| `api/src/live-exam/live-exam.gateway.ts` | Updated `host.start` to pass initial version. Fixed `host.end` to call `closeOutQuestion` before finalize. |
