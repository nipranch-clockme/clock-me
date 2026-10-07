-- Public holidays per office, and time off (PTO) per person. Both take days out of expected hours.

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "fraction" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "fraction" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL DEFAULT 'PTO',
    "note" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TimeOff_dates_check" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "TimeOff_fraction_check" CHECK ("fraction" > 0 AND "fraction" <= 1)
);

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");
CREATE UNIQUE INDEX "Holiday_locationId_date_key" ON "Holiday"("locationId", "date");
CREATE INDEX "TimeOff_userId_startDate_endDate_idx" ON "TimeOff"("userId", "startDate", "endDate");
CREATE UNIQUE INDEX "TimeOff_source_externalId_key" ON "TimeOff"("source", "externalId");

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
