-- AlterTable
ALTER TABLE "test_sections" ADD COLUMN "layoutMode" TEXT NOT NULL DEFAULT 'vertical';

-- Backfill: sections already linked to a passage default to horizontal,
-- matching the previous auto-detect behavior. Everything else (audio-only
-- listening, plain question lists) keeps the 'vertical' default above.
UPDATE "test_sections"
SET "layoutMode" = 'horizontal'
WHERE id IN (SELECT DISTINCT "sectionId" FROM "passages");
