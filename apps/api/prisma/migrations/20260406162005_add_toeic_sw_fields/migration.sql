-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CreditReason" ADD VALUE 'TOEIC_SW_ATTEMPT';
ALTER TYPE "CreditReason" ADD VALUE 'HSK_WRITING_ATTEMPT';

-- AlterTable
ALTER TABLE "user_answers" ADD COLUMN     "audioAnswerUrl" TEXT;
