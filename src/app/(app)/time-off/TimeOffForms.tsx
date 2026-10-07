"use client";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { addHoliday, addTimeOff, type TimeOffResult } from "./actions";

/** "Add time off": a button that opens a small form. Managers can pick whose time off it is. */
export function AddTimeOff({ people, meId, today }: { people: SearchOption[]; meId: string; today: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>Add time off</button>
      <dialog ref={ref} className="wide" onClose={() => setOpen(false)} aria-labelledby="to-title">
        {open && <TimeOffForm people={people} meId={meId} today={today} onDone={() => ref.current?.close()} />}
      </dialog>
    </>
  );
}

function TimeOffForm({ people, meId, today, onDone }: { people: SearchOption[]; meId: string; today: string; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<TimeOffResult, FormData>(addTimeOff, null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState("");
  useEffect(() => { if (state?.ok) { onDone(); router.refresh(); } }, [state, onDone, router]);
  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 id="to-title">Add time off</h2>
        <button type="button" className="btn sm" onClick={onDone}>Close</button>
      </div>
      <p className="sub">Days off are taken out of expected hours, so productivity stays fair. Time can still be logged on them.</p>
      <form onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => action(fd)); }}>
        <div className="row">
          {people.length > 1 && (
            <div style={{ flexBasis: "100%" }}>
              <label htmlFor="to-person">Person</label>
              <SearchSelect id="to-person" name="userId" options={people} defaultValue={meId} searchLabel="Search people" />
            </div>
          )}
          <div><label htmlFor="to-from">First day<span className="req"> *</span></label><input id="to-from" type="date" name="from" value={from} onChange={(e) => { setFrom(e.target.value); if (to && e.target.value > to) setTo(""); }} required /></div>
          <div><label htmlFor="to-to">Last day</label><input id="to-to" type="date" name="to" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /><p className="note" style={{ margin: "3px 0 0" }}>Leave empty for one day.</p></div>
          <div>
            <label htmlFor="to-type">Type</label>
            <select id="to-type" name="type" defaultValue="PTO"><option>PTO</option><option>Sick leave</option><option>Other</option></select>
          </div>
          <div style={{ flexBasis: "100%" }}>
            <label className="check"><input type="checkbox" name="half" /> Half days (only half of each day is off)</label>
          </div>
          <div style={{ flexBasis: "100%" }}>
            <label htmlFor="to-note">Note (optional)</label>
            <input id="to-note" name="note" maxLength={200} placeholder="For example: family trip" />
          </div>
        </div>
        {state?.error && <p className="err-text" role="alert">{state.error}</p>}
        <div className="row" style={{ marginTop: 14 }}><button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Add time off"}</button></div>
      </form>
    </div>
  );
}

/** A Remove button that asks first and shows why it failed (a locked date, someone else's time off) right beside it. */
export function RemoveButton({ id, action, what }: { id: string; action: (prev: TimeOffResult, form: FormData) => Promise<TimeOffResult>; what: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button type="button" className="btn sm" disabled={pending} aria-label={`Remove ${what}`}
        onClick={() => {
          if (!window.confirm(`Remove ${what}?`)) return;
          setError("");
          start(async () => {
            const fd = new FormData(); fd.set("id", id);
            const r = await action(null, fd);
            if (r?.ok) router.refresh(); else setError(r?.error ?? "Something went wrong. Try again.");
          });
        }}>{pending ? "Removing…" : "Remove"}</button>
      {error && <p className="err-text" role="alert">{error}</p>}
    </>
  );
}

/** Add a public holiday to an office: one at a time, or several pasted one per line. Admins can add it to every office at once. */
export function HolidayForm({ offices, officeId, today, admin }: { offices: { id: string; name: string }[]; officeId: string; today: string; admin: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<TimeOffResult, FormData>(addHoliday, null);
  useEffect(() => { if (state?.ok) { form.current?.reset(); router.refresh(); } }, [state, router]);
  return (
    <form ref={form} onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => action(fd)); }} style={{ marginTop: 14 }}>
      <h3 style={{ margin: "0 0 8px" }}>Add a public holiday</h3>
      <div className="row">
        <div style={{ flex: "0 1 170px" }}><label htmlFor="ho-date">Date</label><input id="ho-date" type="date" name="date" defaultValue={today} /></div>
        <div style={{ flex: "2 1 220px" }}><label htmlFor="ho-name">Name</label><input id="ho-name" name="name" maxLength={80} placeholder="For example: Diwali" /></div>
        {admin && (
          <div style={{ flex: "1 1 180px" }}>
            <label htmlFor="ho-office">For</label>
            <select id="ho-office" name="locationId" defaultValue={officeId}>
              {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              {offices.length > 1 && <option value="all">All offices</option>}
            </select>
          </div>
        )}
        <div style={{ flex: "0 1 auto", alignSelf: "flex-end" }}><label className="check"><input type="checkbox" name="half" /> Half day</label></div>
        <div style={{ flex: "0 1 auto", alignSelf: "flex-end" }}><button className="btn primary" disabled={pending}>{pending ? "Adding…" : "Add holiday"}</button></div>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary className="linkbtn" style={{ cursor: "pointer" }}>Add several at once</summary>
        <label htmlFor="ho-bulk" style={{ marginTop: 8 }}>One holiday per line: the date, a comma, then the name. Add (half) at the end of a line for a half day. This is used instead of the single holiday above.</label>
        <textarea id="ho-bulk" name="bulk" rows={6} placeholder={"2026-10-20, Diwali\n2026-12-25, Christmas Day\n2026-12-24, Christmas Eve (half)"} />
      </details>
      {state?.error && <p className="err-text" role="alert">{state.error}</p>}
      {state?.ok && state.message && <p className="note" role="status" style={{ margin: "8px 0 0" }}>{state.message}</p>}
    </form>
  );
}
