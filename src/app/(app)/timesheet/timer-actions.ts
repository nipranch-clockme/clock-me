"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings, logAction } from "@/lib/settings";
import { DAY_MAX_MINUTES, DESCRIPTION_MAX, cleanText, dayTotalError, isDayLocked, missingFields } from "@/lib/entries";
import { trackableProjectsWhere } from "@/lib/scope";
import { addDays, localDate, localMinutes, shortDate, toDate } from "@/lib/dates";
import { fmtHours } from "@/lib/format";
import { existingTagIds, readTagIds } from "@/lib/tags";

export type TimerResult = { ok: boolean; error?: string; fields?: string[]; message?: string } | null;

const read = async (form: FormData) => ({
  projectId: String(form.get("projectId") ?? ""),
  phaseId: String(form.get("phaseId") ?? "") || null,
  tagIds: await readTagIds(form),
  description: cleanText(String(form.get("description") ?? "")),
});

const tooLong = (d: string): TimerResult => ({ ok: false, error: `A description can be at most ${DESCRIPTION_MAX} characters. This one has ${d.length.toLocaleString("en-US")}.`, fields: ["Description"] });

// The first moment of a company-local date, found between two moments on either side of it. It is usually midnight, but a clock change
// can move it, so the minutes in between are halved until the first one on that date is found (a day always starts on a whole minute).
function dayStart(date: string, before: Date, after: Date) {
  let lo = Math.floor(before.getTime() / 60000), hi = Math.floor(after.getTime() / 60000);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDate(new Date(mid * 60000)) >= date) hi = mid; else lo = mid;
  }
  return new Date(hi * 60000);
}

// A timer's time as one entry per company-local day: the real time that passed, to the nearest minute, split where each new day starts.
// Each part is counted from the start and rounded, so the parts add up to the total. Under a minute gives nothing. On a day the clocks go
// back, a part can be longer than its wall-clock span, so its start moves earlier to keep it inside the day (and editable later).
function timerSegments(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  if (ms < 60000) return [];
  const total = Math.round(ms / 60000);
  const cuts = [start], last = localDate(end);
  for (let d = addDays(localDate(start), 1); d <= last; d = addDays(localDate(cuts[cuts.length - 1]), 1)) cuts.push(dayStart(d, cuts[cuts.length - 1], end));
  cuts.push(end);
  const at = (t: Date) => Math.min(total, Math.round((t.getTime() - start.getTime()) / 60000));
  return cuts.slice(0, -1).map((c, i) => {
    const minutes = at(cuts[i + 1]) - at(c);
    return { date: localDate(c), startMin: Math.max(0, Math.min(localMinutes(c), DAY_MAX_MINUTES - minutes)), minutes };
  }).filter((s) => s.minutes > 0);
}

/** Start the timer on a project. One timer per person: starting again while it runs does nothing. */
export async function startTimer(_: TimerResult, form: FormData): Promise<TimerResult> {
  const me = await requireUser();
  if (await db.timerRun.findUnique({ where: { userId: me.id } })) return { ok: true };
  const f = await read(form);
  if (f.description.length > DESCRIPTION_MAX) return tooLong(f.description);
  const project = await db.project.findFirst({ where: { id: f.projectId, ...trackableProjectsWhere(me) }, include: { phases: true } });
  if (!project) return { ok: false, error: "Choose a project you can log time on.", fields: ["projectId"] };
  if (f.phaseId && !project.phases.some((p) => p.id === f.phaseId)) return { ok: false, error: "That phase doesn't belong to this project.", fields: ["Phase"] };
  try {
    await db.timerRun.create({ data: { userId: me.id, ...f } });
  } catch (e) {
    // Another Start sent at the same moment got there first, so the timer is already running.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
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
  const f = form.has("projectId") ? await read(form) : { projectId: run.projectId, phaseId: run.phaseId, tagIds: await existingTagIds(run.tagIds), description: cleanText(run.description) };
  if (f.description.length > DESCRIPTION_MAX) return tooLong(f.description);
  const now = new Date();
  const ms = now.getTime() - run.startedAt.getTime();
  if (ms > 24 * 3600 * 1000) return { ok: false, error: "This timer has been running for more than 24 hours. Discard it and add the time on the Timesheet." };
  const project = await db.project.findFirst({ where: { id: f.projectId, ...trackableProjectsWhere(me) }, include: { phases: true } });
  if (!project) return { ok: false, error: "Choose a project you can log time on.", fields: ["projectId"] };
  if (f.phaseId && !project.phases.some((p) => p.id === f.phaseId)) return { ok: false, error: "That phase doesn't belong to this project.", fields: ["Phase"] };
  // Only this run is removed: a timer started again since then is left alone.
  const claim = { userId: me.id, startedAt: run.startedAt };
  const segs = timerSegments(run.startedAt, now);
  if (!segs.length) {
    await db.timerRun.deleteMany({ where: claim });
    revalidatePath("/timesheet");
    return { ok: true, message: "Stopped. Under a minute, so no time was added." };
  }
  const miss = await missingFields({ ...f, custom: {} }, settings);
  if (miss.length) return { ok: false, error: `Fill in: ${miss.join(", ")}.`, fields: miss };
  for (const s of segs) {
    const lock = await isDayLocked(me.id, s.date, settings);
    if (lock) return { ok: false, error: `${lock} Discard the timer, or ask an Admin to unlock the day.` };
    const full = await dayTotalError(me.id, s.date, s.minutes, settings.timeFormat);
    if (full) return { ok: false, error: `${full} Change that day's other entries on the Timesheet, or discard the timer.` };
  }

  // Claim the run and add its time together: of two Stops sent at the same moment, only the one that removes the run adds anything.
  const added = await db.$transaction(async (tx) => {
    const { count } = await tx.timerRun.deleteMany({ where: claim });
    if (count !== 1) return false;
    await tx.timeEntry.createMany({ data: segs.map((s) => ({ userId: me.id, projectId: f.projectId, phaseId: f.phaseId, tagIds: f.tagIds, description: f.description, custom: {}, date: toDate(s.date), startMin: s.startMin, minutes: s.minutes })) });
    return true;
  });
  revalidatePath("/timesheet");
  if (!added) return { ok: true };
  const total = fmtHours(segs.reduce((a, s) => a + s.minutes, 0), settings.timeFormat);
  await logAction(me.id, `Timer added ${total} h on ${project.name} for ${segs.map((s) => shortDate(s.date)).join(" and ")}`, me.id);
  return { ok: true, message: `Added ${total} h to ${project.name}.` };
}

export async function discardTimer(): Promise<TimerResult> {
  const me = await requireUser();
  await db.timerRun.deleteMany({ where: { userId: me.id } });
  revalidatePath("/timesheet");
  return { ok: true };
}
