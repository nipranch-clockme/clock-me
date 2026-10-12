"use client";
import { useActionState, useState } from "react";
import { approveTimeOff, declineTimeOff, type TimeOffResult } from "../time-off/actions";

export function ApproveTimeOff({ id }: { id: string }) {
  const [state, action, pending] = useActionState<TimeOffResult, FormData>(approveTimeOff, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button className="btn ok sm" disabled={pending}>{pending ? "Approving…" : "Approve"}</button>
      {state && !state.ok && <p className="err-text" role="alert">{state.error}</p>}
    </form>
  );
}

export function DeclineTimeOff({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<TimeOffResult, FormData>(declineTimeOff, null);
  if (!open) return <button type="button" className="btn bad sm" onClick={() => setOpen(true)}>Decline</button>;
  return (
    <form action={action} className="row" style={{ flexBasis: "100%", marginTop: 10 }}>
      <input type="hidden" name="id" value={id} />
      <div style={{ flex: "2 1 240px" }}><label htmlFor={`dn-${id}`}>Reason (optional, they will see it)</label><input id={`dn-${id}`} name="note" maxLength={200} autoFocus /></div>
      <button className="btn bad sm" disabled={pending}>{pending ? "Declining…" : "Decline"}</button>
      <button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
      {state && !state.ok && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.error}</p>}
    </form>
  );
}
