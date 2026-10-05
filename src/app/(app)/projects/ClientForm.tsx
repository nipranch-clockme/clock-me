"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientType } from "@prisma/client";
import { addClient, updateClient, type FormResult } from "./actions";

type EditableClient = { id: string; name: string; type: ClientType; monthlyHours: number | null };
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

export default function ClientForm() {
  const [state, action, pending] = useActionState(addClient, null);
  const [type, setType] = useState<ClientType>("FLOATING");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setType("FLOATING"); } }, [state]);
  return (
    <form ref={ref} onSubmit={(ev) => submit(ev, action)} className="row" style={{ marginTop: 10 }}>
      <div><label htmlFor="nc-name">New client</label><input id="nc-name" name="name" placeholder="e.g. Greenleaf Foods" /></div>
      <ContractFields id="nc" type={type} setType={setType} />
      <button className="btn" disabled={pending}>Add client</button>
      {state?.error && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.error}</p>}
      <p className="note" style={{ flexBasis: "100%", margin: 0 }}>{TYPE_HELP}</p>
    </form>
  );
}

/** Admins change a client's type and contracted hours here. */
export function EditClient({ client }: { client: EditableClient }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return <>
    <button type="button" className="btn sm" onClick={() => setOpen(true)} aria-label={`Edit ${client.name}`}>Edit</button>
    <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby={`ec-${client.id}-title`}>
      {open && <EditClientForm client={client} onDone={() => ref.current?.close()} />}
    </dialog>
  </>;
}

function EditClientForm({ client, onDone }: { client: EditableClient; onDone: () => void }) {
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
        <div className="row"><ContractFields id={`ec-${client.id}`} type={type} setType={setType} hours={client.monthlyHours} /></div>
        <p className="note" style={{ margin: "8px 0 0" }}>{TYPE_HELP}</p>
        {state?.error && <p className="err-text" role="alert">{state.error}</p>}
        <div className="row" style={{ marginTop: 14 }}><button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>
      </form>
    </div>
  );
}
