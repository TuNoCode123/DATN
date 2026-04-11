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

## 2. Session Lifecycle (State Machine)

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

## 3. Per-Question Phase Loop (inside LIVE)

```
        ┌──────────────────────────────────────────────────────┐
        │                                                      │
        ▼                                                      │
   dispatchNextQuestion                                        │
        │   • qIndex++                                         │
        │   • shuffle (if SENTENCE_REORDER)                    │
        │   • emit exam.question  → live:{id}                  │
        │   • emit host.questionView → host:{id}               │
        │   • set timer (perQuestionSec)                       │
        ▼                                                      │
     ┌─────┐  player submits → grade → score → store           │
     │OPEN │  → emit exam.answerAck (player)                   │
     │     │  → emit host.answerStream (host)                  │
     └──┬──┘                                                   │
        │ timer fires                                          │
        ▼                                                      │
   lockQuestion                                                │
        │   • insert TIMEOUT rows for non-responders           │
        │   • batch ZINCRBY → Redis leaderboard                │
        │   • emit exam.questionLocked (reveal+explanation)    │
        ▼                                                      │
   ┌────────┐                                                  │
   │ LOCKED │                                                  │
   └───┬────┘                                                  │
       ▼                                                       │
   revealLeaderboard                                           │
        │   • per-socket: rank, prevRank, delta, awardedPts    │
        │   • emit leaderboard.reveal (player, personalized)   │
        │   • emit leaderboard.update + host.fullLeaderboard   │
        │   • timer (interstitialSec)                          │
        ▼                                                      │
   ┌──────────────┐                                            │
   │INTERSTITIAL  │────────────── next question ───────────────┘
   └──────────────┘
        │  no more Qs / cap hit
        ▼
   finalizeExam
        • Redis snapshot → Participant.finalScore/Rank
        • wipe Redis keys
        • emit exam.ended  (live:{id} + host:{id})
```

---

## 4. Actors & WebSocket Rooms

```
  ┌──────────┐                ┌──────────────┐
  │ Player   │───lobby.join──▶│ lobby:{id}   │ ◀─── host watches lobby
  └──────────┘                └──────┬───────┘
                                     │ host.start
                                     ▼
  ┌──────────┐                ┌──────────────┐    ┌─────────────┐
  │ Player   │ ◀── exam.* ────│ live:{id}    │    │ host:{id}   │
  └──────────┘                └──────────────┘    └─────────────┘
                                                        ▲
                                                        │
                                                  ┌──────────┐
                                                  │ Host     │
                                                  └──────────┘
                                  host receives:
                                   • host.questionView (with answer)
                                   • host.answerStream
                                   • host.fullLeaderboard
```

Namespace: `/live-exam` (Socket.io). Auth via JWT cookie middleware before connect handshake.

---

## 5. End-to-End User Journey

```
HOST                                              PLAYERS
────                                              ───────
1. Create template (DRAFT)
2. Add questions (MCQ / SHORT / REORDER)
3. Publish template (PUBLISHED)
4. Spawn session  ──── joinCode + inviteSlug ────▶ 5. Open /live/join → enter code
                                                   6. POST /sessions/:id/join
                                                   7. WS: lobby.join → lobby:{id}
8. Host console /sessions/:id/host
   WS: host.watch → host:{id}
9. Host clicks START
   WS: host.start ──────────────────────────────▶  10. Receive exam.started
                                                       Auto-nav to /play
                  ┌─── PHASE LOOP ───┐
11. host.questionView                              12. exam.question (no answer)
    (sees correct answer)                              countdown begins
13. host.answerStream  ◀─────────────────────────  14. submit answer → exam.answerAck
    (live answer feed)                                 (graded server-side)
15. leaderboard.update                             16. exam.questionLocked (reveal)
    host.fullLeaderboard                               leaderboard.reveal (rank+delta)
                  └──────────────────┘
17. exam.ended (top3 + analytics)                  18. exam.ended (personal result)
    /result?mode=host                                  /result?mode=player
```

---

## 6. Question Types

| Type | Question payload | Answer payload | Grading |
|------|------------------|----------------|---------|
| `MULTIPLE_CHOICE` | `{ options[], correctOptionId }` | `{ optionId }` | optionId === correctOptionId |
| `SHORT_ANSWER` | `{ acceptedAnswers[], caseSensitive }` | `{ text }` | normalized text in acceptedAnswers |
| `SENTENCE_REORDER` | `{ fragments[], correctOrder[] }` | `{ order[] }` | order === correctOrder (after shuffle un-map) |

---

## 7. Scoring Formula

```
awardedPoints = isCorrect
   ? round(basePoints * (0.5 + 0.5 * (1 - answeredMs / perQuestionMs)))
   : 0
```
Instant-correct ≈ full points; last-ms-correct ≈ 50%; timeout/wrong = 0.

---

## 8. Persistence Split

| Layer | Holds | Lifetime |
|-------|-------|----------|
| **Postgres** | Templates, sessions, snapshot questions, answers, audit events, final scores | Permanent |
| **Redis ZSET** | Live leaderboard `board:{id}:board`, prev ranks, `qindex/qphase/qstart` | LIVE phase only — wiped on `finalizeExam` |
| **In-memory `RoomRuntime`** (gateway node) | Phase timers, shuffle perms, current qIndex | LIVE phase only |

---

## 9. WebSocket Event Reference

### Inbound (client → server)
| Event | Payload | Sender |
|-------|---------|--------|
| `lobby.join` | `{ sessionId }` | player/host |
| `lobby.leave` | `{ sessionId }` | player |
| `host.watch` | `{ sessionId }` | host |
| `host.start` | `{ sessionId }` | host |
| `host.end` | `{ sessionId }` | host |
| `host.kick` | `{ sessionId, userId }` | host |
| `exam.answer` | `{ sessionId, questionId, answer }` | player |

### Outbound (server → client)
| Event | Room | Payload |
|-------|------|---------|
| `lobby.state` | joining socket | `{ players, count }` |
| `lobby.playerJoined` | `lobby:{id}` | `{ userId, displayName }` |
| `lobby.playerLeft` | `lobby:{id}` | `{ userId, kicked? }` |
| `exam.started` | `live:{id}` | `{ serverStartAt, totalQuestions }` |
| `exam.question` | `live:{id}` | `{ index, question, dispatchedAt, perQuestionSec, totalQuestions, phase }` |
| `host.questionView` | `host:{id}` | same + `reveal` (correct answer) |
| `exam.answerAck` | submitter | `{ recorded, answeredMs }` |
| `exam.answerError` | submitter | `{ code, message? }` |
| `host.answerStream` | `host:{id}` | `{ userId, displayName, isCorrect, display, answeredMs, answeredCount, totalPlayers }` |
| `exam.questionLocked` | `live:{id}` | `{ index, reveal, explanation }` |
| `leaderboard.reveal` | per-socket | `{ top10, yourRank, yourPrevRank, yourDelta, yourScore, yourAwardedPoints, yourIsCorrect, interstitialSec }` |
| `leaderboard.update` | `host:{id}` | `{ top10 }` |
| `host.fullLeaderboard` | `host:{id}` | `{ rows }` |
| `exam.ended` | `live:{id}` + `host:{id}` | `{ reason, finalTop3, yourResult? }` |

---

## 10. Key Files

### Backend (`apps/api/src/live-exam/`)
- `live-exam.gateway.ts` — WebSocket gateway, phase loop, all events
- `live-exam.service.ts` — Session lifecycle (create, start, join, end)
- `live-exam-template.service.ts` — Template CRUD, publish/archive
- `live-exam-scoring.service.ts` — Time-weighted scoring
- `live-exam-leaderboard.service.ts` — Redis ZSET leaderboard
- `live-exam-question-types.ts` — Validation, grading, dispatch shaping
- `live-exam.controller.ts` — REST endpoints
- `apps/api/prisma/schema.prisma` — Models (lines 156–1042)

### Frontend (`apps/web/src/`)
- `lib/live-exam-socket.ts` — Socket.io client singleton
- `lib/live-exam-types.ts` — Shared type defs
- `app/(learner)/live/page.tsx` — Template browser
- `app/(learner)/live/templates/[id]/edit/page.tsx` — Template editor
- `app/(learner)/live/sessions/[id]/lobby/page.tsx` — Lobby
- `app/(learner)/live/sessions/[id]/play/page.tsx` — Player FSM (WAITING/OPEN/ANSWERED/LOCKED/INTERSTITIAL/ENDED)
- `app/(learner)/live/sessions/[id]/host/page.tsx` — Host console
- `app/(learner)/live/sessions/[id]/result/page.tsx` — Results (player + host modes)
- `app/(learner)/live/join/page.tsx` — Join by 6-digit code
