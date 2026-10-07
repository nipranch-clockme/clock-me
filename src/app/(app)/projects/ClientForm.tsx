"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientType } from "@prisma/client";
import { addClient, updateClient, type FormResult } from "./actions";

export type TeamOpt = { id: string; label: string };
export type ContactInput = { name: string; email: string; phone: string };
type EditableClient = { id: string; name: string; type: ClientType; monthlyHours: number | null; teamId: string | null; contacts: ContactInput[] };
const TYPE_HELP = "Fixed monthly hours: the client agreed to a set number of hours each month, and the Clients tab shows how much of it is used. No commitment: work as it comes, with no set hours.";

// Submitting by hand keeps what was typed if the server sends back an error (a plain form action would clear it).
const submit = (ev: React.FormEvent<HTMLFormElement>, action: (fd: FormData) => void) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => action(fd)); };

/** Type picker, plus the contracted hours box for fixed clients. */
function ContractFields({ id, type, setType, hours }: { id: string; type: ClientType; setType: (t: ClientType) => void; hours?: number | null }) {
  return <>
    <div>
      <label htmlFor={`${id}-type`}>Type</label>
      <select id={`${id}-type`} name="type" value={type} onChange={(e) => setType(e.target.value === "FIXED" ? "FIXED" : "FLOATING")}>
        <option value="FLOATING">No commitment</option>
        <option value="FIXED">Fixed monthly hours</option>
      </select>
    </div>
    {type === "FIXED" && <div><label htmlFor={`${id}-hours`}>Contracted hours per month<span className="req"> *</span></label><input id={`${id}-hours`} name="monthlyHours" type="number" min="0" step="any" inputMode="decimal" defaultValue={hours ?? ""} placeholder="e.g. 120" required /></div>}
  </>;
}

/** The team that looks after the client, and any number of points of contact. */
function TeamAndContacts({ id, teams, teamId, contacts }: { id: string; teams: TeamOpt[]; teamId?: string | null; contacts?: ContactInput[] }) {
  const [rows, setRows] = useState<ContactInput[]>(contacts?.length ? contacts : [{ name: "", email: "", phone: "" }]);
  const set = (i: number, k: keyof ContactInput, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return <>
    <div style={{ flexBasis: "100%" }}>
      <label htmlFor={`${id}-team`}>Team</label>
      <select id={`${id}-team`} name="teamId" defaultValue={teamId ?? ""}>
        <option value="">No team assigned</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </div>
    <fieldset className="ctype" style={{ flexBasis: "100%" }}>
      <legend>Points of contact</legend>
      {rows.map((r, i) => (
        <div className="row pocrow" key={i} style={{ alignItems: "flex-end", marginBottom: 6 }}>
          <div style={{ flex: "2 1 150px" }}><label htmlFor={`${id}-cn${i}`}>Name</label><input id={`${id}-cn${i}`} name="contactName" maxLength={80} value={r.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Contact name" /></div>
          <div style={{ flex: "2 1 170px" }}><label htmlFor={`${id}-ce${i}`}>Email</label><input id={`${id}-ce${i}`} name="contactEmail" type="email" maxLength={120} value={r.email} onChange={(e) => set(i, "email", e.target.value)} placeholder="name@client.com" /></div>
          <div style={{ flex: "1 1 120px" }}><label htmlFor={`${id}-cp${i}`}>Phone</label><input id={`${id}-cp${i}`} name="contactPhone" maxLength={30} value={r.phone} onChange={(e) => set(i, "phone", e.target.value)} placeholder="+1 555 0100" /></div>
          <button type="button" className="btn sm bad" aria-label={`Remove contact ${i + 1}`} onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ name: "", email: "", phone: "" }])}>Remove</button>
        </div>
      ))}
      <button type="button" className="linkbtn" onClick={() => setRows([...rows, { name: "", email: "", phone: "" }])}>Add another contact</button>
    </fieldset>
  </>;
}

export default function ClientForm({ teams, onAdded }: { teams: TeamOpt[]; onAdded?: () => void }) {
  const [state, action, pending] = useActionState(addClient, null);
  const [type, setType] = useState<ClientType>("FLOATING");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setType("FLOATING"); onAdded?.(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form ref={ref} onSubmit={(ev) => submit(ev, action)} className="row" style={{ marginTop: 10 }}>
      <div><label htmlFor="nc-name">New client</label><input id="nc-name" name="name" placeholder="e.g. Greenleaf Foods" /></div>
      <ContractFields id="nc" type={type} setType={setType} />
      <TeamAndContacts key={String(state?.ok)} id="nc" teams={teams} />
      <button className="btn primary" disabled={pending}>Add client</button>
      {state?.error && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.error}</p>}
      <p className="note" style={{ flexBasis: "100%", margin: 0 }}>{TYPE_HELP}</p>
    </form>
  );
}

/** Admins change a client's type and contracted hours here. */
export function EditClient({ client, teams }: { client: EditableClient; teams: TeamOpt[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return <>
    <button type="button" className="btn sm" onClick={() => setOpen(true)} aria-label={`Edit ${client.name}`}>Edit</button>
    <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby={`ec-${client.id}-title`}>
      {open && <EditClientForm client={client} teams={teams} onDone={() => ref.current?.close()} />}
    </dialog>
  </>;
}

function EditClientForm({ client, teams, onDone }: { client: EditableClient; teams: TeamOpt[]; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormResult, FormData>(updateClient, null);
  const [type, setType] = useState<ClientType>(client.type);
  useEffect(() => { if (state?.ok) { onDone(); router.refresh(); } }, [state, onDone, router]);
  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 id={`ec-${client.id}-title`}>Edit {client.name}</h2>
        <button type="button" className="btn sm" onClick={onDone}>Close</button>
      </div>
      <form onSubmit={(ev) => submit(ev, action)}>
        <input type="hidden" name="id" value={client.id} />
        <div className="row"><ContractFields id={`ec-${client.id}`} type={type} setType={setType} hours={client.monthlyHours} /><TeamAndContacts id={`ec-${client.id}`} teams={teams} teamId={client.teamId} contacts={client.contacts} /></div>
        <p className="note" style={{ margin: "8px 0 0" }}>{TYPE_HELP}</p>
        {state?.error && <p className="err-text" role="alert">{state.error}</p>}
        <div className="row" style={{ marginTop: 14 }}><button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>
      </form>
    </div>
  );
}

/** "Add client" button for the Clients page: the same form in a dialog. */
export function AddClientButton({ teams }: { teams: TeamOpt[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return <>
    <button type="button" className="btn primary" onClick={() => setOpen(true)}>Add client</button>
    <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby="ac-title">
      {open && <div className="panel"><div className="row between"><h2 id="ac-title">Add a client</h2><button type="button" className="btn sm" onClick={() => ref.current?.close()}>Close</button></div><ClientForm teams={teams} onAdded={() => ref.current?.close()} /></div>}
    </dialog>
  </>;
}
