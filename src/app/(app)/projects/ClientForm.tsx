"use client";
import { useActionState, useEffect, useRef } from "react";
import { addClient } from "./actions";

export default function ClientForm() {
  const [state, action, pending] = useActionState(addClient, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="row" style={{ marginTop: 10 }}>
      <div><label htmlFor="nc-name">New client</label><input id="nc-name" name="name" placeholder="e.g. Greenleaf Foods" /></div>
      <button className="btn" disabled={pending}>Add client</button>
      {state?.error && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.error}</p>}
    </form>
  );
}
