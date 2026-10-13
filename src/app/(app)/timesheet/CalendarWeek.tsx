"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import EntryDialog from "@/components/EntryDialog";
import type { EntryOptions } from "@/components/entryTypes";
import { draftEdit, useRestoreDraft, type EntryEdit } from "@/components/entryDraft";
import type { DayMark } from "@/lib/dayMark";

type CalEntry = { id: string; projectId: string; projectName: string; color: string; phaseId: string | null; phaseName: string; tagIds: string[]; description: string; custom: Record<string, string>; date: string; startMin: number; minutes: number };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PX = 40; // pixels per hour
/** Side-by-side columns for entries that overlap in time, so none hides another. */
function layout(list: CalEntry[]) {
  const sorted = [...list].sort((a, b) => a.startMin - b.startMin || b.minutes - a.minutes);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: CalEntry[] = [], colEnds: number[] = [], clusterEnd = -1;
  const flush = () => { for (const e of cluster) out.get(e.id)!.cols = colEnds.length; cluster = []; colEnds = []; };
  for (const e of sorted) {
    const end = e.startMin + Math.max(e.minutes, 15);
    if (e.startMin >= clusterEnd) flush();
    let col = colEnds.findIndex((x) => x <= e.startMin);
    if (col === -1) { col = colEnds.length; colEnds.push(end); } else colEnds[col] = end;
    out.set(e.id, { col, cols: 1 });
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}
const SNAP = 15;
/** A drag on a day column: where it started (snapped down) and where the pointer is now (snapped to the nearest step). */
type Drag = { date: string; anchor: number; cur: number; y0: number; moved: boolean; pointerId: number };
const range = (d: Drag) => (d.cur === d.anchor ? [d.anchor, d.anchor + SNAP] : [Math.min(d.anchor, d.cur), Math.max(d.anchor, d.cur)]);
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const byStart = (a: CalEntry, b: CalEntry) => a.startMin - b.startMin || b.minutes - a.minutes;
// Rows saved before start times were checked can start before 00:00 or at 24:00 or later.
const inDay = (e: CalEntry) => e.startMin >= 0 && e.startMin < 24 * 60;

export default function CalendarWeek({ opts, dates, entries, today, editable, meId, locked, marks = [], ownerName, ownerId }: { opts: EntryOptions; dates: string[]; entries: CalEntry[]; today: string; editable: boolean; meId: string; locked: (string | null)[]; ownerName: string;
  /** Set when the week belongs to someone else whose time the viewer may change (location managers and admins). */
  ownerId?: string;
  /** For each day: a public holiday or time off to show, or null. Time can still be logged on these days. */
  marks?: (DayMark | null)[] }) {
  // The grid shows 07:00 to 20:00, and stretches when an entry starts earlier or ends later so nothing is cut off.
  // Entries with a start outside the day don't stretch it; they are drawn at its top or bottom edge instead.
  const fits = entries.filter(inDay);
  const H0 = Math.min(7, Math.floor(Math.min(7 * 60, ...fits.map((e) => e.startMin)) / 60));
  const H1 = Math.min(24, Math.max(20, Math.ceil(Math.max(0, ...fits.map((e) => e.startMin + Math.max(e.minutes, 15))) / 60)));
  /** Where an entry is drawn, kept inside the grid: start and length in minutes. */
  const drawn = (e: CalEntry) => {
    const a = Math.max(H0 * 60, Math.min(e.startMin, H1 * 60 - 15));
    return { startMin: a, minutes: Math.max(a + 15, Math.min(e.startMin + e.minutes, H1 * 60)) - a };
  };
  const [edit, setEdit] = useState<EntryEdit | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const lastPointer = useRef("mouse");
  const calRef = useRef<HTMLDivElement>(null);
  const setDragBoth = (d: Drag | null) => { dragRef.current = d; setDrag(d); };
  const f = (m: number) => opts.timeFormat === "hhmm" ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : (m / 60).toFixed(2);
  const canAdd = (i: number) => editable && !locked[i];
  const who = ownerId ? { ownerId, ownerName } : {};
  // The form for an existing entry: read only unless the person may change this time.
  const entryForm = (e: CalEntry, i: number): EntryEdit => ({ ...e, readOnly: !editable, lockedReason: editable ? locked[i] : null, ownerId: editable ? ownerId : undefined, ownerName: editable && !ownerId ? undefined : ownerName });
  // A draft from before the session ended reopens its form: the entry being changed if it is still there, otherwise a new entry on that day.
  useRestoreDraft({ by: meId, forId: ownerId ?? meId, editable }, (d) => {
    const e = d.id ? entries.find((x) => x.id === d.id) : undefined;
    setEdit({ ...(e ? entryForm(e, dates.indexOf(e.date)) : { lockedReason: locked[dates.indexOf(d.date)], ...who }), ...draftEdit(d) });
  });
  // The day's add button starts where that day's last entry ends (09:00 on an empty day), like the Timesheet's + buttons.
  const nextStart = (d: string) => {
    const ends = fits.filter((e) => e.date === d).map((e) => e.startMin + e.minutes);
    return Math.min(23 * 60, ends.length ? Math.max(...ends) : 9 * 60);
  };
  // Minutes from the top of a column, kept inside the grid's hours.
  const minuteAt = (el: HTMLElement, clientY: number, round: (x: number) => number) => {
    const y = Math.max(0, Math.min((H1 - H0) * PX, clientY - el.getBoundingClientRect().top));
    return Math.max(H0 * 60, Math.min(H1 * 60, H0 * 60 + round((y / PX) * (60 / SNAP)) * SNAP));
  };

  // Escape cancels a drag in progress, and so does anything that swallows the button release
  // (switching windows, or a right-click menu opening mid-drag).
  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return;
    const cancel = () => setDragBoth(null);
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") cancel(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", cancel);
    window.addEventListener("contextmenu", cancel);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("blur", cancel); window.removeEventListener("contextmenu", cancel); };
  }, [dragging]);
  // A pen drag on a touch screen would otherwise scroll the page and cancel itself. React's touch listeners
  // are passive, so this one is added by hand; it only blocks scrolling while a drag is in progress.
  useEffect(() => {
    const el = calRef.current;
    if (!el) return;
    const onTouchMove = (ev: TouchEvent) => { if (dragRef.current) ev.preventDefault(); };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  // Mouse and pen: press and drag down a day to pick exactly the time spent. Touch keeps tap-to-add, so swiping still scrolls.
  const onDown = (d: string, i: number) => (ev: PointerEvent<HTMLDivElement>) => {
    lastPointer.current = ev.pointerType;
    if (ev.pointerType === "touch" || ev.button !== 0 || !canAdd(i) || (ev.target as HTMLElement).closest(".ev")) return;
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const anchor = Math.min(H1 * 60 - SNAP, minuteAt(ev.currentTarget, ev.clientY, Math.floor));
    setDragBoth({ date: d, anchor, cur: anchor, y0: ev.clientY, moved: false, pointerId: ev.pointerId });
  };
  const onMove = (ev: PointerEvent<HTMLDivElement>) => {
    const cur = dragRef.current;
    if (!cur || cur.pointerId !== ev.pointerId) return;
    if (ev.pointerType === "mouse" && (ev.buttons & 1) === 0) return setDragBoth(null);
    const moved = cur.moved || Math.abs(ev.clientY - cur.y0) > 6;
    const at = minuteAt(ev.currentTarget, ev.clientY, Math.round);
    if (moved !== cur.moved || at !== cur.cur) setDragBoth({ ...cur, moved, cur: moved ? at : cur.anchor });
  };
  const onUp = (ev: PointerEvent<HTMLDivElement>) => {
    const cur = dragRef.current;
    if (!cur || cur.pointerId !== ev.pointerId) return;
    setDragBoth(null);
    const [start, end] = range(cur);
    // A plain click adds the default hour at that slot; a drag adds exactly the dragged time.
    setEdit(cur.moved ? { date: cur.date, startMin: start, minutes: end - start, ...who } : { date: cur.date, startMin: Math.min(cur.anchor, (H1 - 1) * 60), ...who });
  };

  return (
    <>
      <div className="tablebox">
        <div ref={calRef} className={"cal" + (drag ? " dragging" : "")}>
          <div className="hd" />
          {dates.map((d, i) => (
            <div key={d} className={"hd" + (d === today ? " today" : "")}><span>{DAYS[i]}</span>{" "}<span className="dn">{+d.slice(8)}</span>{marks[i] && <span className={"dmark " + marks[i]!.kind} title={marks[i]!.long}>{marks[i]!.short}</span>}<div className="num" style={{ textAlign: "center", fontWeight: 400 }}>{f(entries.filter((e) => e.date === d).reduce((a, e) => a + e.minutes, 0))}</div>
              {canAdd(i) && <button type="button" className="cal-add" aria-label={`Add time on ${dayLabel(d)}`} onClick={() => setEdit({ date: d, startMin: nextStart(d), ...who })}>+</button>}</div>
          ))}
          <div className="hrs" style={{ height: (H1 - H0) * PX }}>
            {Array.from({ length: H1 - H0 - 1 }, (_, i) => <span key={i} style={{ top: (i + 1) * PX }}>{String(H0 + i + 1).padStart(2, "0")}:00</span>)}
          </div>
          {dates.map((d, i) => (
            <div key={d} className={"col" + (canAdd(i) ? "" : " locked") + (d === today ? " today" : "") + (i > 4 ? " wknd" : "") + (marks[i] ? " " + marks[i]!.kind : "")} style={{ height: (H1 - H0) * PX }}
              onPointerDown={onDown(d, i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDragBoth(null)}
              onLostPointerCapture={(ev) => { if (dragRef.current?.pointerId === ev.pointerId) setDragBoth(null); }}
              onClick={(ev) => {
                // Mouse and pen are handled by the pointer events above; this is the tap on touch screens.
                if (lastPointer.current !== "touch" || !canAdd(i) || (ev.target as HTMLElement).closest(".ev")) return;
                const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                const mins = Math.max(H0 * 60, Math.min((H1 - 1) * 60, H0 * 60 + Math.floor(((ev.clientY - r.top) / PX) * 4) * 15));
                setEdit({ date: d, startMin: mins, ...who });
              }}>
              {drag?.date === d && drag.moved && (() => {
                const [a, b] = range(drag);
                // The label sits just below the block (above it near the bottom of the grid, inside it when the block fills
                // the day) so short drags stay readable. On the last days it lines up on the right to stay on screen.
                const y = b < H1 * 60 - 60 ? { top: (b / 60 - H0) * PX + 3 } : a >= H0 * 60 + 30 ? { bottom: (H1 - a / 60) * PX + 3 } : { top: (a / 60 - H0) * PX + 3 };
                const x = i >= 5 ? { right: 3 } : { left: 3 };
                return (
                  <>
                    <div className="dragsel" style={{ top: (a / 60 - H0) * PX, height: ((b - a) / 60) * PX }} />
                    <div className="draglabel" aria-live="polite" style={{ ...y, ...x }}>
                      {hm(a)} to {hm(b)} · {f(b - a)} h
                    </div>
                  </>
                );
              })()}
              {(() => { const day = entries.filter((e) => e.date === d).sort(byStart); const pos = layout(day.map((e) => ({ ...e, ...drawn(e) }))); return day.map((e) => { const { col, cols } = pos.get(e.id)!; const at = drawn(e); return (
                <button key={e.id} className="ev" title={[e.projectName, `${hm(e.startMin)} to ${hm(e.startMin + e.minutes)} · ${f(e.minutes)} h`, e.description].filter(Boolean).join("\n")}
                  style={{ top: Math.max(0, Math.min((at.startMin / 60 - H0) * PX, (H1 - H0) * PX - 18)), height: Math.max(18, (at.minutes / 60) * PX - 2), borderLeftColor: `var(--${e.color})`, textAlign: "left", left: `calc(${(col / cols) * 100}% + 3px)`, right: "auto", width: `calc(${100 / cols}% - 6px)` }}
                  onClick={() => setEdit(entryForm(e, i))}>
                  <b>{e.projectName}</b><span>{hm(e.startMin)} · {f(e.minutes)}</span>
                </button>
              ); }); })()}
            </div>
          ))}
        </div>
      </div>
      <EntryDialog opts={opts} value={edit} meId={meId} today={today} onClose={() => setEdit(null)} />
    </>
  );
}
