-- A client's status (Contracted, Project Based or Lost) and drawing standard, for the Monthly contracts table.

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROJECT_BASED', 'CONTRACTED', 'LOST');
CREATE TYPE "DrawingStandard" AS ENUM ('AVDL', 'MODIFIED_AVDL', 'PROPRIETARY');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "status" "ClientStatus" NOT NULL DEFAULT 'PROJECT_BASED',
ADD COLUMN "drawingStandard" "DrawingStandard";

-- Clients with fixed monthly hours start as Contracted; everyone else as Project Based.
UPDATE "Client" SET "status" = 'CONTRACTED' WHERE "type" = 'FIXED';
