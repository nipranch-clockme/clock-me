"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings, logAction } from "@/lib/settings";
import { isDayLocked, missingFields } from "@/lib/entries";
import { trackableProjectsWhere } from "@/lib/scope";
import { addDays, isDateStr, monday, shortDate, toDate, toStr, weekLabel } from "@/lib/dates";
import { fmtHours, parseDuration } from "@/lib/format";

export type EntryResult = { ok: boolean; error?: string; fields?: string[] } | null;

export async function saveEntry(_: EntryResult, form: FormData): Promise<EntryResult> {
  const me = await requireUser();
  const settings = await getSettings();
  const id = String(form.get("id") ?? "");
  const projectId = String(form.get("projectId") ?? "");
  const date = String(form.get("date") ?? "");
  const start = String(form.get("start") ?? "09:00");
  const minutes = parseDuration(String(form.get("duration") ?? ""));
  if (!isDateStr(date)) return { ok: false, error: "Choose a date." };
  if (!(minutes > 0) || minutes > 24 * 60) return { ok: false, error: "Enter a duration like 1.5 or 1:30.", fields: ["duration"] };
  const [hh, mm] = start.split(":").map(Number);
  const startMin = (hh || 0) * 60 + (mm || 0);

  const project = await db.project.findFirst({ where: { id: projectId, ...trackableProjectsWhere(me) }, include: { phases: true } });
  if (!project) return { ok: false, error: "Choose a project you can log time on.", fields: ["projectId"] };
  const phaseId = String(form.get("phaseId") ?? "") || null;
  const phase = phaseId ? project.phases.find((p) => p.id === phaseId) : null;
  if (phaseId && !phase) return { ok: false, error: "That phase doesn't belong to this project.", fields: ["phaseId"] };
  const tagId = String(form.get("tagId") ?? "") || null;
  const description = String(form.get("description") ?? "").trim();
  const fields = await db.customField.findMany();
  const custom = Object.fromEntries(fields.map((f) => [f.id, String(form.get("cf_" + f.id) ?? "").trim()]));

  const miss = await missingFields({ phaseId, tagId, description, custom }, settings);
  if (miss.length) return { ok: false, error: `Fill in: ${miss.join(", ")}.`, fields: miss };

  const old = id ? await db.timeEntry.findUnique({ where: { id } }) : null;
  // A phase the project manager removed can stay on old entries, but can't be picked for new time.
  if (phase && phase.sort >= 999 && old?.phaseId !== phase.id) return { ok: false, error: "That phase has been removed from the project. Choose another.", fields: ["Phase"] };
  if (id) {
    if (!old || old.userId !== me.id) return { ok: false, error: "You can only change your own entries." };
    const lockOld = await isDayLocked(me.id, toStr(old.date), settings);
    if (lockOld) return { ok: false, error: lockOld };
  }
  const lock = await isDayLocked(me.id, date, settings);
  if (lock) return { ok: false, error: lock };

  const data = { projectId, phaseId, tagId, description, custom, date: toDate(date), startMin, minutes };
  if (id) await db.timeEntry.update({ where: { id }, data });
  else await db.timeEntry.create({ data: { ...data, userId: me.id } });
  await logAction(me.id, `${id ? "Changed" : "Added"} ${fmtHours(minutes, settings.timeFormat)} h on ${project.name} for ${shortDate(date)}`, me.id);
  revalidatePath("/timesheet");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteEntry(form: FormData) {
  const me = await requireUser();
  const settings = await getSettings();
  const e = await db.timeEntry.findUnique({ where: { id: String(form.get("id")) }, include: { project: true } });
  if (!e || e.userId !== me.id) throw new Error("You can only delete your own entries.");
  const lock = await isDayLocked(me.id, toStr(e.date), settings);
  if (lock) throw new Error(lock);
  await db.timeEntry.delete({ where: { id: e.id } });
  // Deleting the last entry on a project that week keeps its timesheet row, so the person can add time again straight away.
  const ws = monday(toStr(e.date));
  const left = await db.timeEntry.count({ where: { userId: me.id, projectId: e.projectId, date: { gte: toDate(ws), lte: toDate(addDays(ws, 6)) } } });
  if (!left && (await db.project.count({ where: { id: e.projectId, ...trackableProjectsWhere(me) } }))) {
    await db.timesheetRow.createMany({ data: [{ userId: me.id, weekStart: toDate(ws), projectId: e.projectId }], skipDuplicates: true });
  }
  await logAction(me.id, `Deleted ${fmtHours(e.minutes, settings.timeFormat)} h on ${e.project.name} from ${shortDate(toStr(e.date))}`, me.id);
  revalidatePath("/timesheet");
  revalidatePath("/calendar");
}

export type RowResult = { ok: boolean; error?: string };

/** The week's own status lock (submitted or approved). Admin lock dates only stop changes to time, not rows. */
async function weekClosed(userId: string, ws: string) {
  const sheet = await db.timesheet.findUnique({ where: { userId_weekStart: { userId, weekStart: toDate(ws) } } });
  return sheet?.status === "SUBMITTED" || sheet?.status === "APPROVED" ? `This week is ${sheet.status.toLowerCase()}.` : null;
}

export async function addRow(form: FormData): Promise<RowResult> {
  const me = await requireUser();
  const week = String(form.get("week") ?? "");
  const projectId = String(form.get("projectId") ?? "");
  if (!isDateStr(week)) return { ok: false, error: "Something went wrong. Reload the page and try again." };
  const ws = monday(week);
  const closed = await weekClosed(me.id, ws);
  if (closed) return { ok: false, error: closed };
  const project = await db.project.findFirst({ where: { id: projectId, ...trackableProjectsWhere(me) }, select: { id: true } });
  if (!project) return { ok: false, error: "Choose a project you can log time on." };
  await db.timesheetRow.createMany({ data: [{ userId: me.id, weekStart: toDate(ws), projectId }], skipDuplicates: true });
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function removeRow(form: FormData): Promise<RowResult> {
  const me = await requireUser();
  const week = String(form.get("week") ?? "");
  const projectId = String(form.get("projectId") ?? "");
  if (!isDateStr(week)) return { ok: false, error: "Something went wrong. Reload the page and try again." };
  const ws = monday(week);
  const closed = await weekClosed(me.id, ws);
  if (closed) return { ok: false, error: closed };
  const hasTime = await db.timeEntry.count({ where: { userId: me.id, projectId, date: { gte: toDate(ws), lte: toDate(addDays(ws, 6)) } } });
  if (hasTime) return { ok: false, error: "This row has time on it. Delete its entries first." };
  await db.timesheetRow.deleteMany({ where: { userId: me.id, weekStart: toDate(ws), projectId } });
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
  await db.timesheet.upsert({
    where: { userId_weekStart: { userId: me.id, weekStart: toDate(ws) } },
    update: { status: "SUBMITTED", comment: "" },
    create: { userId: me.id, weekStart: toDate(ws), status: "SUBMITTED" },
  });
  await logAction(me.id, `Submitted timesheet for ${weekLabel(ws)}`, me.id);
  revalidatePath("/timesheet");
  redirect(back);
}

export async function copyLastWeek(form: FormData) {
  const me = await requireUser();
  const settings = await getSettings();
  const ws = monday(String(form.get("week")));
  const back = String(form.get("back") ?? "/timesheet");
  if (await weekClosed(me.id, ws)) redirect(back);
  const prev = addDays(ws, -7);
  const [src, srcRows, existing, allowed] = await Promise.all([
    db.timeEntry.findMany({ where: { userId: me.id, date: { gte: toDate(prev), lt: toDate(ws) } }, include: { phase: true } }),
    db.timesheetRow.findMany({ where: { userId: me.id, weekStart: toDate(prev) } }),
    db.timeEntry.findMany({ where: { userId: me.id, date: { gte: toDate(ws), lte: toDate(addDays(ws, 6)) } } }),
    db.project.findMany({ where: trackableProjectsWhere(me), select: { id: true } }),
  ]);
  const canLog = new Set(allowed.map((p) => p.id));
  let n = 0, skipped = 0;
  for (const e of src) {
    const nd = addDays(toStr(e.date), 7);
    if (await isDayLocked(me.id, nd, settings)) continue;
    if (existing.some((x) => toStr(x.date) === nd && x.projectId === e.projectId && x.phaseId === e.phaseId)) continue;
    // Skip time on projects they can no longer log on (archived or access removed) and phases that were removed.
    if (!canLog.has(e.projectId) || (e.phase && e.phase.sort >= 999)) { skipped++; continue; }
    await db.timeEntry.create({ data: { userId: me.id, projectId: e.projectId, phaseId: e.phaseId, tagId: e.tagId, description: e.description, custom: e.custom ?? {}, date: toDate(nd), startMin: e.startMin, minutes: e.minutes } });
    n++;
  }
  if (n) await logAction(me.id, `Copied ${n} entries from the week of ${shortDate(prev)}`, me.id);
  // Project rows added last week come along too, as long as the person can still log time on them.
  const rows = srcRows.filter((r) => canLog.has(r.projectId)).map((r) => ({ userId: me.id, weekStart: toDate(ws), projectId: r.projectId }));
  const newRows = rows.length ? (await db.timesheetRow.createMany({ data: rows, skipDuplicates: true })).count : 0;
  revalidatePath("/timesheet");
  redirect(back + (back.includes("?") ? "&" : "?") + `copied=${n}&rows=${newRows}&skipped=${skipped}`);
}
