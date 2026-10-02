import { db } from "./db";
import { monday, toDate } from "./dates";
import type { AppSettings } from "./settings";

/** A day is locked when an admin has locked it, or the person's week is submitted or approved. */
export async function isDayLocked(userId: string, date: string, settings: AppSettings) {
  if (settings.lockBeforeStr && date <= settings.lockBeforeStr) return "This date is locked by an admin.";
  const ts = await db.timesheet.findUnique({ where: { userId_weekStart: { userId, weekStart: toDate(monday(date)) } } });
  if (ts?.status === "SUBMITTED") return "That week is waiting for approval. Cancel the submission on the Timesheet to change it.";
  if (ts?.status === "APPROVED") return "That week is already approved.";
  return null;
}

export type EntryLike = { phaseId: string | null; tagId: string | null; description: string; custom: unknown };

export async function missingFields(e: EntryLike, settings: AppSettings) {
  const out: string[] = [];
  if (!e.phaseId) out.push("Phase");
  if (settings.requireTag && !e.tagId) out.push("Tag");
  if (settings.requireDescription && !e.description.trim()) out.push("Description");
  const fields = await db.customField.findMany({ where: { required: true } });
  const vals = (e.custom ?? {}) as Record<string, string>;
  for (const f of fields) if (!String(vals[f.id] ?? "").trim()) out.push(f.name);
  return out;
}
