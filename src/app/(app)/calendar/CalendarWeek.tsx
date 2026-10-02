"use client";
import { useState } from "react";
import EntryDialog from "@/components/EntryDialog";
import type { EntryOptions, EntryValue } from "@/components/entryTypes";

type CalEntry = { id: string; projectId: string; projectName: string; color: string; phaseId: string | null; tagId: string | null; description: string; custom: Record<string, string>; date: string; startMin: number; minutes: number };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const H0 = 7, H1 = 20, PX = 40;
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default function CalendarWeek({ opts, dates, entries, today, editable, locked, ownerName }: { opts: EntryOptions; dates: string[]; entries: CalEntry[]; today: string; editable: boolean; locked: (string | null)[]; ownerName: string }) {
  const [edit, setEdit] = useState<EntryValue | null>(null);
  const f = (m: number) => opts.timeFormat === "hhmm" ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : (m / 60).toFixed(2);
  return (
    <>
      <div className="tablebox">
        <div className="cal">
          <div className="hd" />
          {dates.map((d, i) => (
            <div key={d} className={"hd" + (d === today ? " today" : "")}>{DAYS[i]} {+d.slice(8)}<div className="num" style={{ textAlign: "center", fontWeight: 400 }}>{f(entries.filter((e) => e.date === d).reduce((a, e) => a + e.minutes, 0))}</div></div>
          ))}
          <div className="hrs" style={{ height: (H1 - H0) * PX }}>
            {Array.from({ length: H1 - H0 - 1 }, (_, i) => <span key={i} style={{ top: (i + 1) * PX }}>{String(H0 + i + 1).padStart(2, "0")}:00</span>)}
          </div>
          {dates.map((d, i) => (
            <div key={d} className={"col" + (locked[i] || !editable ? " locked" : "")} style={{ height: (H1 - H0) * PX }}
              onClick={(ev) => {
                if (!editable || locked[i] || (ev.target as HTMLElement).closest(".ev")) return;
                const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                const mins = Math.max(H0 * 60, Math.min((H1 - 1) * 60, H0 * 60 + Math.floor(((ev.clientY - r.top) / PX) * 4) * 15));
                setEdit({ date: d, startMin: mins });
              }}>
              {entries.filter((e) => e.date === d).map((e) => (
                <button key={e.id} className="ev" style={{ top: Math.max(0, (e.startMin / 60 - H0) * PX), height: Math.max(18, (e.minutes / 60) * PX - 2), borderLeftColor: `var(--${e.color})`, textAlign: "left" }}
                  onClick={() => setEdit({ ...e, readOnly: !editable, lockedReason: editable ? locked[i] : null, ownerName: editable ? undefined : ownerName })}>
                  <b>{e.projectName}</b><span>{hm(e.startMin)} · {f(e.minutes)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <EntryDialog opts={opts} value={edit} onClose={() => setEdit(null)} />
    </>
  );
}
