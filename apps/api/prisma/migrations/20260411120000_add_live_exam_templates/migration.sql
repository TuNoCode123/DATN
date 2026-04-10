-- Refactor the (unreleased) live exam feature into a template/session split
-- with typed questions (multiple-choice / short-answer / sentence-reorder).
--
-- All pre-existing live_exam_* tables from the prior 20260410161619_add_live_exam
-- migration are torn down and rebuilt from scratch. This migration is destructive:
-- any rows created against the old schema will be dropped. The feature had not
-- shipped to users when this refactor landed, so no data preservation is needed.

-- ─── Drop old tables (CASCADE removes dependent FKs / constraints) ──────
DROP TABLE IF EXISTS "live_exam_answers" CASCADE;
DROP TABLE IF EXISTS "live_exam_events" CASCADE;
DROP TABLE IF EXISTS "live_exam_participants" CASCADE;
DROP TABLE IF EXISTS "live_exam_questions" CASCADE;
DROP TABLE IF EXISTS "live_exams" CASCADE;

-- ─── Drop old enum ──────────────────────────────────────────────────────
DROP TYPE IF EXISTS "LiveExamStatus";

-- ─── Create new enums ───────────────────────────────────────────────────
CREATE TYPE "LiveExamTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "LiveExamSessionStatus" AS ENUM ('LOBBY', 'LIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "LiveExamQuestionType" AS ENUM ('MULTIPLE_CHOICE', 'SHORT_ANSWER', 'SENTENCE_REORDER');

-- ─── live_exam_templates ────────────────────────────────────────────────
CREATE TABLE "live_exam_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationSec" INTEGER NOT NULL,
    "perQuestionSec" INTEGER NOT NULL,
    "interstitialSec" INTEGER NOT NULL DEFAULT 5,
    "status" "LiveExamTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_exam_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "live_exam_templates_createdById_status_idx"
    ON "live_exam_templates"("createdById", "status");

ALTER TABLE "live_exam_templates"
    ADD CONSTRAINT "live_exam_templates_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── live_exam_template_questions ───────────────────────────────────────
CREATE TABLE "live_exam_template_questions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "type" "LiveExamQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "live_exam_template_questions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_exam_template_questions_templateId_orderIndex_key"
    ON "live_exam_template_questions"("templateId", "orderIndex");

ALTER TABLE "live_exam_template_questions"
    ADD CONSTRAINT "live_exam_template_questions_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "live_exam_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── live_exam_sessions ─────────────────────────────────────────────────
CREATE TABLE "live_exam_sessions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationSec" INTEGER NOT NULL,
    "perQuestionSec" INTEGER NOT NULL,
    "interstitialSec" INTEGER NOT NULL,
    "joinCode" TEXT,
    "inviteSlug" TEXT,
    "status" "LiveExamSessionStatus" NOT NULL DEFAULT 'LOBBY',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_exam_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_exam_sessions_joinCode_key"
    ON "live_exam_sessions"("joinCode");
CREATE UNIQUE INDEX "live_exam_sessions_inviteSlug_key"
    ON "live_exam_sessions"("inviteSlug");
CREATE INDEX "live_exam_sessions_status_idx"
    ON "live_exam_sessions"("status");
CREATE INDEX "live_exam_sessions_createdById_status_idx"
    ON "live_exam_sessions"("createdById", "status");
CREATE INDEX "live_exam_sessions_templateId_idx"
    ON "live_exam_sessions"("templateId");

ALTER TABLE "live_exam_sessions"
    ADD CONSTRAINT "live_exam_sessions_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "live_exam_templates"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "live_exam_sessions"
    ADD CONSTRAINT "live_exam_sessions_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── live_exam_session_questions (immutable snapshot of template q's) ──
CREATE TABLE "live_exam_session_questions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "type" "LiveExamQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "live_exam_session_questions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_exam_session_questions_sessionId_orderIndex_key"
    ON "live_exam_session_questions"("sessionId", "orderIndex");

ALTER TABLE "live_exam_session_questions"
    ADD CONSTRAINT "live_exam_session_questions_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "live_exam_sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── live_exam_participants ─────────────────────────────────────────────
CREATE TABLE "live_exam_participants" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalScore" INTEGER,
    "finalRank" INTEGER,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "live_exam_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_exam_participants_sessionId_userId_key"
    ON "live_exam_participants"("sessionId", "userId");
CREATE INDEX "live_exam_participants_sessionId_finalScore_idx"
    ON "live_exam_participants"("sessionId", "finalScore");

ALTER TABLE "live_exam_participants"
    ADD CONSTRAINT "live_exam_participants_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "live_exam_sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_exam_participants"
    ADD CONSTRAINT "live_exam_participants_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── live_exam_answers ──────────────────────────────────────────────────
CREATE TABLE "live_exam_answers" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerPayload" JSONB,
    "isCorrect" BOOLEAN NOT NULL,
    "answeredMs" INTEGER NOT NULL,
    "awardedPoints" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_exam_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_exam_answers_participantId_questionId_key"
    ON "live_exam_answers"("participantId", "questionId");
CREATE INDEX "live_exam_answers_questionId_idx"
    ON "live_exam_answers"("questionId");

ALTER TABLE "live_exam_answers"
    ADD CONSTRAINT "live_exam_answers_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "live_exam_participants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_exam_answers"
    ADD CONSTRAINT "live_exam_answers_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "live_exam_session_questions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── live_exam_events ───────────────────────────────────────────────────
CREATE TABLE "live_exam_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_exam_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "live_exam_events_sessionId_createdAt_idx"
    ON "live_exam_events"("sessionId", "createdAt");

ALTER TABLE "live_exam_events"
    ADD CONSTRAINT "live_exam_events_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "live_exam_sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
