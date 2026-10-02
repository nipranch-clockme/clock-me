"use client";
import { startTransition, useEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import EntryDialog from "@/components/EntryDialog";
import type { EntryOptions, EntryValue } from "@/components/entryTypes";
import { addRow, removeRow } from "./actions";

export type SheetEntry = {
  id: string; projectId: string; projectName: string; clientName: string; clientColor: string;
  phaseId: string | null; phaseName: string; tagId: string | null; tagName: string; description: string;
  custom: Record<string, string>; date: string; startMin: number; minutes: number;
};
export type SheetRow = { projectId: string; projectName: string; clientName: string; clientColor: string };
type Tip = { e: SheetEntry; x: number; top: number; bottom: number };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default function TimesheetGrid({ opts, entries, rows, dates, locked, weekStart, rowsLocked, footerLeft, footerRight }: {
  opts: EntryOptions; entries: SheetEntry[]; rows: SheetRow[]; dates: string[]; locked: (string | null)[]; weekStart: string; rowsLocked: boolean;
  /** Week actions from the page (copy last week, submit), shown beside "Add project row". */
  footerLeft?: ReactNode; footerRight?: ReactNode;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<EntryValue | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [rowError, setRowError] = useState("");
  const [addError, setAddError] = useState("");
  const [busy, setBusy] = useState(false);
  const addRef = useRef<HTMLDialogElement>(null);
  const f = (m: number) => opts.timeFormat === "hhmm" ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}` : (m / 60).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lockFor = (d: string) => locked[dates.indexOf(d)];
  const inCell = (projectId: string, d: string) => entries.filter((e) => e.projectId === projectId && e.date === d).sort((a, b) => a.startMin - b.startMin);
  const sum = (projectId: string | null, d: string | null) => entries.filter((e) => (!projectId || e.projectId === projectId) && (!d || e.date === d)).reduce((a, e) => a + e.minutes, 0);
  // New time starts where the day's last entry ends, so the calendar shows entries one after another.
  const nextStart = (d: string) => Math.min(23 * 60, Math.max(9 * 60, ...entries.filter((e) => e.date === d).map((e) => e.startMin + e.minutes)));
  const available = opts.projects.filter((p) => !rows.some((r) => r.projectId === p.id));
  const clients = [...new Set(available.map((p) => p.client))];

  // The tooltip sits outside the table's scroll box, so it hides whenever the page scrolls.
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [tip]);

  const showTip = (e: SheetEntry) => (ev: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    setTip({ e, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  const openAdd = (r: SheetRow, d: string) => {
    setTip(null);
    setEdit({ projectId: r.projectId, projectName: r.projectName, date: d, startMin: nextStart(d), fixed: true, context: `${r.projectName} · ${r.clientName} · ${dayLabel(d)}` });
  };
  const openEntry = (e: SheetEntry) => {
    setTip(null);
    setEdit({ ...e, fixed: true, lockedReason: lockFor(e.date), context: `${e.projectName} · ${e.clientName} · ${dayLabel(e.date)}` });
  };
  const changeRow = (fn: typeof addRow, fd: FormData, setError: (m: string) => void, after?: () => void) => {
    setBusy(true);
    setError("");
    startTransition(async () => {
      const res = await fn(fd);
      setBusy(false);
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  };
  const rowForm = (projectId: string) => { const fd = new FormData(); fd.set("week", weekStart); fd.set("projectId", projectId); return fd; };

  // Keep the tooltip on screen: below the chip unless that would run off the bottom.
  const tipStyle = tip && typeof window !== "undefined" ? {
    left: Math.min(Math.max(tip.x, 130), window.innerWidth - 130),
    ...(tip.bottom + 130 > window.innerHeight ? { bottom: window.innerHeight - tip.top + 6 } : { top: tip.bottom + 6 }),
  } : undefined;

  return (
    <>
      <div className="tablebox">
        <table className="sheet">
          <thead><tr><th>Project</th>{dates.map((d, i) => <th key={d} className="num">{DAYS[i]} {+d.slice(8)}{locked[i] ? " 🔒" : ""}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => {
              const rowTotal = sum(r.projectId, null);
              return (
                <tr key={r.projectId}>
                  <td style={{ minWidth: 180 }}>
                    <div className="row between" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <div><span className="dot" style={{ background: `var(--${r.clientColor})` }} />{r.projectName}<div className="note">{r.clientName}</div></div>
                      {!rowTotal && !rowsLocked && (
                        <button type="button" className="rowx" aria-label={`Remove ${r.projectName} row`} title="Remove this row" disabled={busy} onClick={() => changeRow(removeRow, rowForm(r.projectId), setRowError)}>×</button>
                      )}
                    </div>
                  </td>
                  {dates.map((d, i) => {
                    const list = inCell(r.projectId, d);
                    const lk = locked[i];
                    return (
                      <td key={d} className={"sheetcell" + (lk ? " locked" : "")}>
                        <div className="cellstack">
                          {list.map((e) => (
                            <button type="button" key={e.id} className="chipbtn" style={{ borderLeftColor: `var(--${r.clientColor})` }}
                              onClick={() => openEntry(e)} onMouseEnter={showTip(e)} onMouseLeave={() => setTip(null)} onFocus={showTip(e)} onBlur={() => setTip(null)}
                              aria-label={`${f(e.minutes)} hours. Phase: ${e.phaseName}. Tag: ${e.tagName || "no tag"}. ${e.description ? `Description: ${e.description}` : "No description"}.`}>
                              {f(e.minutes)}
                            </button>
                          ))}
                          {!lk && (
                            <button type="button" className="addcell" onClick={() => openAdd(r, d)} aria-label={`Add time to ${r.projectName} on ${dayLabel(d)}`}>+</button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="num">{f(rowTotal)}</td>
                </tr>
              );
            }) : <tr><td colSpan={9} className="empty">No projects this week yet. Click “Add project row”, then click a day to add time.</td></tr>}
          </tbody>
          <tfoot><tr><td>Total</td>{dates.map((d) => <td key={d} className="num">{f(sum(null, d))}</td>)}<td className="num">{f(sum(null, null))}</td></tr></tfoot>
        </table>
      </div>
      {rowError && <p className="err-text" role="alert">{rowError}</p>}
      <div className="row between" style={{ marginTop: 14 }}>
        <div className="row" style={{ flex: "1 1 400px" }}>
          {!rowsLocked && <button type="button" className="btn primary" onClick={() => { setAddError(""); addRef.current?.showModal(); }}>Add project row</button>}
          {footerLeft}
        </div>
        {footerRight}
      </div>

      {tip && (
        <div className="sheettip" role="tooltip" style={tipStyle}>
          <div><span>Phase</span>{tip.e.phaseName}</div>
          <div><span>Tag</span>{tip.e.tagName || "No tag"}</div>
          <div><span>Description</span>{tip.e.description || "No description"}</div>
        </div>
      )}

      <dialog ref={addRef} aria-labelledby="addrow-title">
        <div className="panel">
          <div className="row between" style={{ marginBottom: 8 }}><h2 id="addrow-title">Add a project row</h2><button type="button" className="btn sm" onClick={() => addRef.current?.close()}>Close</button></div>
          {available.length ? (
            <form onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); fd.set("week", weekStart); changeRow(addRow, fd, setAddError, () => addRef.current?.close()); }}>
              <label htmlFor="addrow-project">Project</label>
              <select id="addrow-project" name="projectId" required defaultValue="">
                <option value="" disabled>Choose a project</option>
                {clients.map((c) => (
                  <optgroup key={c} label={c}>
                    {available.filter((p) => p.client === c).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                ))}
              </select>
              {addError && <p className="err-text" role="alert">{addError}</p>}
              <div className="row" style={{ marginTop: 14 }}><button className="btn primary" disabled={busy}>{busy ? "Adding…" : "Add row"}</button></div>
            </form>
          ) : (
            <p className="sub" style={{ margin: 0 }}>You already have a row for every project you can log time on.</p>
          )}
        </div>
      </dialog>
      <EntryDialog opts={opts} value={edit} onClose={() => setEdit(null)} />
    </>
  );
}
