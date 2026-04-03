# Admin Dashboard Implementation Plan

## Context

The IELTS AI Learning Platform has completed Phase 1 (learner-facing test-taking experience). The admin section currently has only a stub page at `/admin-dashboard`. This plan builds a full client-side admin dashboard with mock data, ready to plug into the real API later. The admin uses **shadcn/ui** (separate from the learner's Ant Design), **Recharts** for charts, and **TanStack Table** for data tables.

---

## Key Design Decisions

1. **shadcn/ui coexists with Ant Design** — different route groups, no conflicts. Next.js code-splits by route automatically.
2. **Sidebar layout replaces current top-nav** — scoped to `(admin)/layout.tsx` only, learner layout untouched.
3. **One Zustand store per entity** with `persist` middleware for localStorage. Seed from mock data on first load.
4. **"Courses" is a client-side concept** — no Prisma model exists yet. Mock-only, future-proof for when backend adds it.
5. **All admin pages are `"use client"`** — no SSR needed for admin dashboard.
6. **React Query wraps Zustand** via `simulateApi()` helper (setTimeout 300-800ms) to simulate network latency and enable loading/error states.

---

## Tech Stack

| Category | Library | Purpose |
|----------|---------|---------|
| UI Components | shadcn/ui | Buttons, cards, modals, inputs, tables |
| Charts | Recharts | Line, bar, pie, histogram charts |
| Data Tables | TanStack Table | Sorting, filtering, pagination |
| State | Zustand (persist) | Mock data CRUD with localStorage |
| Data Fetching | React Query | Simulated API with loading/error states |
| Notifications | Sonner | Toast notifications |
| Icons | Lucide React | Sidebar & UI icons |
| Styling | TailwindCSS v4 | Utility-first CSS |

---

## Folder Structure

```
src/
├── app/(admin)/
│   ├── layout.tsx                    # Sidebar + Topbar shell
│   ├── admin-dashboard/page.tsx      # Stats, charts, activity feed
│   ├── admin-users/page.tsx          # User management table
│   ├── admin-courses/page.tsx        # Course CRUD
│   ├── admin-lessons/page.tsx        # Lesson management
│   ├── admin-questions/page.tsx      # Question bank
│   ├── admin-tests/page.tsx          # Test builder
│   ├── admin-results/page.tsx        # Test results viewer
│   ├── admin-analytics/page.tsx      # Analytics charts
│   └── admin-settings/page.tsx       # Profile, security, theme
├── components/
│   ├── ui/                           # shadcn/ui components (auto-generated)
│   └── admin/
│       ├── sidebar.tsx               # Collapsible sidebar navigation
│       ├── topbar.tsx                # Search, notifications, user menu
│       ├── data-table.tsx            # Generic TanStack Table wrapper
│       ├── stat-card.tsx             # Dashboard metric card
│       ├── confirm-dialog.tsx        # Delete/disable confirmation
│       ├── page-header.tsx           # Page title + actions
│       ├── empty-state.tsx           # Empty table placeholder
│       └── chart-card.tsx            # Recharts card wrapper
├── features/admin/
│   ├── types/index.ts                # TypeScript interfaces
│   ├── mock-data/
│   │   ├── users.ts                  # 25 mock users
│   │   ├── courses.ts                # 8-10 mock courses
│   │   ├── lessons.ts                # 15-20 mock lessons
│   │   ├── questions.ts              # 40-50 mock questions
│   │   ├── tests.ts                  # 12 mock tests
│   │   ├── results.ts               # 50 mock results
│   │   └── index.ts                  # Re-exports
│   ├── stores/
│   │   ├── use-admin-users-store.ts
│   │   ├── use-admin-courses-store.ts
│   │   ├── use-admin-lessons-store.ts
│   │   ├── use-admin-questions-store.ts
│   │   ├── use-admin-tests-store.ts
│   │   ├── use-admin-results-store.ts
│   │   ├── use-admin-settings-store.ts
│   │   └── index.ts
│   └── hooks/
│       ├── simulate-api.ts           # setTimeout wrapper
│       ├── use-admin-users.ts
│       ├── use-admin-courses.ts
│       ├── use-admin-lessons.ts
│       ├── use-admin-questions.ts
│       ├── use-admin-tests.ts
│       ├── use-admin-results.ts
│       ├── use-admin-analytics.ts
│       └── index.ts
└── lib/
    └── utils.ts                      # cn() utility (shadcn)
```

---

## Phase A: Foundation Setup ✅ COMPLETED

### A1. Install dependencies ✅
```bash
cd apps/web
npm install recharts @tanstack/react-table sonner lucide-react clsx tailwind-merge class-variance-authority
npx shadcn@latest init    # Style: New York, Base: Zinc, CSS vars: Yes
npx shadcn@latest add button card input label select dialog dropdown-menu \
  sheet separator avatar badge table tabs tooltip command popover calendar \
  checkbox switch textarea scroll-area skeleton
```

### A2. Type definitions — `src/features/admin/types/index.ts` ✅

| Type | Fields |
|------|--------|
| `AdminUser` | id, email, displayName, avatarUrl, role, isActive, createdAt, updatedAt |
| `AdminCourse` | id, title, level (BEGINNER/INTERMEDIATE/ADVANCED), description, isPublished, testIds, createdAt |
| `AdminLesson` | id, title, videoUrl, courseId, courseName, orderIndex, createdAt |
| `AdminQuestion` | id, questionNumber, stem, type (MCQ/FILL_IN_BLANK), skill, difficulty (EASY/MEDIUM/HARD), mcqOptions, correctAnswer, explanation, examType |
| `AdminTest` | id, title, examType, format, durationMins, isPublished, questionIds, questionCount, createdAt |
| `AdminResult` | id, userId, userName, userEmail, testId, testTitle, status, totalQuestions, correctCount, scorePercent, startedAt, submittedAt, timeTakenMins |
| `DashboardStats` | totalUsers, totalTests, totalAttempts, totalCourses, avgScore |
| `ActivityItem` | id, type, description, userName, timestamp |
| `ChartDataPoint` | label, value |

### A3. Mock data — `src/features/admin/mock-data/` ✅
- `users.ts` — 25 users with staggered dates over 12 months ✅
- `courses.ts` — 9 courses (IELTS/TOEIC levels) ✅
- `lessons.ts` — 18 lessons linked to courses ✅
- `questions.ts` — 50 questions (25 MCQ + 25 fill-in-blank, varied skills/difficulties) ✅
- `tests.ts` — 12 tests with question associations ✅
- `results.ts` — 50 results with varied scores/dates ✅
- `index.ts` — re-exports all ✅

### A4. Zustand stores — `src/features/admin/stores/` ✅
Each store uses Zustand `persist` middleware for localStorage. 7 stores + index created.

### A5. SimulateApi utility — `src/features/admin/hooks/simulate-api.ts` ✅
Random delay 300-800ms to simulate network latency.

### A6. React Query hooks — `src/features/admin/hooks/` ✅
8 hook files + index created. Also includes analytics hooks: useScoreDistribution, useAvgScoreTrend, useCompletionRate, useRecentActivity.

| Hook File | Exports |
|-----------|---------|
| `use-admin-users.ts` | useAdminUsers(filters), useUpdateUser(), useToggleUserStatus() |
| `use-admin-courses.ts` | useAdminCourses(filters), useCreateCourse(), useUpdateCourse(), useDeleteCourse() |
| `use-admin-lessons.ts` | useAdminLessons(courseId?), CRUD mutations, useReorderLessons() |
| `use-admin-questions.ts` | useAdminQuestions(filters), CRUD mutations |
| `use-admin-tests.ts` | useAdminTests(filters), CRUD mutations |
| `use-admin-results.ts` | useAdminResults(filters), useAdminResult(id) |
| `use-admin-analytics.ts` | useDashboardStats(), useUserGrowthChart(), useTestActivityChart(), usePopularCoursesChart() |

---

## Phase B: Layout Shell ✅ COMPLETED

### B1. Admin components — `src/components/admin/` ✅
All 8 components created:
- `sidebar.tsx` ✅ — Collapsible 240px→64px, mobile Sheet overlay, active route highlighting, user avatar
- `topbar.tsx` ✅ — Page title, notification bell with badge, user dropdown with logout
- `data-table.tsx` ✅ — Generic TanStack Table with sorting, search, pagination, skeleton loading
- `stat-card.tsx` ✅ — Metric card with title, value, icon, trend indicator
- `confirm-dialog.tsx` ✅ — Delete/disable confirmation with danger/warning variants
- `page-header.tsx` ✅ — Title + description + action buttons slot
- `empty-state.tsx` ✅ — Icon, message, optional action button
- `chart-card.tsx` ✅ — Recharts card wrapper with loading skeleton

### B2. Admin layout — `src/app/(admin)/layout.tsx` ✅
- Sidebar + Topbar shell with dark/light theme toggle via Zustand settings store
- Sonner toast provider
- Note: Auth guard not yet implemented (deferred to API integration)

---

## Phase C: Pages ✅ COMPLETED

### C1. Dashboard — `/admin-dashboard` ✅
- 4 stat cards with trend indicators (Total Users, Courses, Tests Taken, Avg Score)
- Line chart: User Growth (12 months) via Recharts
- Bar chart: Test Activity (monthly)
- Recent Activity feed with avatars and timestamps

### C2. Users — `/admin-users` ✅
- DataTable with Avatar+Name, Email, Role badge, Status badge, Joined Date, Actions
- Search by name, filter by role and status
- Edit modal (displayName, email, role)
- Toggle active/disabled with confirmation dialog

### C3. Courses — `/admin-courses` ✅
- DataTable with Title, Level badge, Test Count, Published switch, Created Date, Actions
- Create/Edit modal (title, level, description)
- Inline publish toggle switch
- Delete with confirm dialog

### C4. Lessons — `/admin-lessons` ✅
- Course filter dropdown
- DataTable with Order, Title, Video URL, Course Name, Reorder buttons, Actions
- Create/Edit modal (title, video URL, course select, order)
- Up/down reorder buttons

### C5. Question Bank — `/admin-questions` ✅
- DataTable with #, Stem, Type, Skill, Difficulty (color-coded), Exam Type, Actions
- Multi-filter: skill, difficulty, exam type, question type
- Create/Edit Sheet (slide-over): MCQ mode with A/B/C/D + correct answer selector, Fill-in-blank mode, skill/difficulty/exam selects, explanation

### C6. Tests — `/admin-tests` ✅
- DataTable with Title, Exam Type, Format, Duration, Question Count, Published, Created, Actions
- Multi-step create/edit: Step 1 (basic info) → Step 2 (select questions with checkboxes) → Step 3 (preview summary)
- Inline publish toggle, filter by exam type and format

### C7. Results — `/admin-results` ✅
- DataTable with Student, Test, Score (color-coded), Status, Time, Submitted Date, Actions
- Filters: test select, status select
- Detail Sheet: score summary cards + per-question breakdown with correct/incorrect indicators

### C8. Analytics — `/admin-analytics` ✅
- Date range preset buttons (7d, 30d, 90d, 1y)
- 4 charts: Popular Courses (horizontal bar), Avg Score Trend (line), Score Distribution (bar), Completion Rate (donut pie)

### C9. Settings — `/admin-settings` ✅
- Tabs: Profile | Security | Appearance
- Profile: displayName, email (readonly), avatar URL, save
- Security: current/new/confirm password with validation toasts
- Appearance: dark/light toggle with live preview

---

## Phase D: Polish (Partially Complete)

- [x] Loading skeletons on all pages (DataTable, StatCard, ChartCard all have skeleton states)
- [x] Empty states for tables with no data (EmptyState component integrated in DataTable)
- [ ] Error states with retry button
- [x] Responsive: sidebar → Sheet overlay on mobile (<768px)
- [x] Dark mode support via CSS variables (toggle in Settings)
- [x] Toast notifications on all CRUD operations (Sonner)
- [ ] CSV export button on tables (bonus)
- [ ] Auth guard in admin layout (check role === ADMIN, redirect to /login)

---

## Sidebar Navigation

| Icon | Label | Route |
|------|-------|-------|
| LayoutDashboard | Dashboard | /admin-dashboard |
| Users | Users | /admin-users |
| BookOpen | Courses | /admin-courses |
| FileText | Lessons | /admin-lessons |
| HelpCircle | Question Bank | /admin-questions |
| ClipboardList | Tests | /admin-tests |
| BarChart3 | Results | /admin-results |
| TrendingUp | Analytics | /admin-analytics |
| Settings | Settings | /admin-settings |

---

## Files Modified ✅

| File | Action | Status |
|------|--------|--------|
| `apps/web/package.json` | Added recharts, @tanstack/react-table, sonner, lucide-react, clsx, tailwind-merge, class-variance-authority | ✅ |
| `apps/web/src/app/globals.css` | Full rewrite with shadcn CSS variables (oklch), dark mode class, @theme inline | ✅ |
| `apps/web/src/app/(admin)/layout.tsx` | Replaced top-nav with sidebar+topbar shell + dark mode + Sonner | ✅ |
| `apps/web/src/app/(admin)/admin-dashboard/page.tsx` | Replaced stub with full dashboard (stats, charts, activity) | ✅ |
| `apps/web/src/lib/utils.ts` | Created cn() utility (clsx + tailwind-merge) | ✅ |
| `apps/web/components.json` | Created for shadcn/ui configuration | ✅ |

## New Files Created (~60 files) ✅

- `src/features/admin/types/index.ts` (1 file) ✅
- `src/features/admin/mock-data/` (7 files) ✅
- `src/features/admin/stores/` (8 files) ✅
- `src/features/admin/hooks/` (9 files) ✅
- `src/components/admin/` (8 files) ✅
- `src/components/ui/` (20 files, auto-generated by shadcn) ✅
- `src/app/(admin)/admin-*/page.tsx` (8 new page files + 1 updated) ✅

---

## Verification Plan

1. **After Phase A**: `npm run build` passes, no import errors ✅
2. **After Phase B**: Navigate to `/admin-dashboard` — sidebar renders, collapses, routes work, learner pages unaffected ✅
3. **After each page**: Page loads with mock data, CRUD operations work, data persists on refresh (localStorage), loading states show — needs manual testing
4. **Dark mode**: Toggle in settings, verify all pages render correctly in both themes — needs manual testing
5. **Responsive**: Resize to <768px, sidebar becomes Sheet overlay — needs manual testing
6. **Final**: Full `npm run build` passes, all 9 admin pages functional ✅ (build passes, all 17 routes generated)

---

## Potential Issues & Mitigations

| Issue | Mitigation |
|-------|-----------|
| shadcn CSS vars conflict with existing `--background`/`--foreground` | Merge carefully during init; shadcn values take precedence, preserve `@theme inline` block |
| Zustand persist + SSR hydration mismatch | All admin pages are `"use client"`; persist middleware delays hydration to client |
| Large bundle from dual UI libs (Ant Design + shadcn) | Next.js code-splits by route group — no cross-loading |
| TanStack Table + React 19 compatibility | TanStack Table is headless, no React DOM issues |
| Admin route security | Client-side auth guard in layout; real API must also enforce role checks |
