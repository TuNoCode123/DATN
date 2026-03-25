-- System Restructure: IELTS + TOEIC Only
-- This migration simplifies enums, removes unused columns, and adds exam-aware scoring fields.

-- ============================================================
-- 1. Drop columns that reference enums we're about to remove
-- ============================================================

-- Remove 'format' column from tests (was TestFormat enum)
ALTER TABLE "tests" DROP COLUMN IF EXISTS "format";

-- Remove 'layoutType' column from test_sections (was LayoutType enum)
ALTER TABLE "test_sections" DROP COLUMN IF EXISTS "layoutType";

-- Remove 'imageUrls' column from test_sections
ALTER TABLE "test_sections" DROP COLUMN IF EXISTS "imageUrls";

-- Drop the old index that referenced format
DROP INDEX IF EXISTS "tests_examType_format_isPublished_idx";

-- Create new index without format
CREATE INDEX "tests_examType_isPublished_idx" ON "tests"("examType", "isPublished");

-- ============================================================
-- 2. Drop unused enums
-- ============================================================

DROP TYPE IF EXISTS "TestFormat";
DROP TYPE IF EXISTS "LayoutType";

-- ============================================================
-- 3. Simplify ExamType enum (remove unused values)
-- ============================================================

-- Create new enum with only 4 values
CREATE TYPE "ExamType_new" AS ENUM ('IELTS_ACADEMIC', 'IELTS_GENERAL', 'TOEIC_LR', 'TOEIC_SW');

-- Migrate existing data (delete tests with removed exam types first)
DELETE FROM "tests" WHERE "examType" NOT IN ('IELTS_ACADEMIC', 'IELTS_GENERAL', 'TOEIC_LR', 'TOEIC_SW');

-- Alter column to use new enum
ALTER TABLE "tests" ALTER COLUMN "examType" TYPE "ExamType_new" USING "examType"::text::"ExamType_new";

-- Drop old and rename new
DROP TYPE "ExamType";
ALTER TYPE "ExamType_new" RENAME TO "ExamType";

-- ============================================================
-- 4. Update QuestionType enum
-- ============================================================

-- Create new QuestionType enum
CREATE TYPE "QuestionType_new" AS ENUM (
  'MULTIPLE_CHOICE',
  'TRUE_FALSE_NOT_GIVEN',
  'YES_NO_NOT_GIVEN',
  'MATCHING',
  'FILL_IN_BLANK',
  'SENTENCE_COMPLETION',
  'SHORT_ANSWER'
);

-- Migrate existing data: map old types to new types
UPDATE "question_groups" SET "questionType" = 'FILL_IN_BLANK'
WHERE "questionType" IN ('NOTE_FORM_COMPLETION', 'TABLE_COMPLETION', 'SUMMARY_COMPLETION');

-- Alter column to use new enum
ALTER TABLE "question_groups" ALTER COLUMN "questionType" TYPE "QuestionType_new"
USING "questionType"::text::"QuestionType_new";

-- Drop old and rename new
DROP TYPE "QuestionType";
ALTER TYPE "QuestionType_new" RENAME TO "QuestionType";

-- ============================================================
-- 5. Add new columns to QuestionGroup
-- ============================================================

ALTER TABLE "question_groups" ADD COLUMN IF NOT EXISTS "audioUrl" TEXT;
ALTER TABLE "question_groups" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- ============================================================
-- 6. Add exam-aware scoring fields to UserAttempt
-- ============================================================

ALTER TABLE "user_attempts" ADD COLUMN IF NOT EXISTS "bandScore" DOUBLE PRECISION;
ALTER TABLE "user_attempts" ADD COLUMN IF NOT EXISTS "scaledScore" INTEGER;
ALTER TABLE "user_attempts" ADD COLUMN IF NOT EXISTS "sectionScores" JSONB;
