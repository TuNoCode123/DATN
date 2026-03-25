-- ──────────────────────────────────────────────────────────
-- Migration: Admin Redesign
-- 1. Create Passage table
-- 2. Rename columns (passageHtml → instructions, contentHtml → instructions, mcqOptions → options)
-- 3. Migrate existing data
-- ──────────────────────────────────────────────────────────
-- NOTE: Enum values were added in the previous migration (20260325099999)
-- PostgreSQL requires new enum values to be committed before use.

-- 1. Create Passage table
CREATE TABLE "passages" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT,
    "contentHtml" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "passages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passages_sectionId_orderIndex_key" ON "passages"("sectionId", "orderIndex");

ALTER TABLE "passages" ADD CONSTRAINT "passages_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "test_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Migrate passageHtml data → passages table
INSERT INTO "passages" ("id", "sectionId", "title", "contentHtml", "orderIndex")
SELECT
    gen_random_uuid()::text,
    ts."id",
    NULL,
    ts."passageHtml",
    0
FROM "test_sections" ts
WHERE ts."passageHtml" IS NOT NULL AND ts."passageHtml" != '';

-- 3. Add instructions column to test_sections (before dropping passageHtml)
ALTER TABLE "test_sections" ADD COLUMN "instructions" TEXT;

-- 4. Rename contentHtml → instructions on question_groups
ALTER TABLE "question_groups" RENAME COLUMN "contentHtml" TO "instructions";

-- 5. Rename mcqOptions → options on questions
ALTER TABLE "questions" RENAME COLUMN "mcqOptions" TO "options";

-- 6. Drop the old passageHtml column from test_sections
ALTER TABLE "test_sections" DROP COLUMN "passageHtml";

-- 7. Migrate old MATCHING type to MATCHING_FEATURES (most common usage)
UPDATE "question_groups" SET "questionType" = 'MATCHING_FEATURES' WHERE "questionType" = 'MATCHING';

-- 8. Migrate old FILL_IN_BLANK to NOTE_COMPLETION
UPDATE "question_groups" SET "questionType" = 'NOTE_COMPLETION' WHERE "questionType" = 'FILL_IN_BLANK';
