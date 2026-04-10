# Real-time Live Exam & Leaderboard — Implementation Plan (v4)

**Feature**: Kahoot-style user-hosted real-time multiple-choice exam with live leaderboard.
**Stack**: NestJS 11 · Prisma 5 · PostgreSQL · Redis (ioredis) · Socket.io · Next.js 16 frontend
**Approach**: TDD (Red-Green-Refactor), Prisma, **independent of existing `Test` module**.

> **Scope note**: Notifications (admin broadcast, outbox pattern, SES/SNS fan-out) have been **split out into a separate follow-up plan** to keep this scope tight and shippable. See *Future work* at the bottom.

---

## 0. What's in scope

- **Any authenticated user can author and host** a standalone MCQ exam room (no reuse of `Test` module). Users are the "hosts".
- **Admin is observer-only**: global dashboard listing all rooms with status, host, player count, started/ended timestamps, and a kill switch — **no authoring, no starting**.
- Time-weighted scoring — faster correct answers earn more points.
- Real-time leaderboard via Redis ZSET + Socket.io.
- Exam room with **three join methods**: invite link, QR code, 6-digit join code.
- Waiting room shows all joined players + live count.
- **Manual start** — exam only begins when the **host** clicks Start.
- Hard time cap per exam; auto-end when timer expires.
- Result screen: final score, wrong/correct counts, **Top 3 podium**, full leaderboard, per-question breakdown with explanations colored by status.
- **History** — both hosts and players can revisit any ENDED exam they were part of. Clicking an entry opens the **same result screen** as the live post-exam view. For players, the result page additionally renders the **per-question review section** (their choice vs. correct option, explanation, timing, awarded points). For hosts, history opens the host-view leaderboard snapshot (no per-question "my answer" since the host did not play).

## What's out of scope (deferred)

- Admin-to-all-users notifications (email / push / in-app outbox pattern).
- Exam scheduling / T-15m reminder emails.
- Multi-device lockout + anti-cheat proctoring.
- AWS SES / SNS integration.

---

## 0.1 Roles & permissions

| Role | Can author exam | Can host (Start/End) | Can join & play | Admin dashboard | Kill any room |
|---|---|---|---|---|---|
| **Host** (any logged-in user) | ✅ (own only) | ✅ (own only) | ✅ | ❌ | ❌ |
| **Player** (any logged-in user) | — | — | ✅ | ❌ | ❌ |
| **Admin** | ❌ | ❌ | ✅ | ✅ | ✅ |

Key points:
- A "host" is simply a regular user who happens to own a `LiveExam`. No special role needed — ownership is enforced via `LiveExam.createdById == currentUser.id`.
- Admin has **no authoring rights**. They cannot create, edit, or start exams. Their powers are strictly observational: list rooms, drill into a room to see participants & leaderboard (read-only), and force-end a room if needed.
- A user can be a host in one exam and a player in another simultaneously.

---

## 1. Domain model (Prisma)

Add to `apps/api/prisma/schema.prisma`. All new, nothing touches existing `Test`.

```prisma
model LiveExam {
  id              String            @id @default(cuid())
  title           String
  description     String?
  durationSec     Int               // total exam time cap
  perQuestionSec  Int               // per-question time (for time-weighted scoring)
  joinCode        String            @unique  // 6-digit code
  inviteSlug      String            @unique  // for shareable link
  status          LiveExamStatus    @default(DRAFT)
  startedAt       DateTime?
  endedAt         DateTime?
  createdById     String            // the HOST (any user; not necessarily admin)
  createdBy       User              @relation(fields: [createdById], references: [id])
  questions       LiveExamQuestion[]
  participants    LiveExamParticipant[]
  events          LiveExamEvent[]
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  @@index([status])
}

model LiveExamQuestion {
  id            String   @id @default(cuid())
  examId        String
  orderIndex    Int
  prompt        String
  options       Json     // [{id:"A",text:"..."},{id:"B",text:"..."}...]
  correctOption String   // "A" | "B" | "C" | "D"
  explanation   String?
  points        Int      @default(1000)   // base points before time weighting
  exam          LiveExam @relation(fields: [examId], references: [id], onDelete: Cascade)
  answers       LiveExamAnswer[]
  @@unique([examId, orderIndex])
}

model LiveExamParticipant {
  id           String   @id @default(cuid())
  examId       String
  userId       String
  displayName  String
  joinedAt     DateTime @default(now())
  finalScore   Int?
  finalRank    Int?
  correctCount Int      @default(0)
  wrongCount   Int      @default(0)
  exam         LiveExam @relation(fields: [examId], references: [id], onDelete: Cascade)
  user         User     @relation(fields: [userId], references: [id])
  answers      LiveExamAnswer[]
  @@unique([examId, userId])
  @@index([examId, finalScore])
}

model LiveExamAnswer {
  id             String   @id @default(cuid())
  participantId  String
  questionId     String
  selectedOption String?   // null if time ran out
  isCorrect      Boolean
  answeredMs     Int       // ms from question dispatch -> submission (server-computed)
  awardedPoints  Int       // after time-weighting
  createdAt      DateTime  @default(now())
  participant    LiveExamParticipant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  question       LiveExamQuestion    @relation(fields: [questionId], references: [id])
  @@unique([participantId, questionId])
}

model LiveExamEvent {
  id        String   @id @default(cuid())
  examId    String
  userId    String?
  type      String   // JOIN | LEAVE | START | END | ANSWER | KICK
  payload   Json?
  createdAt DateTime @default(now())
  exam      LiveExam @relation(fields: [examId], references: [id], onDelete: Cascade)
  @@index([examId, createdAt])
}

enum LiveExamStatus { DRAFT PUBLISHED LOBBY LIVE ENDED CANCELLED }
```

Migration: `pnpm prisma migrate dev --name add_live_exam`.

---

## 2. Module layout

```
apps/api/src/live-exam/
  live-exam.module.ts
  live-exam.controller.ts            # admin CRUD + learner join/preview/result
  live-exam.service.ts               # lifecycle: DRAFT -> PUBLISHED -> LOBBY -> LIVE -> ENDED
  live-exam-scoring.service.ts       # time-weighted scoring
  live-exam-leaderboard.service.ts   # Redis ZSET ops
  live-exam.gateway.ts               # /live-exam WS namespace
  dto/*.ts
  __tests__/*.spec.ts
```

New deps: `qrcode`, `nanoid` (for 6-digit join codes + invite slugs).

---

## 3. Lifecycle (state machine)

```
DRAFT ──(publish)──> PUBLISHED ──(open lobby)──> LOBBY ──(admin Start)──> LIVE ──(timer 0 or admin End)──> ENDED
                          └──────────(cancel)──────────┘
```

- **DRAFT** — host edits title/questions.
- **PUBLISHED** — sharable; join code + invite link + QR are valid. Players can enter the lobby.
- **LOBBY** — waiting room; shows all joined players + count. **Host** sees the Start button.
- **LIVE** — server-authoritative timer ticks; questions dispatched. Each question runs through a fixed phase loop: **OPEN → LOCKED → INTERSTITIAL → next** (see §5.1). Players cannot advance independently — everyone is synchronized to the server clock.
- **ENDED** — results frozen and displayed.

Ownership is enforced on every mutating action: any endpoint or WS message that transitions state (`publish`, `open-lobby`, `admin.start`, `admin.end`) checks `exam.createdById === currentUser.id`. Admins can only force-end via a dedicated moderator endpoint (see §10).

---

## 4. Join methods (three options)

1. **Invite link** — `https://<web>/live/join/:inviteSlug` → GET exam meta → click Join → WS connect.
2. **QR code** — admin host screen renders `qrcode(inviteLink)`. Mobile scans → opens link.
3. **6-digit join code** — user types at `/live/join` page → `GET /live-exams/by-code/:code` → Join.

All three paths converge on `joinExam(examId, userId)` → creates `LiveExamParticipant` → broadcasts `lobby.playerJoined` to the lobby room.

**Endpoints**
- `GET  /live-exams/by-slug/:slug` → exam meta (no questions)
- `GET  /live-exams/by-code/:code` → exam meta
- `POST /live-exams/:id/join` → creates participant, returns lobby snapshot
- `GET  /live-exams/:id/qr` → PNG stream of invite link (admin host screen)

---

## 5. Time-weighted scoring (TDD)

**Formula** (Kahoot-style):
```
awardedPoints = isCorrect
  ? round( basePoints * (0.5 + 0.5 * (1 - answeredMs / perQuestionMs)) )
  : 0
```
- Answer at t=0ms → full `basePoints` (1000).
- Answer at t=perQuestionMs → half points (500) — still rewards speed but not brutally.
- Wrong or timeout → 0.

Example table (basePoints=1000, perQuestionSec=20):

| answeredMs | isCorrect | awardedPoints |
|---|---|---|
| 0     | ✓ | 1000 |
| 5000  | ✓ | 875  |
| 10000 | ✓ | 750  |
| 20000 | ✓ | 500  |
| 8000  | ✗ | 0    |
| null (timeout) | ✗ | 0 |

**Tests (Red first)** — `live-exam-scoring.service.spec.ts`:
- `full points when answered instantly`
- `half points when answered at final ms`
- `zero when wrong`
- `zero on timeout (selectedOption null)`
- `idempotent — second submission for same question ignored`
- `score clamps to integer`

---

## 5.1 Per-question phase flow (synchronized, server-driven)

The exam is **not** self-paced. Submitting an answer does not advance the player — every client is locked to the server clock and moves through each question in lockstep. This is what makes the leaderboard feel like Kahoot: everyone sees the new rankings at the same instant, between questions.

### Phase machine (per question)

```
       ┌──────────────────── perQuestionSec ────────────────────┐
       │                                                        │
   OPEN ─────────────────────────────────────────► LOCKED ──► INTERSTITIAL ──► (next OPEN)
   ▲                                              ▲           ▲
   │                                              │           │
   server emits exam.question                     │           server emits leaderboard.reveal
   (clients render question + countdown)          │           (clients render leaderboard for
                                                  │            interstitialSec, then auto-clear)
                                                  server emits exam.questionLocked
                                                  (clients freeze inputs, "waiting for others…")
```

Each phase is **server-authoritative**. Clients only render what the server tells them to render — they do **not** run their own per-question timer for state transitions (only a visual countdown synced to `serverNow + remainingMs`).

### Phase 1 — `OPEN` (length: `perQuestionSec`)

- Server writes `liveexam:{id}:qstart = now()` and `liveexam:{id}:qphase = OPEN` for the current question.
- Server emits `exam.question` to room `live:{id}` with `{index, question, dispatchedAt, perQuestionSec, phase: 'OPEN'}`.
- Server schedules `setTimeout(perQuestionSec * 1000, lockQuestion)`.
- Players may submit `exam.answer` exactly **once**. The answer is recorded with `answeredMs = now - qstart` and a per-(participant, question) idempotency lock prevents resubmits.
- Server replies privately with `exam.answerAck` containing `{recorded: true, answeredMs}`. **It does NOT yet reveal correctness, awarded points, or rank.** Revealing those mid-question would let early answerers screenshot and signal teammates, and would also spoil the "everyone waits" tension.
- After the player has answered, their UI flips to a "Locked in — waiting for others (Xs left)" state. The countdown keeps ticking. They cannot un-answer, cannot leave the question, cannot see anyone else's answer.
- If a player has not answered when the timer expires, their answer for that question is recorded as `selectedOption = null, isCorrect = false, awardedPoints = 0`.

### Phase 2 — `LOCKED` (instantaneous, just a state flip)

- Triggered by the `perQuestionSec` timeout from Phase 1.
- Server sets `liveexam:{id}:qphase = LOCKED`.
- Server iterates all participants and **closes out** the current question:
  - For anyone with no `LiveExamAnswer` row for this `(participantId, questionId)`, insert a timeout row (`null` choice, 0 points).
  - For everyone who answered, the row already exists from Phase 1.
- Server then runs scoring: for each answer just finalized, call `LiveExamScoringService.score()` and `LiveExamLeaderboardService.addPoints()`. Scoring during Phase 1 was *recorded* but **not yet applied to the leaderboard** — Phase 2 is when the ZSET is updated, atomically, in a single batch per question. This is what gives the "everyone sees the leaderboard jump together" effect.
- Server emits `exam.questionLocked` to `live:{id}` with `{index, correctOption, explanation}`. Now — and only now — clients learn which option was correct and can paint their own choice green/red.
- Server immediately schedules `setTimeout(0, revealLeaderboard)` (next tick).

> **Why batch the ZSET updates here instead of on each answer?**
> 1. The leaderboard appears to "freeze" during a question and "jump" between questions, which is the desired UX.
> 2. It prevents leaking the rank delta back to fast answerers via `exam.answerAck` (which would let them infer correctness mid-question).
> 3. It collapses N writes into one batched pipeline call to Redis, reducing fan-out chatter.

### Phase 3 — `INTERSTITIAL` (length: `interstitialSec`, default 5)

- Server reads `LiveExamLeaderboardService.getTop(examId, 10)` and emits `leaderboard.reveal` to `live:{id}` with the payload below. Each player **also** receives their own `{yourRank, yourScore, yourDelta, yourAwardedPoints, yourIsCorrect}` privately on the same event (the gateway writes per-socket).
- Clients switch from the question screen to the leaderboard screen. They see:
  - The Top 10 for the room.
  - Their own row pulled out and highlighted (with rank arrow ↑/↓/= vs. previous question).
  - Their own awarded points for the question they just finished, with correct/wrong indicator.
- A visible "Next question in 5…" countdown ticks down on the client, synced to `serverNow + interstitialMs`.
- Server schedules `setTimeout(interstitialSec * 1000, dispatchNextQuestion)`.
- When the timer fires: increment question index, return to Phase 1 (`OPEN`) for the next question. If no questions remain, transition exam → `ENDED`.

### Phase 4 — Last question's INTERSTITIAL is replaced by `ENDED`

- After the final question's `INTERSTITIAL`, the server skips dispatching a next question and instead transitions to `ENDED`, calling `LiveExamLeaderboardService.snapshot()` to persist `finalScore` / `finalRank` and clear Redis keys. Clients receive `exam.ended` and route to the result screen (§8).

### New schema field

Add to `LiveExam` in §1:

```prisma
interstitialSec  Int   @default(5)   // length of inter-question leaderboard reveal
```

And update the migration name to `add_live_exam_with_phases` (or chain a follow-up migration `add_live_exam_interstitial_sec` if Phase 1 already shipped).

### New Redis keys

```
liveexam:{examId}:qphase          STRING  OPEN | LOCKED | INTERSTITIAL
liveexam:{examId}:qindex          STRING  current 0-based question index
liveexam:{examId}:prevRank:{uid}  STRING  previous question's rank (for ↑/↓ arrow)
```

`prevRank` is overwritten in Phase 2 right after the new ZSET state is applied — the value written is the rank *before* the update so that clients can compute the delta. It's cleared in `snapshot()`.

### Anti-cheat / fairness implications

- Answer submissions that arrive **after** Phase 1 ends (i.e. server already moved to LOCKED) are rejected with `exam.answerError = { code: 'PHASE_CLOSED' }`. The unique index on `(participantId, questionId)` is the second line of defense against this.
- Because correctness is not revealed until Phase 2, there is no information channel from "I answered" → "did I get it right?" during Phase 1. A network-sniffing player learns nothing extra.
- Late joiners (allowed per §14) start at the *current phase* of the *current question*. If they join during INTERSTITIAL they immediately see the leaderboard and wait for the next question. If they join during OPEN they get the remaining time. If they join during LOCKED they wait ~0ms for INTERSTITIAL.

### Tests added to §12

```
live-exam.gateway.e2e-spec.ts
  - phase OPEN → LOCKED → INTERSTITIAL → next OPEN runs on server timer, not on answer count
  - exam.answerAck during OPEN does NOT include isCorrect / awardedPoints / rank
  - leaderboard.reveal includes top10, yourRank, yourDelta, yourAwardedPoints, yourIsCorrect
  - all participants receive leaderboard.reveal within 200ms of each other (synchronization)
  - answer submitted after LOCKED is rejected with PHASE_CLOSED
  - participant who never answered gets a timeout row inserted in Phase 2
  - prevRank is captured before the ZSET batch update so deltas are correct
  - last question's INTERSTITIAL transitions to ENDED instead of dispatching another question
```

---

## 6. Leaderboard (Redis ZSET, TDD)

### Keys
```
liveexam:{examId}:board       ZSET   score=points      member=userId
liveexam:{examId}:meta:{uid}  HASH   {name, correct, wrong, lastAt}
liveexam:{examId}:lobby       SET    userIds currently in lobby
liveexam:{examId}:qstart      STRING epoch ms of current question dispatch
```

### `LiveExamLeaderboardService` API
- `addPoints(examId, userId, delta)` → `ZINCRBY` (atomic, O(log N))
- `getTop(examId, n=10)` → `ZREVRANGE … WITHSCORES`
- `getTop3(examId)` → podium shortcut
- `getRank(examId, userId)` → 1-indexed
- `snapshot(examId)` → writes finalScore/finalRank into `LiveExamParticipant`, deletes Redis keys

**Tests**:
- `addPoints accumulates`
- `getTop sorted desc`
- `getTop3 returns exactly 3 or fewer`
- `snapshot persists all ranks and cleans Redis`
- concurrency: 100 parallel `addPoints` produces correct sum

---

## 7. Gateway — `/live-exam` namespace

Follows `chat.gateway.ts` + `speaking.gateway.ts` patterns. Uses existing `@socket.io/redis-adapter` for multi-instance fan-out.

### Connection
Handshake: `?token=<jwt>&examId=<id>`. Gateway validates JWT via `CognitoJwtStrategy.validate()`.

### Rooms
- `lobby:{examId}` — players in waiting room
- `live:{examId}` — active participants during exam
- `host:{examId}` — host-only channel (receives extra telemetry: full leaderboard, join/leave events)
- `mod:global` — admins subscribe here to receive rolling snapshots of every active room

### Client → Server
| Event | Payload | Purpose |
|---|---|---|
| `lobby.join` | `{examId}` | Enter waiting room |
| `lobby.leave` | `{examId}` | Leave |
| `host.start` | `{examId}` | Host clicks Start (ownership-checked) |
| `exam.answer` | `{questionId, option}` | Submit answer |
| `host.end` | `{examId}` | Manual early end by host (force-end, available in any LIVE phase) |
| `host.kick` | `{examId, userId}` | Host removes a player from lobby |
| `host.watch` | `{examId}` | Host subscribes to the live exam as read-only viewer (joins `host:{id}` room; never joins `live:{id}`, so cannot answer) |
| `mod.forceEnd` | `{examId}` | Admin-only force end (role-checked) |

### Server → Client
| Event | Payload | Target |
|---|---|---|
| `lobby.state` | `{players: [...], count}` | `lobby:{id}` on join |
| `lobby.playerJoined` | `{player}` | `lobby:{id}` |
| `lobby.playerLeft` | `{userId}` | `lobby:{id}` |
| `exam.started` | `{serverStartAt, totalQuestions}` | `live:{id}` |
| `exam.question` | `{index, question, dispatchedAt, perQuestionSec, phase:'OPEN'}` | `live:{id}` |
| `exam.answerAck` | `{recorded:true, answeredMs}` — **no correctness/points/rank** (revealed later) | single socket |
| `exam.answerError` | `{code:'PHASE_CLOSED'\|'ALREADY_ANSWERED'}` | single socket |
| `exam.questionLocked` | `{index, correctOption, explanation}` — input freezes | `live:{id}` |
| `leaderboard.reveal` | `{top10, yourRank, yourDelta, yourScore, yourAwardedPoints, yourIsCorrect, interstitialSec}` | `live:{id}` (per-socket personalized fields) |
| `leaderboard.update` | `{top10}` — host/admin telemetry only, fired alongside `leaderboard.reveal` | `host:{id}` + `mod:global` |
| `host.questionView` | `{index, question, correctOption, dispatchedAt, perQuestionSec, phase}` — full question payload **including the correct option** so the host screen can highlight it from the start | `host:{id}` only |
| `host.answerStream` | `{userId, displayName, answeredMs, answeredCount, totalPlayers}` — fired on every player answer for the live "X of Y answered" tile | `host:{id}` only |
| `host.fullLeaderboard` | `{rows:[{rank, userId, name, score, correct, wrong}]}` — full board (not just top 10) refreshed each interstitial | `host:{id}` only |
| `exam.tick` | `{phase, remainingMs}` | `live:{id}`, every 1s |
| `exam.ended` | `{finalTop3, yourResult}` | `live:{id}` |
| `mod.roomSnapshot` | `{exams:[{id, host, status, playerCount, ...}]}` | admin `mod:global` room, every 2s |

### Server-authoritative timing (critical)
- On `host.start`: write `liveexam:{id}:qstart = now()`, `qphase = OPEN`, `qindex = 0` for Q1, emit `exam.question`.
- Answer's `answeredMs` is **computed server-side** as `Date.now() - qstart`. Any client-supplied timestamp is ignored (anti-cheat).
- The full per-question phase loop (`OPEN → LOCKED → INTERSTITIAL → next`) is driven by server `setTimeout` chains — see §5.1. Players answering early do **not** shorten any phase; everyone is held until `perQuestionSec` elapses, then together released into the leaderboard interstitial, then together into the next question.
- Clients cannot trigger progression. The only client→server messages during LIVE are `exam.answer` (subject to phase check) and `host.end`.
- Exam total `durationSec` is a hard cap: a top-level `setTimeout` ends the exam regardless of question progress, even mid-INTERSTITIAL.

---

## 8. Result screen (frontend)

Route: `apps/web/src/app/(learner)/live/[id]/result/page.tsx`.

Sections (top → bottom):

1. **Hero — my result**: big final score, rank badge, correct/wrong count tiles.
2. **Podium — Top 3**: custom 2nd / 1st / 3rd column layout (heights 80% / 100% / 70%), crown/medal icons, avatars, name, score. Neo-brutalist cards with offset shadows per UI memory.
3. **Leaderboard table — ranks 4+**: compact rows; current user's row highlighted.
4. **Question breakdown** — one card per question:
   - **Correct** → green border + check icon.
   - **Wrong** → red border + cross icon, shows your choice vs correct answer.
   - **Timeout** → gray + clock icon.
   - Collapsible `explanation`.
   - Answer timing: "Answered in 4.2s · +875 pts".

---

## 8.1 History (host & player)

Both roles get a history list of every ENDED exam they were part of. Clicking an entry routes straight into the same `result` page used immediately after an exam finishes — no new screen to build, only a read path that hydrates it from persisted DB state instead of in-memory Redis.

### Who sees what

| Role | List source | Clicking an entry shows |
|---|---|---|
| **Player** | every `LiveExamParticipant` row where `userId == me` and `exam.status == ENDED` | Hero (my score/rank) · Podium · Full leaderboard · **Question breakdown section** (per-question: my choice, correct option, explanation, timing, awarded points) |
| **Host** | every `LiveExam` where `createdById == me` and `status == ENDED` | Hero (exam meta + totals) · Podium · Full leaderboard · Event log summary (joins/leaves/kicks count) · **No "my answer" question section** — host did not play. Instead shows an aggregate per-question card: % correct, avg answer ms, distribution by option. |

The result page detects mode from the requester: if the caller is a participant, it renders the player breakdown; if the caller is the host, it renders the host aggregate breakdown; if both (host who also played, rare), the UI shows a tab toggle.

### Data source after ENDED

At exam end, `LiveExamLeaderboardService.snapshot()` already writes `finalScore` / `finalRank` / `correctCount` / `wrongCount` onto `LiveExamParticipant` and deletes the Redis ZSET. History reads therefore hit **Postgres only** — no Redis dependency post-exam, no recomputation. Per-question answers are already persisted in `LiveExamAnswer`, so the breakdown is a straight join.

### REST endpoints (added to §10)

**Player history**
| Method | Path | Purpose |
|---|---|---|
| GET | `/live-exams/history/mine` | Paginated list of ENDED exams I played. Returns `{examId, title, endedAt, myScore, myRank, correctCount, wrongCount, totalPlayers}` per row. |
| GET | `/live-exams/:id/result/me` | (already in plan) Full player result + per-question breakdown. Reused by history. |

**Host history**
| Method | Path | Purpose |
|---|---|---|
| GET | `/live-exams/history/hosted` | Paginated list of ENDED exams I hosted. Returns `{examId, title, endedAt, playerCount, avgScore, topScore, topPlayerName}` per row. |
| GET | `/live-exams/:id/result/host` | Host-view result: exam meta, final leaderboard, per-question aggregate stats (`{questionId, correctRate, avgAnsweredMs, optionDistribution}`). Auth: `createdById == me`. |

Both listing endpoints support `?take=20&cursor=<examId>` cursor pagination ordered by `endedAt DESC`.

### Frontend routes (added to §11)

```
apps/web/src/app/(learner)/live/
  history/
    page.tsx                 # unified history page with two tabs: "Played" and "Hosted"
                             # - tab "Played" uses GET /live-exams/history/mine
                             # - tab "Hosted" uses GET /live-exams/history/hosted (only if user has hosted any)
                             # Row click → /live/[id]/result?mode=player|host
  [id]/result/page.tsx       # existing result screen — now accepts ?mode= query:
                             #   mode=player (default) → fetches /result/me, shows question breakdown section
                             #   mode=host             → fetches /result/host, shows aggregate breakdown
```

The existing live-flow result page (reached at `exam.ended` time) passes `mode=player` implicitly. The history flow is just another entry point into the same route.

### Gating & ownership

- `/result/me` requires a `LiveExamParticipant` row for `(examId, currentUser.id)`.
- `/result/host` requires `exam.createdById == currentUser.id`.
- Admin can read either via the existing `/admin/live-exams/:id` read endpoint — history for admin is already covered by §10 admin routes, so no new admin endpoint.

### Tests (added to §12)

```
live-exam.service.spec.ts
  - getMyHistory returns only ENDED exams the user participated in
  - getMyHistory cursor paginates by endedAt desc
  - getHostedHistory returns only exams the user created
  - getPlayerResult throws when user was not a participant
  - getHostResult throws when user is not the host
  - getHostResult aggregate: correctRate/avgMs/optionDistribution match fixture
```

### Edge cases (added to §14)

| Case | Mitigation |
|---|---|
| User played but never answered a question | History row still shows (score 0, rank last); result screen shows all questions as "Timeout". |
| Exam deleted after ending (host DELETE) | Hard-delete cascades `LiveExamParticipant`; history row disappears for everyone. Consider soft-delete if this is user-hostile — open question for phase 6. |
| Host also joined as a player | Both history tabs show the row; result page offers the player/host toggle. |
| Very old exams | No retention policy yet; deferred. If DB grows, add a nightly job to archive `LiveExamAnswer` older than N months. |

---

## 8.2 Host live screen (read-only viewer + force-end)

While players are taking the exam, the host needs a dedicated screen that lets them **watch the room without participating**. The host is not a player — they did not create a `LiveExamParticipant` row, so they have no answers, no rank, and no score. Their only inputs during LIVE are observing and (optionally) force-ending the exam.

Route: `apps/web/src/app/(learner)/live/[id]/host/page.tsx` — already listed in §11. This section spells out what's on it.

### Access rules

- Server requires `exam.createdById === currentUser.id`. Anyone else hitting this route is redirected to `/live/[id]/play` if they are a participant, or 403 otherwise.
- The host page emits `host.watch` on mount, which makes the gateway add the socket to the `host:{id}` room only. It is **never** added to `live:{id}`, so it cannot receive `exam.question` and cannot send `exam.answer`. This is enforced server-side, not just by hiding UI.
- If the host is somehow already a participant in their own exam (shouldn't happen, but possible if they created the exam and then joined as a player from another tab), the host page detects it via `GET /live-exams/:id/host-view` and shows a banner: *"You're also a player in this exam — open the play tab to answer."* The host screen itself stays read-only.

### Layout (top → bottom)

1. **Header bar**
   - Exam title, join code, status pill (LOBBY / LIVE / ENDED).
   - Big red **"Force End Exam"** button (always visible during LIVE; see *Force end* below). Disabled in LOBBY (use Start there) and ENDED.
   - Question progress: `Question 3 of 10`.
   - Phase pill: `OPEN 14s` / `LOCKED` / `LEADERBOARD 5s`, color-coded, ticking down with `exam.tick`.

2. **Current question panel** (visible during OPEN + LOCKED, hidden during INTERSTITIAL)
   - Full prompt and all four options.
   - **The correct option is highlighted from the start** — the host already knows the answer key, so there is no anti-cheat reason to hide it. This is what `host.questionView` (host-only event in §7) carries. Players, by contrast, only learn the correct option in `exam.questionLocked`.
   - During OPEN: a translucent overlay says *"Players are answering — you are observing."* The options are not clickable. There is no answer button on the host screen, period.
   - During LOCKED: overlay flips to *"Time's up — calculating scores…"*.

3. **Live answer stream tile** (visible during OPEN)
   - Big counter: **`12 / 15 answered`**, updates on every `host.answerStream` event.
   - Optional ticker list: last 5 answer events as `Alice — 2.3s`, `Bob — 4.1s`, etc. Speed only — never which option they picked, so the host cannot leak hints by reading the stream out loud.

4. **Live leaderboard panel** (always visible)
   - Pulled from `host.fullLeaderboard` (refreshed each INTERSTITIAL) plus incremental `leaderboard.update` (alongside `leaderboard.reveal`).
   - Full ranked list, not just top 10 — the host wants to see everyone for room management.
   - Each row: rank, name, score, correct/wrong counts, last-answer speed.
   - Hovering a row reveals a **Kick** button (LOBBY only) — kicking during LIVE is intentionally disabled to avoid mid-exam grief.

5. **Event log drawer** (collapsible, bottom)
   - Streams `LiveExamEvent` rows live: JOIN, LEAVE, ANSWER (with timing), KICK.
   - Useful for explaining anomalies after the fact ("why did Carol disappear at Q4?").

6. **Footer**
   - "End exam now" — same action as the header force-end button, duplicated here for visibility.

### Force-end flow

The host has **two ways** to end an exam early, both invoking the exact same code path:

1. **REST**: `POST /live-exams/:id/end` — already in §10. Idempotent: if the exam is already ENDED, returns the existing snapshot.
2. **WebSocket**: `host.end` — already in §7. Same auth check (`exam.createdById === currentUser.id`).

Either path runs `LiveExamService.forceEnd(examId, userId)`:

```
1. Validate ownership.
2. Validate status: must be LOBBY or LIVE. ENDED → no-op return current snapshot. CANCELLED → 409.
3. Cancel all pending setTimeouts (current OPEN/LOCKED/INTERSTITIAL chain + the global durationSec cap).
4. If status was LIVE and the current question's answers were not yet scored
   (i.e. we are mid-OPEN), close it out the same way Phase 2 normally would:
     - Insert timeout rows for any participant who has no answer for this question.
     - Run scoring + ZSET batch update.
5. Set status = ENDED, endedAt = now().
6. LiveExamLeaderboardService.snapshot() — write finalScore/finalRank/correctCount/wrongCount
   onto LiveExamParticipant, delete Redis keys.
7. Emit `exam.ended` to live:{id}, host:{id}, and mod:global with a `reason: 'host_force_end'`.
8. Append a LiveExamEvent { type: 'END', payload: { reason: 'host_force_end', byUserId } }.
```

The crucial detail is **step 4**: a force-end mid-OPEN must still finalize the in-flight question, otherwise some participants would have answered it and others wouldn't, and the scoring would be inconsistent. Treat the force-end as if the question's timer expired right now.

### UX guardrails on the force-end button

- Single-click confirmation: clicking the red button opens an inline modal — *"End exam for all 15 players? Their current question will be scored and the leaderboard will freeze."* with **End now** / **Cancel**.
- Button is disabled while the previous force-end request is in flight (prevents double-fire).
- After success, the host page automatically routes to `/live/[id]/result?mode=host` (the same screen as §8.1 host history).

### REST endpoints (already covered in §10, no new routes needed)

| Method | Path | Notes |
|---|---|---|
| GET  | `/live-exams/:id/host-view` | Existing. Returns full participant list + live leaderboard + current phase + current question index, used by the host page on mount and on reconnect. |
| POST | `/live-exams/:id/end` | Existing. Now explicitly documented as idempotent and as the canonical force-end entry point. |

### Tests added to §12

```
live-exam.gateway.e2e-spec.ts
  - host.watch joins host:{id} only, never live:{id}
  - host socket cannot emit exam.answer (rejected with FORBIDDEN_ROLE)
  - host receives host.questionView with correctOption populated
  - host receives host.answerStream on every player answer
  - host.answerStream payload never includes the picked option (only timing)

live-exam.service.spec.ts
  - forceEnd from LOBBY transitions to ENDED with empty leaderboard
  - forceEnd mid-OPEN finalizes the current question (timeouts + scoring) before snapshot
  - forceEnd mid-INTERSTITIAL skips dispatching the next question
  - forceEnd is idempotent (second call returns same snapshot)
  - forceEnd by non-host user is rejected with FORBIDDEN
```

### Edge cases added to §14

| Case | Mitigation |
|---|---|
| Host force-ends mid-OPEN | Service step 4 closes out the in-flight question (timeout rows + scoring) before snapshot — see flow above. |
| Host force-ends from a stale tab after exam already ended naturally | Endpoint is idempotent: returns the existing snapshot without re-running scoring. |
| Host opens the host screen from two tabs | Both sockets join `host:{id}` and receive identical events. Force-end is idempotent so double-clicking from two tabs is safe. |
| Host loses network during LIVE | Exam keeps running (server-driven). On reconnect the host page calls `GET /live-exams/:id/host-view` to rehydrate phase + current question + leaderboard, then re-emits `host.watch`. |
| Host accidentally closes the tab | Same as above — exam is unaffected. They can return to the host screen at any time. |
| Force-end while a player's `exam.answer` is in flight | Phase check on the answer handler runs after the force-end has already flipped status to ENDED, so the answer is rejected with `PHASE_CLOSED`. The force-end's step 4 already inserted a timeout row for that player, so the rejected answer does not orphan their state. |

---

## 9. Waiting room (frontend)

Route: `apps/web/src/app/(learner)/live/[id]/lobby/page.tsx`.

- Header: exam title, join code, QR (for sharing from the lobby screen itself).
- Player grid: avatar tiles, live count "24 players joined".
- Pulsing "Waiting for host…" message.
- Admin-only: Start button (disabled until ≥ 1 player), plus kick controls.
- WS-driven: `lobby.playerJoined` animates tile in; `lobby.playerLeft` animates it out.

---

## 10. REST endpoint summary

### Host (any authenticated user — owner-scoped)
All routes below require JWT; service layer asserts `exam.createdById === currentUser.id`.

| Method | Path | Purpose |
|---|---|---|
| POST  | `/live-exams` | Create draft (caller becomes host) |
| GET   | `/live-exams/mine` | List exams I host |
| PATCH | `/live-exams/:id` | Update meta (DRAFT only) |
| DELETE| `/live-exams/:id` | Delete (DRAFT only) |
| POST  | `/live-exams/:id/questions` | Add MCQ |
| PATCH | `/live-exams/:id/questions/:qid` | Update MCQ |
| DELETE| `/live-exams/:id/questions/:qid` | Remove MCQ |
| POST  | `/live-exams/:id/publish` | DRAFT → PUBLISHED (generates joinCode + slug) |
| POST  | `/live-exams/:id/open-lobby` | PUBLISHED → LOBBY |
| POST  | `/live-exams/:id/start` | LOBBY → LIVE (host only) |
| POST  | `/live-exams/:id/end` | LIVE → ENDED (host only) |
| GET   | `/live-exams/:id/qr` | QR PNG of invite link |
| GET   | `/live-exams/:id/host-view` | Full participant list + live leaderboard |

### Player (any authenticated user)
| Method | Path | Purpose |
|---|---|---|
| GET   | `/live-exams/by-slug/:slug` | Meta by invite link |
| GET   | `/live-exams/by-code/:code` | Meta by join code |
| POST  | `/live-exams/:id/join` | Create participant |
| GET   | `/live-exams/:id/result/me` | My final result + per-Q breakdown (used by post-exam AND history) |
| GET   | `/live-exams/:id/result/host` | Host-view result: meta + final leaderboard + per-Q aggregates (host only) |
| GET   | `/live-exams/:id/leaderboard` | Final leaderboard (after ENDED) |
| GET   | `/live-exams/history/mine` | Cursor-paginated list of ENDED exams I played. See §8.1. |
| GET   | `/live-exams/history/hosted` | Cursor-paginated list of ENDED exams I hosted. See §8.1. |

### Admin (observer / moderator — read-only + kill switch)
All routes below require `Roles('ADMIN')`.

| Method | Path | Purpose |
|---|---|---|
| GET   | `/admin/live-exams` | List **all** rooms with filters (status, host, createdAt range) |
| GET   | `/admin/live-exams/stats` | Aggregate counters: # rooms per status, total players online, hosts online |
| GET   | `/admin/live-exams/:id` | Room detail: exam meta, host info, participant list, current leaderboard |
| GET   | `/admin/live-exams/:id/events` | Audit log from `LiveExamEvent` |
| POST  | `/admin/live-exams/:id/force-end` | Moderator kill switch — transitions any status → ENDED/CANCELLED |

> Admin endpoints are **strictly read-only plus force-end**. There is no admin create/update/publish/start.

---

## 11. Frontend routes

```
apps/web/src/app/
  (admin)/
    admin-live-exams/
      page.tsx                    # monitor dashboard: all rooms, stats, filters (read-only)
      [id]/page.tsx               # room detail: participants, leaderboard, events, force-end button
  (learner)/
    live/
      page.tsx                    # my hosted exams + quick "Create new room"
      new/page.tsx                # host: create exam + question editor
      [id]/edit/page.tsx          # host: edit draft
      [id]/host/page.tsx          # host console: lobby + Start + live leaderboard view
      join/page.tsx               # player: enter 6-digit code
      join/[slug]/page.tsx        # player: invite link landing
      [id]/lobby/page.tsx         # player: waiting room
      [id]/play/page.tsx          # player: exam runner (WS driven)
      [id]/result/page.tsx        # results with podium + breakdown — accepts ?mode=player|host (see §8.1)
      history/page.tsx            # unified history: "Played" + "Hosted" tabs, rows link into result page (see §8.1)
```

Authoring lives under `(learner)` because any user can host. The admin area has only the monitor dashboard.

Neo-brutalist UI per memory: `brutal-card`, `brutal-btn-fill`, offset shadows throughout.

### 11.1 Responsive design (mandatory for every page)

**Every page listed in §11 must be fully responsive across mobile, tablet, and desktop.** This is a hard requirement, not a polish pass — QR-code joining means a large share of players will land on phones, so mobile is a first-class target, not an afterthought.

**Breakpoints** (Tailwind defaults, aligned with existing learner pages):
- `base` (< 640px) — phone portrait. **Primary target for players joining via QR.**
- `sm` (≥ 640px) — phone landscape / small tablet.
- `md` (≥ 768px) — tablet.
- `lg` (≥ 1024px) — desktop. Primary target for hosts running the console.
- `xl` (≥ 1280px) — wide desktop (admin monitor).

**Per-page responsive rules**:

| Page | Mobile (base/sm) | Desktop (lg+) |
|---|---|---|
| `live/join` | Large tap-friendly 6-digit input, full-width `brutal-btn-fill`, min tap target 44px. | Centered card, max-w-md. |
| `live/join/[slug]` | Single-column landing, exam title + Join button stacked. | Same, centered. |
| `live/[id]/lobby` | Player list as 2-col grid, join code + QR collapsed into an accordion. Sticky "Waiting…" banner at top. | 3–4 col player grid, QR/code sidebar visible. |
| `live/[id]/host` (host console) | Start button pinned to bottom, player list scrollable above. QR in a modal, not inline. | Two-pane: left = players/leaderboard, right = QR + controls. |
| `live/[id]/play` | Question text scales via `clamp()`, options as full-width stacked buttons (never a 2×2 grid on mobile — too cramped). Timer fixed at top. | 2×2 option grid, timer in header. |
| `live/[id]/result` | Podium stacks vertically on base, 3-column on `sm+`. Per-question breakdown as an accordion on mobile, full table on `md+`. | Full podium + side-by-side breakdown. |
| `live/history` | Tabs full-width, rows as cards with score/rank badges. | Tabs + data table. |
| `live/new`, `live/[id]/edit` (question editor) | Single-column form, options stacked, sticky save bar at bottom. Host authoring on mobile is supported but not optimized — we expect most authoring on desktop. | Two-column: question list on left, editor on right. |
| `admin-live-exams` (monitor) | Card list with key stats (host, players, status). Filters in a bottom sheet. | Full data table with filters in a top bar. |
| `admin-live-exams/[id]` | Tabs: Participants / Leaderboard / Events. Force-end in a sticky footer. | Three-column dashboard. |

**Global rules** (apply to all pages above):
1. **No fixed pixel widths** on containers — use `w-full max-w-*` patterns.
2. **Tap targets ≥ 44×44px** on any interactive element that appears on mobile (buttons, option cards, tab triggers).
3. **Font scaling**: question text and podium scores use `clamp()` or `text-2xl md:text-4xl lg:text-6xl` patterns — never a single fixed size.
4. **Neo-brutalist offset shadows must scale** — use smaller offsets on mobile (`shadow-[2px_2px_0]`) and larger on desktop (`shadow-[6px_6px_0]`) so they don't overflow viewport.
5. **Horizontal scroll is forbidden** on any viewport ≥ 360px. Test with Chrome DevTools device toolbar at iPhone SE (375px) as the narrowest reference.
6. **Socket.io reconnect UX** (lobby, play, host, admin detail) — the "reconnecting…" banner must be visible and non-dismissible on mobile, pinned to the top with safe-area insets respected.
7. **Safe-area insets**: play page timer and host console Start button must respect `env(safe-area-inset-bottom)` so iOS notch / home indicator never overlap controls.
8. **Landscape phone** (height < 500px) — on `live/[id]/play`, collapse the timer into a thin top bar and keep options visible without scrolling.

**Verification**: Phase 10 E2E suite (§13) must include at least **one mobile viewport context** (iPhone 12 profile, 390×844) alongside the desktop contexts, to catch regressions where a feature works on desktop but breaks on phones.

---

## 12. Test plan (TDD)

```
live-exam-scoring.service.spec.ts      — 6 cases (time formula)
live-exam-leaderboard.service.spec.ts  — 5 cases incl. concurrency
live-exam.service.spec.ts              — lifecycle transitions, join by code/slug, idempotent join
live-exam.gateway.e2e-spec.ts          — socket.io client: lobby join → admin start → answer → leaderboard → end
```

Red-Green-Refactor strictly enforced: no production code before a failing test exists.

---

## 13. Execution order (phases)

1. **Phase 1** — Prisma models + migration + module scaffold (compiles, no logic).
2. **Phase 2 (TDD)** — `LiveExamScoringService` (time-weighted formula).
3. **Phase 3 (TDD)** — `LiveExamLeaderboardService` (Redis ZSET).
4. **Phase 4** — `LiveExamService` lifecycle + host REST endpoints + join methods (ownership guard enforced).
5. **Phase 5** — `LiveExamGateway` (WS lobby + live + answer flow + server-authoritative timer + host events).
6. **Phase 6** — Frontend: host flows — create exam, question editor, host console (lobby + Start + live view).
7. **Phase 7** — Frontend: player flows — join (code/slug), lobby, play screen.
8. **Phase 8** — Frontend: result screen (podium + breakdown).
9. **Phase 9** — Admin monitor: REST `/admin/live-exams*` + `mod:global` WS room + admin dashboard UI + force-end action.
10. **Phase 10** — Load test (1000 concurrent joiners, 500 concurrent answerers); tune Redis + gateway.

Each phase ends with `pnpm test` green + manual smoke test before advancing.

---

## 14. Edge cases addressed

| Case | Mitigation |
|---|---|
| Thundering herd on join | Redis adapter fan-out; lobby broadcasts rate-limited to 1 every 250ms. |
| Network drop / refresh mid-exam | Client persists `examId` in `localStorage`; reconnect re-issues `lobby.join` / re-subscribes to `live:{id}`; server returns authoritative state (`qstart`, current index, remaining ms). |
| Duplicate answer submission | `LiveExamAnswer` unique on `(participantId, questionId)`; second submit ignored. |
| Clock skew | Server is the only clock; `answeredMs` computed server-side. |
| Late arrival after Start | Allowed by default; user joins mid-question with already-reduced max points; missed questions scored 0. (Flag `allowLateJoin` could be added later.) |
| Host disconnects mid-exam | Exam keeps running — timer is server-driven, not host-driven. Host reconnects back into `host:{id}` room and resumes live view. |
| Host abandons in LOBBY | Background sweeper auto-cancels rooms stuck in LOBBY > 2h. Admin can also force-end. |
| User spams room creation | Per-user rate limit: max 5 exams in DRAFT, max 1 in LOBBY/LIVE simultaneously. |
| Admin force-end mid-question | Transition sets status ENDED, broadcasts `exam.ended` to all rooms, snapshots current leaderboard. |
| Race on score update | `ZINCRBY` is atomic; DB write happens once at `snapshot()` on exam end. |
| Player answers, then disconnects before LOCKED | Answer row already persisted in Phase 1; on reconnect during LOCKED/INTERSTITIAL the server replays the current phase state (`exam.questionLocked` or `leaderboard.reveal`) so they catch up without losing their answer. |
| Player disconnects mid-OPEN without answering | Phase 2 inserts a timeout row for them; on reconnect they receive the current phase snapshot and rejoin synchronized. |
| Reveal payload arrives before client renders LOCKED screen | Client treats `leaderboard.reveal` as the source of truth and skips ahead to the leaderboard view; the LOCKED frame is purely cosmetic. |
| Server crash between Phase 2 and Phase 3 | On gateway restart, a recovery routine reads `qphase` + `qindex` from Redis and resumes from the correct phase; if Redis is also gone, the exam is force-ended. |
| Clock drift between server tick emit and client render | Clients sync their visual countdown to `dispatchedAt + perQuestionSec - serverNow` on each `exam.tick`, so a slow client cannot fall behind by more than 1s. |

---

## 14.1 End-to-end multi-user test (Playwright)

In addition to the Jest unit/integration tests in §12, Phase 10 ships a **Playwright E2E suite** that drives 10–20 real browser contexts simultaneously to validate the full real-time flow end-to-end.

### Architecture of the multi-user simulation

```
                                  ┌────────────────────────┐
                                  │   test orchestrator    │
                                  │  (Playwright worker)   │
                                  └────────────┬───────────┘
                                               │ spawns N contexts
                 ┌─────────────────────────────┼────────────────────────────┐
                 ▼                             ▼                            ▼
       ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
       │ Context: host     │       │ Context: player 1 │  ...  │ Context: player N │
       │  - login          │       │  - login          │       │  - login          │
       │  - create exam    │       │  - join by code   │       │  - join by code   │
       │  - open lobby     │       │  - enter lobby    │       │  - enter lobby    │
       └─────────┬─────────┘       └─────────┬─────────┘       └─────────┬─────────┘
                 │                           │                           │
                 │       ── BARRIER 1 ──  all players reach lobby        │
                 │                           │                           │
                 ▼                           │                           │
         click "Start"                       │                           │
                 │                           ▼                           ▼
                 │                     wait for `exam.started` WS event
                 │                           │                           │
                 │       ── BARRIER 2 ──  all players in LIVE state      │
                 │                           │                           │
                 │                     answer each question              │
                 │                                                       │
                 │       ── BARRIER 3 ──  all players see result page    │
                 ▼
       assert leaderboard order matches expected ranks
```

Three synchronization barriers implemented via `Promise.all` over per-user promise-returning steps. **No `page.waitForTimeout`** — every wait is event-driven (`waitForSelector`, `waitForURL`, or a WS listener resolving a promise).

### Files
```
apps/web/e2e/
  live-exam.spec.ts           # the suite
  helpers/
    user-factory.ts           # creates N throwaway accounts via API
    ws-utils.ts               # attaches to Socket.io client in-page to wait for events
    barriers.ts               # Promise.all + named logging
  fixtures/
    test-exam.json            # 5 MCQ fixture used by the suite
playwright.config.ts          # workers: 1 (we parallelize *within* one test), fullyParallel: false for this suite
```

### Full working script — `apps/web/e2e/live-exam.spec.ts`

```ts
import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { createTestUsers, TestUser } from './helpers/user-factory';
import { waitForSocketEvent, installSocketTap } from './helpers/ws-utils';
import { barrier } from './helpers/barriers';

const PLAYER_COUNT = 15;
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API_URL  = process.env.E2E_API_URL  ?? 'http://localhost:4000/api';

type UserSession = {
  user: TestUser;
  context: BrowserContext;
  page: Page;
  log: (step: string, status?: 'ok' | 'fail', extra?: unknown) => void;
};

test.describe('Real-time live exam — multi-user', () => {
  test.setTimeout(5 * 60 * 1000); // 5 min ceiling

  test(`host + ${PLAYER_COUNT} players complete an exam`, async ({ browser }) => {
    // ---------- 1. Provision accounts via API (fast, no UI) ----------
    const [host, ...players] = await createTestUsers(API_URL, PLAYER_COUNT + 1);

    // ---------- 2. Spin up isolated browser contexts ----------
    const hostSession   = await openSession(browser, host,   'HOST');
    const playerSessions = await Promise.all(
      players.map((u, i) => openSession(browser, u, `P${i + 1}`)),
    );

    // ---------- 3. Host: login + create exam + open lobby ----------
    await loginViaUi(hostSession);
    hostSession.log('login', 'ok');

    const { joinCode, examId } = await hostCreatesExam(hostSession);
    hostSession.log('exam-created', 'ok', { examId, joinCode });

    await hostSession.page.click('[data-testid="open-lobby-btn"]');
    await hostSession.page.waitForSelector('[data-testid="host-lobby"]');
    hostSession.log('lobby-open', 'ok');

    // ---------- 4. Players: parallel login + join by code ----------
    await Promise.all(playerSessions.map(async (s) => {
      await loginViaUi(s);
      s.log('login', 'ok');

      await s.page.goto(`${BASE_URL}/live/join`);
      await s.page.fill('[data-testid="join-code-input"]', joinCode);
      await s.page.click('[data-testid="join-btn"]');
      await s.page.waitForURL(/\/live\/.*\/lobby/);
      await s.page.waitForSelector('[data-testid="lobby-waiting"]');
      s.log('joined-lobby', 'ok');

      // install an in-page tap on the Socket.io client so we can
      // resolve JS promises when specific events arrive
      await installSocketTap(s.page);
    }));

    // ---------- BARRIER 1: host sees every player in the lobby ----------
    await barrier('all-players-in-lobby', async () => {
      await expect.poll(async () => {
        return await hostSession.page.locator('[data-testid="player-tile"]').count();
      }, { timeout: 30_000, intervals: [250, 500, 1000] }).toBe(PLAYER_COUNT);
    });
    hostSession.log('lobby-full', 'ok', { count: PLAYER_COUNT });

    // ---------- 5. Host clicks Start ----------
    // Arm listeners BEFORE the click to avoid race conditions
    const startedPromises = playerSessions.map((s) =>
      waitForSocketEvent(s.page, 'exam.started', 15_000),
    );

    await hostSession.page.click('[data-testid="host-start-btn"]');
    hostSession.log('start-clicked', 'ok');

    // ---------- BARRIER 2: every player received `exam.started` ----------
    await Promise.all(startedPromises);
    playerSessions.forEach((s) => s.log('exam-started', 'ok'));

    await Promise.all(playerSessions.map((s) =>
      s.page.waitForURL(/\/live\/.*\/play/),
    ));

    // ---------- 6. Players answer all questions ----------
    // Each player answers deterministically so we can assert ranks.
    // Player index 0 = fastest all-correct, index 1 = 2nd fastest, etc.
    await Promise.all(playerSessions.map(async (s, idx) => {
      for (let q = 0; q < 5; q++) {
        const questionArrived = waitForSocketEvent(s.page, 'exam.question', 20_000);
        await questionArrived;

        // Deterministic delay: faster index → shorter delay
        const delayMs = 200 + idx * 150;
        await s.page.waitForTimeout(delayMs); // deliberate pacing, not a flaky wait

        // First 10 players always click the correct option; last 5 click wrong
        const selector = idx < 10
          ? '[data-testid="option-correct"]'
          : '[data-testid="option-wrong"]';
        await s.page.click(selector);

        const ack = await waitForSocketEvent(s.page, 'exam.answerAck', 10_000);
        s.log(`answered-q${q}`, 'ok', ack);
      }
    }));

    // ---------- BARRIER 3: everyone reaches the result screen ----------
    await Promise.all(playerSessions.map((s) =>
      s.page.waitForURL(/\/live\/.*\/result/, { timeout: 30_000 }),
    ));
    playerSessions.forEach((s) => s.log('result-visible', 'ok'));

    // ---------- 7. Assertions ----------
    // 7a. Top-3 podium shows the 3 fastest all-correct players
    const podium = hostSession.page.locator('[data-testid="podium"]');
    await expect(podium.locator('[data-rank="1"]'))
      .toContainText(playerSessions[0].user.displayName);
    await expect(podium.locator('[data-rank="2"]'))
      .toContainText(playerSessions[1].user.displayName);
    await expect(podium.locator('[data-rank="3"]'))
      .toContainText(playerSessions[2].user.displayName);

    // 7b. Each of the first 10 players sees "5 correct / 0 wrong"
    for (let i = 0; i < 10; i++) {
      const s = playerSessions[i];
      await expect(s.page.locator('[data-testid="correct-count"]')).toHaveText('5');
      await expect(s.page.locator('[data-testid="wrong-count"]')).toHaveText('0');
    }

    // 7c. Players 10–14 see "0 correct / 5 wrong"
    for (let i = 10; i < PLAYER_COUNT; i++) {
      const s = playerSessions[i];
      await expect(s.page.locator('[data-testid="correct-count"]')).toHaveText('0');
      await expect(s.page.locator('[data-testid="wrong-count"]')).toHaveText('5');
    }

    // ---------- 8. Clean up ----------
    await Promise.all([
      hostSession.context.close(),
      ...playerSessions.map((s) => s.context.close()),
    ]);
  });
});

// ---------- helpers ----------

async function openSession(
  browser: Browser,
  user: TestUser,
  label: string,
): Promise<UserSession> {
  const context = await browser.newContext({
    // Each context = its own cookie jar, localStorage, WS connection
    viewport: { width: 1280, height: 800 },
    storageState: undefined,
  });
  const page = await context.newPage();
  const log = (step: string, status: 'ok' | 'fail' = 'ok', extra?: unknown) => {
    // eslint-disable-next-line no-console
    console.log(
      `[${new Date().toISOString()}] [${label}] user=${user.id} step=${step} status=${status}`
      + (extra ? ` ${JSON.stringify(extra)}` : ''),
    );
  };
  page.on('pageerror', (err) => log('pageerror', 'fail', err.message));
  return { user, context, page, log };
}

async function loginViaUi(s: UserSession) {
  await s.page.goto(`${BASE_URL}/login`);
  await s.page.fill('[data-testid="email-input"]', s.user.email);
  await s.page.fill('[data-testid="password-input"]', s.user.password);
  await s.page.click('[data-testid="login-submit"]');
  await s.page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 15_000,
  });
}

async function hostCreatesExam(s: UserSession): Promise<{ joinCode: string; examId: string }> {
  await s.page.goto(`${BASE_URL}/live/new`);
  await s.page.fill('[data-testid="exam-title"]', `E2E Exam ${Date.now()}`);
  await s.page.fill('[data-testid="duration-sec"]', '300');
  await s.page.fill('[data-testid="per-question-sec"]', '20');

  // add 5 deterministic MCQs with a stable "correct" option
  for (let q = 0; q < 5; q++) {
    await s.page.click('[data-testid="add-question-btn"]');
    await s.page.fill(`[data-testid="q-${q}-prompt"]`, `Question ${q + 1}?`);
    await s.page.fill(`[data-testid="q-${q}-option-A"]`, 'CORRECT');
    await s.page.fill(`[data-testid="q-${q}-option-B"]`, 'wrong-1');
    await s.page.fill(`[data-testid="q-${q}-option-C"]`, 'wrong-2');
    await s.page.fill(`[data-testid="q-${q}-option-D"]`, 'wrong-3');
    await s.page.selectOption(`[data-testid="q-${q}-correct"]`, 'A');
  }

  await s.page.click('[data-testid="publish-btn"]');
  await s.page.waitForSelector('[data-testid="join-code-display"]');

  const joinCode = await s.page.textContent('[data-testid="join-code-display"]') ?? '';
  const url = s.page.url();
  const examId = url.split('/').find((seg) => seg.length > 20) ?? '';
  return { joinCode: joinCode.trim(), examId };
}
```

### `helpers/ws-utils.ts`

```ts
import { Page } from '@playwright/test';

/**
 * Installs a tap on the in-page Socket.io client so the test can wait
 * for specific events via page.evaluate. The app must expose the socket
 * instance on window.__exam_socket__ in non-production builds.
 */
export async function installSocketTap(page: Page) {
  await page.waitForFunction(() => !!(window as any).__exam_socket__, null, {
    timeout: 10_000,
  });
  await page.evaluate(() => {
    const w = window as any;
    if (w.__tap_installed) return;
    w.__tap_installed = true;
    w.__event_buffer = [];
    const s = w.__exam_socket__;
    const origOn = s.onAny?.bind(s);
    if (origOn) {
      s.onAny((event: string, payload: unknown) => {
        w.__event_buffer.push({ event, payload, ts: Date.now() });
      });
    }
  });
}

export async function waitForSocketEvent(
  page: Page,
  event: string,
  timeoutMs: number,
): Promise<unknown> {
  return page.waitForFunction(
    (name) => {
      const w = window as any;
      const found = (w.__event_buffer ?? []).find((e: any) => e.event === name);
      return found ? found.payload : null;
    },
    event,
    { timeout: timeoutMs, polling: 100 },
  );
}
```

### `helpers/barriers.ts`

```ts
export async function barrier<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[barrier] ${name} waiting…`);
  const out = await fn();
  // eslint-disable-next-line no-console
  console.log(`[barrier] ${name} cleared in ${Date.now() - start}ms`);
  return out;
}
```

### `helpers/user-factory.ts`

```ts
import axios from 'axios';

export type TestUser = { id: string; email: string; password: string; displayName: string; token: string };

export async function createTestUsers(apiUrl: string, count: number): Promise<TestUser[]> {
  // Seed through a test-only endpoint (guarded by NODE_ENV !== 'production')
  // that bulk-creates confirmed Cognito users and returns their credentials.
  const { data } = await axios.post(`${apiUrl}/test/users/bulk`, { count });
  return data.users as TestUser[];
}
```

> A tiny `POST /api/test/users/bulk` endpoint (only mounted when `process.env.E2E_MODE === '1'`) is the cleanest way to provision users without hammering the UI register flow. It short-circuits Cognito email verification for test accounts.

### What the assertions cover

| Step | Assertion |
|---|---|
| Login | `waitForURL` off `/login` within 15s |
| Join room | `waitForURL` match `/live/.*/lobby` + lobby waiting element visible |
| Lobby sync | Host sees exactly `PLAYER_COUNT` tiles (poll with backoff) |
| Exam started event | Every player's in-page `__event_buffer` receives `exam.started` |
| Answer ack | `exam.answerAck` received per question, per player |
| Result page | `waitForURL` match `/live/.*/result` |
| Podium correctness | Top-3 tiles contain the expected player display names |
| Per-user stats | correct/wrong count tiles match deterministic expectation |

### Best practices for stability in real-time systems

1. **Event-driven waits, not `waitForTimeout`.** The only deliberate timeout in the script is the *pacing delay* between question display and answer click, which exists to differentiate player speeds — not to "wait for UI". Everything else uses `waitForURL`, `waitForSelector`, `expect.poll`, or a WS event promise.
2. **Arm listeners before the trigger.** When waiting for `exam.started`, construct the `Promise[]` *before* clicking Start. Otherwise the fast WS event can fire between the click and the listener install, and the test hangs.
3. **Barriers via `Promise.all`.** Synchronize all N users at key checkpoints so one slow client doesn't stagger the others into unrelated states.
4. **Isolated contexts, not pages.** Each user needs its own `BrowserContext` so cookies, `localStorage`, and the Socket.io connection are independent. Multiple pages in one context would share auth.
5. **Deterministic test data.** Fixed 5 questions, fixed correct option `A`, deterministic per-player delays → reproducible leaderboard order. No randomness.
6. **Test-only seed endpoint.** Bypass the UI registration for bulk user provisioning. It's faster and doesn't thrash Cognito.
7. **Expose the Socket.io client on `window` in non-prod builds.** Lets tests subscribe without re-opening a second WS — no dual-connection multi-device lockout false positives.
8. **`expect.poll` with backoff** for lobby convergence instead of a hard wait — stable under load and CI jitter.
9. **Structured per-user logging.** Every action prints `[timestamp] [label] user=... step=... status=...` so flake postmortems are grep-friendly.
10. **Capture page errors.** `page.on('pageerror')` surfaces client-side exceptions that would otherwise be invisible.
11. **Single-worker mode for this suite.** Inside the test we already spawn 15+ contexts; letting Playwright parallelize across workers too would oversubscribe the backend. Configure `workers: 1` for `live-exam.spec.ts` specifically.
12. **CI resource headroom.** Each context ≈ 80–150 MB RAM. 20 users → ~3 GB. Run on a CI machine with at least 4 GB free.
13. **Cleanup on failure.** Wrap context close in `test.afterEach` so aborted runs don't leak browser processes.
14. **Separate E2E-mode env.** API runs with `E2E_MODE=1` in CI to enable `/test/users/bulk`, disable rate limits on auth, and shorten any `perQuestionSec` floor.

### Playwright config snippet (`playwright.config.ts`)

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 5 * 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

### Required app-side hooks (small changes to production code)

- Expose `window.__exam_socket__ = socket` in `apps/web/src/lib/live-exam-socket.ts` behind `if (process.env.NEXT_PUBLIC_E2E === '1')`.
- Add stable `data-testid` attributes on: lobby tiles, host start button, question options, correct/wrong count tiles, podium ranks, join-code display, login form fields.
- Add `POST /api/test/users/bulk` gated by `E2E_MODE=1` env.
- Expose a `data-testid="option-correct"` / `data-testid="option-wrong"` marker on MCQ options — during E2E the play screen tags the correct option so the test can click it deterministically without needing to read answer keys from the backend.

---

## 15. Future work (separate plans)

- **Admin broadcast notifications** — Transactional Outbox pattern with SES/SNS/in-app fan-out, retries, DLQ, idempotency. Planned as its own feature after Live Exam ships.
- **Exam scheduling & T-15m reminders** — depends on the notification feature above.
- **Proctoring / anti-cheat** — tab-blur detection, multi-device lockout, DQ flow.
- **Team mode** — groups of players competing as a squad.

---

## 16. Open questions before coding

1. **Per-question navigation** — allow skipping backwards? Recommendation: **no** (Kahoot-style monotonic forward).
2. **Tie-break on leaderboard** — ties broken by earlier last-answer timestamp? Recommendation: **yes**.
3. **Late join** — allow users to join after Start? Recommendation: **yes** in v1 (they just miss earlier questions).
4. **Anonymous join** — require login, or allow guest display name? Recommendation: **require login** (Cognito already in place; participant needs `userId`).
5. **Top-3 tiebreaker display** — if 4 players tie for 3rd, show all four on the podium or cut at 3? Recommendation: **cut at 3**, show the rest in the table below.
6. **Interstitial length** — how long should the inter-question leaderboard reveal stay on screen? Recommendation: **5s default, host-configurable per exam in 3–10s range**. Long enough to read top 10 + your delta, short enough that the room doesn't lose momentum.
7. **Reveal correctness during interstitial vs. final result only** — should the per-question explanation be shown during the 5s interstitial, or held back until the result screen? Recommendation: **show correct option + brief explanation in `exam.questionLocked` so players who answered wrong learn why immediately**, but keep the full breakdown for the result screen.

Confirm / override these and I'll start **Phase 1** (Prisma migration + module scaffold + first failing test for `LiveExamScoringService`).
