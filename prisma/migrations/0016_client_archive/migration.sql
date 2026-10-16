-- Archive a client: archived clients leave the client lists and project pickers. Additive: no existing data changes.
-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "archivedAt" TIMESTAMP(3);
