-- AlterTable
ALTER TABLE "passages" ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "audioUrl" TEXT,
ADD COLUMN "imageLayout" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "imageLayout" TEXT;
