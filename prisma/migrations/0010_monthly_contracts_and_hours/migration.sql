-- Contracted hours per client per month, a client's kinds of work, and expected hours per person per month.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "workTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ClientMonth" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ClientMonth_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClientMonth_hours_check" CHECK ("hours" >= 0)
);

-- CreateTable
CREATE TABLE "UserMonth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "weeklyHours" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "UserMonth_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserMonth_weeklyHours_check" CHECK ("weeklyHours" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientMonth_clientId_month_key" ON "ClientMonth"("clientId", "month");
CREATE UNIQUE INDEX "UserMonth_userId_month_key" ON "UserMonth"("userId", "month");

-- AddForeignKey
ALTER TABLE "ClientMonth" ADD CONSTRAINT "ClientMonth_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMonth" ADD CONSTRAINT "UserMonth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
