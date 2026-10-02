"use client";
import { useRef, useState } from "react";
import EntryDialog from "@/components/EntryDialog";
import type { EntryOptions, EntryValue } from "@/components/entryTypes";

export type SheetEntry = {
  id: string; projectId: string; projectName: string; clientName: string; clientColor: string;
  phaseId: string | null; phaseName: string; tagId: string | null; tagName: string; description: string;
  custom: Record<string, string>; date: string; startMin: number; minutes: number;
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TimesheetGrid({ opts, entries, dates, locked, today }: { opts: EntryOptions; entries: SheetEntry[]; dates: string[]; locked: (string | null)[]; today: string }) {
  const [edit, setEdit] = useState<EntryValue | null>(null);
  const [cell, setCell] = useState<{ key: string; date: string } | null>(null);
  const listRef = useRef<HTMLDialogElement>(null);
  const f = (m: number) => opts.timeFormat === "hhmm" ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}` : (m / 60).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const key = (e: SheetEntry) => e.projectId + "|" + (e.phaseId ?? "");
  const rows = [...new Map(entries.map((e) => [key(e), e])).values()];
  const sum = (k: string | null, d: string | null) => entries.filter((e) => (!k || key(e) === k) && (!d || e.date === d)).reduce((a, e) => a + e.minutes, 0);
  const lockFor = (d: string) => locked[dates.indexOf(d)];
  const open = (e: SheetEntry) => setEdit({ ...e, lockedReason: lockFor(e.date) });
  const firstOpen = dates.find((d, i) => !locked[i] && d === today) ?? dates.find((_, i) => !locked[i]);
  const cellEntries = cell ? entries.filter((e) => key(e) === cell.key && e.date === cell.date) : [];

  return (
    <>
      <div className="tablebox">
        <table>
          <thead><tr><th>Project and phase</th>{dates.map((d, i) => <th key={d} className="num">{DAYS[i]} {+d.slice(8)}{locked[i] ? " 🔒" : ""}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={key(r)}>
                <td style={{ minWidth: 180 }}><span className="dot" style={{ background: `var(--${r.clientColor})` }} />{r.projectName}<div className="note">{r.clientName} · {r.phaseName}</div></td>
                {dates.map((d) => {
                  const v = sum(key(r), d);
                  return <td key={d} className="num">{v ? <button className="cellbtn" onClick={() => { setCell({ key: key(r), date: d }); listRef.current?.showModal(); }} aria-label={`${r.projectName} ${d}: ${f(v)} hours`}>{f(v)}</button> : null}</td>;
                })}
                <td className="num">{f(sum(key(r), null))}</td>
              </tr>
            )) : <tr><td colSpan={9} className="empty">No time this week yet. Use “Add entry with details” to log your first entry.</td></tr>}
          </tbody>
          <tfoot><tr><td>Total</td>{dates.map((d) => <td key={d} className="num">{f(sum(null, d))}</td>)}<td className="num">{f(sum(null, null))}</td></tr></tfoot>
        </table>
      </div>
      {firstOpen && <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setEdit({ date: firstOpen })}>Add entry with details</button>}

      <dialog ref={listRef} onClose={() => setCell(null)}>
        <div className="panel">
          <div className="row between" style={{ marginBottom: 8 }}><h2>{cellEntries[0]?.projectName}</h2><button className="btn sm" onClick={() => listRef.current?.close()}>Close</button></div>
          <p className="sub">{cell?.date} · {cellEntries[0]?.phaseName}</p>
          <div className="list">
            {cellEntries.map((e) => (
              <div className="item" key={e.id}>
                <div>{f(e.minutes)} h<div className="meta">{e.tagName ? e.tagName + " · " : ""}{e.description || "No description"}</div></div>
                <button className="btn sm" onClick={() => { listRef.current?.close(); open(e); }}>{lockFor(e.date) ? "View" : "Edit"}</button>
              </div>
            ))}
          </div>
          {cell && !lockFor(cell.date) && (
            <button className="btn primary" style={{ marginTop: 12 }} onClick={() => { const [projectId, phaseId] = cell.key.split("|"); listRef.current?.close(); setEdit({ projectId, phaseId, date: cell.date }); }}>Add another entry</button>
          )}
        </div>
      </dialog>
      <EntryDialog opts={opts} value={edit} onClose={() => setEdit(null)} />
    </>
  );
}
