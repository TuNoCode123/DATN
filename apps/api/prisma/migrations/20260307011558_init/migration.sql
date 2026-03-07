-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('IELTS_ACADEMIC', 'IELTS_GENERAL', 'TOEIC_LR', 'TOEIC_SW', 'HSK_1', 'HSK_2', 'HSK_3', 'HSK_4', 'HSK_5', 'HSK_6', 'TOPIK_I', 'TOPIK_II', 'JLPT_N1', 'JLPT_N2', 'JLPT_N3', 'JLPT_N4', 'JLPT_N5', 'DIGITAL_SAT', 'ACT', 'THPTQG');

-- CreateEnum
CREATE TYPE "TestFormat" AS ENUM ('FULL', 'CONDENSED');

-- CreateEnum
CREATE TYPE "SectionSkill" AS ENUM ('LISTENING', 'READING', 'WRITING', 'SPEAKING');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'NOTE_FORM_COMPLETION', 'TABLE_COMPLETION', 'SUMMARY_COMPLETION', 'MATCHING');

-- CreateEnum
CREATE TYPE "AttemptMode" AS ENUM ('PRACTICE', 'FULL_TEST');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'ABANDONED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL,
    "format" "TestFormat" NOT NULL,
    "durationMins" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "sectionCount" INTEGER NOT NULL DEFAULT 0,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_tags" (
    "testId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "test_tags_pkey" PRIMARY KEY ("testId","tagId")
);

-- CreateTable
CREATE TABLE "test_sections" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "skill" "SectionSkill" NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "audioUrl" TEXT,
    "durationMins" INTEGER,
    "questionCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "test_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_groups" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "contentHtml" TEXT,
    "matchingOptions" JSONB,

    CONSTRAINT "question_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "stem" TEXT,
    "mcqOptions" JSONB,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "mode" "AttemptMode" NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "timeLimitMins" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "totalQuestions" INTEGER,
    "correctCount" INTEGER,
    "scorePercent" DOUBLE PRECISION,

    CONSTRAINT "user_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_sections" (
    "attemptId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "attempt_sections_pkey" PRIMARY KEY ("attemptId","sectionId")
);

-- CreateTable
CREATE TABLE "user_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT,
    "isCorrect" BOOLEAN,

    CONSTRAINT "user_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_likes" (
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,

    CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("userId","commentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "tests_examType_format_isPublished_idx" ON "tests"("examType", "format", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "test_sections_testId_orderIndex_key" ON "test_sections"("testId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "question_groups_sectionId_orderIndex_key" ON "question_groups"("sectionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "questions_groupId_orderIndex_key" ON "questions"("groupId", "orderIndex");

-- CreateIndex
CREATE INDEX "user_attempts_userId_testId_idx" ON "user_attempts"("userId", "testId");

-- CreateIndex
CREATE INDEX "user_attempts_userId_status_idx" ON "user_attempts"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_answers_attemptId_questionId_key" ON "user_answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "comments_testId_parentId_createdAt_idx" ON "comments"("testId", "parentId", "createdAt");

-- AddForeignKey
ALTER TABLE "test_tags" ADD CONSTRAINT "test_tags_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_tags" ADD CONSTRAINT "test_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sections" ADD CONSTRAINT "test_sections_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "test_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "question_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_attempts" ADD CONSTRAINT "user_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_attempts" ADD CONSTRAINT "user_attempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_sections" ADD CONSTRAINT "attempt_sections_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "user_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_sections" ADD CONSTRAINT "attempt_sections_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "test_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_answers" ADD CONSTRAINT "user_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "user_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_answers" ADD CONSTRAINT "user_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
