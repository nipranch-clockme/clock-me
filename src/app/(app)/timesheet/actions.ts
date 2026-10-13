"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type Me } from "@/lib/auth";
import { getSettings, logAction } from "@/lib/settings";
import { DAY_MAX_MINUTES, cleanText, dayTotalError, entryDateError, isDayLocked, laterPhaseInUse, missingFields, parseStart, phaseInUseMessage, timeSubject } from "@/lib/entries";
import { readTagIds, tagNamesOf } from "@/lib/tags";
import { loggableProjectsWhere, trackableProjectsWhere, visibleProjectsWhere } from "@/lib/scope";
import { addDays, isDateStr, monday, shortDate, toDate, toStr, weekLabel } from "@/lib/dates";
import { DESCRIPTION_MAX, clock, fmtHours, hasOverlongMinutes, parseDuration } from "@/lib/format";

/** On someone's behalf, a project the signed-in manager can see (see loggableProjectsWhere). Anyone's own projects are always fine. */
async function canSeeProject(me: Me, projectId: string) {
  return !!(await db.project.count({ where: { id: projectId, ...visibleProjectsWhere(me) } }));
}

/** `fieldErrors` maps each field with a problem (projectId, Phase, Tags, Description, a custom field's name, date, start, duration) to its
 *  message, and `error` is a summary line naming those fields. When the save is refused outright, `error` alone gives the reason. */
export type EntryResult = { ok: boolean; error?: string; fields?: string[]; fieldErrors?: Record<string, string> } | null;

const FIELD_LABELS: Record<string, string> = { projectId: "Project", date: "Date", start: "Start", duration: "Duration" };
const MISSING: Record<string, string> = { Phase: "Choose a phase.", Tags: "Tick at least one tag.", Description: "Enter a description." };

/** Why a typed duration can't be used, or null when it can. */
function durationError(raw: string, minutes: number) {
  if (hasOverlongMinutes(raw)) return "Minutes must be under 60, like 1:45 or 1h 45m.";
  if (isNaN(minutes)) return "Enter a duration like 1.5 or 1:30.";
  if (minutes <= 0) return "Enter a duration of at least 1 minute.";
  if (minutes > DAY_MAX_MINUTES) return "One entry can be at most 24 hours.";
  return null;
}

const tagList = (ids: string[], names: Map<string, string>) => tagNamesOf(ids, names).join(" + ") || "none";
// Cleaned here too: a description saved before cleanText existed can hold direction overrides that would flip the rest of the log line.
const descStart = (raw: string) => { const s = cleanText(raw); return s ? `description "${s.length > 60 ? s.slice(0, 60).trimEnd() + "…" : s}"` : "no description"; };

/** Adds or changes a time entry for the signed-in person, or on someone's behalf when the form names them (location managers and admins).
 *  Every field is checked in one pass, so the form can show all its problems at once. */
export async function saveEntry(_: EntryResult, form: FormData): Promise<EntryResult> {
  const me = await requireUser();
  const who = await timeSubject(me, String(form.get("userId") ?? ""));
  if ("error" in who) return { ok: false, error: who.error };
  const person = who.person, onBehalf = person.id !== me.id;
  const settings = await getSettings();
  const id = String(form.get("id") ?? "");

  const old = id ? await db.timeEntry.findUnique({ where: { id }, include: { project: { select: { name: true } }, phase: { select: { name: true } } } }) : null;
  if (id) {
    if (!old) return { ok: false, error: "This entry was deleted. Reload the page to see the latest." };
    if (old.userId !== person.id) return { ok: false, error: onBehalf ? `That entry isn't ${person.name}'s.` : "You can only change your own entries." };
    if (onBehalf && !(await canSeeProject(me, old.projectId))) return { ok: false, error: `That entry isn't ${person.name}'s.` };
    const lockOld = await isDayLocked(person.id, toStr(old.date), settings, onBehalf);
    if (lockOld) return { ok: false, error: lockOld };
  }

  const errs: Record<string, string> = {};
  const projectId = String(form.get("projectId") ?? "");
  const date = String(form.get("date") ?? "");
  const dateOk = isDateStr(date);
  const dateErr = dateOk ? entryDateError(date) : "Choose a date.";
  if (dateErr) errs.date = dateErr;
  const startRaw = String(form.get("start") ?? "");
  const startMin = parseStart(startRaw);
  if (startMin == null) errs.start = startRaw.trim() ? "Enter a start time from 00:00 to 23:59, like 09:00." : "Enter a start time.";
  const durRaw = String(form.get("duration") ?? "");
  const minutes = parseDuration(durRaw);
  const durErr = durationError(durRaw, minutes);
  if (durErr) errs.duration = durErr;
  else if (startMin != null && startMin + minutes > DAY_MAX_MINUTES) errs.duration = "This entry would end after midnight. Make it end by 24:00 and add the rest on the next day.";

  const project = await db.project.findFirst({ where: { id: projectId, ...loggableProjectsWhere(me, person) }, include: { phases: true } });
  if (!project) errs.projectId = onBehalf ? `Choose a project ${person.name} can log time on.` : "Choose a project you can log time on.";
  const phaseId = String(form.get("phaseId") ?? "") || null;
  const phase = phaseId ? project?.phases.find((p) => p.id === phaseId) : null;
  if (project && phaseId && !phase) errs.Phase = "That phase doesn't belong to this project.";
  // A phase the project manager removed can stay on old entries, but can't be picked for new time.
  else if (phase && phase.sort >= 999 && old?.phaseId !== phase.id) errs.Phase = "That phase has been removed from the project. Choose another.";
  // Once a later phase of the project has time on it, new time can't go on an earlier one. Only a new entry or a changed phase is checked.
  else if (project && phase && (!old || old.phaseId !== phase.id)) {
    const later = await laterPhaseInUse(project.id, phase.id, old?.id);
    if (later) errs.Phase = phaseInUseMessage(later, phase.name);
  }
  const tagIds = await readTagIds(form);
  const description = cleanText(String(form.get("description") ?? ""));
  if (description.length > DESCRIPTION_MAX) errs.Description = `A description can be at most ${DESCRIPTION_MAX} characters. This one has ${description.length.toLocaleString("en-US")}.`;
  const fields = await db.customField.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] });
  const custom = Object.fromEntries(fields.map((f) => [f.id, String(form.get("cf_" + f.id) ?? "").trim()]));
  for (const k of await missingFields({ phaseId, tagIds, description, custom }, settings)) errs[k] ??= MISSING[k] ?? `Fill in ${k}.`;

  // The day's total is checked once the duration and date are good, so its message is the one that matters.
  if (!errs.duration && !errs.date) {
    const full = await dayTotalError(person.id, date, minutes, settings.timeFormat, id ? [id] : []);
    if (full) errs.duration = full;
  }
  // Moving time to a day that's locked is a problem with the date. (A locked day the entry is already on was refused above.)
  if (!errs.date) {
    const lock = await isDayLocked(person.id, date, settings, onBehalf);
    if (lock) errs.date = lock;
  }

  const order = ["projectId", "Phase", "date", "start", "duration", ...fields.map((f) => f.name), "Tags", "Description"];
  const keys = Object.keys(errs).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (keys.length) {
    const error = `Check ${keys.length === 1 ? "this field" : "these fields"}: ${keys.map((k) => FIELD_LABELS[k] ?? k).join(", ")}.`;
    return { ok: false, error, fields: keys, fieldErrors: Object.fromEntries(keys.map((k) => [k, errs[k]])) };
  }
  if (!project || startMin == null) return { ok: false, error: "Something went wrong. Reload the page and try again." };

  const data = { projectId, phaseId, tagIds, description, custom, date: toDate(date), startMin, minutes };
  if (old) {
    // Deleted in another tab since it was read above: say so rather than fail.
    if (!(await db.timeEntry.updateMany({ where: { id: old.id }, data })).count) return { ok: false, error: "This entry was deleted. Reload the page to see the latest." };
  } else await db.timeEntry.create({ data: { ...data, userId: person.id } });
  const behalf = onBehalf ? ` on behalf of ${person.name}` : "";
  if (!old) await logAction(me.id, `Added ${fmtHours(minutes, settings.timeFormat)} h on ${project.name} for ${shortDate(date)}${behalf}`, person.id);
  else {
    const names = await tagNames([...old.tagIds, ...tagIds]);
    const oldCustom = (old.custom ?? {}) as Record<string, string>;
    const h = (m: number) => `${fmtHours(m, settings.timeFormat)} h`;
    const changes = [
      toStr(old.date) !== date && `date ${shortDate(toStr(old.date))} to ${shortDate(date)}`,
      old.startMin !== startMin && `start ${clock(old.startMin)} to ${clock(startMin)}`,
      old.minutes !== minutes && `duration ${h(old.minutes)} to ${h(minutes)}`,
      old.projectId !== projectId && `project ${old.project.name} to ${project.name}`,
      old.phaseId !== phaseId && `phase ${old.phase?.name ?? "none"} to ${phase?.name ?? "none"}`,
      old.tagIds.join() !== tagIds.join() && `tags ${tagList(old.tagIds, names)} to ${tagList(tagIds, names)}`,
      old.description !== description && "description changed",
      ...fields.map((f) => String(oldCustom[f.id] ?? "") !== custom[f.id] && `${f.name} changed`),
    ].filter(Boolean);
    if (changes.length) await logAction(me.id, `Changed ${h(old.minutes)} on ${old.project.name} for ${shortDate(toStr(old.date))}${behalf}: ${changes.join(", ")}`, person.id);
  }
  revalidatePath("/timesheet");
  revalidatePath("/calendar");
  return { ok: true };
}

async function tagNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const tags = await db.tag.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(tags.map((t) => [t.id, t.name]));
}

export type DeleteResult = { ok: boolean; error?: string };
const ALREADY_DELETED = "This entry was already deleted. Reload the page to see the latest.";

/** Deletes a time entry. Refusals come back as a message (never thrown), so the form can show them. */
export async function deleteEntry(form: FormData): Promise<DeleteResult> {
  const me = await requireUser();
  const settings = await getSettings();
  const e = await db.timeEntry.findUnique({ where: { id: String(form.get("id") ?? "") }, include: { project: true, phase: true } });
  if (!e) return { ok: false, error: ALREADY_DELETED };
  // Someone else's entry can be deleted by a location manager or admin who may change that person's time.
  const who = e.userId === me.id ? { person: me } : await timeSubject(me, e.userId);
  if ("error" in who) return { ok: false, error: me.role === "ADMIN" || me.role === "LOCATION" ? who.error : "You can only delete your own entries." };
  const person = who.person, onBehalf = person.id !== me.id;
  if (onBehalf && !(await canSeeProject(me, e.projectId))) return { ok: false, error: `That entry isn't ${person.name}'s.` };
  const lock = await isDayLocked(person.id, toStr(e.date), settings, onBehalf);
  if (lock) return { ok: false, error: lock };
  // Of two deletes at once (a double click, two tabs), only the one that removes the row carries on.
  const gone = await db.timeEntry.deleteMany({ where: { id: e.id } });
  if (!gone.count) return { ok: false, error: ALREADY_DELETED };
  // Deleting the last entry on a project that week keeps its timesheet row, so the person can add time again straight away.
  const ws = monday(toStr(e.date));
  const left = await db.timeEntry.count({ where: { userId: person.id, projectId: e.projectId, date: { gte: toDate(ws), lte: toDate(addDays(ws, 6)) } } });
  if (!left && (await db.project.count({ where: { id: e.projectId, ...loggableProjectsWhere(me, person) } }))) {
    await db.timesheetRow.createMany({ data: [{ userId: person.id, weekStart: toDate(ws), projectId: e.projectId }], skipDuplicates: true });
  }
  const names = await tagNames(e.tagIds);
  await logAction(me.id, `Deleted ${fmtHours(e.minutes, settings.timeFormat)} h on ${e.project.name} from ${shortDate(toStr(e.date))}${onBehalf ? ` on behalf of ${person.name}` : ""}: phase ${e.phase?.name ?? "none"}, tags ${tagList(e.tagIds, names)}, ${descStart(e.description)}`, person.id);
  revalidatePath("/timesheet");
  revalidatePath("/calendar");
  return { ok: true };
}

export type RowResult = { ok: boolean; error?: string };

/** The week's own status lock (submitted or approved). Admin lock dates only stop changes to time, not rows. */
async function weekClosed(userId: string, ws: string, onBehalf = false) {
  const sheet = await db.timesheet.findUnique({ where: { userId_weekStart: { userId, weekStart: toDate(ws) } } });
  return sheet?.status === "SUBMITTED" ? (onBehalf ? "This week is waiting for approval. Send it back from Approvals to change it." : "This week is waiting for approval. Cancel the submission to change it.")
    : sheet?.status === "APPROVED" ? "This week is approved." : null;
}

export async function addRow(form: FormData): Promise<RowResult> {
  const me = await requireUser();
  const who = await timeSubject(me, String(form.get("userId") ?? ""));
  if ("error" in who) return { ok: false, error: who.error };
  const person = who.person;
  const week = String(form.get("week") ?? "");
  const projectId = String(form.get("projectId") ?? "");
  if (!isDateStr(week)) return { ok: false, error: "Something went wrong. Reload the page and try again." };
  const ws = monday(week);
  const closed = await weekClosed(person.id, ws, person.id !== me.id);
  if (closed) return { ok: false, error: closed };
  const project = await db.project.findFirst({ where: { id: projectId, ...loggableProjectsWhere(me, person) }, select: { id: true, name: true } });
  if (!project) return { ok: false, error: person.id === me.id ? "Choose a project you can log time on." : `Choose a project ${person.name} can log time on.` };
  await db.timesheetRow.createMany({ data: [{ userId: person.id, weekStart: toDate(ws), projectId }], skipDuplicates: true });
  if (person.id !== me.id) await logAction(me.id, `Added the ${project.name} row for ${weekLabel(ws)} on behalf of ${person.name}`, person.id);
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function removeRow(form: FormData): Promise<RowResult> {
  const me = await requireUser();
  const who = await timeSubject(me, String(form.get("userId") ?? ""));
  if ("error" in who) return { ok: false, error: who.error };
  const person = who.person;
  const week = String(form.get("week") ?? "");
  const projectId = String(form.get("projectId") ?? "");
  if (!isDateStr(week)) return { ok: false, error: "Something went wrong. Reload the page and try again." };
  const ws = monday(week);
  const closed = await weekClosed(person.id, ws, person.id !== me.id);
  if (closed) return { ok: false, error: closed };
  if (person.id !== me.id && !(await canSeeProject(me, projectId))) return { ok: false, error: `Choose a project ${person.name} can log time on.` };
  const hasTime = await db.timeEntry.count({ where: { userId: person.id, projectId, date: { gte: toDate(ws), lte: toDate(addDays(ws, 6)) } } });
  if (hasTime) return { ok: false, error: "This row has time on it. Delete its entries first." };
  const gone = await db.timesheetRow.deleteMany({ where: { userId: person.id, weekStart: toDate(ws), projectId } });
  if (gone.count && person.id !== me.id) {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true } });
    await logAction(me.id, `Removed the ${project?.name ?? "project"} row for ${weekLabel(ws)} on behalf of ${person.name}`, person.id);
  }
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function submitWeek(form: FormData) {
  const me = await requireUser();
  const settings = await getSettings();
  const ws = monday(String(form.get("week")));
  const back = String(form.get("back") ?? "/timesheet");
  // A week that's already waiting or approved stays as it is (e.g. a second tab clicking Submit again).
  const current = await db.timesheet.findUnique({ where: { userId_weekStart: { userId: me.id, weekStart: toDate(ws) } } });
  if (current && (current.status === "SUBMITTED" || current.status === "APPROVED")) redirect(back);
  const entries = await db.timeEntry.findMany({ where: { userId: me.id, date: { gte: toDate(ws), lte: toDate(addDays(ws, 6)) } } });
  if (!entries.length) redirect(back);
  for (const e of entries) if ((await missingFields(e, settings)).length) redirect(back + (back.includes("?") ? "&" : "?") + "missing=1");
  // Only the request that really changes the status writes the log line, so two overlapping submits log once.
  const where = { userId: me.id, weekStart: toDate(ws) };
  let changed = (await db.timesheet.updateMany({ where: { ...where, status: { in: ["DRAFT", "REJECTED"] } }, data: { status: "SUBMITTED", comment: "" } })).count > 0;
  if (!changed) changed = (await db.timesheet.createMany({ data: [{ ...where, status: "SUBMITTED" }], skipDuplicates: true })).count > 0;
  if (changed) await logAction(me.id, `Submitted timesheet for ${weekLabel(ws)}`, me.id);
  revalidatePath("/timesheet");
  redirect(back);
}

/** Takes back a submitted week that hasn't been approved yet, so it can be changed and submitted again. */
export async function cancelSubmission(form: FormData) {
  const me = await requireUser();
  const ws = monday(String(form.get("week")));
  const back = String(form.get("back") ?? "/timesheet");
  // A week whose days are all locked by an admin couldn't be changed anyway, so it stays with the approver.
  const settings = await getSettings();
  if (settings.lockBeforeStr && addDays(ws, 6) <= settings.lockBeforeStr) redirect(back);
  // Only a week still waiting for approval can be taken back. If it was approved or sent back in the meantime, it stays that way.
  const r = await db.timesheet.updateMany({ where: { userId: me.id, weekStart: toDate(ws), status: "SUBMITTED" }, data: { status: "DRAFT", comment: "" } });
  if (r.count) await logAction(me.id, `Cancelled the submission of their timesheet for ${weekLabel(ws)}`, me.id);
  revalidatePath("/timesheet");
  redirect(back + (back.includes("?") ? "&" : "?") + `cancelled=${r.count ? 1 : 0}`);
}

export async function copyLastWeek(form: FormData) {
  const me = await requireUser();
  const ws = monday(String(form.get("week")));
  const back = String(form.get("back") ?? "/timesheet");
  if (await weekClosed(me.id, ws)) redirect(back);
  const prev = addDays(ws, -7);
  const week = (from: string) => ({ gte: toDate(from), lte: toDate(addDays(from, 6)) });
  // Only last week's projects come across, as empty rows. The person adds this week's hours themselves.
  const [lastEntries, lastRows, thisEntries, thisRows, allowed] = await Promise.all([
    db.timeEntry.findMany({ where: { userId: me.id, date: week(prev) }, select: { projectId: true }, distinct: ["projectId"] }),
    db.timesheetRow.findMany({ where: { userId: me.id, weekStart: toDate(prev) }, select: { projectId: true } }),
    db.timeEntry.findMany({ where: { userId: me.id, date: week(ws) }, select: { projectId: true }, distinct: ["projectId"] }),
    db.timesheetRow.findMany({ where: { userId: me.id, weekStart: toDate(ws) }, select: { projectId: true } }),
    db.project.findMany({ where: trackableProjectsWhere(me), select: { id: true } }),
  ]);
  const canLog = new Set(allowed.map((p) => p.id));
  const shown = new Set([...thisEntries, ...thisRows].map((x) => x.projectId));
  const last = [...new Set([...lastEntries, ...lastRows].map((x) => x.projectId))];
  // Projects they can no longer log on (archived or access removed) are left out.
  const keep = last.filter((id) => canLog.has(id));
  if (keep.length) await db.timesheetRow.createMany({ data: keep.map((projectId) => ({ userId: me.id, weekStart: toDate(ws), projectId })), skipDuplicates: true });
  const copied = keep.filter((id) => !shown.has(id)).length;
  // Left out: last week's projects closed to new time that aren't on this week anyway (ones with time this week still show).
  const skipped = last.filter((id) => !canLog.has(id) && !shown.has(id)).length;
  revalidatePath("/timesheet");
  redirect(back + (back.includes("?") ? "&" : "?") + `copied=${copied}&last=${last.length}&skipped=${skipped}`);
}
