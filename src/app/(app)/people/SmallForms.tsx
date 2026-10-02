"use client";
import { useActionState, useEffect, useRef } from "react";
import { addOffice, addTeam, type PeopleResult } from "./actions";

function useResetOnOk(state: PeopleResult) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return ref;
}

export function OfficeForm() {
  const [state, action, pending] = useActionState(addOffice, null);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="row" style={{ marginTop: 10 }}>
      <div><label htmlFor="no-name">New office</label><input id="no-name" name="name" placeholder="e.g. Toronto" /></div>
      <button className="btn" disabled={pending}>Add office</button>
      {state?.error && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.error}</p>}
    </form>
  );
}

export function TeamForm({ locations, admin }: { locations: { id: string; name: string }[]; admin: boolean }) {
  const [state, action, pending] = useActionState(addTeam, null);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="row" style={{ marginTop: 10 }}>
      <div><label htmlFor="nt-name">New team</label><input id="nt-name" name="name" placeholder="e.g. Marketing" /></div>
      {admin && <div><label htmlFor="nt-loc">Office</label><select id="nt-loc" name="locationId">{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
      <button className="btn" disabled={pending}>Add team</button>
      {state?.error && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.error}</p>}
    </form>
  );
}
