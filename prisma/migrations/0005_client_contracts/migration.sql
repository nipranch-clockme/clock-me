-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('FIXED', 'FLOATING');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "monthlyHours" DOUBLE PRECISION,
ADD COLUMN     "type" "ClientType" NOT NULL DEFAULT 'FLOATING';

