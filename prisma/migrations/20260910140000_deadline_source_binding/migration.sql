-- AlterTable
ALTER TABLE "Deadline" ADD COLUMN "sourceEventId" TEXT;
ALTER TABLE "Deadline" ADD COLUMN "sourceRawDate" TEXT;
ALTER TABLE "Deadline" ADD COLUMN "sourceReference" TEXT;
ALTER TABLE "Deadline" ADD COLUMN "inferenceVersion" TEXT NOT NULL DEFAULT 'limitation-inference/1.0.0';
ALTER TABLE "Deadline" ADD COLUMN "clockKind" TEXT NOT NULL DEFAULT 'legal_limitation';
