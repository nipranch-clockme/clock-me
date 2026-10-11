import { db } from "./db";
import { monday, toDate } from "./dates";
import type { AppSettings } from "./settings";
import type { Me } from "./auth";
import { timeEditError, visibleProjectsWhere, visibleUsersWhere } from "./scope";

/** A day is locked when an admin has locked it, or the person's week is submitted or approved. */
export async function isDayLocked(userId: string, date: string, settings: AppSettings, onBehalf = false) {
  if (settings.lockBeforeStr && date <= settings.lockBeforeStr) return "This date is locked by an admin.";
  const ts = await db.timesheet.findUnique({ where: { userId_weekStart: { userId, weekStart: toDate(monday(date)) } } });
  if (ts?.status === "SUBMITTED") return onBehalf ? "That week is waiting for approval. Send it back from Approvals to change it." : "That week is waiting for approval. Cancel the submission on the Timesheet to change it.";
  if (ts?.status === "APPROVED") return "That week is already approved.";
  return null;
}

export type EntryLike = { phaseId: string | null; tagIds: string[]; description: string; custom: unknown };

export async function missingFields(e: EntryLike, settings: AppSettings) {
  const out: string[] = [];
  if (!e.phaseId) out.push("Phase");
  if (settings.requireTag && !e.tagIds.length) out.push("Tags");
  if (settings.requireDescription && !e.description.trim()) out.push("Description");
  const fields = await db.customField.findMany({ where: { required: true } });
  const vals = (e.custom ?? {}) as Record<string, string>;
  for (const f of fields) if (!String(vals[f.id] ?? "").trim()) out.push(f.name);
  return out;
}

const ONLY_MANAGERS = "Only location managers and admins can add or change someone else's time.";

/**
 * Whose time a request is about: the signed-in person, or (location managers and admins only) someone they may change,
 * who must be active. Anyone else naming another person gets the same plain refusal, whoever that person is.
 */
export async function timeSubject(me: Me, userId: string | null | undefined): Promise<{ person: Me } | { error: string }> {
  if (!userId || userId === me.id) return { person: me };
  if (me.role !== "ADMIN" && me.role !== "LOCATION") return { error: ONLY_MANAGERS };
  const person = await db.user.findFirst({ where: { AND: [{ id: userId }, visibleUsersWhere(me)] }, include: { team: true, location: true } });
  if (!person) return { error: "Choose a person from the list." };
  const denied = timeEditError(me, person);
  if (denied) return { error: denied };
  if (!person.active) return { error: `${person.name} is not active.` };
  return { person };
}

/** The label shown in place of a project's name, client and phase when the signed-in person may not see that project. */
export const HIDDEN_PROJECT = "A project you can't see";

/** Of these projects, the ids the signed-in person may not see. Only someone else's time is looked at: their own time, and everything for an
 *  admin, is always shown in full. Used so a manager reads another person's week without learning the names of projects they can't see. */
export async function hiddenProjectIds(me: Me, ownerId: string, projectIds: string[]): Promise<Set<string>> {
  if (me.id === ownerId || me.role === "ADMIN" || !projectIds.length) return new Set();
  const seen = await db.project.findMany({ where: { id: { in: [...new Set(projectIds)] }, ...visibleProjectsWhere(me) }, select: { id: true } });
  const ok = new Set(seen.map((p) => p.id));
  return new Set(projectIds.filter((id) => !ok.has(id)));
}
