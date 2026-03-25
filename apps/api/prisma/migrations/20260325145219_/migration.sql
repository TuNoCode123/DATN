/*
  Warnings:

  - The values [MATCHING,FILL_IN_BLANK] on the enum `QuestionType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "QuestionType_new" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE_NOT_GIVEN', 'YES_NO_NOT_GIVEN', 'MATCHING_HEADINGS', 'MATCHING_INFORMATION', 'MATCHING_FEATURES', 'MATCHING_SENTENCE_ENDINGS', 'SENTENCE_COMPLETION', 'SUMMARY_COMPLETION', 'NOTE_COMPLETION', 'SHORT_ANSWER', 'LABELLING', 'READ_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_TO_QUESTIONS', 'PROPOSE_SOLUTION', 'EXPRESS_OPINION', 'WRITE_SENTENCES', 'RESPOND_WRITTEN_REQUEST', 'WRITE_OPINION_ESSAY');
ALTER TABLE "question_groups" ALTER COLUMN "questionType" TYPE "QuestionType_new" USING ("questionType"::text::"QuestionType_new");
ALTER TYPE "QuestionType" RENAME TO "QuestionType_old";
ALTER TYPE "QuestionType_new" RENAME TO "QuestionType";
DROP TYPE "QuestionType_old";
COMMIT;
