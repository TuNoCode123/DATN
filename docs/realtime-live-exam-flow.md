# Realtime Live Exam — Flow & Architecture

## 1. Entity Relationship Diagram

```
┌─────────────────────────┐
│  User                   │
│  (admin / learner)      │
└──────┬──────────────────┘
       │ 1
       │ creates
       │ N
       ▼
┌─────────────────────────────────┐         ┌──────────────────────────────┐
│  LiveExamTemplate               │ 1     N │  LiveExamTemplateQuestion    │
│  ───────────────                │────────▶│  ───────────────────────     │
│  id, title, description         │         │  orderIndex, type, prompt    │
│  durationSec, perQuestionSec    │         │  payload (JSON), points      │
│  interstitialSec                │         │  explanation                 │
│  status: DRAFT|PUBLISHED|ARCHIVED│         └──────────────────────────────┘
└──────┬──────────────────────────┘            (template-side, editable)
       │ 1
       │ spawns (snapshot)
       │ N
       ▼
┌─────────────────────────────────┐         ┌──────────────────────────────┐
│  LiveExamSession                │ 1     N │  LiveExamSessionQuestion     │
│  ───────────────                │────────▶│  (frozen snapshot copy)      │
│  joinCode (6-digit), inviteSlug │         └──────────────────────────────┘
│  status: LOBBY|LIVE|ENDED       │
│  startedAt, endedAt             │
└──────┬──────────┬───────────────┘
       │ 1        │ 1
       │          │
       │ N        │ N
       ▼          ▼
┌──────────────────────┐   ┌──────────────────────┐
│ LiveExamParticipant  │   │ LiveExamEvent        │
│ ───────────────────  │   │ (audit log)          │
│ userId, displayName  │   │ JOIN|START|END|KICK  │
│ finalScore, finalRank│   └──────────────────────┘
│ correct/wrongCount   │
└──────┬───────────────┘
       │ 1
       │ N
       ▼
┌─────────────────────────────────┐
│ LiveExamAnswer                  │
│ ─────────────                   │
│ questionId, answerPayload (JSON)│
│ isCorrect, answeredMs           │
│ awardedPoints                   │
└─────────────────────────────────┘
```

**Key invariant:** Template questions are **cloned** into `LiveExamSessionQuestion` at session creation → in-flight sessions are immune to template edits.

---

## 2. Session Lifecycle

```
   Template:  DRAFT ──publish──▶ PUBLISHED ──archive──▶ ARCHIVED
                                     │
                                     │ createFromTemplate()
                                     ▼
   Session:                        LOBBY ─────host.start────▶ LIVE
                                     │                          │
                                     │                          │ all Qs done
                                     │                          │   OR host.end
                                     │                          │   OR durationCap
                                     ▼                          ▼
                              (admin force-end) ──────────▶  ENDED
                                                       (snapshot to Postgres)
```

---

## 3. Socket.io Rooms

| Room | Members | What gets broadcast here |
|------|---------|--------------------------|
| `lobby:{sessionId}` | Players + host (host watches lobby state) | `lobby.state`, `lobby.playerJoined`, `lobby.playerLeft` |
| `live:{sessionId}` | Active players ONLY (host is excluded) | `exam.started`, `exam.question`, `exam.questionLocked`, `exam.ended` |
| `host:{sessionId}` | Host watcher ONLY (host cannot answer) | `host.questionView`, `host.answerStream`, `host.fullLeaderboard`, `leaderboard.update` |

Namespace: `/live-exam`. Auth via JWT cookie middleware that runs **before** the `connect` handshake completes (so handlers never race the auth check).

---

## 4. Step-by-Step Event Walkthrough

The goal of this section: for every event, show **who emits it, who receives it, what the server does, and what the client does**.

### Phase A — Lobby (status = LOBBY)

#### A1. Player connects & joins lobby

```
PLAYER                                       SERVER                                     OTHERS IN LOBBY
──────                                       ──────                                     ───────────────
io.connect('/live-exam')  ───────────────▶
                            (middleware verifies JWT cookie → socket.data.user set)
emit('lobby.join',         ───────────────▶
     { sessionId })
                                             handleLobbyJoin (gateway.ts:163)
                                             1. examService.join() — upsert
                                                LiveExamParticipant row
                                             2. socket.join('lobby:{id}')
                                             3. Build lobby snapshot from DB
                                             4. Insert LiveExamEvent type=JOIN
                            ◀───── emit('lobby.state',
                                        { players[], count })
                                                                ─── emit('lobby.playerJoined',
                                                                        { userId, displayName }) ───▶
                                                                                                    │
                                                                                                    ▼
                                                                                          (every other socket
                                                                                           in lobby:{id} adds
                                                                                           the new player to
                                                                                           their tile grid)
```

What clients do with each event:
- **`lobby.state`** — replaces the player list with the authoritative snapshot. Used by the joining socket to "catch up".
- **`lobby.playerJoined`** — pushes one new player into the local list. Used by everyone *else*.

#### A2. Mid-exam rejoin (special case inside `lobby.join`)

If the session is already `LIVE` when a `lobby.join` arrives (e.g. player navigated lobby → play, which destroys the old socket and creates a new one), the gateway also:

1. Joins the socket to `live:{id}`.
2. Re-emits `exam.started` with the original `serverStartAt` and `totalQuestions`.
3. Re-emits `exam.question` for the *current* `qIndex`, including the same shuffle permutation for SENTENCE_REORDER (so the rejoiner sees the identical fragment order).
4. If the current phase is `LOCKED` or `INTERSTITIAL`, also emits `exam.questionLocked` so the rejoiner immediately sees the reveal instead of a frozen "OPEN" question.

This is the only path where a single client gets a **personalized replay** of recent events.

#### A3. Host attaches as watcher

```
HOST                                       SERVER
────                                       ──────
emit('host.watch',         ───────────────▶ handleHostWatch (gateway.ts:268)
     { sessionId })                         1. Verify session.createdById === user.id
                                            2. socket.join('host:{id}')
                                            3. socket.join('lobby:{id}')   ← so host sees player joins
                            ◀────── ack { ok: true }
```

The host is in `host:{id}` AND `lobby:{id}`, but **never** `live:{id}`. The "host can't answer" check in `handleAnswer` (line 470) uses `socket.rooms.has('host:{id}')` to enforce this.

#### A4. Host kicks a player

```
HOST                                       SERVER                                       ALL IN LOBBY
────                                       ──────                                       ────────────
emit('host.kick',          ───────────────▶ handleHostKick (gateway.ts:412)
     { sessionId, userId })                 1. Verify host owns session
                                            2. Verify status === LOBBY
                                            3. Delete LiveExamParticipant row
                                            4. Insert LiveExamEvent type=KICK
                                                              ── emit('lobby.playerLeft',
                                                                       { userId, kicked: true }) ──▶
                                                                                                    │
                                                                                                    ▼
                                                                              (kicked player's socket
                                                                               sees `kicked: true` and
                                                                               navigates back to /live)
```

#### A5. Player leaves voluntarily

```
PLAYER                                     SERVER                                       OTHERS IN LOBBY
──────                                     ──────                                       ───────────────
emit('lobby.leave',        ───────────────▶ handleLobbyLeave (gateway.ts:254)
     { sessionId })                         1. socket.leave('lobby:{id}')
                                                                  ── emit('lobby.playerLeft',
                                                                          { userId }) ──▶
```

(Note: the participant row is NOT deleted. Soft leave only — they remain on the roster.)

---

### Phase B — Host starts the exam

```
HOST                                       SERVER                                       ALL PLAYERS
────                                       ──────                                       ───────────
emit('host.start',         ───────────────▶ handleHostStart (gateway.ts:290)
     { sessionId })                         ┌──────────────────────────────────────┐
                                            │ 1. examService.start() →             │
                                            │    UPDATE session SET status=LIVE,   │
                                            │           startedAt=now              │
                                            │ 2. Load all SessionQuestions         │
                                            │ 3. Validate every payload up-front   │
                                            │    (fail-fast on corrupt JSON)       │
                                            │ 4. Move every socket in lobby:{id}   │
                                            │    INTO live:{id}                    │
                                            │    (skipping the host's own socket)  │
                                            │ 5. For each Participant: leaderboard │
                                            │    .initParticipant() → ZADD score=0 │
                                            │ 6. Build RoomRuntime in-memory       │
                                            │    (qIndex=-1, timers=[])            │
                                            │ 7. runtimes.set(sessionId, runtime)  │
                                            └──────────────────────────────────────┘
                                                              ── emit('exam.started',
                                                                  { serverStartAt, totalQuestions }) ──▶
                                                                                                    │
                                                                                                    ▼
                                                                                          (lobby page sees
                                                                                           the event and
                                                                                           navigates to /play)
                                            ┌──────────────────────────────────────┐
                                            │ 8. Set durationCap = setTimeout(     │
                                            │      finalizeExam, durationSec*1000) │
                                            │    ← unconditional hard end          │
                                            │ 9. dispatchNextQuestion(runtime)     │
                                            │ 10. Insert LiveExamEvent type=START  │
                                            └──────────────────────────────────────┘
```

After this, the runtime engine drives everything via timers. The host doesn't need to do anything until they want to force-end.

---

### Phase C — Per-question loop

The loop runs `dispatchNextQuestion → (timer) → lockQuestion → revealLeaderboard → (timer) → dispatchNextQuestion …` until all questions are done or the duration cap fires.

#### C1. `dispatchNextQuestion` (gateway.ts:593)

```
SERVER                                     PLAYERS                                       HOST
──────                                     ───────                                       ────
runtime.qIndex++
if qIndex >= questions.length:
   → finalizeExam (skip to Phase D)
runtime.phase = 'OPEN'
runtime.qStartAt = Date.now()

if type === SENTENCE_REORDER:
   q.shuffle = randomShufflePermutation(n)
else:
   q.shuffle = null

leaderboard.setQuestionState(
  qIndex, 'OPEN', qStartAt
)   // Redis qindex/qphase/qstart keys

dispatch = buildDispatchPayload()  // strips correct answer
reveal   = buildRevealPayload()    // includes correct answer

  ── emit('exam.question', {
       index, question: { id, type, prompt, dispatch },
       dispatchedAt, perQuestionSec,
       totalQuestions, phase: 'OPEN'
     }) ──▶  to live:{id}
                                            (PlayPage onQuestion:
                                             setQuestion(payload),
                                             setPhase('OPEN'),
                                             countdown begins from
                                             dispatchedAt + perQuestionSec*1000)

  ── emit('host.questionView', {
       index, question, reveal,
       dispatchedAt, perQuestionSec,
       phase: 'OPEN'
     }) ──▶  to host:{id}
                                                                              (HostConsole shows
                                                                               question + correct
                                                                               answer highlighted)

setTimeout(lockQuestion, perQuestionSec * 1000)
```

Two key invariants here:
1. **Players never receive `correctOptionId`** — the dispatch payload omits it. Anti-cheat is enforced server-side, not by trusting the client.
2. **`dispatchedAt` is the server clock** — clients use it for the countdown, not their own `Date.now()`. This makes the countdown identical for everyone regardless of latency (it just starts a few ms late on slow links).

#### C2. Player submits an answer

```
PLAYER                                     SERVER                                       HOST
──────                                     ──────                                       ────
emit('exam.answer', {      ───────────────▶ handleAnswer (gateway.ts:447)
  sessionId,
  questionId,                               ┌──────────────────────────────────────┐
  answer: { ... }                           │ Validation gauntlet:                 │
})                                          │  • runtime exists?                   │
                                            │    no  → emit answerError NO_RUNTIME │
                                            │  • phase === 'OPEN'?                 │
                                            │    no  → emit PHASE_CLOSED           │
                                            │  • not in host:{id} room?            │
                                            │    no  → emit FORBIDDEN_ROLE         │
                                            │  • currentQ.id === questionId?       │
                                            │    no  → emit STALE_QUESTION         │
                                            │  • answer payload shape valid?       │
                                            │    no  → emit INVALID_ANSWER         │
                                            └──────────────────────────────────────┘

                                            For SENTENCE_REORDER: translate the
                                            submitted positions (in shuffled order)
                                            BACK to original fragment indices using
                                            currentQ.shuffle. The DB only ever
                                            stores answers in the stable original
                                            index space.

                                            answeredMs = now − runtime.qStartAt
                                            { isCorrect, awardedPoints } =
                                              scoring.gradeAndScore({...})

                                            INSERT LiveExamAnswer
                                              (participantId, questionId,
                                               answerPayload, isCorrect,
                                               answeredMs, awardedPoints)
                                            ── unique constraint catches double
                                               submit → emit ALREADY_ANSWERED

                                            ⚠ The ZSET is NOT updated yet —
                                              points are batched and applied
                                              all at once during lockQuestion.

                            ◀──── emit('exam.answerAck',
                                       { recorded: true, answeredMs })

                                            COUNT(participants), COUNT(answers for q)
                                            display = buildAnswerDisplay()  // human-readable

                                                              ── emit('host.answerStream', {
                                                                       userId, displayName,
                                                                       questionId, answeredMs,
                                                                       answeredCount, totalPlayers,
                                                                       isCorrect, display
                                                                  }) ──▶  to host:{id}
                                                                                                  │
                                                                                                  ▼
                                                                                       (HostConsole pushes
                                                                                        new row into the
                                                                                        live answer feed,
                                                                                        progress = answered
                                                                                        / totalPlayers)
```

What `exam.answerAck` does on the player side: switches phase from `OPEN` → `ANSWERED`. Player sees their selection locked in but **does not yet know if they were correct** — that comes at lock time.

#### C3. `lockQuestion` (timer fires after `perQuestionSec`)

`lockQuestion` immediately delegates to `closeOutCurrentQuestion(runtime, false)`:

```
SERVER                                     PLAYERS                                       HOST
──────                                     ───────                                       ────
if runtime.phase !== 'OPEN': return  ← idempotent guard
runtime.phase = 'LOCKED'
leaderboard.setQuestionState(qIndex, 'LOCKED')

leaderboard.capturePrevRanks()
   ← snapshot every player's CURRENT rank into Redis
     so we can compute "you moved +2 / -1" arrows after
     this question's points get added.

# Insert TIMEOUT rows for non-responders
participants = SELECT * FROM LiveExamParticipant
answered     = SELECT * FROM LiveExamAnswer WHERE questionId
missing      = participants − answered
for p in missing:
   INSERT LiveExamAnswer(
     participantId = p.id,
     questionId    = q.id,
     answerPayload = NULL,
     isCorrect     = false,
     answeredMs    = perQuestionSec * 1000,  ← maxed out
     awardedPoints = 0
   )

# Batch ZSET update for ALL answers on this question
for a in answers:
   leaderboard.addPoints(userId, a.awardedPoints, a.isCorrect)
   ← ZINCRBY board:{id}:board <points> <userId>
   ← HINCRBY meta:{id}:{userId} correct|wrong 1

reveal = buildRevealPayload(q.type, q.payload)

  ── emit('exam.questionLocked', {
       index, reveal, explanation
     }) ──▶  to live:{id}
                                            (PlayPage onLocked:
                                             setPhase('LOCKED'),
                                             setReveal(reveal),
                                             play correct/wrong sound,
                                             confetti if isCorrect,
                                             show explanation)

if isForceEnd: return  ← skip the leaderboard reveal,
                         finalizeExam will run instead
setTimeout(revealLeaderboard, 0)
```

Why a `setTimeout(..., 0)` instead of an inline call: it lets the `exam.questionLocked` event flush to the network *before* the personalized leaderboard reveal goes out. Players see "answer revealed" → then "leaderboard reveal" as two distinct UI steps.

#### C4. `revealLeaderboard` (gateway.ts:760)

```
SERVER                                     PLAYERS                                       HOST
──────                                     ───────                                       ────
runtime.phase = 'INTERSTITIAL'
leaderboard.setQuestionState(qIndex, 'INTERSTITIAL')

top10 = leaderboard.getTop(10)   ← Redis ZREVRANGE
all   = leaderboard.getAll()     ← every participant ranked

                                                              ── emit('host.fullLeaderboard',
                                                                      { rows: all }) ──▶  to host:{id}
                                                                                                  │
                                                                                                  ▼
                                                                                       (HostConsole replaces
                                                                                        leaderboard table
                                                                                        with full rows)

                                                              ── emit('leaderboard.update',
                                                                      { top10 }) ──▶  to host:{id}

# Per-socket personalized reveal — NOT a broadcast
liveSockets = server.in('live:{id}').fetchSockets()
for socket in liveSockets:
   userId   = socket.data.user.id
   rank     = leaderboard.getRank(userId)       ← current rank
   prevRank = leaderboard.getPrevRank(userId)   ← snapshotted earlier
   score    = leaderboard.getScore(userId)
   myAnswer = SELECT * FROM LiveExamAnswer
              WHERE questionId AND participant.userId

     ── socket.emit('leaderboard.reveal', {
          top10,
          yourRank, yourPrevRank,
          yourDelta: prevRank - rank,   ← positive = climbed up
          yourScore,
          yourAwardedPoints: myAnswer?.awardedPoints,
          yourIsCorrect:     myAnswer?.isCorrect,
          interstitialSec
        })
                                            (PlayPage onReveal:
                                             show top10 podium,
                                             show personal rank delta arrow,
                                             show "+847 points" toast,
                                             schedule next question UI
                                             after interstitialSec)

setTimeout(dispatchNextQuestion, interstitialSec * 1000)
   ← loops back to C1 with the next question
```

**Why personalized per-socket emits?** The top10 is the same for everyone, but `yourRank`, `yourDelta`, and `yourAwardedPoints` are different for every player. Doing this server-side keeps the client dumb — the player UI only needs to render what it receives.

---

### Phase D — Exam ends

There are three triggers, all funnel into `finalizeExam`:

1. **Natural end**: `dispatchNextQuestion` runs out of questions → calls `finalizeExam(runtime, 'all_questions_done')`.
2. **Hard cap**: the `durationCap` timer set at `host.start` fires → `finalizeExam(runtime, 'duration_cap')`.
3. **Host force-end**: host emits `host.end` → `closeOutCurrentQuestion(runtime, isForceEnd=true)` finalizes the current question (so the in-flight question still gets graded, scored, and revealed, but skips the interstitial), then `finalizeExam(runtime, 'host_force_end', userId)`.
4. **Force-end while still in LOBBY**: no runtime exists, so `host.end` calls `examService.forceEnd()` directly and emits `exam.ended` to `lobby:{id}`.

#### D1. `finalizeExam` (gateway.ts:821)

```
SERVER                                     PLAYERS                                       HOST
──────                                     ───────                                       ────
if !runtimes.has(sessionId): return  ← idempotent
cancelTimers(runtime)
runtimes.delete(sessionId)

UPDATE LiveExamSession
  SET status = ENDED, endedAt = NOW()
  WHERE id = sessionId AND status = LIVE

leaderboard.snapshot(sessionId)
   ┌─────────────────────────────────────┐
   │ For each member of board:{id}:board:│
   │   UPDATE LiveExamParticipant SET    │
   │     finalScore  = ZSCORE,           │
   │     finalRank   = ZREVRANK + 1,     │
   │     correctCount = HGET correct,    │
   │     wrongCount   = HGET wrong       │
   │ Then DEL all Redis keys for this id │
   └─────────────────────────────────────┘

finalTop3 = SELECT * FROM LiveExamParticipant
            WHERE sessionId AND finalRank <= 3
            ORDER BY finalRank

# Per-socket personalized result
for socket in liveSockets:
   me = SELECT * FROM LiveExamParticipant
        WHERE sessionId AND userId

     ── socket.emit('exam.ended', {
          reason,
          finalTop3,
          yourResult: me ? {
            finalScore, finalRank,
            correctCount, wrongCount
          } : null
        })
                                            (PlayPage onEnded:
                                             setPhase('ENDED'),
                                             show final score card,
                                             auto-navigate to
                                             /sessions/:id/result
                                             after ENDED_HOLD_MS)

  ── emit('exam.ended', {
       reason, finalTop3
     }) ──▶  to host:{id}
                                                                                       (HostConsole shows
                                                                                        final podium and
                                                                                        link to analytics)

INSERT LiveExamEvent type=END payload={reason}
```

After `finalizeExam`, the source of truth shifts entirely to Postgres. Redis is wiped. Players opening `/sessions/:id/result` now hit REST endpoints (`resultMe`, `resultHost`) instead of WebSocket.

---

## 5. Inbound Event Reference (client → server)

| Event | Payload | Sender | Server action | Failure modes |
|-------|---------|--------|---------------|---------------|
| `lobby.join` | `{ sessionId }` | player/host | Upsert participant; join lobby room; on LIVE: also join live room and replay current question | session not found, full, etc. → `{ ok: false, error }` ack |
| `lobby.leave` | `{ sessionId }` | player | Soft leave (room only, participant row stays) | none |
| `host.watch` | `{ sessionId }` | host | Verify ownership; join `host:{id}` + `lobby:{id}` | `FORBIDDEN` if not owner |
| `host.start` | `{ sessionId }` | host | LOBBY → LIVE; build runtime; start phase loop | service throws if not LOBBY |
| `host.end` | `{ sessionId }` | host | Force-end via `closeOutCurrentQuestion + finalizeExam` (or service.forceEnd if still LOBBY) | none |
| `host.kick` | `{ sessionId, userId }` | host | Delete participant; broadcast `lobby.playerLeft` with `kicked: true` | `FORBIDDEN`, `KICK_ONLY_IN_LOBBY` |
| `exam.answer` | `{ sessionId, questionId, answer }` | player | Validate → grade → score → INSERT answer → ack → host telemetry | `NO_RUNTIME`, `PHASE_CLOSED`, `FORBIDDEN_ROLE`, `STALE_QUESTION`, `INVALID_ANSWER`, `NOT_PARTICIPANT`, `ALREADY_ANSWERED` |

---

## 6. Outbound Event Reference (server → client)

| Event | Room | Payload | Triggered by | Client behavior |
|-------|------|---------|--------------|-----------------|
| `lobby.state` | joining socket | `{ players[], count }` | `lobby.join` | Replace lobby roster |
| `lobby.playerJoined` | `lobby:{id}` (excl. self) | `{ userId, displayName }` | `lobby.join` | Add player tile |
| `lobby.playerLeft` | `lobby:{id}` | `{ userId, kicked? }` | `lobby.leave`, `host.kick` | Remove player; if `kicked` and it's me → navigate away |
| `exam.started` | `live:{id}` | `{ serverStartAt, totalQuestions }` | `host.start` | Lobby page navigates to `/play` |
| `exam.question` | `live:{id}` | `{ index, question, dispatchedAt, perQuestionSec, totalQuestions, phase }` | `dispatchNextQuestion` | Render question, start countdown from `dispatchedAt` |
| `host.questionView` | `host:{id}` | same + `reveal` (correct answer) | `dispatchNextQuestion` | Host sees question with correct answer highlighted |
| `exam.answerAck` | submitter | `{ recorded, answeredMs }` | accepted answer | `OPEN` → `ANSWERED`, lock UI |
| `exam.answerError` | submitter | `{ code, message? }` | validation failure | Surface error toast |
| `host.answerStream` | `host:{id}` | `{ userId, displayName, isCorrect, display, answeredMs, answeredCount, totalPlayers }` | each accepted answer | Push row into live answer feed; update progress bar |
| `exam.questionLocked` | `live:{id}` | `{ index, reveal, explanation }` | `closeOutCurrentQuestion` | `ANSWERED` → `LOCKED`, play sound, confetti if correct, show explanation |
| `host.fullLeaderboard` | `host:{id}` | `{ rows: all }` | `revealLeaderboard` | Replace host leaderboard table |
| `leaderboard.update` | `host:{id}` | `{ top10 }` | `revealLeaderboard` | Update host top10 widget |
| `leaderboard.reveal` | per-socket | `{ top10, yourRank, yourPrevRank, yourDelta, yourScore, yourAwardedPoints, yourIsCorrect, interstitialSec }` | `revealLeaderboard` | `LOCKED` → `INTERSTITIAL`, show podium + personal delta arrow + "+points" toast |
| `exam.ended` | per-socket (live) + `host:{id}` | `{ reason, finalTop3, yourResult? }` | `finalizeExam` | `ENDED`; auto-navigate to result page after hold |
| `auth_error` | emitting socket | `{ message }` | `userOr401` failure | Force re-login |

---

## 7. Question Types

| Type | Question payload | Answer payload (wire) | Stored answer payload | Grading |
|------|------------------|-----------------------|----------------------|---------|
| `MULTIPLE_CHOICE` | `{ options[], correctOptionId }` | `{ optionId }` | same | `optionId === correctOptionId` |
| `SHORT_ANSWER` | `{ acceptedAnswers[], caseSensitive }` | `{ text }` | same | normalized text ∈ acceptedAnswers |
| `SENTENCE_REORDER` | `{ fragments[], correctOrder[] }` | `{ order[] }` (positions in **shuffled** array) | `{ order[] }` (positions in **original** array, after un-mapping) | `translatedOrder === correctOrder` |

The `SENTENCE_REORDER` shuffle is generated fresh in `dispatchNextQuestion` and stored on the runtime so:
- Players who rejoin mid-question see the same shuffled order.
- Server can translate submitted positions back to original indices for grading + storage.

---

## 8. Scoring Formula

```
awardedPoints = isCorrect
   ? round(basePoints * (0.5 + 0.5 * (1 - answeredMs / perQuestionMs)))
   : 0
```

- Instant correct ≈ `basePoints` (full marks)
- Last-millisecond correct ≈ `0.5 * basePoints` (half marks)
- Wrong / timeout = `0`

Important: scoring runs in `handleAnswer`, but the leaderboard ZSET is **only updated** in `closeOutCurrentQuestion`. This means while a question is open, the player ranking does not move — preventing leaderboard flicker mid-question.

---

## 9. Persistence Split

| Layer | Holds | Lifetime |
|-------|-------|----------|
| **Postgres** | Templates, sessions, snapshot questions, answers, audit events, final scores | Permanent |
| **Redis** | `exam:{sid}:state` (HASH — phase, qIndex, qStartAt, qEndAt, version), `exam:{sid}:questions` (JSON snapshot), `liveexam:{sid}:board` (ZSET ranks), `liveexam:{sid}:meta:{userId}` (HASH correct/wrong) | LIVE phase only — wiped by `leaderboard.snapshot()` + `redisState.cleanup()` in `finalizeExam` |
| **BullMQ** | `next-question`, `lock-question`, `reveal-leaderboard`, `duration-cap` jobs with deterministic jobIds | Jobs are enqueued per phase transition and auto-removed on completion |

**Multi-instance safe:** Phase state lives in Redis (`exam:{sid}:state` HASH), transitions are guarded by Lua CAS scripts (version counter), and all timers run as BullMQ delayed jobs with deterministic `jobId`s (dedup). The Socket.IO Redis adapter fans events to all nodes. Any node can process any job.

---

## 10. Key Files

### Backend (`apps/api/src/live-exam/`)
- `live-exam.gateway.ts` — WebSocket gateway, lobby/answer handlers, Socket.IO Redis adapter setup
- `live-exam-redis-state.service.ts` — Redis HASH state management, Lua CAS transition scripts
- `live-exam-queue.service.ts` — BullMQ queue + worker (next-question, lock, reveal, duration-cap)
- `live-exam.service.ts` — Session lifecycle (create, start, join, force-end)
- `live-exam-template.service.ts` — Template CRUD, publish/archive
- `live-exam-scoring.service.ts` — Time-weighted scoring formula
- `live-exam-leaderboard.service.ts` — Redis ZSET leaderboard + snapshot
- `live-exam-question-types.ts` — Validation, grading, dispatch shaping (per type)
- `live-exam.controller.ts` — REST endpoints (templates, sessions, results)
- `apps/api/prisma/schema.prisma` — Models (lines 156–1042)

### Frontend (`apps/web/src/`)
- `lib/live-exam-socket.ts` — Socket.io client singleton with auto-reconnect
- `lib/live-exam-types.ts` — Shared type defs
- `app/(learner)/live/page.tsx` — Template browser
- `app/(learner)/live/templates/[id]/edit/page.tsx` — Template editor
- `app/(learner)/live/sessions/[id]/lobby/page.tsx` — Lobby
- `app/(learner)/live/sessions/[id]/play/page.tsx` — Player FSM (`WAITING`/`OPEN`/`ANSWERED`/`LOCKED`/`INTERSTITIAL`/`ENDED`)
- `app/(learner)/live/sessions/[id]/host/page.tsx` — Host console
- `app/(learner)/live/sessions/[id]/result/page.tsx` — Results (player + host modes)
- `app/(learner)/live/join/page.tsx` — Join by 6-digit code
