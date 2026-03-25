-- AlterTable
ALTER TABLE "question_groups" ADD COLUMN     "passageId" TEXT;

-- AddForeignKey
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
