-- RenameColumn
ALTER TABLE "users" RENAME COLUMN "cognitoSub" TO "firebaseUid";

-- RenameIndex
ALTER INDEX "users_cognitoSub_key" RENAME TO "users_firebaseUid_key";
