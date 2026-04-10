# Realtime Exam: Templates + New Question Types

Follow-up to `realtime-exam-leaderboard-plan.md`. Two changes:

1. **Template / Session split** — a host authors a template once, then spins up many sessions from it (each session has its own join code, participants, leaderboard, history).
2. **New question types** — add `SENTENCE_REORDER` (ordering) and `SHORT_ANSWER` (free-text input answer) alongside existing `MULTIPLE_CHOICE`.

Today `LiveExam` is both template and instance (one-shot). Questions are embedded and MCQ-only with 4 hardcoded options.

---

## 1. Data Model Changes

### 1.1 Introduce template/session split

Rename + split existing tables. Migration is destructive for draft data; safe because the feature hasn't shipped to production users yet (confirm with user before migrating).

**New table: `LiveExamTemplate`**
```
id              String  @id
title           String
description     String?
durationSec     Int
perQuestionSec  Int
interstitialSec Int
createdById     String
createdAt       DateTime
updatedAt       DateTime
status          LiveExamTemplateStatus  // DRAFT | PUBLISHED | ARCHIVED
```

**New table: `LiveExamTemplateQuestion`** (replaces question fields on `LiveExamQuestion`)
```
id           String
templateId   String
orderIndex   Int
type         LiveExamQuestionType   // MULTIPLE_CHOICE | SHORT_ANSWER | SENTENCE_REORDER
prompt       String
points       Int
explanation  String?
payload      Json                   // shape depends on `type`, see §2
```

**Rename: `LiveExam` → `LiveExamSession`**
- Add `templateId String` FK → `LiveExamTemplate`
- Drop authoring fields that now live on the template (`title`, `description`, `durationSec`, `perQuestionSec`, `interstitialSec`) — snapshot them onto the session at creation time so template edits don't mutate in-flight sessions
- Keep: `joinCode`, `inviteSlug`, `status` (LOBBY | LIVE | ENDED), `startedAt`, `endedAt`, `createdById` (host for this run)
- Rename `LiveExamQuestion` → `LiveExamSessionQuestion`, populated by cloning template questions at session creation (immutable snapshot — a template edit after a session starts must NOT affect that session)

**Unchanged:** `LiveExamParticipant`, `LiveExamAnswer`, `LiveExamEvent` — just re-point FKs from `liveExamId` → `sessionId`.

### 1.2 Migration strategy

One Prisma migration: `add_live_exam_templates`. Because live-exam has only recently landed on this branch and is unreleased, do a clean schema reshape rather than a data-preserving migration. Drop the existing `20260410161619_add_live_exam` tables and rebuild. Confirm with user before running.

---

## 2. Question Type Payloads

Single `payload: Json` column, discriminated by `type`. Shapes:

**MULTIPLE_CHOICE**
```json
{ "options": [{"id":"A","text":"..."}, ...], "correctOptionId": "B" }
```

**SHORT_ANSWER** (free-text input, exact-match with normalization)
```json
{ "acceptedAnswers": ["Paris", "paris"], "caseSensitive": false }
```
The `prompt` is a normal question (e.g. "What is the capital of France?"). Participant types a single-line answer into a text input. Grading = trim + collapse whitespace + (optional) lowercase, then match any entry in `acceptedAnswers`.

**SENTENCE_REORDER** (reuses HSK pattern)
```json
{ "fragments": ["I","eat","apples"], "correctOrder": [0,1,2] }
```
Client receives fragments in shuffled order; submits an index array. Grading = exact sequence match.

Add `LiveExamQuestionType` enum to schema. Do not reuse the existing `QuestionType` enum — keep live-exam schema decoupled from the test system (consistent with current design).

---

## 3. Backend Changes (`apps/api/src/live-exam/`)

### 3.1 New REST endpoints (templates)
- `POST   /live-exams/templates` — create draft template
- `GET    /live-exams/templates` — list my templates
- `GET    /live-exams/templates/:id` — detail w/ questions
- `PATCH  /live-exams/templates/:id` — edit metadata (only DRAFT)
- `DELETE /live-exams/templates/:id`
- `POST   /live-exams/templates/:id/questions` — add question (type-aware validation)
- `PATCH  /live-exams/templates/:id/questions/:qid`
- `DELETE /live-exams/templates/:id/questions/:qid`
- `POST   /live-exams/templates/:id/publish` — DRAFT → PUBLISHED (validates ≥1 question, each payload well-formed)

### 3.2 Changed REST endpoints (sessions)
- `POST /live-exams/sessions` — body `{ templateId }`; clones template questions into `LiveExamSessionQuestion`, generates `joinCode` + `inviteSlug`, status = LOBBY
- Existing endpoints (`/open-lobby`, `/publish`, force-end, etc.) become session-scoped; drop redundant ones now that template handles authoring
- `GET /live-exams/templates/:id/sessions` — history of runs for a template (for host reuse view)

### 3.3 Services
- **New**: `LiveExamTemplateService` — CRUD + publish validation per question type
- **Updated**: `LiveExamService` — session creation takes a templateId and snapshots questions
- **Updated**: `LiveExamScoringService.score()` — dispatch on `question.type`:
  - MCQ: compare `selectedOptionId === correctOptionId` (as today)
  - SHORT_ANSWER: normalize + match against `acceptedAnswers`
  - SENTENCE_REORDER: array equality on submitted index order vs `correctOrder`
  - Time-weighted points formula unchanged

### 3.4 Gateway / socket events
- `exam.question` payload now carries `type` and type-specific `payload` (hide correct answer until `exam.questionLocked`)
- `exam.answer` client payload becomes a union: `{ selectedOptionId }` | `{ text }` | `{ orderedFragmentIds: number[] }`
- Server validates shape matches question type; reject mismatches
- `exam.questionLocked` reveals the correct answer in type-appropriate shape

### 3.5 DTO / validation
- Use discriminated-union DTOs (class-validator `@ValidateIf` or separate DTOs per type) for create/update question and for answer submission

---

## 4. Frontend Changes

### 4.1 New admin/learner routes
- `/live/templates` — my templates list
- `/live/templates/new` — create
- `/live/templates/[id]/edit` — edit questions (replaces current `/live/[id]/edit`)
- `/live/templates/[id]` — template detail + "Start new session" button + past sessions list
- `/live/sessions/[id]/lobby` (rename from `/live/[id]/lobby`), same for `/play`, `/host`, `/result`
- `/admin-live-exams` admin list — tabs for Templates vs Live Sessions

### 4.2 Editor refactor (`components/live-exam/exam-editor.tsx`)
Split into:
- `TemplateEditor` — top-level form (title, timing config) + question list
- `QuestionEditor` — accepts `type` prop, renders one of:
  - `McqQuestionFields` (existing 4-option UI, generalized to N options)
  - `ShortAnswerQuestionFields` — prompt text + accepted answers list (add/remove rows) + caseSensitive toggle
  - `SentenceReorderQuestionFields` — fragments list (reorderable input rows), correct order derived from list order
- Type picker when adding a new question

### 4.3 Live playback renderers
Reuse HSK renderers as starting point, adapt to live-exam socket data:
- `LiveMcqPlayer` — existing
- `LiveShortAnswerPlayer` — single text input, submits on Enter or timer end
- `LiveSentenceReorderPlayer` — clickable fragment chips, current-order preview, submit button; adapted from `sentence-reorder-renderer.tsx`
- Parent `LiveQuestionView` dispatches on `question.type`

### 4.4 Socket client (`lib/live-exam-socket.ts`)
- Extend answer helpers with per-type submit functions
- Type the `exam.question` event payload as a discriminated union

### 4.5 Host session spawn flow
On template detail page: "Start new session" button → `POST /live-exams/sessions` → redirect to `/live/sessions/[id]/host`. Template detail also lists prior sessions with final leaderboards (links to existing `/result` page).

---

## 5. Scoring & Edge Cases

- **Short-answer normalization**: trim, collapse whitespace, lowercase unless `caseSensitive`. Unicode-NFC normalize for Vietnamese diacritics. Do not ship fuzzy match in v1 — exact match only, but authors can list multiple `acceptedAnswers` to cover variants.
- **Reorder**: if `fragments.length !== correctOrder.length` on publish, reject.
- **No answer / timeout**: same as today — 0 points, `isCorrect = false`, `selectedOptionId/text/orderedFragmentIds = null`.
- **Session immutability**: once a session leaves LOBBY, its snapshotted questions must never be edited, even if the template changes. Enforce at service layer.
- **Template deletion**: soft-block if any session references it that is not ENDED; otherwise allow and cascade nothing (sessions keep their snapshot).

---

## 6. Rollout Steps

1. Schema migration + Prisma client regen
2. Backend: template service + endpoints + tests
3. Backend: session service refactor to consume templateId
4. Backend: scoring dispatch + DTO unions + gateway payload updates
5. Frontend: template list/editor pages (MCQ only first, to keep diff reviewable)
6. Frontend: session pages rename + wire to new session endpoint
7. Frontend: add short-answer editor + player
8. Frontend: add sentence-reorder editor + player
9. Admin list: template/session tabs
10. Manual E2E: create template → publish → spawn 2 sessions back-to-back → verify independent leaderboards + history

---

## 7. Open Questions (confirm before implementing)

1. OK to do a destructive migration (drop existing live-exam tables)? Any real data to preserve?
2. Short-answer v1 = exact-match against a list of accepted answers, no fuzzy/typo tolerance — acceptable?
3. Sentence-reorder grading = exact-match only, no partial credit — acceptable?
4. Should templates be shareable across hosts, or strictly private to the creator? (Plan assumes private.)
5. Keep `LiveExamQuestionType` as its own enum (proposed) vs. reuse the main `QuestionType` enum?
