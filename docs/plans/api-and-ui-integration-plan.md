# Plan: Complete API + Seed + Connect UI to API

## Current State
- **Backend**: All modules scaffolded (auth, users, tests, attempts, tags, comments) with full service logic
- **Frontend**: All pages exist but use **hardcoded mock data** (tests list, test detail, attempt, result)
- **Database**: Schema complete, seed exists but hasn't been run against real DB
- **Missing**: DB migration not run, UI not connected to API

## What Needs to Be Done

### Step 1: Run Database Migration & Seed
```bash
cd apps/api && npx prisma migrate dev --name init
cd apps/api && npx prisma db seed
```

### Step 2: Verify API starts and endpoints work
```bash
cd apps/api && npm run start:dev
# Test: GET /api/tests, GET /api/tags, POST /api/auth/register, POST /api/auth/login
```

### Step 3: Connect Frontend to API (replace mock data)

#### 3a. Tests Library Page (`apps/web/src/app/(learner)/tests/page.tsx`)
- Remove `MOCK_TESTS` array
- Use `react-query` + `api.get('/tests', { params })` to fetch real tests
- Map API response shape `{ data, total, page, limit }` to existing UI
- Tags come as `test.tags[].tag.name` from API

#### 3b. Test Detail Page (`apps/web/src/app/(learner)/tests/[id]/page.tsx`)
- Remove `MOCK_TESTS` and `getDefaultTest`
- Use `react-query` + `api.get('/tests/${id}')` to fetch test with sections
- Wire section checkboxes to real section IDs
- On "Start" → call `POST /api/attempts` then navigate to attempt page with attemptId

#### 3c. Attempt/Test-Taking Page (`apps/web/src/app/(learner)/tests/[id]/attempt/page.tsx`)
- Remove `MOCK_SECTIONS`
- Fetch attempt data from `GET /api/attempts/${attemptId}` (includes sections, groups, questions, existing answers)
- Auto-save answers via `POST /api/attempts/${attemptId}/answers/bulk`
- Submit via `POST /api/attempts/${attemptId}/submit`
- Navigate to result page on submit

#### 3d. Result Page (`apps/web/src/app/(learner)/tests/[id]/result/page.tsx`)
- Remove all mock data (`CORRECT_ANSWERS_MAP`, `DEMO_ANSWERS`, etc.)
- Fetch from `GET /api/attempts/${attemptId}/result` which returns questions with `correctAnswer`, `explanation`, and user answers with `isCorrect`
- Compute stats from API response

#### 3e. Auth Pages (`login/page.tsx`, `register/page.tsx`)
- Implement login form → `POST /api/auth/login` → store tokens + set user in Zustand
- Implement register form → `POST /api/auth/register` → same flow
- Add `GET /api/users/me` call on app init to restore session from stored token

### Step 4: Add auth-aware navigation
- Learner layout header: show user name, logout button when authenticated
- Redirect to login when accessing protected routes (attempts) without auth

## File Changes Summary

| File | Action |
|------|--------|
| `apps/web/src/app/(learner)/tests/page.tsx` | Replace mock with API fetch |
| `apps/web/src/app/(learner)/tests/[id]/page.tsx` | Replace mock with API fetch |
| `apps/web/src/app/(learner)/tests/[id]/attempt/page.tsx` | Replace mock, wire to attempt API |
| `apps/web/src/app/(learner)/tests/[id]/result/page.tsx` | Replace mock, wire to result API |
| `apps/web/src/app/(auth)/login/page.tsx` | Implement login form |
| `apps/web/src/app/(auth)/register/page.tsx` | Implement register form |
| `apps/web/src/app/(learner)/layout.tsx` | Add auth-aware nav |
| `apps/web/src/lib/auth-store.ts` | Minor: add init method |

## Order of Execution
1. Run migration + seed (need running PostgreSQL)
2. Start API, verify endpoints with curl
3. Implement auth pages (login/register) - needed first since attempts require auth
4. Connect tests list page
5. Connect test detail page
6. Connect attempt page
7. Connect result page
8. Add auth-aware layout
