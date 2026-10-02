-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "targetUserId" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inviteExpires" TIMESTAMP(3),
ADD COLUMN     "resetSentAt" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthAttempt_key_at_idx" ON "AuthAttempt"("key", "at");

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_idx" ON "AuditLog"("targetUserId");

