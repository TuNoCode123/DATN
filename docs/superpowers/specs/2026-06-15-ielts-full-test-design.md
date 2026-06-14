# IELTS Full Test Bundles — Design

## Context

Today, IELTS Listening, Reading, Writing, and Speaking each exist as separate `Test` records (each with its own `examType`, `TestSection[]`, and `UserAttempt`s). There is no way for a student to take a combined "IELTS 2025"-style full test consisting of all four skills and get one overall band score.

## Goal

Introduce a `FullTest` bundle entity (e.g. "IELTS 2025 - Test 1") that references one existing Listening, Reading, Writing, and Speaking `Test`, lets a student take all four in sequence, and produces a combined overall band score using standard IELTS rounding.

## Scope

- IELTS only (`IELTS_ACADEMIC` / `IELTS_GENERAL` exam types).
- TOEIC full-test bundling (LR + Speaking/Writing) is explicitly deferred — TOEIC uses a different overall-scoring strategy (scaled score sum, not band averaging) and needs its own spec.
- Each linked `Test` remains a normal, independently practiceable Test. No changes to existing per-skill test taking flow except a small hook for full-test attempts.

## Data Model

### `FullTest`

A bundle of 4 existing `Test` records, one per skill.

```prisma
model FullTest {
  id           String   @id @default(cuid())
  title        String              // e.g. "IELTS 2025 - Test 1"
  examType     ExamType            // IELTS_ACADEMIC | IELTS_GENERAL
  description  String?
  isPublished  Boolean  @default(false)
  attemptCount Int      @default(0)

  listeningTestId String
  readingTestId   String
  writingTestId   String
  speakingTestId  String

  listeningTest Test @relation("FullTestListening", fields: [listeningTestId], references: [id])
  readingTest   Test @relation("FullTestReading", fields: [readingTestId], references: [id])
  writingTest   Test @relation("FullTestWriting", fields: [writingTestId], references: [id])
  speakingTest  Test @relation("FullTestSpeaking", fields: [speakingTestId], references: [id])

  attempts FullTestAttempt[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([examType, isPublished])
  @@map("full_tests")
}
```

Validation on create/update (admin):
- All 4 linked `Test`s must have the same `examType` as the `FullTest`.
- `listeningTestId`'s Test must have a `TestSection` with `skill = LISTENING` (and similarly Reading/Writing/Speaking).

### `FullTestAttempt`

Lightweight aggregation record tying together up to 4 `UserAttempt`s (mode = `FULL_TEST`), one per skill.

```prisma
model FullTestAttempt {
  id          String        @id @default(cuid())
  userId      String
  fullTestId  String
  status      AttemptStatus @default(IN_PROGRESS)
  startedAt   DateTime      @default(now())
  submittedAt DateTime?
  overallBand Float?

  listeningAttemptId String?
  readingAttemptId   String?
  writingAttemptId   String?
  speakingAttemptId  String?

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fullTest FullTest @relation(fields: [fullTestId], references: [id], onDelete: Cascade)

  @@index([userId, fullTestId])
  @@map("full_test_attempts")
}
```

No new question/section/attempt-detail tables — each skill's `UserAttempt`/`AttemptSection`/`UserAnswer` flow is reused unchanged.

## Attempt Flow

1. Student starts a full test → `POST /api/full-tests/:id/attempts` creates a `FullTestAttempt` (status `IN_PROGRESS`) if none is in progress for that user+fullTest, or returns the existing in-progress one (resume).
2. Student enters a skill section (e.g. Listening) → the existing attempt-creation flow is invoked for `listeningTestId`'s `Test`, with `mode = FULL_TEST`. The resulting `UserAttempt.id` is stored on `FullTestAttempt.listeningAttemptId`.
3. Student completes and submits that section via existing submission endpoints (unchanged). After scoring, the submission handler checks whether the `UserAttempt` is referenced by a `FullTestAttempt`; if so:
   - If all 4 child attempt ids are set and all 4 corresponding `UserAttempt.status = SUBMITTED`, mark `FullTestAttempt.status = SUBMITTED`, set `submittedAt`, and compute `overallBand`.
4. If the student leaves and resumes later, `FullTestAttempt` stays `IN_PROGRESS`; re-entering a skill section that already has a stored attempt id resumes that `UserAttempt` instead of creating a new one.

### Overall Band Calculation

Standard IELTS rounding applied to the average of the 4 `UserAttempt.bandScore` values:

```
avg = (listening.bandScore + reading.bandScore + writing.bandScore + speaking.bandScore) / 4
overallBand = round to nearest 0.5, where:
  - fractional part .25 rounds up to the next .5
  - fractional part .75 rounds up to the next whole number
```

Since each `bandScore` is a multiple of 0.5, the average's fractional part is always 0, .25, .5, or .75. Example: L=6.5, R=7.0, W=6.0, S=7.5 → avg = 27/4 = 6.75 → fractional part .75 rounds up → overall = 7.0. Implementation must follow this exact IELTS table-based rounding, not naive `Math.round`.

## API Endpoints

### Learner-facing (`apps/api/src/full-tests/`)

| Endpoint | Description |
|---|---|
| `GET /api/full-tests` | List published full tests, filterable by `examType`, paginated |
| `GET /api/full-tests/:id` | Detail: title, description, summaries of the 4 linked Tests (title, durationMins, questionCount), and the user's current/latest `FullTestAttempt` if any |
| `POST /api/full-tests/:id/attempts` | Start or resume a `FullTestAttempt`; returns its id and any existing child attempt ids |
| `POST /api/full-tests/attempts/:id/sections/:skill/start` | Create or resume the `UserAttempt` for the given skill (`listening`\|`reading`\|`writing`\|`speaking`), delegating to existing attempt-start logic |
| `GET /api/full-tests/attempts/:id` | Combined result: overall band, per-skill `UserAttempt` summaries (bandScore, scorePercent, status), links to each detail result |

### Admin (`apps/api/src/admin/full-tests/`)

| Endpoint | Description |
|---|---|
| `GET /api/admin/full-tests` | List all bundles (published + unpublished) |
| `POST /api/admin/full-tests` | Create a bundle: title, examType, 4 test ids; runs validation rules above |
| `PATCH /api/admin/full-tests/:id` | Edit title/description/linked test ids/publish status; re-runs validation |
| `DELETE /api/admin/full-tests/:id` | Delete bundle (does not delete the linked Tests) |

## Frontend

The existing `/tests` library page gains a tab switcher at the top: **"Tests"** (default, existing per-skill grid — Listening/Reading/Writing/Speaking, unchanged) and **"Full Tests"** (new grid of `FullTest` bundles). Students can freely switch between taking individual skill tests and full-test bundles; the per-skill flow is otherwise untouched.

- **`/tests` (Full Tests tab)**: grid of `brutal-card` items — title, examType badge, 4 skill badges, summed duration, and a "Start" / "Continue" / "View Result" button depending on `FullTestAttempt` status.
- **`/full-tests/[id]`**: overview page with 4 skill cards (Listening/Reading/Writing/Speaking), each showing not-started / in-progress / done (+ band score if done). Buttons route into the existing `/tests/[testId]/attempt` flow for that skill's linked Test, carrying the `fullTestAttemptId` so submission can link back.
- **`/full-tests/[id]/results/[attemptId]`**: combined results page — large overall band score, per-skill band breakdown cards, links to each skill's detailed `UserAttempt` result page (existing result pages, unchanged).
- **`/admin-full-tests`** (new route under `(admin)`): CRUD list + form. Form fields: title, examType select, description, 4 test-picker dropdowns (each filtered to published Tests of the matching examType containing a section of the required skill), publish toggle.

## Out of Scope / Future Work

- TOEIC full-test bundling (separate spec, different scoring model).
- HSK full-test bundling.
- Per-section time limits / proctoring across the full-test sequence beyond what each individual Test attempt already enforces.
