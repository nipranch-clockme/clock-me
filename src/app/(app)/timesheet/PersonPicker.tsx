"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Switches the Timesheet or Calendar to another person, keeping the week. Your own week is the one with no `u` in the address.
 *  Names are shown as given: the page adds the office to shared names and "you" to yours, in one pair of brackets ("Sam Rivera (AMD, you)").
 *  A button shows who is chosen and opens the list in a box with a search, so picking someone is one press away. */
export default function PersonPicker({ people, current, meId, offset, view = "cal", label = "Showing" }: { people: { id: string; name: string }[]; current: string; meId: string; offset: number; view?: "sheet" | "cal"; label?: string }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? people.filter((p) => p.name.toLowerCase().includes(needle)) : people;
  const who = people.find((p) => p.id === current)?.name ?? "";
  const go = (v: string) => {
    dlg.current?.close();
    const sp = new URLSearchParams();
    if (view === "cal") sp.set("view", "cal");
    if (offset) sp.set("w", String(offset));
    if (v !== meId) sp.set("u", v);
    router.push(`/timesheet${sp.size ? `?${sp}` : ""}`);
  };
  return (
    <div className="whose">
      <span className="whose-label">{label}</span>
      <button type="button" className="btn whose-btn" aria-haspopup="dialog" aria-controls={`${id}-dlg`} onClick={() => { setQ(""); dlg.current?.showModal(); }}>
        <span>{who}</span><span className="whose-caret" aria-hidden="true">▾</span>
      </button>
      <dialog ref={dlg} id={`${id}-dlg`} className="narrow" aria-labelledby={`${id}-t`}>
        <div className="panel">
          <h2 id={`${id}-t`}>{label}</h2>
          <input type="search" className="ssel-q" placeholder="Search people" aria-label="Search people" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
          <ul className="whose-list">
            {shown.map((p) => (
              <li key={p.id}><button type="button" className="whose-opt" aria-current={p.id === current ? "true" : undefined} onClick={() => go(p.id)}>{p.name}</button></li>
            ))}
          </ul>
          {!shown.length && <p className="note">No one matches that search.</p>}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
