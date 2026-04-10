-- AlterEnum
ALTER TYPE "CreditReason" ADD VALUE 'TRANSLATION_SESSION';

-- CreateTable
CREATE TABLE "translation_topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" "DifficultyLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "difficulty" "DifficultyLevel" NOT NULL,
    "sentencePairs" JSONB NOT NULL,
    "avgScore" DOUBLE PRECISION,
    "totalDone" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_results" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sentenceIndex" INTEGER NOT NULL,
    "vietnameseSentence" TEXT NOT NULL,
    "referenceEnglish" TEXT NOT NULL,
    "userTranslation" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "accuracyScore" DOUBLE PRECISION NOT NULL,
    "grammarScore" DOUBLE PRECISION NOT NULL,
    "vocabularyScore" DOUBLE PRECISION NOT NULL,
    "naturalnessScore" DOUBLE PRECISION NOT NULL,
    "suggestedTranslation" TEXT,
    "feedback" TEXT NOT NULL,
    "assessment" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "translation_topics_name_key" ON "translation_topics"("name");

-- CreateIndex
CREATE INDEX "translation_topics_isPublished_difficulty_idx" ON "translation_topics"("isPublished", "difficulty");

-- CreateIndex
CREATE INDEX "translation_sessions_userId_createdAt_idx" ON "translation_sessions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "translation_results_sessionId_sentenceIndex_key" ON "translation_results"("sessionId", "sentenceIndex");

-- AddForeignKey
ALTER TABLE "translation_sessions" ADD CONSTRAINT "translation_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translation_sessions" ADD CONSTRAINT "translation_sessions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "translation_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translation_results" ADD CONSTRAINT "translation_results_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "translation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
