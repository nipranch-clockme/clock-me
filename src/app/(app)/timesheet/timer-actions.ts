"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings, logAction } from "@/lib/settings";
import { isDayLocked, missingFields } from "@/lib/entries";
import { trackableProjectsWhere } from "@/lib/scope";
import { addDays, localDate, localMinutes, shortDate, toDate } from "@/lib/dates";
import { fmtHours } from "@/lib/format";

export type TimerResult = { ok: boolean; error?: string; fields?: string[]; message?: string } | null;

const read = (form: FormData) => ({
  projectId: String(form.get("projectId") ?? ""),
  phaseId: String(form.get("phaseId") ?? "") || null,
  tagId: String(form.get("tagId") ?? "") || null,
  description: String(form.get("description") ?? "").trim(),
});

/** Start the timer on a project. One timer per person: starting again while it runs does nothing. */
export async function startTimer(_: TimerResult, form: FormData): Promise<TimerResult> {
  const me = await requireUser();
  if (await db.timerRun.findUnique({ where: { userId: me.id } })) return { ok: true };
  const f = read(form);
  const project = await db.project.findFirst({ where: { id: f.projectId, ...trackableProjectsWhere(me) }, include: { phases: true } });
  if (!project) return { ok: false, error: "Choose a project you can log time on.", fields: ["projectId"] };
  if (f.phaseId && !project.phases.some((p) => p.id === f.phaseId)) return { ok: false, error: "That phase doesn't belong to this project.", fields: ["Phase"] };
  await db.timerRun.create({ data: { userId: me.id, ...f } });
  revalidatePath("/timesheet");
  return { ok: true };
}

/** Stop the timer and add the time. A timer that crosses midnight becomes one entry per day. Under a minute adds nothing. */
export async function stopTimer(_: TimerResult, form: FormData): Promise<TimerResult> {
  const me = await requireUser();
  const settings = await getSettings();
  const run = await db.timerRun.findUnique({ where: { userId: me.id } });
  if (!run) return { ok: true };
  // The fields on screen win over what was saved at Start, so they can be filled in while it runs.
  const f = form.has("projectId") ? read(form) : { projectId: run.projectId, phaseId: run.phaseId, tagId: run.tagId, description: run.description };
  const now = new Date();
  const ms = now.getTime() - run.startedAt.getTime();
  if (ms > 24 * 3600 * 1000) return { ok: false, error: "This timer has been running for more than 24 hours. Discard it and add the time on the Timesheet." };
  const project = await db.project.findFirst({ where: { id: f.projectId, ...trackableProjectsWhere(me) }, include: { phases: true } });
  if (!project) return { ok: false, error: "Choose a project you can log time on.", fields: ["projectId"] };
  if (f.phaseId && !project.phases.some((p) => p.id === f.phaseId)) return { ok: false, error: "That phase doesn't belong to this project.", fields: ["Phase"] };
  const total = Math.round(ms / 60000);
  if (total < 1) {
    await db.timerRun.delete({ where: { userId: me.id } });
    revalidatePath("/timesheet");
    return { ok: true, message: "Stopped. Under a minute, so no time was added." };
  }
  const miss = await missingFields({ ...f, description: f.description, custom: {} }, settings);
  if (miss.length) return { ok: false, error: `Fill in: ${miss.join(", ")}.`, fields: miss };

  const d0 = localDate(run.startedAt), d1 = localDate(now);
  const m0 = localMinutes(run.startedAt), m1 = localMinutes(now);
  const segs: { date: string; startMin: number; minutes: number }[] = d0 === d1
    ? [{ date: d0, startMin: m0, minutes: Math.max(1, m1 - m0) }]
    : [{ date: d0, startMin: m0, minutes: 1440 - m0 }, { date: d1, startMin: 0, minutes: m1 }].filter((s) => s.minutes > 0);
  for (const s of segs) {
    const lock = await isDayLocked(me.id, s.date, settings);
    if (lock) return { ok: false, error: `${lock} Discard the timer, or ask an admin to unlock the day.` };
  }
  await db.timeEntry.createMany({ data: segs.map((s) => ({ userId: me.id, projectId: f.projectId, phaseId: f.phaseId, tagId: f.tagId, description: f.description, custom: {}, date: toDate(s.date), startMin: s.startMin, minutes: s.minutes })) });
  await db.timerRun.delete({ where: { userId: me.id } });
  await logAction(me.id, `Timer added ${fmtHours(segs.reduce((a, s) => a + s.minutes, 0), settings.timeFormat)} h on ${project.name} for ${segs.map((s) => shortDate(s.date)).join(" and ")}`, me.id);
  revalidatePath("/timesheet");
  return { ok: true, message: `Added ${fmtHours(segs.reduce((a, s) => a + s.minutes, 0), settings.timeFormat)} h to ${project.name}.` };
}

export async function discardTimer(): Promise<TimerResult> {
  const me = await requireUser();
  await db.timerRun.deleteMany({ where: { userId: me.id } });
  revalidatePath("/timesheet");
  return { ok: true };
}
