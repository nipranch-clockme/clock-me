"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type FilterOption = { value: string; label: string };

/**
 * One report filter: a button that opens a short list of tick boxes (with a search box when the list is long).
 * The ticks are ordinary form fields, so the surrounding form sends them when "Apply filter" is pressed.
 */
export default function FilterMenu({ name, label, options, selected }: { name: string; label: string; options: FilterOption[]; selected: string[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set(selected));
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  // Keep the list on screen when its button is near the right edge.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    el.style.left = "0"; el.style.right = "auto";
    if (el.getBoundingClientRect().right > window.innerWidth - 8) { el.style.left = "auto"; el.style.right = "0"; }
  }, [open]);

  const flip = (v: string) => setPicked((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  return (
    <div className="fm" ref={box}>
      <button type="button" className={`fm-b${picked.size ? " on" : ""}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}{picked.size > 0 && <span className="fm-n" aria-label={`${picked.size} chosen`}>{picked.size}</span>}
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="fm-p" ref={panel} hidden={!open} role="group" aria-label={`${label} filter`}>
        {options.length > 7 && (
          <input type="search" className="fm-q" placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label.toLowerCase()}`} value={q} autoComplete="off"
            onChange={(e) => { e.stopPropagation(); setQ(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
        )}
        <div className="fm-act">
          <span>{picked.size ? `${picked.size} chosen` : "Nothing chosen: all"}</span>
          {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())}>Clear</button>}
        </div>
        <ul>
          {options.map((o) => (
            <li key={o.value} hidden={!shown.includes(o)}>
              <label><input type="checkbox" name={name} value={o.value} checked={picked.has(o.value)} onChange={() => flip(o.value)} /> <span>{o.label}</span></label>
            </li>
          ))}
        </ul>
        {!shown.length && <p className="note fm-none">{options.length ? `Nothing matches “${q.trim()}”.` : "Nothing to choose from yet."}</p>}
      </div>
    </div>
  );
}
