ALTER TYPE "JaStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED' BEFORE 'CONFIRMED';
ALTER TYPE "JaStatus" ADD VALUE IF NOT EXISTS 'REVISION_REQUIRED' BEFORE 'CONFIRMED';

ALTER TABLE "JaRecord"
  ADD COLUMN "reviewedById" UUID,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewComment" TEXT;

CREATE INDEX "JaRecord_status_submittedAt_idx" ON "JaRecord"("status", "submittedAt");
CREATE INDEX "JaRecord_reviewedById_idx" ON "JaRecord"("reviewedById");

ALTER TABLE "JaRecord"
  ADD CONSTRAINT "JaRecord_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
