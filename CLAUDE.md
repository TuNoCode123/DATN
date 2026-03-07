# IELTS AI Learning Platform

## Project Structure
- `apps/api` — NestJS backend (REST API, Prisma ORM, PostgreSQL)
- `apps/web` — Next.js 14 frontend (App Router, TailwindCSS, React Query, Zustand)
- `docs/plans` — Architecture and implementation plans

## Development
- Backend: `npm run dev:api` (port 4000)
- Frontend: `npm run dev:web` (port 3000)
- Database: `npm run db:migrate` then `npm run db:seed`

## Conventions
- Backend uses NestJS module pattern (module, controller, service per feature)
- Frontend uses Next.js App Router with route groups: `(auth)`, `(learner)`, `(admin)`
- Prisma schema at `apps/api/prisma/schema.prisma`
- API prefix: `/api`
- Auth: JWT + refresh tokens
