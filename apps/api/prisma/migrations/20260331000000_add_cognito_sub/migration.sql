-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cognitoSub" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_cognitoSub_key" ON "users"("cognitoSub");
