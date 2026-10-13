import { db } from "@/lib/db";
import { requireUser, type Me } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { entryOptions } from "@/lib/entryOptions";
import { HIDDEN_PROJECT, hiddenProjectIds, isDayLocked, missingFields } from "@/lib/entries";
import { canEditTimeFor, clientColorFor, hidesClients, visibleUsersWhere } from "@/lib/scope";
import { addDays, monday, today, toDate, toStr, weekLabel, DAYS } from "@/lib/dates";
import { fmtHours } from "@/lib/format";
import { tagText } from "@/lib/tags";
import { dayMarks, loadExpected } from "@/lib/timeoff";
import { dayMark } from "@/lib/dayMark";
import { PageHead, Pill, statusTone } from "@/components/ui";
import { sheetStatusLabel } from "@/lib/sheetStatus";
import CalendarView from "./CalendarView";
import TimerView from "./TimerView";
import PersonPicker from "./PersonPicker";
import WeekFocus from "./WeekFocus";
import DayOffList from "./DayOffList";
import { ICONS } from "@/components/icons";
import TimesheetGrid, { type SheetEntry, type SheetRow } from "./TimesheetGrid";
import { cancelSubmission, copyLastWeek, submitWeek } from "./actions";
import Link from "next/link";

/** How far back the Timesheet and Calendar go: 520 weeks, about ten years. Neither goes past this week. */
const MAX_WEEKS_BACK = 520;

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<{ view?: string; u?: string; w?: string; missing?: string; cancelled?: string; copied?: string; last?: string; skipped?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const settings = await getSettings();
  const view = sp.view === "cal" || sp.view === "timer" ? sp.view : "sheet";
  // Any other week offset in the address is held at the nearest end, so it never reaches the date maths.
  const offset = Math.min(0, Math.max(-MAX_WEEKS_BACK, parseInt(sp.w ?? "0") || 0));
  const ws = addDays(monday(today()), offset * 7);
  const dates = DAYS.map((_, i) => addDays(ws, i));
  // Whose week this is. Location managers and admins can switch to someone else and add or change their time (never the Timer, which is
  // always your own); a Team/Project Manager can look at a team member on the Calendar, read only.
  const canSwitch = view !== "timer" && me.role !== "MEMBER" && !(me.role === "LEADER" && view === "sheet");
  const people = canSwitch ? await db.user.findMany({ where: { AND: [visibleUsersWhere(me), { active: true }] }, orderBy: { name: "asc" }, include: { team: true, location: true } }) : [];
  const pickable = view === "sheet" ? people.filter((p) => canEditTimeFor(me, p)) : people;
  const subject: Me = (sp.u && sp.u !== me.id ? pickable.find((p) => p.id === sp.u) : undefined) ?? me;
  const others = subject.id !== me.id;
  // Two people can share a name, so the picker and the on-behalf banner add the office to those names.
  const dupNames = new Set(people.map((p) => p.name).filter((n, i, all) => all.indexOf(n) !== i));
  const nameOf = (p: { name: string; location: { name: string } }) => (dupNames.has(p.name) ? `${p.name} (${p.location.name})` : p.name);
  // In the picker the office and "you" share one pair of brackets: "Sam Rivera (AMD, you)".
  const pickName = (p: { id: string; name: string; location: { name: string } }) => {
    const notes = [dupNames.has(p.name) && p.location.name, p.id === me.id && "you"].filter(Boolean);
    return notes.length ? `${p.name} (${notes.join(", ")})` : p.name;
  };
  const subjectName = nameOf(subject);
  const editable = !others || canEditTimeFor(me, subject); // someone else's week is read only unless you may change their time
  const [rows, sheet, opts, savedRows, offs, ex] = await Promise.all([
    db.timeEntry.findMany({ where: { userId: subject.id, date: { gte: toDate(ws), lte: toDate(dates[6]) } }, include: { project: { include: { client: true } }, phase: true }, orderBy: [{ date: "asc" }, { startMin: "asc" }] }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: subject.id, weekStart: toDate(ws) } } }),
    entryOptions(editable ? subject : me, me), // a read-only view never lists the other person's projects
    db.timesheetRow.findMany({ where: { userId: subject.id, weekStart: toDate(ws) }, include: { project: { include: { client: true } } } }),
    dayMarks(subject, dates), // public holidays of their office and their time off, for the badges
    loadExpected([subject], { from: ws, to: dates[6] }),
  ]);
  const marks = offs.map(dayMark);
  // Someone else's week: a project the signed-in manager can't see is shown without its name, client or phase.
  const hidden = await hiddenProjectIds(me, subject.id, [...rows, ...savedRows].map((x) => x.projectId));
  const weekly = ex.plain(subject, ws, dates[6]) / 60; // the week's expected hours before public holidays and time off, each month at its own weekly hours
  const want = ex(subject, ws, dates[6], { whole: true }); // this week's expected minutes: the weekly target less holidays and time off
  const status = sheet?.status ?? "DRAFT";
  const statusLocked = status === "SUBMITTED" || status === "APPROVED";
  const adminLocked = (d: string) => !!settings.lockBeforeStr && d <= settings.lockBeforeStr;
  // People can take back a submitted week, unless an admin has locked every day of it.
  const canCancel = status === "SUBMITTED" && !dates.every(adminLocked);
  const total = rows.reduce((a, e) => a + e.minutes, 0);
  const missingList = sp.missing ? (await Promise.all(rows.map(async (e) => ({ e, miss: await missingFields(e, settings) })))).filter((x) => x.miss.length) : [];
  const tagNames = new Map(opts.tags.map((t) => [t.id, t.name]));
  const entries: SheetEntry[] = rows.map((e) => ({
    id: e.id, projectId: e.projectId, projectName: hidden.has(e.projectId) ? HIDDEN_PROJECT : e.project.name, clientName: hidden.has(e.projectId) || hidesClients(me) ? "" : e.project.client.name, clientColor: clientColorFor(me, e.project.client.color),
    phaseId: e.phaseId, phaseName: hidden.has(e.projectId) ? "" : (e.phase?.name ?? "No phase"), tagIds: e.tagIds, tagName: tagText(e.tagIds, tagNames), description: e.description,
    custom: (e.custom ?? {}) as Record<string, string>, date: toStr(e.date), startMin: e.startMin, minutes: e.minutes,
  }));
  // One row per project: the ones added for this week (while still open to log on) plus any with time this week.
  const sheetRows = new Map<string, SheetRow>();
  const open = new Set(opts.projects.map((p) => p.id));
  for (const r of savedRows) if (open.has(r.projectId)) sheetRows.set(r.projectId, { projectId: r.projectId, projectName: hidden.has(r.projectId) ? HIDDEN_PROJECT : r.project.name, clientName: hidden.has(r.projectId) || hidesClients(me) ? "" : r.project.client.name, clientColor: clientColorFor(me, r.project.client.color) });
  for (const e of entries) if (!sheetRows.has(e.projectId)) sheetRows.set(e.projectId, { projectId: e.projectId, projectName: e.projectName, clientName: e.clientName, clientColor: e.clientColor });
  const rowList = [...sheetRows.values()].sort((a, b) => a.clientName.localeCompare(b.clientName) || a.projectName.localeCompare(b.projectName));
  const uParam = others ? subject.id : undefined; // the week nav and view buttons stay on the same person
  const href = (v: string, w: number, u: string | undefined = v === "timer" ? undefined : uParam) => {
    const q = new URLSearchParams();
    if (v !== "sheet") q.set("view", v);
    if (w) q.set("w", String(w));
    if (u) q.set("u", u);
    return `/timesheet${q.size ? `?${q}` : ""}`;
  };
  const back = href(view, offset);
  const copied = Number(sp.copied ?? 0), lastCount = Number(sp.last ?? 0), skipped = Number(sp.skipped ?? 0);

  const run = view === "timer" ? await db.timerRun.findUnique({ where: { userId: me.id } }) : null;
  const blocked = view === "timer" ? await isDayLocked(me.id, today(), settings) : null;
  const waiting = others ? "This week is waiting for approval. Send it back from Approvals to change it." : "This week is waiting for approval. Cancel the submission to change it.";
  const lockedFor = dates.map((d) => (adminLocked(d) ? "This date is locked by an Admin." : statusLocked ? (status === "SUBMITTED" ? waiting : "This week is approved.") : null));
  const toggle = (
    <div className="seg vt" role="group" aria-label="Timesheet view">
      {([["timer", "Timer"], ["sheet", "Timesheet"], ["cal", "Calendar"]] as const).map(([k, l]) => (
        <Link key={k} href={href(k, offset)} aria-pressed={view === k} replace><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[k === "sheet" ? "sheet" : k === "cal" ? "cal" : "timer"] }} />{l}</Link>
      ))}
    </div>
  );
  const submitBtn = others ? null : canCancel ? (
    <form action={cancelSubmission}><input type="hidden" name="week" value={ws} /><input type="hidden" name="back" value={back} /><button className="btn">Cancel submission</button></form>
  ) : (
    <form action={submitWeek}><input type="hidden" name="week" value={ws} /><input type="hidden" name="back" value={back} /><button className="btn primary" disabled={statusLocked || !rows.length}>Submit for approval</button></form>
  );

  return (
    <>
    <PageHead title="Timesheet" beside={toggle} actions={submitBtn} />
    <section className="panel">
      {view === "sheet" && pickable.length > 1 && (
        <div className="row" style={{ marginBottom: 12 }}>
          <PersonPicker view="sheet" label="Whose time" people={pickable.map((p) => ({ id: p.id, name: pickName(p) }))} current={subject.id} meId={me.id} offset={offset} />
        </div>
      )}
      {others && editable && view === "sheet" && (
        <p className="alert info" role="status">You are adding and changing time for <strong>{subjectName}</strong>. They will see it on their own timesheet, and every change is recorded in the change log, which Admins can see in Settings. They still submit their own week.</p>
      )}
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="weeknav">
          {/* At either end the arrow stays a link (to this same week), marked unavailable, so a keyboard user who reached the end keeps focus on it. */}
          <Link className="btn sm" href={href(view, offset > -MAX_WEEKS_BACK ? offset - 1 : offset)} aria-label="Previous week" aria-disabled={offset <= -MAX_WEEKS_BACK || undefined}>‹</Link>
          <strong id="weeklabel" tabIndex={-1}>{weekLabel(ws)}</strong>
          <Link className="btn sm" href={href(view, offset < 0 ? offset + 1 : offset)} aria-label="Next week" aria-disabled={offset >= 0 || undefined}>›</Link>
          <WeekFocus week={ws} target="weeklabel" />
          {offset !== 0 && <Link className="linkbtn" href={href(view, 0)}>This week</Link>}
          {(!others || editable) && <Pill tone={statusTone(status)}>{sheetStatusLabel(status)}</Pill>}
          {dates.some(adminLocked) && <Pill tone="locked">Locked period</Pill>}
        </div>
        {(!others || editable) && (
          <div className="stats wk-stats">
            <div className="stat"><b>{fmtHours(total, settings.timeFormat)}</b><span>hours logged</span></div>
            <div className="stat"><b>{want ? Math.round((total / want) * 100) : weekly ? "–" : 0}{want || !weekly ? "%" : ""}</b><span title={want < weekly * 60 ? "The weekly target less public holidays and time off" : undefined}>{want === weekly * 60 ? `of ${weekly} h target` : `of ${fmtHours(want, settings.timeFormat)} h expected`}</span></div>
          </div>
        )}
      </div>
      {view === "sheet" && <>
      {sp.copied != null && (
        <p className={skipped ? "alert warn" : "alert info"} role="status">
          {copied ? `Copied ${copied} ${copied === 1 ? "project" : "projects"} from last week. Click a day to add your hours.`
            : !lastCount ? "You didn't have any projects last week, so there was nothing to copy."
            : skipped === lastCount ? ""
            : "Last week's projects are already on this week."}
          {skipped ? ` ${skipped} ${skipped === 1 ? "project was" : "projects were"} left out because ${skipped === 1 ? "it's" : "they're"} archived or you no longer have access.` : ""}
        </p>
      )}
      {sp.cancelled != null && status === "DRAFT" && <p className="alert info" role="status">Submission cancelled. You can change this week and submit it again.</p>}
      {sp.cancelled === "0" && status !== "DRAFT" && status !== "SUBMITTED" && (
        <p className="alert warn" role="status">{status === "APPROVED" ? "This week was approved before you cancelled, so it can't be changed now. Ask your approver if something needs changing." : "This week was sent back before you cancelled. You can change it and submit it again."}</p>
      )}
      {status === "REJECTED" && sheet?.comment && <p className="alert bad">Sent back: {sheet.comment}</p>}
      {dates.some(adminLocked) && <p className="alert info">Days on or before {settings.lockBeforeStr} are locked by an Admin and can&apos;t be changed.</p>}
      {missingList.length > 0 && (
        <div className="alert bad">
          <strong>{missingList.length} {missingList.length === 1 ? "entry needs" : "entries need"} details before you can submit.</strong> Click each one in the grid below to fill in:
          <ul style={{ margin: "6px 0 0" }}>{missingList.map(({ e, miss }) => <li key={e.id}>{toStr(e.date)} · {e.project.name}: {miss.join(", ")}</li>)}</ul>
        </div>
      )}
      <TimesheetGrid opts={opts} meId={me.id} canEdit={editable} entries={entries} rows={rowList} weekStart={ws} rowsLocked={statusLocked} today={today()} dates={dates} marks={marks} ownerId={others ? subject.id : undefined} ownerName={others ? subjectName : undefined} locked={lockedFor} footerLeft={statusLocked ? <span className="note">{others ? (status === "SUBMITTED" ? "This week is waiting for approval. It can be sent back from Approvals if something needs changing." : "This week is approved.") : canCancel ? "This week is waiting for approval. Cancel the submission if you need to change something." : status === "SUBMITTED" ? "This week is waiting for approval. Its days are locked by an Admin, so it can't be changed." : "This week is approved. Ask your approver if something needs changing."}</span> : others ? null : (
          <form action={copyLastWeek}><input type="hidden" name="week" value={ws} /><input type="hidden" name="back" value={back} /><button className="btn">Copy last week</button></form>
        )} />
      <p className="note" style={{ margin: "12px 0 0" }}>
        {statusLocked ? <>This week can&apos;t be changed{status === "SUBMITTED" ? " while it waits for approval" : ""}. <span className="honly">Click an entry to see its details, or hover over it to see its phase, tags and description.</span><span className="tonly">Tap an entry to see its details.</span></>
          : <><span className="honly">Click an empty day to add time. Click an entry to change it, or hover over it to see its phase, tags and description.</span><span className="tonly">Tap an empty day to add time. Tap an entry to change it.</span>{` Every entry needs a phase${settings.requireTag ? (settings.requireDescription ? ", at least one tag" : " and at least one tag") : ""}${settings.requireDescription ? " and a description" : ""}.`}</>}
      </p>
      </>}
      {view !== "cal" && <DayOffList dates={dates} marks={marks} />}
      {view === "cal" && <CalendarView me={me} subject={subject} subjectName={subjectName} people={people.map((p) => ({ id: p.id, name: pickName(p) }))} editable={editable} opts={opts} settings={settings} offset={offset} />}
      {view === "timer" && <TimerView opts={opts} meId={me.id} run={run ? { projectId: run.projectId, phaseId: run.phaseId, tagIds: run.tagIds, description: run.description, startedAt: run.startedAt.toISOString() } : null} entries={entries} dates={dates} today={today()} locked={lockedFor} blocked={blocked} timeZone={settings.timeZone} />}
    </section>
    </>
  );
}
