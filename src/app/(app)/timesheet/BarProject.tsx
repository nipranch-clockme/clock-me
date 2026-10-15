"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type BarProjectOpt = { value: string; label: string; group: string };

/** The project dropdown on the timer bar. The button shows the chosen project; its pop-up has a search box at the top, with the projects that match under it. */
export default function BarProject({ value, options, onChange, invalid }: {
  value: string; options: BarProjectOpt[]; onChange: (v: string) => void; invalid: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const qRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const chosen = options.find((o) => o.value === value);
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => `${o.label} ${o.group}`.toLowerCase().includes(needle)) : options;
  const close = () => { if (ref.current) ref.current.open = false; };
  // After a pick, focus returns to the button, so the keyboard stays on the bar.
  const pick = (v: string) => { onChange(v); setQ(""); close(); ref.current?.querySelector("summary")?.focus(); };
  // The pop-up closes when a click goes somewhere else on the page.
  useEffect(() => {
    const away = (e: PointerEvent) => { const d = ref.current; if (d?.open && !d.contains(e.target as Node)) d.open = false; };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);
  const onKey = (e: KeyboardEvent<HTMLDetailsElement>) => {
    if (e.key === "Escape" && ref.current?.open) { e.preventDefault(); close(); ref.current.querySelector("summary")?.focus(); }
  };
  // Enter picks the first match once something is typed, and never submits the bar; the arrow key moves into the list.
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); if (needle && shown[0]) pick(shown[0].value); }
    if (e.key === "ArrowDown") { e.preventDefault(); e.currentTarget.parentElement?.querySelector<HTMLElement>(".tmpick-opt")?.focus(); }
  };
  return (
    <>
      <input type="hidden" id="tm-project" name="projectId" value={value} />
      <details ref={ref} className={`tmpick${invalid ? " err" : ""}`} onKeyDown={onKey}
        onToggle={(e) => { if (e.currentTarget.open) qRef.current?.focus(); }}
        onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false; }}>
        <summary id="tm-project-btn" aria-label={chosen ? `Project: ${chosen.label}` : "Project"}>{chosen ? chosen.label : "+ Project"}</summary>
        <div className="tmpick-pop">
          <input ref={qRef} type="search" className="tmpick-q" placeholder="Search projects" aria-label="Search projects" autoComplete="off"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} />
          <div className="tmpick-list">
            {shown.map((o) => (
              <button key={o.value} type="button" className={`tmpick-opt${o.value === value ? " on" : ""}`} aria-pressed={o.value === value} onClick={() => pick(o.value)}>
                <span>{o.label}</span><small>{o.group}</small>
              </button>
            ))}
            {!shown.length && <p className="note">No project matches “{q.trim()}”.</p>}
          </div>
        </div>
      </details>
    </>
  );
}
