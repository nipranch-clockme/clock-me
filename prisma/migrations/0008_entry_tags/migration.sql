-- An entry (and a running timer) can carry several tags, kept as a list of tag ids.
-- The single tag each entry had is copied into the list before the old column goes.

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "tagIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TimerRun" ADD COLUMN     "tagIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Copy the existing tags across (a timer never had a link to Tag, so only copy ones that still exist)
UPDATE "TimeEntry" SET "tagIds" = ARRAY["tagId"] WHERE "tagId" IS NOT NULL;
UPDATE "TimerRun" SET "tagIds" = ARRAY["tagId"] WHERE "tagId" IN (SELECT "id" FROM "Tag");

-- DropForeignKey
ALTER TABLE "TimeEntry" DROP CONSTRAINT "TimeEntry_tagId_fkey";

-- AlterTable
ALTER TABLE "TimeEntry" DROP COLUMN "tagId";
ALTER TABLE "TimerRun" DROP COLUMN "tagId";

-- CreateIndex
CREATE INDEX "TimeEntry_tagIds_idx" ON "TimeEntry" USING GIN ("tagIds");
