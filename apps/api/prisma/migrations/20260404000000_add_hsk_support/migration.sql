-- AlterEnum: Add HSK exam types
ALTER TYPE "ExamType" ADD VALUE 'HSK_1';
ALTER TYPE "ExamType" ADD VALUE 'HSK_2';
ALTER TYPE "ExamType" ADD VALUE 'HSK_3';
ALTER TYPE "ExamType" ADD VALUE 'HSK_4';
ALTER TYPE "ExamType" ADD VALUE 'HSK_5';
ALTER TYPE "ExamType" ADD VALUE 'HSK_6';

-- AlterEnum: Add HSK question types
ALTER TYPE "QuestionType" ADD VALUE 'SENTENCE_REORDER';
ALTER TYPE "QuestionType" ADD VALUE 'KEYWORD_COMPOSITION';
ALTER TYPE "QuestionType" ADD VALUE 'PICTURE_COMPOSITION';

-- AlterTable: Make correctAnswer optional (for AI-graded questions)
ALTER TABLE "questions" ALTER COLUMN "correctAnswer" DROP NOT NULL;

-- AlterTable: Add metadata column to questions
ALTER TABLE "questions" ADD COLUMN "metadata" JSONB;

-- CreateTable: WritingEvaluation
CREATE TABLE "writing_evaluations" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "hskLevel" INTEGER,
    "grammarScore" DOUBLE PRECISION NOT NULL,
    "vocabScore" DOUBLE PRECISION NOT NULL,
    "contentScore" DOUBLE PRECISION NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "feedback" TEXT NOT NULL,
    "vocabAnalysis" JSONB,
    "grammarErrors" JSONB,
    "modelUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "writing_evaluations_answerId_key" ON "writing_evaluations"("answerId");

-- AddForeignKey
ALTER TABLE "writing_evaluations" ADD CONSTRAINT "writing_evaluations_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "user_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: HskVocabulary
CREATE TABLE "hsk_vocabulary" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "simplified" TEXT NOT NULL,
    "traditional" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL,
    "meaningEn" TEXT NOT NULL,
    "meaningVi" TEXT,
    "partOfSpeech" TEXT,

    CONSTRAINT "hsk_vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hsk_vocabulary_level_idx" ON "hsk_vocabulary"("level");
CREATE INDEX "hsk_vocabulary_simplified_idx" ON "hsk_vocabulary"("simplified");
CREATE UNIQUE INDEX "hsk_vocabulary_level_simplified_key" ON "hsk_vocabulary"("level", "simplified");
