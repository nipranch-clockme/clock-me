-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "shareApprovedOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareToken" TEXT,
ADD COLUMN     "shareViewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Client_shareToken_key" ON "Client"("shareToken");
