# IELTS AI-Powered Learning Platform — Implementation Plan

## Context

Build a full-stack IELTS preparation website that integrates AI throughout the learning experience: automated Writing scoring, RAG-based question generation from uploaded documents, personalized learning path recommendations, an AI tutor, basic Speaking practice, and AI-assisted admin tools for question import.

**Tech stack:** NestJS (REST API) · Next.js 16 App Router (frontend) · PostgreSQL (primary DB) · Claude API (AI backbone) · Ant Design (UI component library)

---

## System Architecture

```
┌─────────────────────────────────────────────┐
│            Next.js Frontend                 │
│  App Router · Ant Design · TailwindCSS      │
│  React Query · Zustand · Axios              │
└──────────────────┬──────────────────────────┘
                   │ HTTP / SSE
┌──────────────────▼──────────────────────────┐
│           NestJS API Gateway                │
│  Auth · REST modules · SSE for AI streaming │
│  Port 4000 · Prefix /api                    │
└───┬──────────────┬──────────────────────────┘
    │              │
PostgreSQL     External AI Services
(Prisma ORM)   ┌──────────────────────┐
+ pgvector     │ Claude API           │
               │ OpenAI Whisper API   │
               │ AWS Textract / OCR   │
               └──────────────────────┘
```

---

## Database Schema

> Full schema implemented in `apps/api/prisma/schema.prisma`. See `docs/plans/dabase-init-plan.md` for detailed field specs.

### Enums

| Enum | Values |
|---|---|
| `UserRole` | `STUDENT`, `ADMIN` |
| `ExamType` | `IELTS_ACADEMIC`, `IELTS_GENERAL`, `TOEIC_LR`, `TOEIC_SW`, `HSK_1`–`HSK_6`, `TOPIK_I`, `TOPIK_II`, `JLPT_N1`–`JLPT_N5`, `DIGITAL_SAT`, `ACT`, `THPTQG` |
| `TestFormat` | `FULL`, `CONDENSED` |
| `SectionSkill` | `LISTENING`, `READING`, `WRITING`, `SPEAKING` |
| `QuestionType` | `MULTIPLE_CHOICE`, `NOTE_FORM_COMPLETION`, `TABLE_COMPLETION`, `SUMMARY_COMPLETION`, `MATCHING` |
| `AttemptMode` | `PRACTICE`, `FULL_TEST` |
| `AttemptStatus` | `IN_PROGRESS`, `SUBMITTED`, `ABANDONED` |

### Models (Phase 1 — Implemented)

| Model | Map | Purpose |
|---|---|---|
| `User` | `users` | Accounts (students & admins) |
| `Test` | `tests` | Top-level exam entity with cached counters |
| `Tag` | `tags` | Free-form labels with slug |
| `TestTag` | `test_tags` | M:N join between tests and tags |
| `TestSection` | `test_sections` | Skill-based divisions with optional audio |
| `QuestionGroup` | `question_groups` | Shared stimulus (form/table/passage/matching pool) |
| `Question` | `questions` | Individual question with answer data |
| `UserAttempt` | `user_attempts` | One attempt per user per test |
| `AttemptSection` | `attempt_sections` | Which sections are in an attempt |
| `UserAnswer` | `user_answers` | Per-question answer with auto-grade flag |
| `Comment` | `comments` | Threaded test comments with like count |
| `CommentLike` | `comment_likes` | Unique like per user per comment |

### Models (Future Phases — Not yet implemented)

| Table | Phase | Purpose |
|---|---|---|
| `user_profiles` | 3 | Target band, test date, learning style |
| `skill_scores` | 3 | Per-skill band score history |
| `writing_evaluations` | 2 | 4-criteria rubric results from Claude |
| `documents` | 2 | Uploaded PDF/DOCX for RAG |
| `document_chunks` | 2 | Text chunks + pgvector embeddings |
| `generated_questions` | 2 | RAG-generated questions pending review |
| `learning_paths` | 3 | Claude-generated roadmap JSON |
| `study_sessions` | 3 | Study streak tracking |
| `ai_chat_sessions` | 3 | AI tutor message history |
| `speaking_sessions` | 4 | Audio, transcript, Claude feedback |
| `admin_import_jobs` | 4 | OCR + question detection jobs |

---

## Backend — NestJS Modules

### Implemented (Phase 1)

```
apps/api/src/
├── prisma/              # PrismaService (global module)
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── auth/                # JWT auth, guards, refresh tokens
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── auth.controller.ts
│   ├── jwt.strategy.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── roles.decorator.ts
│   └── dto/
│       ├── register.dto.ts
│       ├── login.dto.ts
│       └── refresh.dto.ts
├── users/               # User CRUD
│   ├── users.module.ts
│   ├── users.service.ts
│   └── users.controller.ts
├── tags/                # Tag listing for filter UI
│   ├── tags.module.ts
│   ├── tags.service.ts
│   └── tags.controller.ts
├── tests/               # Test browsing with search/filter/pagination + detail (correctAnswer stripped)
│   ├── tests.module.ts
│   ├── tests.service.ts
│   └── tests.controller.ts
├── attempts/            # Full attempt lifecycle: start, resume, save, bulk-save, submit, abandon, result
│   ├── attempts.module.ts
│   ├── attempts.service.ts
│   └── attempts.controller.ts
├── comments/            # Threaded comments on tests + like/unlike
│   ├── comments.module.ts
│   ├── comments.service.ts
│   └── comments.controller.ts
├── main.ts
└── app.module.ts
```

### Planned (Future Phases)

```
src/
├── writing/         # AI Writing evaluation (Claude API)          ← Phase 2
├── rag/             # Document upload, chunking, pgvector         ← Phase 2
├── questions-gen/   # RAG question generation pipeline            ← Phase 2
├── learning-path/   # Result analysis + Claude roadmap            ← Phase 3
├── ai-tutor/        # Streaming AI chat with exam context         ← Phase 3
├── speaking/        # Whisper transcription + Claude feedback     ← Phase 4
├── admin/           # OCR import + question detection             ← Phase 4
├── files/           # S3/local file storage service               ← Phase 4
└── common/          # Pipes, guards, interceptors, pagination
```

### API Endpoints (Phase 1)

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Register new user |
| `POST` | `/api/auth/login` | — | Login, get tokens |
| `POST` | `/api/auth/refresh` | — | Refresh access token |

#### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/me` | JWT | Get current user profile |

#### Tags

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tags` | — | List all tags (for filter chips in test library UI) |

#### Tests

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tests` | — | List tests with pagination. Query params: `examType`, `format`, `tags` (comma-separated slugs), `search` (title keyword), `page`, `limit`. Returns `{ data, total, page, limit }` |
| `GET` | `/api/tests/:id` | — | Get test detail with sections → question groups → questions. **`correctAnswer` and `explanation` are stripped** from the response to prevent cheating |

#### Attempts

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/attempts` | JWT | Start attempt. Body: `{ testId, mode, sectionIds?, timeLimitMins? }`. Blocks if user already has an in-progress attempt for same test. Returns attempt with sections and test info |
| `GET` | `/api/attempts` | JWT | List all of current user's attempts with test summary |
| `GET` | `/api/attempts/in-progress` | JWT | Check for existing in-progress attempt. Query: `?testId=`. Returns attempt or `null` |
| `GET` | `/api/attempts/:id` | JWT | Get attempt with full question tree + saved answers (for resume). `correctAnswer` still hidden |
| `GET` | `/api/attempts/:id/result` | JWT | Get result after submission — includes `correctAnswer`, `explanation`, and `isCorrect` per answer. Rejects if attempt not yet submitted |
| `POST` | `/api/attempts/:id/answers` | JWT | Save single answer: `{ questionId, answerText }` |
| `POST` | `/api/attempts/:id/answers/bulk` | JWT | Bulk save answers (auto-save): `{ answers: [{ questionId, answerText }] }`. Runs in a transaction |
| `POST` | `/api/attempts/:id/submit` | JWT | Submit + auto-grade. Compares each answer to `correctAnswer`, sets `isCorrect`, calculates `scorePercent`, increments `test.attemptCount` |
| `POST` | `/api/attempts/:id/abandon` | JWT | Mark attempt as `ABANDONED`. Only works on `IN_PROGRESS` attempts |

#### Comments

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tests/:testId/comments` | — | Paginated top-level comments with nested replies and user info. Query: `?page=`, `?limit=`. Returns `{ data, total, page, limit }` |
| `POST` | `/api/tests/:testId/comments` | JWT | Create comment or reply. Body: `{ body, parentId? }`. Increments `test.commentCount` |
| `DELETE` | `/api/comments/:id` | JWT | Delete own comment. Decrements `test.commentCount` |
| `POST` | `/api/comments/:id/like` | JWT | Like a comment. Blocked by unique constraint if already liked. Increments `comment.likeCount` |
| `DELETE` | `/api/comments/:id/like` | JWT | Unlike a comment. Decrements `comment.likeCount` |

### Module Responsibilities (Future)

| Module | Core Logic |
|---|---|
| `writing` | Build rubric prompt → stream Claude response → parse 4-criteria JSON → persist |
| `rag` | pdf-parse / mammoth → chunk text → embed via OpenAI → store in pgvector |
| `questions-gen` | Retrieve top-k chunks → prompt Claude to generate MCQ/short-answer/essay |
| `learning-path` | Aggregate skill_scores + attempts → prompt Claude for roadmap JSON |
| `ai-tutor` | Maintain rolling message history, inject current question as system context |
| `speaking` | Receive audio blob → Whisper transcription → Claude pronunciation/fluency feedback |
| `admin` | AWS Textract or Tesseract → Claude classifies question types → returns structured JSON |

---

## Frontend — Next.js Routes

### Implemented (Phase 1)

```
apps/web/src/
├── app/
│   ├── layout.tsx                          # Root layout + Providers (React Query)
│   ├── page.tsx                            # Landing page
│   ├── (auth)/
│   │   ├── layout.tsx                      # Centered card layout
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (learner)/
│   │   ├── layout.tsx                      # Topnav layout
│   │   ├── dashboard/page.tsx
│   │   ├── tests/
│   │   │   ├── page.tsx                    # Test library browse
│   │   │   └── [id]/
│   │   │       ├── page.tsx                # Test detail / instructions
│   │   │       └── attempt/page.tsx        # Test-taking UI
│   │   ├── writing/
│   │   │   ├── submit/                     # (placeholder)
│   │   │   └── results/[id]/              # (placeholder)
│   │   ├── speaking/practice/              # (placeholder)
│   │   ├── my-documents/                   # (placeholder)
│   │   ├── learning-path/                  # (placeholder)
│   │   └── tutor/                          # (placeholder)
│   └── (admin)/
│       ├── layout.tsx                      # Dark topnav admin layout
│       ├── admin-dashboard/page.tsx        # Note: prefixed to avoid route conflict
│       ├── admin-tests/                    # (placeholder)
│       ├── admin-import/                   # (placeholder)
│       └── admin-users/                    # (placeholder)
├── lib/
│   ├── api.ts                              # Axios client + JWT interceptor + auto-refresh
│   ├── auth-store.ts                       # Zustand store (user, isAuthenticated, logout)
│   └── providers.tsx                       # React Query provider (staleTime 60s)
└── components/                             # Shared components (TBD)
```

> **Note:** Admin routes use `admin-` URL prefix (e.g. `/admin-dashboard`) to avoid Next.js App Router path conflicts with learner routes that share the same segment names.

---

## AI Integration Strategy

**Default model:** `claude-sonnet-4-6` · **Lightweight tasks:** `claude-haiku-4-5`

| Feature | Model | Approach |
|---|---|---|
| Writing evaluation | claude-sonnet-4-6 | Structured JSON output with rubric prompt; stream to client via SSE |
| Question generation (RAG) | claude-sonnet-4-6 | Top-k chunk retrieval → few-shot prompt → JSON array of questions |
| Learning path | claude-sonnet-4-6 | Aggregate scores object → prompt → structured roadmap JSON |
| AI Tutor | claude-sonnet-4-6 | Streaming chat with system prompt injecting exam context |
| Speaking feedback | claude-haiku-4-5 | Transcript → band score + feedback JSON |
| Admin OCR classification | claude-haiku-4-5 | Extracted text → classify & structure questions |

### RAG Pipeline

1. Upload PDF/DOCX → extract text (`pdf-parse` / `mammoth`)
2. Chunk at ~500 tokens with 50-token overlap
3. Embed via `text-embedding-3-small` (OpenAI)
4. Store chunks + embeddings in pgvector on PostgreSQL
5. On question-gen request: embed query → cosine similarity search → top-5 chunks → generate

---

## Key Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| UI Library | Ant Design (antd) | Rich enterprise-grade component set; built-in Form, Table, Modal, Tabs — ideal for test-taking and admin UIs |
| ORM | Prisma **v5** (not v7) | v7 breaks `url` in schema.prisma; v5 is stable |
| Vector search | pgvector on PostgreSQL | Avoid extra infrastructure; sufficient for initial scale |
| File storage | AWS S3 (local MinIO for dev) | Audio, PDF, image uploads |
| Speech-to-text | OpenAI Whisper API | Best accuracy/cost ratio |
| OCR | AWS Textract (fallback: Tesseract.js) | Handles complex layouts |
| AI streaming | SSE (Server-Sent Events) | Simpler than WebSocket for one-directional AI stream |
| Auth | JWT access (15m) + JWT refresh (7d) | Standard, secure — stored in localStorage for now |
| State management | Zustand (client) + React Query (server) | Minimal boilerplate |
| Frontend version | Next.js 16 (not 14) | Latest stable at scaffold time |

---

## Third-Party Services

| Service | Purpose | Cost Model |
|---|---|---|
| Anthropic Claude API | Writing grading, RAG QA, tutor, learning path | Per token |
| OpenAI Whisper API | Speaking transcription | Per minute of audio |
| OpenAI Embeddings API | Document chunk embeddings | Per token (cheap) |
| AWS S3 | File storage | Per GB + requests |
| AWS Textract (optional) | OCR for admin image import | Per page |

---

## Environment Variables

### Backend (`apps/api/.env`)

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ielts_platform?schema=public"
JWT_SECRET="your-jwt-secret-change-in-production"
JWT_REFRESH_SECRET="your-refresh-secret-change-in-production"
FRONTEND_URL="http://localhost:3000"
PORT=4000
```

### Frontend (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

---

## Development Commands

```bash
# From repo root
npm run dev:api         # Start NestJS (port 4000, watch mode)
npm run dev:web         # Start Next.js (port 3000)

npm run db:generate     # prisma generate
npm run db:migrate      # prisma migrate dev
npm run db:seed         # ts-node prisma/seed.ts
npm run db:studio       # prisma studio
```

---

## Phase-Based Development Roadmap

### Phase 1 — Foundation & Core Testing (MVP)

- [x] NestJS project scaffold (Prisma 5 + PostgreSQL + JWT auth)
- [x] Next.js project scaffold (App Router + TailwindCSS + React Query + Zustand)
- [x] Prisma schema with all Phase 1 models
- [x] Seed data: 3 users, 16 tags, IELTS test (40q, 4 types), TOEIC condensed test (15q)
- [x] Auth endpoints: register / login / refresh token
- [x] Tags module: list all tags for filter UI
- [x] Tests module: list with search/tag filter/pagination + detail (correctAnswer stripped from students)
- [x] Attempts module: start (with duplicate check) / get single (resume) / save answer / bulk save / submit + auto-grade / abandon / get result (with correctAnswer) / check in-progress / list
- [x] Comments module: paginated threaded comments / create + reply / delete own / like + unlike
- [x] All route directories scaffolded (frontend)
- [x] All Phase 1 backend APIs complete and type-checked
- [x] Test Library page UI (two-column layout: main content + user sidebar; category tabs, search, test cards grid with stats/tags; user avatar/username/goal prompt/stats button in sidebar)
- [x] Test Detail page UI (info tabs, practice/full-test mode, section checkboxes, time limit selector)
- [x] Test-Taking UI (3-panel layout: passage+audio | answer inputs | timer+question palette)
  - Supports form completion, multiple choice, table completion, summary completion
  - Recording section tabs, audio player bar, countdown timer
  - Question navigation grid with answered/unanswered status
  - Next section navigation, submit button
- [x] Ant Design integration (ConfigProvider in providers.tsx)
- [ ] Connect frontend to backend API (replace mock data with API calls)
- [ ] User dashboard (scores history)
- [ ] Test & Question CRUD for admin

### Phase 2 — AI Writing & RAG

- Writing submission UI + backend
- Claude Writing evaluation (4 rubric criteria + feedback) with SSE streaming
- Writing results page with rubric breakdown visualization
- Document upload (PDF/DOCX) + chunking + pgvector embedding
- RAG question generation from uploaded documents
- Generated questions review page for learner

### Phase 3 — AI Tutor & Learning Path

- AI Tutor chat UI with streaming (context = current test/question)
- Learning path generation (analyze scores → Claude roadmap)
- Learning path visualization page (timeline / radar chart)
- Study streak & progress tracking

### Phase 4 — Speaking & Admin AI Tools

- Speaking practice: browser audio recording (MediaRecorder API)
- Audio upload → Whisper transcription → Claude feedback
- Speaking results with band score + detailed feedback
- Admin image import: upload image → OCR → Claude question detection
- Admin review UI for detected questions before saving

### Phase 5 — Polish & Optimization

- Performance: Redis caching for AI responses, pagination
- UI/UX polish, Ant Design theme customization, mobile responsiveness
- Rate limiting on AI endpoints
- Error handling, loading states, retry logic
- Basic analytics dashboard for admin

---

## Critical Files

### Backend (`apps/api/`)

```
prisma/schema.prisma                      ← Full DB schema (Prisma v5)
prisma/seed.ts                            ← Seed: users, tags, IELTS test, TOEIC test
src/main.ts                               ← Bootstrap, CORS, ValidationPipe
src/app.module.ts                         ← Root module
src/prisma/prisma.service.ts              ← Global PrismaClient
src/auth/auth.service.ts                  ← register / login / refresh logic
src/auth/jwt.strategy.ts                  ← Passport JWT strategy
src/auth/guards/jwt-auth.guard.ts         ← Route protection
src/auth/guards/roles.guard.ts            ← ADMIN/STUDENT role check
src/tags/tags.service.ts                 ← findAll tags for filter UI
src/tags/tags.controller.ts              ← GET /api/tags
src/tests/tests.service.ts               ← findAll (search/filter/pagination) + findById (correctAnswer stripped) + findByIdFull (admin)
src/attempts/attempts.service.ts          ← start / findById (resume) / save / bulkSave / submit / abandon / getResult
src/comments/comments.service.ts         ← findByTest (paginated) / create / delete / like / unlike
src/comments/comments.controller.ts      ← Mounted at /tests/:testId/comments + /comments/:id
src/writing/writing.service.ts            ← Claude rubric evaluation       [Phase 2]
src/rag/rag.service.ts                    ← Chunking + pgvector             [Phase 2]
src/learning-path/lp.service.ts           ← Personalized roadmap            [Phase 3]
src/ai-tutor/tutor.service.ts             ← SSE chat                        [Phase 3]
src/speaking/speaking.service.ts          ← Whisper + feedback              [Phase 4]
```

### Frontend (`apps/web/`)

```
src/lib/api.ts                            ← Axios client with JWT auto-refresh
src/lib/auth-store.ts                     ← Zustand auth state
src/lib/providers.tsx                     ← React Query + Ant Design ConfigProvider
src/app/(learner)/tests/page.tsx          ← Test library (category tabs, search, card grid)
src/app/(learner)/tests/[id]/page.tsx     ← Test detail (info, practice/full mode, section picker)
src/app/(learner)/tests/[id]/attempt/     ← Test-taking UI (passage, answers, timer sidebar)
src/app/(learner)/writing/submit/         ← Writing submission     [Phase 2]
src/app/(learner)/writing/results/[id]/   ← Writing AI feedback    [Phase 2]
src/app/(learner)/tutor/                  ← AI Tutor chat          [Phase 3]
src/app/(learner)/speaking/practice/      ← Speaking recording     [Phase 4]
src/app/(learner)/learning-path/          ← Roadmap visualization  [Phase 3]
src/app/(admin)/admin-import/             ← AI question import     [Phase 4]
```

---

## Verification Plan

1. **DB setup:** `npm run db:migrate` → `npm run db:seed` → `npm run db:studio` — all tables and seed data visible
2. **Auth flow:** `POST /api/auth/register` → `POST /api/auth/login` → `GET /api/users/me` with Bearer token → `POST /api/auth/refresh`
3. **Tags:** `GET /api/tags` returns all 16 seeded tags
4. **Test browse:** `GET /api/tests` returns paginated tests → `GET /api/tests?examType=IELTS_ACADEMIC` filters → `GET /api/tests?search=Listening` keyword search → `GET /api/tests?tags=listening,ielts-academic` tag filter
5. **Test detail:** `GET /api/tests/:id` returns full question tree with `correctAnswer` and `explanation` excluded
6. **Attempt start:** `POST /api/attempts` creates attempt → duplicate start blocked with 400
7. **Resume:** `GET /api/attempts/in-progress?testId=X` returns existing attempt → `GET /api/attempts/:id` returns questions + saved answers
8. **Answer save:** `POST /api/attempts/:id/answers` upserts single → `POST /api/attempts/:id/answers/bulk` upserts batch in transaction
9. **Submit:** `POST /api/attempts/:id/submit` grades all answers, sets `scorePercent`, increments `test.attemptCount`
10. **Abandon:** `POST /api/attempts/:id/abandon` marks attempt `ABANDONED`
11. **Result:** `GET /api/attempts/:id/result` returns full answers with `correctAnswer`, `explanation`, `isCorrect` (only after submit)
12. **Comments:** `GET /api/tests/:testId/comments` returns paginated threaded comments → `POST` creates → `POST /api/comments/:id/like` likes → `DELETE` unlikes
13. **Frontend build:** `cd apps/web && npx next build` completes with no errors
14. **Backend build:** `cd apps/api && npx nest build` compiles with no TypeScript errors
7. **Writing AI:** submit essay → SSE streams rubric feedback → results page renders 4 criteria   `[Phase 2]`
8. **RAG:** upload PDF → chunks created in DB → generate questions → questions appear for review   `[Phase 2]`
9. **Learning path:** attempt several tests → generate roadmap → roadmap JSON renders as timeline   `[Phase 3]`
10. **Speaking:** record 30s audio → transcript appears → AI feedback + band score displayed   `[Phase 4]`
11. **Admin import:** upload question image → extracted text shown → questions detected → save to DB   `[Phase 4]`
