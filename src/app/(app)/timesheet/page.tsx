import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { entryOptions } from "@/lib/entryOptions";
import { missingFields } from "@/lib/entries";
import { addDays, monday, today, toDate, toStr, weekLabel, DAYS } from "@/lib/dates";
import { fmtHours } from "@/lib/format";
import { Pill, statusTone } from "@/components/ui";
import TimesheetGrid, { type SheetEntry, type SheetRow } from "./TimesheetGrid";
import { cancelSubmission, copyLastWeek, submitWeek } from "./actions";
import Link from "next/link";

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<{ w?: string; missing?: string; cancelled?: string; copied?: string; last?: string; skipped?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const settings = await getSettings();
  const offset = Math.min(0, parseInt(sp.w ?? "0") || 0);
  const ws = addDays(monday(today()), offset * 7);
  const dates = DAYS.map((_, i) => addDays(ws, i));
  const [rows, sheet, opts, savedRows] = await Promise.all([
    db.timeEntry.findMany({ where: { userId: me.id, date: { gte: toDate(ws), lte: toDate(dates[6]) } }, include: { project: { include: { client: true } }, phase: true, tag: true }, orderBy: [{ date: "asc" }, { startMin: "asc" }] }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: me.id, weekStart: toDate(ws) } } }),
    entryOptions(me),
    db.timesheetRow.findMany({ where: { userId: me.id, weekStart: toDate(ws) }, include: { project: { include: { client: true } } } }),
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
  // One row per project: the ones added for this week (while still open to log on) plus any with time this week.
  const sheetRows = new Map<string, SheetRow>();
  const open = new Set(opts.projects.map((p) => p.id));
  for (const r of savedRows) if (open.has(r.projectId)) sheetRows.set(r.projectId, { projectId: r.projectId, projectName: r.project.name, clientName: r.project.client.name, clientColor: r.project.client.color });
  for (const e of entries) if (!sheetRows.has(e.projectId)) sheetRows.set(e.projectId, { projectId: e.projectId, projectName: e.projectName, clientName: e.clientName, clientColor: e.clientColor });
  const rowList = [...sheetRows.values()].sort((a, b) => a.clientName.localeCompare(b.clientName) || a.projectName.localeCompare(b.projectName));
  const back = `/timesheet${offset ? `?w=${offset}` : ""}`;
  const copied = Number(sp.copied ?? 0), lastCount = Number(sp.last ?? 0), skipped = Number(sp.skipped ?? 0);

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
        <p className={skipped ? "alert warn" : "alert info"} role="status">
          {copied ? `Copied ${copied} ${copied === 1 ? "project" : "projects"} from last week. Click a day to add your hours.`
            : !lastCount ? "You didn't have any projects last week, so there was nothing to copy."
            : skipped === lastCount ? ""
            : "Last week's projects are already on this week."}
          {skipped ? ` ${skipped} ${skipped === 1 ? "project was" : "projects were"} left out because ${skipped === 1 ? "it's" : "they're"} archived or you no longer have access.` : ""}
        </p>
      )}
      {sp.cancelled === "1" && status === "DRAFT" && <p className="alert info" role="status">Submission cancelled. You can change this week and submit it again.</p>}
      {sp.cancelled === "0" && status !== "DRAFT" && status !== "SUBMITTED" && (
        <p className="alert warn" role="status">{status === "APPROVED" ? "This week was approved before you cancelled, so it can't be changed now. Ask your approver if something needs changing." : "This week was sent back before you cancelled. You can change it and submit it again."}</p>
      )}
      {status === "REJECTED" && sheet?.comment && <p className="alert bad">Sent back: {sheet.comment}</p>}
      {dates.some(adminLocked) && <p className="alert info">Days on or before {settings.lockBeforeStr} are locked by an admin and can&apos;t be changed.</p>}
      {missingList.length > 0 && (
        <div className="alert bad">
          <strong>{missingList.length} {missingList.length === 1 ? "entry needs" : "entries need"} details before you can submit.</strong> Click each one in the grid below to fill in:
          <ul style={{ margin: "6px 0 0" }}>{missingList.map(({ e, miss }) => <li key={e.id}>{toStr(e.date)} · {e.project.name}: {miss.join(", ")}</li>)}</ul>
        </div>
      )}
      <TimesheetGrid opts={opts} entries={entries} rows={rowList} weekStart={ws} rowsLocked={statusLocked} dates={dates} locked={dates.map((d) => (adminLocked(d) ? "This date is locked by an admin." : statusLocked ? (status === "SUBMITTED" ? "This week is waiting for approval. Cancel the submission to change it." : "This week is approved.") : null))} footerLeft={statusLocked ? <span className="note">{status === "SUBMITTED" ? "This week is waiting for approval. Cancel the submission if you need to change something." : "This week is approved. Ask your approver if something needs changing."}</span> : (
          <form action={copyLastWeek}><input type="hidden" name="week" value={ws} /><input type="hidden" name="back" value={back} /><button className="btn">Copy last week</button></form>
        )} footerRight={status === "SUBMITTED" ? (
          <form action={cancelSubmission}>
            <input type="hidden" name="week" value={ws} /><input type="hidden" name="back" value={back} />
            <button className="btn">Cancel submission</button>
          </form>
        ) : (
          <form action={submitWeek}>
            <input type="hidden" name="week" value={ws} /><input type="hidden" name="back" value={back} />
            <button className="btn ok" disabled={statusLocked || !rows.length}>Submit for approval</button>
          </form>
        )} />
      <p className="note" style={{ margin: "12px 0 0" }}>
        {statusLocked ? `This week can't be changed${status === "SUBMITTED" ? " while it waits for approval" : ""}. Click an entry to see its details, or hover over it to see its phase, tag and description.`
          : `Click an empty day to add time. Click an entry to change it, or hover over it to see its phase, tag and description. Every entry needs a phase${settings.requireTag ? (settings.requireDescription ? ", tag" : " and tag") : ""}${settings.requireDescription ? " and description" : ""}.`}
      </p>
    </section>
  );
}
