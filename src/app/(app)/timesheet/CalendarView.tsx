import Link from "next/link";
import { db } from "@/lib/db";
import type { Me } from "@/lib/auth";
import { entryOptions } from "@/lib/entryOptions";
import { visibleUsersWhere } from "@/lib/scope";
import { addDays, monday, today, toDate, toStr, DAYS } from "@/lib/dates";
import { dayMarks } from "@/lib/timeoff";
import { dayMark } from "@/lib/dayMark";
import type { AppSettings } from "@/lib/settings";
import CalendarWeek from "./CalendarWeek";
import PersonPicker from "./PersonPicker";
import DayOffList from "./DayOffList";

/** Timesheet view 2: the week as a calendar. Anyone who can see other people's time can switch to them (read only). */
export default async function CalendarView({ me, settings, offset, u }: { me: Me; settings: AppSettings; offset: number; u?: string }) {
  const ws = addDays(monday(today()), offset * 7);
  const dates = DAYS.map((_, i) => addDays(ws, i));
  const people = await db.user.findMany({ where: { ...visibleUsersWhere(me), active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, locationId: true } });
  const who = people.some((p) => p.id === u) ? u! : me.id;
  const whoPerson = people.find((p) => p.id === who) ?? { id: me.id, locationId: me.locationId };
  const [rows, sheet, opts, offs] = await Promise.all([
    db.timeEntry.findMany({ where: { userId: who, date: { gte: toDate(ws), lte: toDate(dates[6]) } }, include: { project: { include: { client: true } }, phase: true } }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: who, weekStart: toDate(ws) } } }),
    entryOptions(me),
    dayMarks(whoPerson, dates), // public holidays of that person's office and their time off
  ]);
  const marks = offs.map(dayMark);
  const statusLocked = sheet?.status === "SUBMITTED" || sheet?.status === "APPROVED";
  const locked = dates.map((d) => (settings.lockBeforeStr && d <= settings.lockBeforeStr ? "This date is locked by an admin." : statusLocked ? (sheet!.status === "SUBMITTED" ? "This week is waiting for approval. To change it, cancel the submission." : "This week is approved.") : null));
  const clients = await db.client.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      {people.length > 1 && <div className="row" style={{ marginBottom: 10 }}><PersonPicker people={people} current={who} meId={me.id} offset={offset} /></div>}
      <p className="note" style={{ margin: "0 0 10px" }}>{who === me.id ? "Click a time to add an hour, or drag down the day to add exactly the time you spent. Click an entry to edit or delete it." : "Viewing someone else's calendar. Read only."}</p>
      <CalendarWeek
        opts={opts} dates={dates} today={today()} editable={who === me.id} locked={locked} marks={marks}
        ownerName={people.find((p) => p.id === who)?.name ?? ""}
        entries={rows.map((e) => ({ id: e.id, projectId: e.projectId, projectName: e.project.name, color: e.project.client.color, phaseId: e.phaseId, phaseName: e.phase?.name ?? "", tagIds: e.tagIds, description: e.description, custom: (e.custom ?? {}) as Record<string, string>, date: toStr(e.date), startMin: e.startMin, minutes: e.minutes }))}
      />
      <DayOffList dates={dates} marks={marks} />
      <div className="legend">{clients.map((c) => <span key={c.id}><i style={{ background: `var(--${c.color})` }} />{c.name}</span>)}</div>
    </>
  );
}
