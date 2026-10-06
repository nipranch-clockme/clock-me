import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Company-wide starting data: settings, tags and phase templates. Safe to run more than once. */
export async function ensureDefaults(db: Db) {
  await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  for (const name of ["CAD", "ENG", "Revit"]) {
    await db.tag.upsert({ where: { name }, update: {}, create: { name } });
  }
  const templates: [string, string[]][] = [
    ["Submissions", ["Submission 1", "Submission 2", "Submission 3", "Submission 4", "Submission 5"]],
    ["Ongoing internal work", ["Ongoing"]],
  ];
  for (const [name, phases] of templates) await db.phaseTemplate.upsert({ where: { name }, update: {}, create: { name, phases } });
}
