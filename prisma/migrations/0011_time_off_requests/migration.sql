-- Time off requests: people ask for time off, a location manager or admin approves or declines it.
-- Rows that already exist (typed in, imported, or added on someone's behalf) are APPROVED, so they keep counting.

-- AlterTable
ALTER TABLE "TimeOff" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "decidedById" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3),
ADD COLUMN "decisionNote" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "TimeOff_status_idx" ON "TimeOff"("status");

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
