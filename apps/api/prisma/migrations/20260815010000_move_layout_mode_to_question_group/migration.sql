-- AlterTable: layoutMode moves from TestSection to QuestionGroup (per-group control)
ALTER TABLE "question_groups" ADD COLUMN "layoutMode" TEXT NOT NULL DEFAULT 'vertical';

-- Backfill from the parent section's current layoutMode (set by the
-- previous migration) so existing side-by-side sections keep their look.
UPDATE "question_groups" qg
SET "layoutMode" = ts."layoutMode"
FROM "test_sections" ts
WHERE ts.id = qg."sectionId";

-- AlterTable
ALTER TABLE "test_sections" DROP COLUMN "layoutMode";
