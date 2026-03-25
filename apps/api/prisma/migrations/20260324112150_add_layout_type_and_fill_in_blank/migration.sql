-- CreateEnum
CREATE TYPE "LayoutType" AS ENUM ('PASSAGE_QUESTIONS', 'QUESTIONS_ONLY', 'AUDIO_QUESTIONS', 'AUDIO_VISUAL');

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'FILL_IN_BLANK';

-- AlterTable
ALTER TABLE "test_sections" ADD COLUMN     "imageUrls" JSONB,
ADD COLUMN     "layoutType" "LayoutType" NOT NULL DEFAULT 'QUESTIONS_ONLY',
ADD COLUMN     "passageHtml" TEXT;
