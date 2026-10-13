import { db } from "./db";
import { addDays, monday, shortDate, toDate, today } from "./dates";
import { fmtHours, type TimeFormat } from "./format";
import type { AppSettings } from "./settings";
import type { Me } from "./auth";
import { timeEditError, visibleProjectsWhere, visibleUsersWhere } from "./scope";

/** A day is locked when an admin has locked it, or the person's week is submitted or approved. */
export async function isDayLocked(userId: string, date: string, settings: AppSettings, onBehalf = false) {
  if (settings.lockBeforeStr && date <= settings.lockBeforeStr) return "This date is locked by an Admin.";
  const ts = await db.timesheet.findUnique({ where: { userId_weekStart: { userId, weekStart: toDate(monday(date)) } } });
  if (ts?.status === "SUBMITTED") return onBehalf ? "That week is waiting for approval. Send it back from Approvals to change it." : "That week is waiting for approval. Cancel the submission on the Timesheet to change it.";
  if (ts?.status === "APPROVED") return "That week is already approved.";
  return null;
}

/** The longest description a time entry or a running timer may have. Browser code imports it from format.ts, since this file reads the database. */
export { DESCRIPTION_MAX } from "./format";

// Direction overrides and isolates (they make text read backwards) and zero-width spaces, word joiners and byte-order marks (they make a
// blank description look filled in). Zero-width joiners stay: emoji and several Indian scripts need them.
const STRIP = /[\u200B\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]/g;
const INVISIBLE = /[\s\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]/g;
/** Free text as it's saved: without the characters above, trimmed. */
export const cleanText = (s: string) => s.replace(STRIP, "").trim();
/** True when the text has nothing visible in it. */
export const isBlankText = (s: string) => !s.replace(INVISIBLE, "");

/** A start time typed as HH:MM, from 00:00 to 23:59, in minutes after midnight; null when it isn't one. */
export function parseStart(v: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Why time can't be added on this date, or null when it can: from 2000 up to the end of the company's current week. */
export function entryDateError(date: string): string | null {
  const last = addDays(monday(today()), 6);
  if (date > last) return `Time can be added up to the end of this week (${shortDate(last)}).`;
  if (date < "2000-01-01") return "Choose a date from 2000 onwards.";
  return null;
}

/** The most time one person can log on one day. */
export const DAY_MAX_MINUTES = 1440;

/** Why adding `minutes` on `date` would give this person more than 24 hours that day, or null when it fits. `excludeIds` are entries being
 *  replaced (the one being edited), so they don't count twice. */
export async function dayTotalError(userId: string, date: string, minutes: number, timeFormat: TimeFormat, excludeIds: string[] = []) {
  const agg = await db.timeEntry.aggregate({ where: { userId, date: toDate(date), ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}) }, _sum: { minutes: true } });
  const logged = agg._sum.minutes ?? 0;
  if (logged + minutes <= DAY_MAX_MINUTES) return null;
  return `A day can't hold more than 24 hours. ${shortDate(date)} already has ${fmtHours(logged, timeFormat)} h, so at most ${fmtHours(Math.max(0, DAY_MAX_MINUTES - logged), timeFormat)} h more fits.`;
}

export type EntryLike = { phaseId: string | null; tagIds: string[]; description: string; custom: unknown };

export async function missingFields(e: EntryLike, settings: AppSettings) {
  const out: string[] = [];
  if (!e.phaseId) out.push("Phase");
  if (settings.requireTag && !e.tagIds.length) out.push("Tags");
  if (settings.requireDescription && isBlankText(e.description)) out.push("Description");
  const fields = await db.customField.findMany({ where: { required: true } });
  const vals = (e.custom ?? {}) as Record<string, string>;
  for (const f of fields) if (!String(vals[f.id] ?? "").trim()) out.push(f.name);
  return out;
}

/** The later phase of this project that someone already has time on, when `phaseId` is an earlier one, with the person who logged it most
 *  recently. Null when nothing later is in use. A removed phase (sort 999) is never a later one, and is never the one being checked.
 *  `exceptId` is the entry being changed, so moving the only entry off a later phase isn't refused by its own row. */
export async function laterPhaseInUse(projectId: string, phaseId: string, exceptId?: string): Promise<{ phase: string; user: string } | null> {
  const mine = await db.phase.findUnique({ where: { id: phaseId }, select: { sort: true } });
  if (!mine || mine.sort >= 999) return null;
  const latest = await db.timeEntry.findFirst({
    where: { projectId, phase: { sort: { gt: mine.sort, lt: 999 } }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { phase: { select: { name: true } }, user: { select: { name: true } } },
  });
  if (!latest?.phase) return null;
  return { phase: latest.phase.name, user: latest.user.name };
}

/** Why new time can't go on `phase`, given the later phase already in use (from laterPhaseInUse). */
export const phaseInUseMessage = (later: { phase: string; user: string }, phase: string) =>
  `"${later.phase}" is already being used by ${later.user}, so "${phase}" can't take new time on this project.`;

/** Thrown when a save is refused for this reason, so the message can reach the person (other errors stay generic). */
export class PhaseInUseError extends Error {}

const ONLY_MANAGERS = "Only Location managers and Admins can add or change someone else's time.";

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
