# Plan: Initial Database Schema Design

## Table of Contents

- [Context](#context)
- [Files to Create](#files-to-create)
- [Schema Design](#schema-design)
  - [Enums](#enums)
  - [Models](#models)
- [Entity Relationships](#entity-relationships)
- [Table Relationships & Scenarios](#table-relationships--scenarios)
- [Seed Data](#seed-data)
- [Verification Checklist](#verification-checklist)

---

## Context

Build the foundational **PostgreSQL** database schema (via **Prisma ORM**) for an English test practice platform. The frontend uses **Next.js 16** with **Ant Design** as the primary UI component library alongside TailwindCSS.

The UI shows:

- A **test library page** with filtering
- A **test detail page** with Practice / Full Test modes
- A **test-taking interface** supporting multiple question types

| Supported Question Types |
| ------------------------ |
| Multiple Choice          |
| Note / Form Completion   |
| Table Completion         |
| Summary Completion       |
| Matching                 |

> **Scope:** Phase 1 MVP only — AI features (Writing eval, RAG, Speaking, Learning Path) are **deferred**.

---

## Files to Create

| File                            | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma` | Full Prisma schema                                            |
| `apps/api/prisma/seed.ts`       | Seed data (admin user, tags, 1 complete IELTS Listening test) |

> No other files are created in this plan.

---

## Schema Design

### Enums

```prisma
enum UserRole      { STUDENT ADMIN }

enum ExamType      { IELTS_ACADEMIC IELTS_GENERAL
                     TOEIC_LR TOEIC_SW
                     HSK_1 HSK_2 HSK_3 HSK_4 HSK_5 HSK_6
                     TOPIK_I TOPIK_II
                     JLPT_N1 JLPT_N2 JLPT_N3 JLPT_N4 JLPT_N5
                     DIGITAL_SAT ACT THPTQG }

enum TestFormat    { FULL CONDENSED }        // "Tất cả" vs "Đề rút gọn"
enum SectionSkill  { LISTENING READING WRITING SPEAKING }

enum QuestionType  { MULTIPLE_CHOICE NOTE_FORM_COMPLETION
                     TABLE_COMPLETION SUMMARY_COMPLETION MATCHING }

enum AttemptMode   { PRACTICE FULL_TEST }
enum AttemptStatus { IN_PROGRESS SUBMITTED ABANDONED }
```

---

### Models

#### `users`

**Purpose:** Stores all platform accounts — both students who take tests and admins who manage content.

| Field          | Type     | Notes              |
| -------------- | -------- | ------------------ |
| `id`           | cuid     | Primary key        |
| `email`        | String   | Unique             |
| `passwordHash` | String   |                    |
| `displayName`  | String?  | Optional           |
| `avatarUrl`    | String?  | Optional           |
| `role`         | UserRole | Default: `STUDENT` |
| `createdAt`    | DateTime |                    |
| `updatedAt`    | DateTime |                    |

**When this applies:**

- Registration / login flows
- Showing "attempted by X users" attribution on test cards
- Restricting content management to `ADMIN` role only

---

#### `tests`

**Purpose:** The top-level entity representing one published exam (e.g. "IELTS Listening Practice Test 1"). This is what appears as a card on the test library page.

| Field           | Type       | Notes             |
| --------------- | ---------- | ----------------- |
| `id`            | cuid       | Primary key       |
| `title`         | String     |                   |
| `examType`      | ExamType   |                   |
| `format`        | TestFormat |                   |
| `durationMins`  | Int        |                   |
| `isPublished`   | Boolean    |                   |
| `description`   | String?    | Optional          |
| `attemptCount`  | Int        | Cached, default 0 |
| `commentCount`  | Int        | Cached, default 0 |
| `sectionCount`  | Int        | Cached, default 0 |
| `questionCount` | Int        | Cached, default 0 |

**When this applies:**

- Browsing / filtering the test library (`examType`, `format`, `isPublished`)
- Displaying the test card stats (attempts, questions, sections) without expensive JOINs — cached counters serve this
- A student clicks "Start Test" — the attempt is linked to this `testId`

> **Cached counters** avoid expensive `COUNT` JOINs on the browse page.
>
> **Index:** `@@index([examType, format, isPublished])`

---

#### `tags` + `test_tags` (M:N join)

**Purpose:** Free-form labels attached to tests (e.g. "Official Test", "2024", "Listening"). A test can have many tags; a tag can belong to many tests.

| Model       | Field    | Type   | Notes                           |
| ----------- | -------- | ------ | ------------------------------- |
| `tags`      | `id`     | cuid   | PK                              |
| `tags`      | `name`   | String | Unique — display label          |
| `tags`      | `slug`   | String | Unique — URL-safe filter key    |
| `test_tags` | `testId` | cuid   | Composite PK                    |
| `test_tags` | `tagId`  | cuid   | Composite PK, cascade on delete |

**When this applies:**

- Filtering the test library by tag (e.g. clicking the "Official Test" chip)
- Showing tag badges on the test detail page
- Admins tagging a newly uploaded test

---

#### `test_sections`

**Purpose:** Divides a test into skill-specific parts (e.g. IELTS Listening has 4 recordings; TOEIC has Listening + Reading). Each section can have its own audio file for Listening.

| Field           | Type         | Notes                                              |
| --------------- | ------------ | -------------------------------------------------- |
| `id`            | cuid         | Primary key                                        |
| `testId`        | cuid         | FK → tests                                         |
| `title`         | String       | e.g. `"Recording 1"`                               |
| `skill`         | SectionSkill |                                                    |
| `orderIndex`    | Int          | Unique with `testId`                               |
| `audioUrl`      | String?      | S3/CDN URL for Listening audio                     |
| `durationMins`  | Int?         | Optional                                           |
| `questionCount` | Int          | Cached — used for section checklist on detail page |

**When this applies:**

- Rendering the **section checklist** on the test detail page (e.g. "Recording 1 · 10 questions")
- **Practice mode:** the student picks which sections to attempt — each selected section gets an `attempt_sections` row
- **Full Test mode:** all sections are included automatically
- Playing audio per-section during a Listening test

---

#### `question_groups` — KEY design decision

**Purpose:** Groups a block of questions that share one stimulus (a form, a table, a passage, or a matching pool). Avoids repeating large HTML in every question row.

Without this layer, a 10-blank form would duplicate the entire HTML template across 10 `questions` rows. With it, the template is stored once here and questions only hold their individual answer data.

| Field             | Type         | Notes                                                                                         |
| ----------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `id`              | cuid         | Primary key                                                                                   |
| `sectionId`       | cuid         | FK → test_sections                                                                            |
| `questionType`    | QuestionType |                                                                                               |
| `orderIndex`      | Int          |                                                                                               |
| `contentHtml`     | String?      | HTML template with `{n}` tokens; frontend replaces `{23}` with `<input data-question="23" />` |
| `matchingOptions` | Json?        | `[{label:"A", text:"..."}]` — right-hand option pool for MATCHING type only                   |

**When this applies:**

| Question Type          | What goes in `contentHtml`                | What `matchingOptions` holds      |
| ---------------------- | ----------------------------------------- | --------------------------------- |
| `NOTE_FORM_COMPLETION` | A form/note template with numbered blanks | —                                 |
| `TABLE_COMPLETION`     | An HTML table with blank cells            | —                                 |
| `SUMMARY_COMPLETION`   | A prose passage with numbered gaps        | —                                 |
| `MATCHING`             | A list of headings/statements on the left | The lettered options on the right |
| `MULTIPLE_CHOICE`      | — (no shared stimulus)                    | —                                 |

> For `MULTIPLE_CHOICE`, `contentHtml` is `null` — each question stands alone in the `questions` table.

---

#### `questions`

**Purpose:** One row per individual question number. Stores the question-specific data: its stem (for MCQ), its answer choices (for MCQ), and its correct answer.

| Field            | Type    | Notes                                                                                       |
| ---------------- | ------- | ------------------------------------------------------------------------------------------- |
| `id`             | cuid    | Primary key                                                                                 |
| `groupId`        | cuid    | FK → question_groups                                                                        |
| `questionNumber` | Int     | Global 1–40 within test                                                                     |
| `orderIndex`     | Int     | Unique with `groupId`                                                                       |
| `stem`           | String? | MCQ: question text; blank-based types: null (position is embedded in group's `contentHtml`) |
| `mcqOptions`     | Json?   | `[{label:"A", text:"..."}]` — avoids extra options table                                    |
| `correctAnswer`  | String  | `"A"`/`"B"`/`"C"` for MCQ · exact text for fill-blank · option label for MATCHING           |
| `explanation`    | String? | Optional                                                                                    |

**When this applies:**

- Rendering individual MCQ items (uses `stem` + `mcqOptions`)
- Rendering blank-filling inputs — the frontend reads `questionNumber` to match the `{n}` token in the parent group's `contentHtml`
- Auto-grading on submission: compares `user_answers.answerText` to `correctAnswer`
- Showing answer explanation in review mode

---

#### `user_attempts`

**Purpose:** Records one attempt by one user on one test. Tracks the mode, timing, and final score. A user can have multiple attempts on the same test.

| Field            | Type          | Notes                            |
| ---------------- | ------------- | -------------------------------- |
| `id`             | cuid          | Primary key                      |
| `userId`         | cuid          | FK → users                       |
| `testId`         | cuid          | FK → tests                       |
| `mode`           | AttemptMode   |                                  |
| `status`         | AttemptStatus |                                  |
| `timeLimitMins`  | Int?          | null = no limit in Practice mode |
| `startedAt`      | DateTime      |                                  |
| `submittedAt`    | DateTime?     |                                  |
| `totalQuestions` | Int?          | Populated on submission          |
| `correctCount`   | Int?          | Populated on submission          |
| `scorePercent`   | Float?        | Populated on submission          |

**When this applies:**

| Scenario                               | `mode`      | `timeLimitMins`                 | `status` flow                   |
| -------------------------------------- | ----------- | ------------------------------- | ------------------------------- |
| Student starts Full Test               | `FULL_TEST` | copied from `test.durationMins` | `IN_PROGRESS` → `SUBMITTED`     |
| Student starts Practice (section pick) | `PRACTICE`  | `null`                          | `IN_PROGRESS` → `SUBMITTED`     |
| Student closes browser mid-test        | either      | —                               | stays `IN_PROGRESS` (resumable) |
| Time runs out / force-submit           | either      | —                               | → `SUBMITTED`                   |
| Student abandons explicitly            | either      | —                               | → `ABANDONED`                   |

> **Indexes:** `(userId, testId)` · `(userId, status)`

---

#### `attempt_sections` (Practice mode section selection)

**Purpose:** A join table recording which sections were included in a given attempt.

| Field       | Type | Notes        |
| ----------- | ---- | ------------ |
| `attemptId` | cuid | Composite PK |
| `sectionId` | cuid | Composite PK |

**When this applies:**

- **Practice mode:** created only for the sections the student checked on the detail page. The test-taking UI only loads questions from these sections.
- **Full Test mode:** rows are created for **all** sections automatically, giving uniform resume logic — the backend always reads `attempt_sections` to know which sections to load, regardless of mode.
- On resume: the server queries `attempt_sections` to reconstruct exactly which sections to show.

---

#### `user_answers`

**Purpose:** Stores the student's answer for each individual question within an attempt. Created/updated on every auto-save; `isCorrect` is set only when the attempt is submitted.

| Field        | Type     | Notes                                             |
| ------------ | -------- | ------------------------------------------------- |
| `id`         | cuid     | Primary key                                       |
| `attemptId`  | cuid     | FK → user_attempts                                |
| `questionId` | cuid     | FK → questions                                    |
| `answerText` | String?  |                                                   |
| `isCorrect`  | Boolean? | null while in-progress; set on submission grading |

**When this applies:**

- **Auto-save:** upserted every few seconds while the student is answering — `answerText` is updated, `isCorrect` stays `null`
- **Submit:** all rows for the attempt are graded in bulk; `isCorrect` is set by comparing `answerText` to `questions.correctAnswer`
- **Review mode:** the UI reads `answerText` + `isCorrect` to highlight correct/incorrect answers
- **Unique constraint `(attemptId, questionId)`** prevents duplicate answer rows for the same question in the same attempt

---

#### `comments` + `comment_likes`

**Purpose:** Lets students leave feedback on a test, with one level of threaded replies. `comment_likes` prevents a user from liking the same comment twice.

| Field       | Type   | Notes                                                    |
| ----------- | ------ | -------------------------------------------------------- |
| `id`        | cuid   | Primary key                                              |
| `testId`    | cuid   | FK → tests                                               |
| `userId`    | cuid   | FK → users                                               |
| `parentId`  | cuid?  | Self-reference → `comments.id`; null = top-level comment |
| `body`      | String |                                                          |
| `likeCount` | Int    | Cached                                                   |

**When this applies:**

- Displaying the comment section on the test detail page — top-level comments fetched first, then their replies grouped by `parentId`
- A student posts a top-level comment: `parentId = null`
- A student replies to a comment: `parentId = <that comment's id>`
- A student likes a comment: a row is inserted into `comment_likes`; attempting a second like is blocked by the unique constraint on `(userId, commentId)`

> **Index:** `(testId, parentId, createdAt)` for efficient threaded fetch.

---

## Entity Relationships

```
┌─────────┐        ┌──────────────┐        ┌──────────────────┐
│  users  │──────<│ user_attempts│>───────│      tests       │
└─────────┘        └──────┬───────┘        └────────┬─────────┘
                          │                         │
                  ┌───────┴────────┐        ┌───────┴─────────┐
                  │attempt_sections│        │  test_sections   │
                  └───────┬────────┘        └───────┬─────────┘
                          │ (join)                  │
                          └─────────>───────────────┘
                                                    │
                                           ┌────────┴────────┐
                                           │ question_groups  │
                                           └────────┬────────┘
                                                    │
                                           ┌────────┴────────┐
                                           │    questions     │
                                           └────────┬────────┘
                                                    │
                                           ┌────────┴────────┐
                                           │  user_answers   │<──── user_attempts
                                           └─────────────────┘

tests ──< test_tags >── tags
tests ──< comments (self-ref parentId) ──< comment_likes >── users
```

**Reading the diagram:**

- `──<` means "one-to-many" (left side is the "one")
- `>──` means "many-to-one"
- `><` means "many-to-many via join table"

---

## Table Relationships & Scenarios

This section maps each major user flow to the tables it touches.

### Scenario 1 — Browsing the test library

```
UI filter (examType, format, tag slug)
  → tests (WHERE examType, format, isPublished)
  → test_tags JOIN tags (WHERE slug IN [...])
  → returns: title, attemptCount, questionCount, sectionCount (all cached on tests row)
```

No JOINs into sections or questions needed; cached counters serve the card UI.

---

### Scenario 2 — Viewing a test detail page

```
tests (id = ?)
  └─ test_sections (orderIndex ASC)
       └─ questionCount (cached — for section checklist)
  └─ tags (via test_tags)
  └─ comments WHERE parentId IS NULL (ORDER BY createdAt)
       └─ comments WHERE parentId = <top-level id>  (replies)
```

---

### Scenario 3 — Starting a Full Test attempt

```
1. INSERT user_attempts { mode: FULL_TEST, status: IN_PROGRESS, timeLimitMins: test.durationMins }
2. INSERT attempt_sections for ALL test_sections of this test
3. Load questions:
   test_sections → question_groups → questions
   (all sections, ordered by section.orderIndex → group.orderIndex → question.orderIndex)
```

---

### Scenario 4 — Starting a Practice attempt (partial sections)

```
1. User checks sections on detail page
2. INSERT user_attempts { mode: PRACTICE, status: IN_PROGRESS, timeLimitMins: null }
3. INSERT attempt_sections only for CHECKED sections
4. Load questions: only from those sections (same tree as Full Test but filtered)
```

---

### Scenario 5 — Auto-saving answers mid-test

```
Every N seconds (or on answer change):
  UPSERT user_answers { attemptId, questionId, answerText }
  ON CONFLICT (attemptId, questionId) DO UPDATE SET answerText = ?
  isCorrect stays NULL until submission
```

---

### Scenario 6 — Submitting a test

```
1. For each user_answers row of this attempt:
     compare answerText to questions.correctAnswer
     UPDATE isCorrect = true/false
2. UPDATE user_attempts {
     status: SUBMITTED,
     submittedAt: now(),
     totalQuestions: N,
     correctCount: X,
     scorePercent: X/N * 100
   }
3. INCREMENT tests.attemptCount += 1
```

---

### Scenario 7 — Resuming an in-progress attempt

```
1. Find user_attempts WHERE userId = ? AND status = IN_PROGRESS
2. Load attempt_sections → test_sections → question_groups → questions
3. Load existing user_answers for this attempt → restore filled-in answers
4. Restore countdown: timeLimitMins - elapsed(startedAt, now())
```

---

### Scenario 8 — Reviewing results after submission

```
user_attempts (id = ?, status = SUBMITTED)
  └─ user_answers JOIN questions
       → answerText (what student wrote)
       → correctAnswer (from questions)
       → isCorrect (graded flag)
       → explanation (optional hint)
  └─ attempt_sections → test_sections (to group answers by section)
```

---

### Scenario 9 — Rendering question types in the test UI

| Question Type          | Group `contentHtml`                       | Group `matchingOptions`     | Question `stem`                       | Question `mcqOptions`    |
| ---------------------- | ----------------------------------------- | --------------------------- | ------------------------------------- | ------------------------ |
| `MULTIPLE_CHOICE`      | null                                      | null                        | "What does the speaker say about...?" | `[{label:"A",...}, ...]` |
| `NOTE_FORM_COMPLETION` | HTML form with `{1}` … `{10}` tokens      | null                        | null                                  | null                     |
| `TABLE_COMPLETION`     | HTML table with blank cells `{21}`…`{30}` | null                        | null                                  | null                     |
| `SUMMARY_COMPLETION`   | Prose passage with gaps `{31}`…`{40}`     | null                        | null                                  | null                     |
| `MATCHING`             | Left-side statements list                 | `[{label:"A", text:"..."}]` | null                                  | null                     |

Frontend rendering rule:

- If `questionType = MULTIPLE_CHOICE`: render each question as a standalone card using `stem` + `mcqOptions`
- Otherwise: render the group's `contentHtml` once, replace each `{n}` token with `<input data-question="n" />`, and connect inputs to the matching `questions` row by `questionNumber`

---

## Seed Data

**File:** `apps/api/prisma/seed.ts`

### 1. Users

| Role    | Email                  |
| ------- | ---------------------- |
| ADMIN   | `admin@example.com`    |
| STUDENT | `student1@example.com` |
| STUDENT | `student2@example.com` |

### 2. Tags

`IELTS Academic` · `IELTS General` · `Listening` · `Reading` · `Writing` · `Speaking` · `TOEIC` · `HSK` · `TOPIK` · `JLPT` · `SAT` · `ACT` · `THPTQG` · `2024` · `Official Test` · `Practice`

### 3. IELTS Listening Test 1 (all 4 question types)

```
examType: IELTS_ACADEMIC  |  format: FULL  |  durationMins: 40  |  questionCount: 40
```

| Section     | Question Type          | Questions | Detail                                   |
| ----------- | ---------------------- | --------- | ---------------------------------------- |
| Recording 1 | `NOTE_FORM_COMPLETION` | Q1–10     | `contentHtml` with `{1}`–`{10}` tokens   |
| Recording 2 | `MULTIPLE_CHOICE`      | Q11–20    | `stem` + `mcqOptions` per question       |
| Recording 3 | `TABLE_COMPLETION`     | Q21–30    | `contentHtml` table with `{21}`–`{30}`   |
| Recording 4 | `SUMMARY_COMPLETION`   | Q31–40    | `contentHtml` passage with `{31}`–`{40}` |

- All Question rows have `correctAnswer` filled
- 1 submitted `UserAttempt` for student1 with `UserAnswer` + `isCorrect` populated

### 4. Condensed TOEIC Test

```
examType: TOEIC_LR  |  format: CONDENSED  |  durationMins: 45
```

3 sections · MCQ questions only

### 5. Sample Comments on IELTS Test

2 top-level comments + 1 reply

---

## Verification Checklist

| #   | Command / Action                                                                                           | Expected Result                                                          | Status |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ |
| 1   | `npx prisma migrate dev --name init`                                                                       | Migration succeeds, all tables created                                   | ✅ Done |
| 2   | `npx prisma db seed`                                                                                       | Admin + student users, tags, and IELTS test visible in DB                | ✅ Done |
| 3   | `findMany({ where: { examType: 'IELTS_ACADEMIC', isPublished: true } })`                                   | Returns test with correct cached counts                                  | ✅ Done |
| 4   | `findUnique({ include: { sections: { include: { questionGroups: { include: { questions: true } } } } } })` | Returns full tree for test-taking UI                                     | ✅ Done |
| 5   | Create `UserAttempt` → upsert `UserAnswer` rows → submit                                                   | Sets `isCorrect`, updates `scorePercent`, increments `Test.attemptCount` | ✅ Done |
| 6   | `npx prisma studio`                                                                                        | All tables and seed data visually inspectable                            | ✅ Done |

---

## Implementation Status

> **Last updated:** 2026-03-07

### API Endpoints (all implemented and verified)

| Method | Endpoint                          | Auth | Purpose                                      | Status |
| ------ | --------------------------------- | ---- | -------------------------------------------- | ------ |
| POST   | `/api/auth/register`              | No   | Register new user, returns JWT tokens         | ✅     |
| POST   | `/api/auth/login`                 | No   | Login, returns JWT access + refresh tokens    | ✅     |
| POST   | `/api/auth/refresh`               | No   | Refresh expired access token                  | ✅     |
| GET    | `/api/users/me`                   | Yes  | Get current user profile                      | ✅     |
| GET    | `/api/tests`                      | No   | List tests with filters (examType, format, tags, search, pagination) | ✅ |
| GET    | `/api/tests/:id`                  | No   | Test detail with sections, groups, questions (answers hidden) | ✅ |
| GET    | `/api/tags`                       | No   | List all tags                                 | ✅     |
| POST   | `/api/attempts`                   | Yes  | Start new attempt (practice or full test)     | ✅     |
| GET    | `/api/attempts`                   | Yes  | List user's attempts                          | ✅     |
| GET    | `/api/attempts/in-progress`       | Yes  | Find in-progress attempt for a test           | ✅     |
| GET    | `/api/attempts/:id`               | Yes  | Get attempt with questions + saved answers    | ✅     |
| POST   | `/api/attempts/:id/answers`       | Yes  | Save single answer (upsert)                  | ✅     |
| POST   | `/api/attempts/:id/answers/bulk`  | Yes  | Bulk save answers (auto-save)                 | ✅     |
| POST   | `/api/attempts/:id/submit`        | Yes  | Grade + submit attempt                        | ✅     |
| GET    | `/api/attempts/:id/result`        | Yes  | Get graded result with correct answers        | ✅     |
| POST   | `/api/attempts/:id/abandon`       | Yes  | Abandon in-progress attempt                   | ✅     |
| GET    | `/api/tests/:testId/comments`     | No   | List comments with replies (paginated)        | ✅     |
| POST   | `/api/tests/:testId/comments`     | Yes  | Create comment or reply                       | ✅     |
| DELETE | `/api/comments/:id`               | Yes  | Delete own comment                            | ✅     |
| POST   | `/api/comments/:id/like`          | Yes  | Like a comment                                | ✅     |
| DELETE | `/api/comments/:id/like`          | Yes  | Unlike a comment                              | ✅     |

### API Source Files

| File                                              | Purpose                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `apps/api/src/main.ts`                            | Bootstrap, CORS, global prefix `/api`    |
| `apps/api/src/app.module.ts`                      | Root module imports all feature modules  |
| `apps/api/src/prisma/prisma.service.ts`           | PrismaClient wrapper                     |
| `apps/api/src/prisma/prisma.module.ts`            | Global Prisma module                     |
| `apps/api/src/auth/auth.module.ts`                | Auth module (JWT, Passport)              |
| `apps/api/src/auth/auth.service.ts`               | Register, login, refresh token logic     |
| `apps/api/src/auth/auth.controller.ts`            | Auth endpoints                           |
| `apps/api/src/auth/jwt.strategy.ts`               | Passport JWT strategy                    |
| `apps/api/src/auth/guards/jwt-auth.guard.ts`      | JWT auth guard                           |
| `apps/api/src/auth/guards/roles.guard.ts`         | Role-based access guard                  |
| `apps/api/src/auth/decorators/current-user.decorator.ts` | `@CurrentUser()` param decorator  |
| `apps/api/src/auth/decorators/roles.decorator.ts` | `@Roles()` decorator                     |
| `apps/api/src/auth/dto/register.dto.ts`           | Register DTO (email, password, displayName?) |
| `apps/api/src/auth/dto/login.dto.ts`              | Login DTO (email, password)              |
| `apps/api/src/auth/dto/refresh.dto.ts`            | Refresh DTO (refreshToken)               |
| `apps/api/src/users/users.module.ts`              | Users module                             |
| `apps/api/src/users/users.service.ts`             | findByEmail, findById, create            |
| `apps/api/src/users/users.controller.ts`          | GET /users/me                            |
| `apps/api/src/tests/tests.module.ts`              | Tests module                             |
| `apps/api/src/tests/tests.service.ts`             | findAll (with filters), findById, findByIdFull |
| `apps/api/src/tests/tests.controller.ts`          | GET /tests, GET /tests/:id               |
| `apps/api/src/attempts/attempts.module.ts`        | Attempts module                          |
| `apps/api/src/attempts/attempts.service.ts`       | Start, save answers, submit, grade, abandon |
| `apps/api/src/attempts/attempts.controller.ts`    | All attempt endpoints                    |
| `apps/api/src/tags/tags.module.ts`                | Tags module                              |
| `apps/api/src/tags/tags.service.ts`               | findAll, findBySlug                      |
| `apps/api/src/tags/tags.controller.ts`            | GET /tags                                |
| `apps/api/src/comments/comments.module.ts`        | Comments module                          |
| `apps/api/src/comments/comments.service.ts`       | CRUD + like/unlike                       |
| `apps/api/src/comments/comments.controller.ts`    | Comment endpoints                        |

### Frontend Pages (all connected to real API)

| File                                                      | Purpose                                    | Status |
| --------------------------------------------------------- | ------------------------------------------ | ------ |
| `apps/web/src/app/(auth)/login/page.tsx`                  | Login form → POST /auth/login → store JWT  | ✅     |
| `apps/web/src/app/(auth)/register/page.tsx`               | Register form → POST /auth/register        | ✅     |
| `apps/web/src/app/(learner)/layout.tsx`                   | Auth-aware nav (session restore, logout)   | ✅     |
| `apps/web/src/app/(learner)/tests/page.tsx`               | Test library with API filters + pagination | ✅     |
| `apps/web/src/app/(learner)/tests/[id]/page.tsx`          | Test detail, section select, start attempt | ✅     |
| `apps/web/src/app/(learner)/tests/[id]/attempt/page.tsx`  | Test-taking UI, auto-save, submit          | ✅     |
| `apps/web/src/app/(learner)/tests/[id]/result/page.tsx`   | Graded results, analysis table, answer review | ✅  |

### Frontend Shared Files

| File                                    | Purpose                                      |
| --------------------------------------- | -------------------------------------------- |
| `apps/web/src/lib/api.ts`              | Axios instance with JWT interceptor + refresh |
| `apps/web/src/lib/auth-store.ts`       | Zustand store (user, isAuthenticated, logout) |
| `apps/web/src/lib/providers.tsx`       | React Query + Ant Design ConfigProvider       |

### End-to-End Flow (verified 2026-03-07)

```
Login (student1@example.com / student123)
  → Browse test library (GET /api/tests)
  → View test detail (GET /api/tests/:id)
  → Start practice attempt (POST /api/attempts)
  → Answer questions (POST /api/attempts/:id/answers)
  → Submit (POST /api/attempts/:id/submit) → grading runs
  → View results (GET /api/attempts/:id/result)
  → Score: 1/10 (10%) ✅
```

### Test Credentials

| Role    | Email                   | Password     |
| ------- | ----------------------- | ------------ |
| ADMIN   | `admin@example.com`     | `admin123`   |
| STUDENT | `student1@example.com`  | `student123` |
| STUDENT | `student2@example.com`  | `student123` |

### Remaining TODO

- [ ] User dashboard page (scores history, stats)
- [ ] Audio playback for Listening sections
- [ ] Comment section integration in test detail UI
- [ ] Admin panel for test CRUD
- [ ] AI features (Phase 2)
