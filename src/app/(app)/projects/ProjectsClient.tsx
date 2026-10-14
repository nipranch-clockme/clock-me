"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { saveProject, bulkEditProjects, type FormResult } from "./actions";
import SearchSelect from "@/components/SearchSelect";

type Opt = { id: string; name: string };
export type ProjectForm = {
  clients: Opt[]; templates: (Opt & { phases: string[] })[]; locations: Opt[]; teams: Opt[]; users: Opt[];
  managers: (Opt & { role: string })[]; meId: string;
};
export type EditableProject = {
  id: string; name: string; clientId: string; phases: string[]; budget: number | null; access: "PUBLIC" | "RESTRICTED"; archived: boolean;
  locs: string[]; teams: string[]; users: string[]; managers: string[];
};
const DEFAULT_PHASES = ["Submission 1", "Submission 2", "Submission 3", "Submission 4", "Submission 5"];

export default function ProjectsClient({ creator, form, editable, count, admin }: { creator: boolean; canImport: boolean; form: ProjectForm; editable: EditableProject[]; count: number; admin: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const editId = sp.get("edit");
  const open = sp.get("new") === "1" ? "new" : editId && editable.some((p) => p.id === editId) ? editId : null;
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => {
    const q = new URLSearchParams(sp.toString());
    q.delete("edit"); q.delete("new");
    router.replace(q.size ? `${path}?${q}` : path, { scroll: false });
  };
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const newHref = () => { const q = new URLSearchParams(sp.toString()); q.set("new", "1"); return `${path}?${q}`; };
  // The rows are drawn by the server page, so the ticked projects are read from the page itself.
  const [picked, setPicked] = useState<string[]>([]);
  const bulkRef = useRef<HTMLDialogElement>(null);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setPicked([...document.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked')].map((i) => i.value));
    document.addEventListener("change", read);
    return () => document.removeEventListener("change", read);
  }, []);
  const openBulk = () => { setBulkIds(picked); bulkRef.current?.showModal(); };

  return (
    <>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div>
          <h3 style={{ margin: 0 }}>Projects</h3>
          <p className="note" style={{ margin: "2px 0 0" }}>{count} project{count === 1 ? "" : "s"}{creator ? "" : " you've been added to. Projects open to everyone aren't listed, but you can still log time on them."}</p>
        </div>
        {creator && (
          <div className="row" style={{ flex: "0 1 auto", gap: 8 }}>
            {picked.length > 0 && <button type="button" className="btn" onClick={openBulk}>Bulk edit ({picked.length})</button>}
            <button type="button" className="btn primary" onClick={() => router.push(newHref(), { scroll: false })} disabled={!form.clients.length}>New project</button>
          </div>
        )}
      </div>
      {creator && !form.clients.length && <p className="alert info">{admin ? "Add a client below before creating a project." : "An Admin needs to add a client before projects can be created."}</p>}
      <dialog ref={ref} className="wide" onClose={close} aria-labelledby="proj-title">
        {open && <ProjectEditor key={open} form={form} project={open === "new" ? null : editable.find((p) => p.id === open)!} admin={admin} onDone={() => ref.current?.close()} />}
      </dialog>
      <dialog ref={bulkRef} className="wide" aria-labelledby="bulk-title" onClose={() => setBulkIds([])}>
        {bulkIds.length > 0 && <BulkEditor key={bulkIds.join()} ids={bulkIds} form={form} onDone={() => bulkRef.current?.close()} />}
      </dialog>
    </>
  );
}

/** Changes the same things on several projects. Each part is ticked on separately; projects the person doesn't manage are skipped. */
function BulkEditor({ ids, form, onDone }: { ids: string[]; form: ProjectForm; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormResult, FormData>(bulkEditProjects, null);
  const [access, setAccess] = useState("PUBLIC");
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  const box = { maxHeight: 150, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" } as const;
  const n = ids.length;

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 id="bulk-title">Bulk edit {n} project{n === 1 ? "" : "s"}</h2>
        <button type="button" className="btn sm" onClick={onDone}>Close</button>
      </div>
      <p className="note" style={{ margin: "0 0 10px" }}>Tick what you want to change. Projects you don&apos;t manage are skipped.</p>
      <form action={action}>
        {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <div className="bulkrow" style={{ display: "grid", gap: 14 }}>
          <label className="check"><input type="checkbox" name="doClient" /> Client</label>
          <div><label htmlFor="bulk-client" className="sr-only">Client</label>
            <select id="bulk-client" name="clientId" defaultValue="">
              <option value="" disabled>Choose a client</option>
              {form.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <label className="check"><input type="checkbox" name="doAccess" /> Who can see it</label>
          <div>
            <div className="seg" role="group" aria-label="Who can see it">
              <label><input type="radio" name="access" value="PUBLIC" checked={access === "PUBLIC"} onChange={() => setAccess("PUBLIC")} /> Everyone in the company</label>
              <label><input type="radio" name="access" value="RESTRICTED" checked={access === "RESTRICTED"} onChange={() => setAccess("RESTRICTED")} /> Only chosen offices, teams or people</label>
            </div>
            {access === "RESTRICTED" && (
              <>
                <div className="row" style={{ marginTop: 10, alignItems: "flex-start" }}>
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="note">Offices</legend><div style={box}>{form.locations.map((l) => <label key={l.id} className="check"><input type="checkbox" name="loc" value={l.id} /> {l.name}</label>)}</div></fieldset>
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="note">Teams</legend><div style={box}>{form.teams.map((t) => <label key={t.id} className="check"><input type="checkbox" name="team" value={t.id} /> {t.name}</label>)}</div></fieldset>
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="note">People</legend><div style={box}>{form.users.map((u) => <label key={u.id} className="check"><input type="checkbox" name="user" value={u.id} /> {u.name}</label>)}</div></fieldset>
                </div>
                <div className="row" style={{ marginTop: 8, gap: 16 }}>
                  <label className="check"><input type="radio" name="accessMode" value="add" defaultChecked /> Add to existing</label>
                  <label className="check"><input type="radio" name="accessMode" value="overwrite" /> Overwrite existing</label>
                </div>
              </>
            )}
          </div>

          <label className="check"><input type="checkbox" name="doPhases" /> Add phases</label>
          <div><label htmlFor="bulk-phases" className="sr-only">Phases to add</label><input id="bulk-phases" name="addPhases" placeholder="Separate with commas, e.g. Submission 6, Final" /></div>
        </div>
        {state?.error && <p className="err-text" role="alert">{state.error}</p>}
        {state?.ok && state.message && <p role="status">{state.message}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={pending}>{pending ? "Saving…" : `Apply to ${n} project${n === 1 ? "" : "s"}`}</button>
        </div>
      </form>
    </div>
  );
}

function ProjectEditor({ form, project, admin, onDone }: { form: ProjectForm; project: EditableProject | null; admin: boolean; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormResult, FormData>(saveProject, null);
  const [phases, setPhases] = useState((project?.phases ?? DEFAULT_PHASES).join(", "));
  const [access, setAccess] = useState(project?.access ?? "PUBLIC");
  const managers = new Set(project?.managers ?? []);
  useEffect(() => { if (state?.ok) { onDone(); router.refresh(); } }, [state, onDone, router]);
  const box = { maxHeight: 150, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" } as const;

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 id="proj-title">{project ? "Edit project" : "New project"}</h2>
        <button type="button" className="btn sm" onClick={onDone}>Close</button>
      </div>
      <form onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => action(fd)); }}>
        <input type="hidden" name="id" value={project?.id ?? ""} />
        <input type="hidden" name="access" value={access} />
        <div className="row">
          <div><label htmlFor="p-name">Project name<span className="req"> *</span></label><input id="p-name" name="name" defaultValue={project?.name} required /></div>
          <div>
            <label htmlFor="p-client">Client<span className="req"> *</span></label>
            <SearchSelect id="p-client" name="clientId" defaultValue={project?.clientId ?? ""} required placeholder="Choose a client" searchLabel="Search clients"
              options={form.clients.map((c) => ({ value: c.id, label: c.name }))} />
          </div>
          {!project && (
            <div>
              <label htmlFor="p-tpl">Start from template</label>
              <select id="p-tpl" defaultValue="" onChange={(e) => { const t = form.templates.find((x) => x.id === e.target.value); setPhases((t?.phases ?? DEFAULT_PHASES).join(", ")); }}>
                <option value="">Blank</option>
                {form.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div><label htmlFor="p-budget">Budget (hours)</label><input id="p-budget" name="budget" type="number" min="0" step="1" defaultValue={project?.budget ?? ""} placeholder="Optional" /></div>
          <div style={{ flexBasis: "100%" }}>
            <label htmlFor="p-phases">Phases<span className="req"> *</span></label>
            <input id="p-phases" name="phases" value={phases} onChange={(e) => setPhases(e.target.value)} />
            <p className="note" style={{ margin: "4px 0 0" }}>Separate with commas. People pick one of these on every entry.</p>
          </div>
        </div>

        <h3 style={{ marginTop: 16 }}>Who can see and log time on it</h3>
        <div className="seg" role="group" aria-label="Project access">
          <button type="button" aria-pressed={access === "PUBLIC"} onClick={() => setAccess("PUBLIC")}>Everyone in the company</button>
          <button type="button" aria-pressed={access === "RESTRICTED"} onClick={() => setAccess("RESTRICTED")}>Only chosen offices, teams or people</button>
        </div>
        {access === "RESTRICTED" && (
          <div className="row" style={{ marginTop: 10, alignItems: "flex-start" }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="note">Offices (everyone there)</legend>
              <div style={box}>{form.locations.map((l) => <label key={l.id} className="check"><input type="checkbox" name="loc" value={l.id} defaultChecked={project?.locs.includes(l.id)} /> {l.name}</label>)}</div>
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="note">Teams</legend>
              <div style={box}>{form.teams.map((t) => <label key={t.id} className="check"><input type="checkbox" name="team" value={t.id} defaultChecked={project?.teams.includes(t.id)} /> {t.name}</label>)}</div>
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="note">People</legend>
              <div style={box}>{form.users.map((u) => <label key={u.id} className="check"><input type="checkbox" name="user" value={u.id} defaultChecked={project?.users.includes(u.id)} /> {u.name}</label>)}</div>
            </fieldset>
          </div>
        )}

        <h3 style={{ marginTop: 16 }}>Managers</h3>
        <p className="note" style={{ margin: "0 0 6px" }}>{admin ? "Managers can edit this project." : "You'll be a manager of this project. Managers can edit it."}</p>
        <div style={box}>
          {form.managers.map((m) => (
            <label key={m.id} className="check">
              <input type="checkbox" name="manager" value={m.id} defaultChecked={managers.has(m.id) || (!project && !admin && m.id === form.meId)} disabled={!admin && m.id === form.meId} /> {m.name} <span className="note" style={{ marginLeft: 6 }}>{m.role}</span>
            </label>
          ))}
        </div>

        {project && <label className="check" style={{ marginTop: 12 }}><input type="checkbox" name="archived" defaultChecked={project.archived} /> Archived (hidden from entry forms, kept in reports)</label>}
        {state?.error && <p className="err-text" role="alert">{state.error}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={pending}>{pending ? "Saving…" : project ? "Save changes" : "Create project"}</button>
        </div>
      </form>
    </div>
  );
}
