-- CreateTable
CREATE TABLE "pronunciation_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "difficulty" "DifficultyLevel" NOT NULL,
    "sentences" TEXT[],
    "avgScore" DOUBLE PRECISION,
    "totalDone" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pronunciation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pronunciation_results" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sentenceIndex" INTEGER NOT NULL,
    "targetSentence" TEXT NOT NULL,
    "spokenText" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "pronunciationScore" DOUBLE PRECISION NOT NULL,
    "accuracyScore" DOUBLE PRECISION NOT NULL,
    "fluencyScore" DOUBLE PRECISION NOT NULL,
    "completenessScore" DOUBLE PRECISION NOT NULL,
    "feedback" TEXT NOT NULL,
    "assessment" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pronunciation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pronunciation_sessions_userId_createdAt_idx" ON "pronunciation_sessions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pronunciation_results_sessionId_sentenceIndex_key" ON "pronunciation_results"("sessionId", "sentenceIndex");

-- AddForeignKey
ALTER TABLE "pronunciation_sessions" ADD CONSTRAINT "pronunciation_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pronunciation_sessions" ADD CONSTRAINT "pronunciation_sessions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "pronunciation_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pronunciation_results" ADD CONSTRAINT "pronunciation_results_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "pronunciation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
