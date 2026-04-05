-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('SIGNUP_BONUS', 'DAILY_BONUS', 'PRONUNCIATION_SESSION', 'POLLY_TTS', 'AI_GRADING', 'ADMIN_TOPUP');

-- CreateTable
CREATE TABLE "user_credits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 100,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_credits_userId_key" ON "user_credits"("userId");

-- CreateIndex
CREATE INDEX "credit_transactions_creditId_createdAt_idx" ON "credit_transactions"("creditId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "user_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
