import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { entryOptions } from "@/lib/entryOptions";
import { missingFields } from "@/lib/entries";
import { addDays, monday, today, toDate, toStr, weekLabel, DAYS } from "@/lib/dates";
import { fmtHours } from "@/lib/format";
import { Pill, statusTone } from "@/components/ui";
import TimesheetGrid, { type SheetEntry } from "./TimesheetGrid";
import { copyLastWeek, submitWeek } from "./actions";
import Link from "next/link";

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<{ w?: string; missing?: string; copied?: string; skipped?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const settings = await getSettings();
  const offset = Math.min(0, parseInt(sp.w ?? "0") || 0);
  const ws = addDays(monday(today()), offset * 7);
  const dates = DAYS.map((_, i) => addDays(ws, i));
  const [rows, sheet, opts] = await Promise.all([
    db.timeEntry.findMany({ where: { userId: me.id, date: { gte: toDate(ws), lte: toDate(dates[6]) } }, include: { project: { include: { client: true } }, phase: true, tag: true }, orderBy: [{ date: "asc" }, { startMin: "asc" }] }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: me.id, weekStart: toDate(ws) } } }),
    entryOptions(me),
  ]);
  const status = sheet?.status ?? "DRAFT";
  const statusLocked = status === "SUBMITTED" || status === "APPROVED";
  const adminLocked = (d: string) => !!settings.lockBeforeStr && d <= settings.lockBeforeStr;
  const total = rows.reduce((a, e) => a + e.minutes, 0);
  const missingList = sp.missing ? (await Promise.all(rows.map(async (e) => ({ e, miss: await missingFields(e, settings) })))).filter((x) => x.miss.length) : [];
  const entries: SheetEntry[] = rows.map((e) => ({
    id: e.id, projectId: e.projectId, projectName: e.project.name, clientName: e.project.client.name, clientColor: e.project.client.color,
    phaseId: e.phaseId, phaseName: e.phase?.name ?? "No phase", tagId: e.tagId, tagName: e.tag?.name ?? "", description: e.description,
    custom: (e.custom ?? {}) as Record<string, string>, date: toStr(e.date), startMin: e.startMin, minutes: e.minutes,
  }));
  const back = `/timesheet${offset ? `?w=${offset}` : ""}`;

  return (
    <section className="panel">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="weeknav">
          <Link className="btn sm" href={`/timesheet?w=${offset - 1}`} aria-label="Previous week">‹</Link>
          <strong>{weekLabel(ws)}</strong>
          {offset < 0 ? <Link className="btn sm" href={`/timesheet?w=${offset + 1}`} aria-label="Next week">›</Link> : <span className="btn sm" aria-disabled="true" style={{ opacity: 0.45 }}>›</span>}
          {offset !== 0 && <Link className="linkbtn" href="/timesheet">This week</Link>}
          <Pill tone={statusTone(status)}>{status.toLowerCase()}</Pill>
          {dates.some(adminLocked) && <Pill tone="locked">Locked period</Pill>}
        </div>
        <div className="stats">
          <div className="stat"><b>{fmtHours(total, settings.timeFormat)}</b><span>hours logged</span></div>
          <div className="stat"><b>{me.weeklyTarget ? Math.round((total / 60 / me.weeklyTarget) * 100) : 0}%</b><span>of {me.weeklyTarget} h target</span></div>
        </div>
      </div>
      {sp.copied != null && (
        <p className={Number(sp.skipped) ? "alert warn" : "alert info"} role="status">
          Copied {sp.copied} {sp.copied === "1" ? "entry" : "entries"} from last week.
          {Number(sp.skipped) ? ` ${sp.skipped} ${sp.skipped === "1" ? "entry was" : "entries were"} left out because the project is archived, you no longer have access, or the phase was removed.` : ""}
        </p>
      )}
      {status === "REJECTED" && sheet?.comment && <p className="alert bad">Sent back: {sheet.comment}</p>}
      {dates.some(adminLocked) && <p className="alert info">Days on or before {settings.lockBeforeStr} are locked by an admin and can&apos;t be changed.</p>}
      {missingList.length > 0 && (
        <div className="alert bad">
          <strong>{missingList.length} {missingList.length === 1 ? "entry needs" : "entries need"} details before you can submit.</strong> Click each one in the grid below to fill in:
          <ul style={{ margin: "6px 0 0" }}>{missingList.map(({ e, miss }) => <li key={e.id}>{toStr(e.date)} · {e.project.name}: {miss.join(", ")}</li>)}</ul>
        </div>
      )}
      <TimesheetGrid opts={opts} entries={entries} dates={dates} locked={dates.map((d) => (adminLocked(d) ? "This date is locked by an admin." : statusLocked ? `This week is ${status.toLowerCase()}.` : null))} today={today()} />
      <div className="row between" style={{ marginTop: 14 }}>
        {statusLocked ? <span className="note">This week is {status.toLowerCase()}. Ask your approver if something needs changing.</span> : (
          <form action={copyLastWeek}><input type="hidden" name="week" value={ws} /><input type="hidden" name="back" value={back} /><button className="btn">Copy last week</button></form>
        )}
        <form action={submitWeek}>
          <input type="hidden" name="week" value={ws} /><input type="hidden" name="back" value={back} />
          <button className="btn ok" disabled={statusLocked || !rows.length}>Submit for approval</button>
        </form>
      </div>
      <p className="note" style={{ margin: "12px 0 0" }}>Click a number to see, edit or delete those entries. Every entry needs a project and phase{settings.requireTag ? ", tag" : ""}{settings.requireDescription ? " and description" : ""}.</p>
    </section>
  );
}
