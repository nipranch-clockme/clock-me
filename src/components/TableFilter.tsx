"use client";
import { useRef } from "react";

/** A search box that hides the rows of the table right below it that don't contain the typed words. */
export default function TableFilter({ label = "Search", placeholder = "Search…" }: { label?: string; placeholder?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const apply = (q: string) => {
    const box = ref.current?.closest(".tfilter")?.nextElementSibling;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    box?.querySelectorAll("tbody tr").forEach((tr) => {
      const el = tr as HTMLElement;
      if (el.querySelector("td.empty")) return;
      const ok = words.every((w) => (el.textContent ?? "").toLowerCase().includes(w));
      el.hidden = !ok; if (ok) shown++;
    });
    const none = ref.current?.closest(".tfilter")?.querySelector(".tf-none") as HTMLElement | null;
    if (none) none.hidden = !words.length || shown > 0;
  };
  return (
    <div className="tfilter">
      <label className="sr-only" htmlFor="tf-q">{label}</label>
      <input id="tf-q" ref={ref} type="search" placeholder={placeholder} autoComplete="off" onChange={(e) => apply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
      <span className="note tf-none" hidden>Nothing matches.</span>
    </div>
  );
}
