import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Company-wide starting data: settings, tags, phase templates and an optional Ticket ID field. Safe to run more than once. */
export async function ensureDefaults(db: Db) {
  await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  for (const name of ["Admin", "Content", "Courses", "Design", "Development", "Meetings", "Mentoring", "QA", "Research"]) {
    await db.tag.upsert({ where: { name }, update: {}, create: { name } });
  }
  const templates: [string, string[]][] = [
    ["Product build", ["Discovery", "Design", "Build", "Launch", "Support"]],
    ["Brand project", ["Research", "Concept", "Refinement", "Delivery"]],
    ["Website", ["Discovery", "Wireframes", "Visual design", "Development", "Launch"]],
    ["Ongoing internal work", ["Ongoing"]],
  ];
  for (const [name, phases] of templates) await db.phaseTemplate.upsert({ where: { name }, update: {}, create: { name, phases } });
  await db.customField.upsert({ where: { name: "Ticket ID" }, update: {}, create: { name: "Ticket ID", type: "text", options: [], required: false } });
}
