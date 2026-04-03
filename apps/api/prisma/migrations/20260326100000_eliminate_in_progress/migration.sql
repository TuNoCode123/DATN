-- Step 1: Add lastHeartbeatAt column
ALTER TABLE "user_attempts" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

-- Step 2: Close all stale IN_PROGRESS and ABANDONED attempts
UPDATE "user_attempts"
SET "status" = 'SUBMITTED', "submittedAt" = NOW()
WHERE "status" IN ('IN_PROGRESS', 'ABANDONED') AND "submittedAt" IS NULL;

-- Step 3: Remove ABANDONED from the AttemptStatus enum
-- First update any remaining ABANDONED rows (safety net)
UPDATE "user_attempts" SET "status" = 'SUBMITTED' WHERE "status" = 'ABANDONED';

-- Create new enum without ABANDONED
CREATE TYPE "AttemptStatus_new" AS ENUM ('IN_PROGRESS', 'SUBMITTED');
ALTER TABLE "user_attempts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "user_attempts" ALTER COLUMN "status" TYPE "AttemptStatus_new" USING ("status"::text::"AttemptStatus_new");
ALTER TYPE "AttemptStatus" RENAME TO "AttemptStatus_old";
ALTER TYPE "AttemptStatus_new" RENAME TO "AttemptStatus";
DROP TYPE "AttemptStatus_old";
ALTER TABLE "user_attempts" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';
