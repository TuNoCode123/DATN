-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('PUBLISHED', 'PENDING', 'HIDDEN', 'DELETED');

-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "blogPostId" TEXT,
ADD COLUMN     "reportCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "CommentStatus" NOT NULL DEFAULT 'PUBLISHED',
ALTER COLUMN "testId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "trustScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "comment_reports" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comment_reports_commentId_idx" ON "comment_reports"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "comment_reports_userId_commentId_key" ON "comment_reports"("userId", "commentId");

-- CreateIndex
CREATE INDEX "comments_blogPostId_parentId_createdAt_idx" ON "comments"("blogPostId", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "comments_status_idx" ON "comments"("status");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_blogPostId_fkey" FOREIGN KEY ("blogPostId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
