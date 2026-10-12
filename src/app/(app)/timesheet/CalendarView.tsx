import Link from "next/link";
import { db } from "@/lib/db";
import type { Me } from "@/lib/auth";
import { addDays, monday, today, toDate, toStr, DAYS } from "@/lib/dates";
import { dayMarks } from "@/lib/timeoff";
import { dayMark } from "@/lib/dayMark";
import { clientColorFor, hidesClients } from "@/lib/scope";
import { HIDDEN_PROJECT, hiddenProjectIds } from "@/lib/entries";
import type { EntryOptions } from "@/components/entryTypes";
import type { AppSettings } from "@/lib/settings";
import CalendarWeek from "./CalendarWeek";
import PersonPicker from "./PersonPicker";
import DayOffList from "./DayOffList";

/** Timesheet view 2: the week as a calendar, for `subject` (you, or someone you can look at). It is read only for someone else
 *  unless you are a location manager or admin who may change their time. */
export default async function CalendarView({ me, subject, subjectName = subject.name, people, editable, opts, settings, offset }: { me: Me; subject: Me; subjectName?: string; people: { id: string; name: string }[]; editable: boolean; opts: EntryOptions; settings: AppSettings; offset: number }) {
  const ws = addDays(monday(today()), offset * 7);
  const dates = DAYS.map((_, i) => addDays(ws, i));
  const [rows, sheet, offs] = await Promise.all([
    db.timeEntry.findMany({ where: { userId: subject.id, date: { gte: toDate(ws), lte: toDate(dates[6]) } }, include: { project: { include: { client: true } }, phase: true } }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: subject.id, weekStart: toDate(ws) } } }),
    dayMarks(subject, dates), // public holidays of that person's office and their time off
  ]);
  const marks = offs.map(dayMark);
  const others = subject.id !== me.id;
  const hidden = await hiddenProjectIds(me, subject.id, rows.map((e) => e.projectId)); // another person's projects the signed-in manager can't see
  const statusLocked = sheet?.status === "SUBMITTED" || sheet?.status === "APPROVED";
  const waiting = others ? "This week is waiting for approval. Send it back from Approvals to change it." : "This week is waiting for approval. To change it, cancel the submission.";
  const locked = dates.map((d) => (settings.lockBeforeStr && d <= settings.lockBeforeStr ? "This date is locked by an admin." : statusLocked ? (sheet!.status === "SUBMITTED" ? waiting : "This week is approved.") : null));
  const clients = await db.client.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      {people.length > 1 && <div className="row" style={{ marginBottom: 10 }}><PersonPicker people={people} current={subject.id} meId={me.id} offset={offset} label={me.role === "ADMIN" || me.role === "LOCATION" ? "Whose time" : "Showing"} /></div>}
      {others && editable && <p className="alert info" role="status">You are adding and changing time for <strong>{subjectName}</strong>. They will see it on their own timesheet, and every change is written to the change log. They still submit their own week.</p>}
      <p className="note" style={{ margin: "0 0 10px" }}>{!others || editable ? "Click a time to add an hour, or drag down the day to add exactly the time spent. Click an entry to edit or delete it." : "Viewing someone else's calendar. Read only."}</p>
      <CalendarWeek
        opts={opts} dates={dates} today={today()} editable={editable} locked={locked} marks={marks}
        ownerId={others && editable ? subject.id : undefined}
        ownerName={subjectName}
        entries={rows.map((e) => ({ id: e.id, projectId: e.projectId, projectName: hidden.has(e.projectId) ? HIDDEN_PROJECT : e.project.name, color: clientColorFor(me, e.project.client.color), phaseId: e.phaseId, phaseName: hidden.has(e.projectId) ? "" : (e.phase?.name ?? ""), tagIds: e.tagIds, description: e.description, custom: (e.custom ?? {}) as Record<string, string>, date: toStr(e.date), startMin: e.startMin, minutes: e.minutes }))}
      />
      <DayOffList dates={dates} marks={marks} />
      {!hidesClients(me) && <div className="legend">{clients.map((c) => <span key={c.id}><i style={{ background: `var(--${c.color})` }} />{c.name}</span>)}</div>}
    </>
  );
}
