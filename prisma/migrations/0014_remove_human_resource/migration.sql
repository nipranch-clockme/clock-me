-- Human Resource is removed. Its accounts become Team members, which are resources, so an account with no expected hours gets the usual 40.
UPDATE "User" SET "weeklyTarget" = 40 WHERE "role" = 'HUMAN_RESOURCE' AND "weeklyTarget" = 0;
UPDATE "User" SET "role" = 'MEMBER' WHERE "role" = 'HUMAN_RESOURCE';
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('MEMBER', 'LEADER', 'LOCATION', 'GUEST', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "Role_old";
