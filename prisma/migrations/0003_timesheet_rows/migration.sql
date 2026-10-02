-- CreateTable
CREATE TABLE "TimesheetRow" (
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetRow_pkey" PRIMARY KEY ("userId","weekStart","projectId")
);

-- AddForeignKey
ALTER TABLE "TimesheetRow" ADD CONSTRAINT "TimesheetRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetRow" ADD CONSTRAINT "TimesheetRow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

