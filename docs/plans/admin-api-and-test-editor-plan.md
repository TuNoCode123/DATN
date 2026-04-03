# Plan: Admin API Integration + Test Entry Flow

> **Status: COMPLETED** (2026-03-23)

## Context

All admin pages use mock data (Zustand stores + `simulateApi()` delays). Backend has zero admin endpoints — only learner-facing APIs exist. The role-based guard infrastructure (`@Roles()`, `RolesGuard`) exists but is unused.

The DB has 4 core entities for test content:

```
Test → TestSection → QuestionGroup → Question
```

No Courses/Lessons needed — they'll be removed from the admin UI.

---

## Phase 1: Backend — Admin Module (NestJS) ✅

Create `apps/api/src/admin/` with controllers/services. All endpoints protected with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')`.

### 1A. Schema Change ✅

- Added `isActive Boolean @default(true)` to `User` model in `apps/api/prisma/schema.prisma`
- Migration: `20260322170113_add_user_is_active`

### 1B. Files Created ✅

```
apps/api/src/admin/
  admin.module.ts
  admin-users.controller.ts    + admin-users.service.ts
  admin-tests.controller.ts    + admin-tests.service.ts
  admin-questions.controller.ts + admin-questions.service.ts
  admin-results.controller.ts  + admin-results.service.ts
  admin-analytics.controller.ts + admin-analytics.service.ts
  admin-tags.controller.ts     + admin-tags.service.ts
  dto/
    create-test.dto.ts
    update-test.dto.ts
    admin-query.dto.ts
```

`AdminModule` registered in `apps/api/src/app.module.ts`.

### 1C. Endpoints ✅

#### Users (`/api/admin/users`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/users` | List with pagination, search (email/displayName), role filter |
| GET | `/admin/users/:id` | Get user + attempt count |
| PATCH | `/admin/users/:id` | Update displayName, role |
| PATCH | `/admin/users/:id/toggle-status` | Toggle isActive |

#### Tests (`/api/admin/tests`) — Nested CRUD

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/tests` | List ALL tests (incl. unpublished) with pagination/filters |
| GET | `/admin/tests/:id` | Full test tree with correctAnswer/explanation |
| POST | `/admin/tests` | Create test with nested sections/groups/questions |
| PUT | `/admin/tests/:id` | Replace full test structure (delete children + recreate in transaction) |
| PATCH | `/admin/tests/:id/publish` | Toggle isPublished |
| DELETE | `/admin/tests/:id` | Delete test (cascade) |

#### Questions (`/api/admin/questions`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/questions` | Flat list across all tests with group/section/test joins, filters |

#### Results (`/api/admin/results`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/results` | All attempts across users, with filters (testId, status, userId) |
| GET | `/admin/results/:id` | Attempt detail with answers + correct answers |

#### Analytics (`/api/admin/analytics`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/analytics/stats` | totalUsers, totalTests, totalAttempts, avgScore |
| GET | `/admin/analytics/user-growth` | Monthly registration counts |
| GET | `/admin/analytics/test-activity` | Monthly attempt counts |
| GET | `/admin/analytics/score-distribution` | Score range histogram |
| GET | `/admin/analytics/recent-activity` | Recent registrations + submissions |

#### Tags (`/api/admin/tags`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/tags` | List all tags with test count |
| POST | `/admin/tags` | Create tag |
| PATCH | `/admin/tags/:id` | Update tag |
| DELETE | `/admin/tags/:id` | Delete tag |

### 1D. Test Create/Update — Nested Payload ✅

Single JSON with full tree, saved in `prisma.$transaction`:

```json
{
  "title": "IELTS Academic Test 1",
  "examType": "IELTS_ACADEMIC",
  "format": "FULL",
  "durationMins": 150,
  "description": "...",
  "isPublished": false,
  "tagIds": ["tag-id-1"],
  "sections": [
    {
      "title": "Listening Section 1",
      "skill": "LISTENING",
      "orderIndex": 0,
      "audioUrl": "https://...",
      "durationMins": 30,
      "questionGroups": [
        {
          "questionType": "MULTIPLE_CHOICE",
          "orderIndex": 0,
          "contentHtml": "<p>Listen to the conversation...</p>",
          "questions": [
            {
              "questionNumber": 1,
              "orderIndex": 0,
              "stem": "What is the man's name?",
              "mcqOptions": ["John", "James", "Jack", "Jim"],
              "correctAnswer": "John",
              "explanation": "The man introduces himself as John"
            }
          ]
        }
      ]
    }
  ]
}
```

On **PUT update**: delete all children (cascade) + recreate in transaction. Response includes `hasAttempts` flag so frontend can warn.

---

## Phase 2: Test Entry Flow — UX Design ✅

### 2A. Overall Layout — Single-Page Editor ✅

Route: `/admin-tests/[id]/edit` (use `id=new` for creation)

```
┌──────────────────────────────────────────────────────────┐
│  ← Back to Tests          [Save Draft]  [Save & Publish] │
├────────────────────┬─────────────────────────────────────┤
│  TREE SIDEBAR      │  EDITOR PANEL                       │
│                    │                                     │
│  📋 Test Info      │  (Changes based on tree selection)  │
│                    │                                     │
│  📖 Section 1      │                                     │
│    ├ Group 1  (5q) │                                     │
│    └ Group 2  (3q) │                                     │
│                    │                                     │
│  🎧 Section 2      │                                     │
│    └ Group 1  (4q) │                                     │
│                    │                                     │
│  [+ Add Section]   │                                     │
│                    │                                     │
│ ─────────────────  │                                     │
│  Total: 12 questions│                                    │
└────────────────────┴─────────────────────────────────────┘
```

Implemented with:
- **Left sidebar (~250px)**: Tree with expand/collapse sections, skill icons (🎧📖✍️🗣️), question counts per group
- **Right panel**: Context-sensitive form (Test Info / Section / Question Group)
- **Top bar**: Back button, Save Draft, Save & Publish

### 2B–2D. Editor Panels ✅

- **Test Info panel**: title, examType, format, duration, description
- **Section panel**: title, skill, audioUrl, duration + list of groups
- **Question Group panel**: questionType, contentHtml, inline question editor

### 2E. Question Input ✅

- **MULTIPLE_CHOICE**: stem + 4 options (A/B/C/D) with radio correct selector + explanation
- **Non-MCQ types** (NOTE_FORM_COMPLETION, SUMMARY_COMPLETION, TABLE_COMPLETION, MATCHING): stem + correctAnswer text input + explanation

### 2F. Quick Actions ✅

- Bulk add N blank questions
- Duplicate group (with all questions)
- Auto question numbering (global across sections/groups)
- Collapse/expand questions

### 2G. Section Templates ✅

| Template | Pre-fills |
|----------|-----------|
| 🎧 Listening Section | skill=LISTENING, 1 MULTIPLE_CHOICE group with 10 blank questions |
| 📖 Reading Section | skill=READING, 1 group with passage area + 13 blank questions |
| ✍️ Writing Section | skill=WRITING, 1 group with 2 blank questions |
| 📝 Blank Section | Empty section, configure manually |

### 2H. State Management ✅

`useReducer` with 13 action types:
- `SET_TEST_INFO`, `LOAD_TEST`
- `ADD_SECTION` / `UPDATE_SECTION` / `DELETE_SECTION`
- `ADD_GROUP` / `UPDATE_GROUP` / `DELETE_GROUP`
- `ADD_QUESTION` / `UPDATE_QUESTION` / `DELETE_QUESTION`
- `ADD_BULK_QUESTIONS`, `DUPLICATE_GROUP`

---

## Phase 3: Frontend — Replace Mock Data Layer ✅

### 3A. Created `apps/web/src/lib/admin-api.ts` ✅

All typed axios calls organized by domain (users, tags, tests, questions, results, analytics).

### 3B. Rewrote Hooks ✅

| Hook | Status |
|------|--------|
| `useAdminUsers` | ✅ React Query + adminUsersApi |
| `useAdminTests` + `useAdminTest(id)` | ✅ Added single-fetch + toggle publish |
| `useAdminQuestions` | ✅ Read-only, no mutations |
| `useAdminResults` + `useAdminResult(id)` | ✅ With filters |
| Analytics hooks (5 hooks) | ✅ useDashboardStats, useUserGrowthChart, useTestActivityChart, useRecentActivity, useScoreDistribution |
| `useAdminCourses` | ✅ Deleted |
| `useAdminLessons` | ✅ Deleted |

### 3C. Updated Types ✅

- `AdminTest` gains `sections[]` hierarchy
- Added `AdminTestSection`, `AdminQuestionGroup`
- `QuestionType` aligned with Prisma enum (5 values)
- `ExamType` expanded to all 18 Prisma enum values
- `TestFormat` → FULL, CONDENSED only
- Added `PaginatedResponse<T>`, `AdminQuestionBankItem`, `AdminResultDetail`
- Deleted `AdminCourse`, `AdminLesson`

### 3D. Cleanup ✅

- Deleted `src/features/admin/mock-data/` (6 files)
- Deleted `src/features/admin/stores/` (7 files + index)
- Deleted `simulate-api.ts`
- Deleted `use-admin-courses.ts`, `use-admin-lessons.ts`

---

## Phase 4: Admin Page Updates ✅

| Page | Change | Status |
|------|--------|--------|
| `admin-tests/page.tsx` | Removed dialog wizard. Create → `/admin-tests/new/edit`. Edit → `/admin-tests/[id]/edit` | ✅ |
| `admin-tests/[id]/edit/page.tsx` | **New** — Full tree sidebar + editor panels (~750 lines) | ✅ |
| `admin-questions/page.tsx` | Read-only question bank with test/section context | ✅ |
| `admin-users/page.tsx` | Swapped hooks | ✅ |
| `admin-results/page.tsx` | Rewritten with nested user/test objects + detail sheet | ✅ |
| `admin-dashboard/page.tsx` | "Active Courses" → "Published Tests", swapped analytics hooks | ✅ |
| `admin-analytics/page.tsx` | Rewritten with userGrowth, testActivity, scoreDistribution charts | ✅ |
| `admin-settings/page.tsx` | Replaced useAdminSettingsStore with useAuthStore | ✅ |
| `admin-courses/` | **Deleted** (page + sidebar link) | ✅ |
| `admin-lessons/` | **Deleted** (page + sidebar link) | ✅ |
| `layout.tsx` | Removed store imports/theme logic | ✅ |
| `sidebar.tsx` | Removed courses/lessons nav, swapped store | ✅ |
| `topbar.tsx` | Removed courses/lessons titles, swapped store | ✅ |

---

## Verification Checklist

- [x] TypeScript compiles with zero errors (`npx tsc --noEmit`)
- [x] Next.js build succeeds (all 15 routes generated)
- [ ] Manual testing: login as admin, verify all pages load with real data
- [ ] Create a test via editor, verify it appears in learner test list
- [ ] Take test as student, verify attempt flow with API-created data
- [ ] Check dashboard/analytics show real numbers
