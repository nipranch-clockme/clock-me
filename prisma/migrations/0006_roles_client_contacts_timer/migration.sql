-- The Project manager role is merged into Team leader (shown as "Team/Project Manager").
UPDATE "User" SET "role" = 'LEADER' WHERE "role" = 'PM';
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('MEMBER', 'LEADER', 'LOCATION', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "Role_old";

-- Clients: the team that looks after them, and their points of contact.
ALTER TABLE "Client" ADD COLUMN "teamId" TEXT;
ALTER TABLE "Client" ADD CONSTRAINT "Client_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Timer: one running timer per person.
CREATE TABLE "TimerRun" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "tagId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimerRun_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "TimerRun" ADD CONSTRAINT "TimerRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
