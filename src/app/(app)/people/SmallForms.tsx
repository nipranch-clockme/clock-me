"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addOffice, addTeam, deleteOffice, deleteTeam, renameOffice, renameTeam, type PeopleResult } from "./actions";

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

/** One office or team in its list: rename it in place, or delete it (the server says no while people belong to it). */
export function NameRow({ kind, id, name, meta, canEdit, deleteQuestion }: { kind: "office" | "team"; id: string; name: string; meta: string; canEdit: boolean; deleteQuestion: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const [busy, startBusy] = useTransition();
  const save = () => startBusy(async () => {
    const r = kind === "office" ? await renameOffice(id, value) : await renameTeam(id, value);
    if (r?.ok) { setEditing(false); setError(""); } else setError(r?.error ?? "Couldn't rename it.");
  });
  const remove = () => {
    if (!confirm(deleteQuestion)) return;
    startBusy(async () => { const r = kind === "office" ? await deleteOffice(id) : await deleteTeam(id); if (!r?.ok) setError(r?.error ?? "Couldn't delete it."); });
  };
  return (
    <div className="item" style={{ flexWrap: "wrap" }}>
      {editing ? (
        <form className="row" style={{ gap: 6, flex: 1 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input value={value} onChange={(e) => setValue(e.target.value)} aria-label={`New name for ${name}`} autoFocus style={{ maxWidth: 220 }} />
          <button className="btn sm primary" disabled={busy}>Save</button>
          <button type="button" className="btn sm" disabled={busy} onClick={() => { setEditing(false); setValue(name); setError(""); }}>Cancel</button>
        </form>
      ) : (
        <div>{name}<div className="meta">{meta}</div></div>
      )}
      {canEdit && !editing && (
        <div className="row" style={{ flex: "0 0 auto", gap: 6 }}>
          <button type="button" className="btn sm" disabled={busy} onClick={() => setEditing(true)} aria-label={`Rename ${name}`}>Rename</button>
          <button type="button" className="btn sm bad" disabled={busy} onClick={remove} aria-label={`Delete ${name}`}>Delete</button>
        </div>
      )}
      {error && <p className="err-text" role="alert" style={{ flexBasis: "100%", margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
}
