"use client";
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
type Tip = { id: string; el: HTMLElement };
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
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const addFormRef = useRef<HTMLFormElement>(null);
  const [rowError, setRowError] = useState("");
  const [addError, setAddError] = useState("");
  const [busy, setBusy] = useState(false);
  const addRef = useRef<HTMLDialogElement>(null);
  const f = (m: number) => opts.timeFormat === "hhmm" ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}` : (m / 60).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lockFor = (d: string) => locked[dates.indexOf(d)];
  const inCell = (projectId: string, d: string) => entries.filter((e) => e.projectId === projectId && e.date === d).sort((a, b) => a.startMin - b.startMin);
  const sum = (projectId: string | null, d: string | null) => entries.filter((e) => (!projectId || e.projectId === projectId) && (!d || e.date === d)).reduce((a, e) => a + e.minutes, 0);
  // New time starts where the day's last entry ends (09:00 on an empty day), so the calendar shows entries one after another.
  const nextStart = (d: string) => {
    const ends = entries.filter((e) => e.date === d).map((e) => e.startMin + e.minutes);
    return Math.min(23 * 60, ends.length ? Math.max(...ends) : 9 * 60);
  };
  // Projects that are archived or no longer open to this person keep their time on show, but take no new time.
  const canLog = (projectId: string) => opts.projects.some((p) => p.id === projectId);
  const available = opts.projects.filter((p) => !rows.some((r) => r.projectId === p.id));
  const clients = [...new Set(available.map((p) => p.client))];

  // The tooltip reads the entry fresh on every render, so it disappears with a deleted entry.
  const tipEntry = tip ? entries.find((e) => e.id === tip.id) : undefined;
  useEffect(() => { if (tip && !tipEntry) setTip(null); }, [tip, tipEntry]);

  // It sits outside the table's scroll box, placed from the chip's position and its own real size:
  // below the chip if it fits, otherwise above, and always inside the window.
  const placeTip = useCallback(() => {
    const box = tipRef.current;
    if (!tip || !box) return;
    const r = tip.el.getBoundingClientRect();
    if (!tip.el.isConnected || r.bottom < 0 || r.top > window.innerHeight) return setTip(null);
    const m = 8, w = box.offsetWidth, h = box.offsetHeight;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - m) top = r.top - 6 - h;
    top = Math.max(m, Math.min(top, window.innerHeight - m - h));
    const left = Math.max(m, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - m - w));
    setTipPos({ left, top });
  }, [tip]);
  useLayoutEffect(() => { placeTip(); }, [placeTip, tipEntry]);
  useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", placeTip, true);
    window.addEventListener("resize", placeTip);
    return () => { window.removeEventListener("scroll", placeTip, true); window.removeEventListener("resize", placeTip); };
  }, [tip, placeTip]);

  const showTip = (id: string, el: HTMLElement) => { setTipPos(null); setTip({ id, el }); };
  const openAdd = (r: SheetRow, d: string) => {
    setTip(null);
    setEdit({ projectId: r.projectId, projectName: r.projectName, date: d, startMin: nextStart(d), fixed: true, context: `${r.projectName} · ${r.clientName} · ${dayLabel(d)}` });
  };
  const openEntry = (e: SheetEntry) => {
    setTip(null);
    // On a project that's closed for new time, the full form lets the person move the entry to another project.
    if (!canLog(e.projectId)) return setEdit({ ...e, lockedReason: lockFor(e.date), context: `${e.projectName} is archived or no longer open to you. You can move this entry to another project or delete it.` });
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
                      <div><span className="dot" style={{ background: `var(--${r.clientColor})` }} />{r.projectName}<div className="note">{r.clientName}{!canLog(r.projectId) && " · closed for new time"}</div></div>
                      {!rowTotal && !rowsLocked && (
                        <button type="button" className="rowx" aria-label={`Remove ${r.projectName} row`} title="Remove this row" disabled={busy} onClick={() => changeRow(removeRow, rowForm(r.projectId), setRowError)}>×</button>
                      )}
                    </div>
                  </td>
                  {dates.map((d, i) => {
                    const list = inCell(r.projectId, d);
                    const open = !locked[i] && canLog(r.projectId);
                    return (
                      // Mouse users can click anywhere free in the cell; the + button inside is there for keyboard users.
                      <td key={d} className={"sheetcell" + (open ? " open" : " locked")} onClick={open ? (ev) => { if (!(ev.target as HTMLElement).closest("button")) openAdd(r, d); } : undefined}>
                        <div className="cellstack">
                          {list.map((e) => (
                            <button type="button" key={e.id} className="chipbtn" style={{ borderLeftColor: `var(--${r.clientColor})` }}
                              onClick={() => openEntry(e)} onMouseEnter={(ev) => showTip(e.id, ev.currentTarget)} onMouseLeave={() => setTip(null)}
                              onFocus={(ev) => { if (ev.currentTarget.matches(":focus-visible")) showTip(e.id, ev.currentTarget); }} onBlur={() => setTip(null)}
                              aria-label={`${f(e.minutes)} hours. Phase: ${e.phaseName}. Tag: ${e.tagName || "no tag"}. ${e.description ? `Description: ${e.description}` : "No description"}.`}>
                              {f(e.minutes)}
                            </button>
                          ))}
                          {open && (
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
          {!rowsLocked && <button type="button" className="btn primary" onClick={() => { setAddError(""); addFormRef.current?.reset(); addRef.current?.showModal(); }}>Add project row</button>}
          {footerLeft}
        </div>
        {footerRight}
      </div>

      {tip && tipEntry && (
        <div ref={tipRef} className="sheettip" role="tooltip" style={tipPos ?? { left: 0, top: 0, visibility: "hidden" }}>
          <div><span>Phase</span>{tipEntry.phaseName}</div>
          <div><span>Tag</span>{tipEntry.tagName || "No tag"}</div>
          <div><span>Description</span>{tipEntry.description || "No description"}</div>
        </div>
      )}

      <dialog ref={addRef} aria-labelledby="addrow-title">
        <div className="panel">
          <div className="row between" style={{ marginBottom: 8 }}><h2 id="addrow-title">Add a project row</h2><button type="button" className="btn sm" onClick={() => addRef.current?.close()}>Close</button></div>
          {available.length ? (
            <form ref={addFormRef} onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); fd.set("week", weekStart); changeRow(addRow, fd, setAddError, () => addRef.current?.close()); }}>
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
      {/* Closing the dialog puts focus back on the chip; don't let that pop the tooltip up. */}
      <EntryDialog opts={opts} value={edit} onClose={() => { setEdit(null); setTip(null); }} />
    </>
  );
}
