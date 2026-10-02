"use client";
import { useActionState, useState } from "react";
import { remind, sendBack, type ApproveResult } from "./actions";

export function SendBack({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ApproveResult, FormData>(sendBack, null);
  if (!open) return <button type="button" className="btn bad sm" onClick={() => setOpen(true)}>Send back</button>;
  return (
    <form action={action} className="row" style={{ flexBasis: "100%", marginTop: 10 }}>
      <input type="hidden" name="id" value={id} />
      <div style={{ flex: "2 1 240px" }}><label htmlFor={`rj-${id}`}>Reason for sending back</label><input id={`rj-${id}`} name="reason" placeholder="e.g. Tuesday looks short" autoFocus /></div>
      <button className="btn bad sm" disabled={pending}>Send back</button>
      <button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
      {state?.message && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.message}</p>}
    </form>
  );
}

export function RemindButton({ userId, week }: { userId: string; week: string }) {
  const [state, action, pending] = useActionState<ApproveResult, FormData>(remind, null);
  return (
    <form action={action} style={{ textAlign: "right" }}>
      <input type="hidden" name="userId" value={userId} /><input type="hidden" name="week" value={week} />
      {state?.ok ? <span className="note" role="status">{state.message}</span> : <button className="btn sm" disabled={pending}>Send reminder</button>}
      {state && !state.ok && <p className="err-text" role="alert">{state.message}</p>}
    </form>
  );
}
