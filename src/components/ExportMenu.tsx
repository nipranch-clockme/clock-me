"use client";
import { useEffect, useRef, useState } from "react";

/** "Export" button: a short menu to download the report as a CSV file or print it (or save it as a PDF from the print window). */
export default function ExportMenu({ csvHref }: { csvHref: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="xm" ref={box}>
      <button type="button" className="btn xm-b" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Export
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="xm-p" hidden={!open}>
        <a href={csvHref} onClick={() => setOpen(false)}>Save as CSV<small>Opens in Excel or Google Sheets</small></a>
        <button type="button" onClick={() => { setOpen(false); setTimeout(() => window.print(), 50); }}>Print or save as PDF<small>Prints this page as you see it</small></button>
      </div>
    </div>
  );
}
