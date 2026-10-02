"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveEntry, deleteEntry, type EntryResult } from "@/app/(app)/timesheet/actions";
import type { EntryOptions, EntryValue } from "./entryTypes";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dur = (m: number | undefined, f: "decimal" | "hhmm") => (m == null ? (f === "hhmm" ? "1:00" : "1.00") : f === "hhmm" ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : (m / 60).toFixed(2));

export default function EntryDialog({ opts, value, onClose }: { opts: EntryOptions; value: EntryValue | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (value && !d.open) d.showModal();
    if (!value && d.open) d.close();
  }, [value]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="entry-title">
      {value && <EntryForm key={(value.id ?? "") + value.date + (value.startMin ?? "")} opts={opts} value={value} onDone={() => ref.current?.close()} />}
    </dialog>
  );
}

function EntryForm({ opts, value, onDone }: { opts: EntryOptions; value: EntryValue; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<EntryResult, FormData>(saveEntry, null);
  const [projectId, setProjectId] = useState(value.projectId ?? opts.projects[0]?.id ?? "");
  const project = opts.projects.find((p) => p.id === projectId);
  const bad = (k: string) => (state?.fields?.includes(k) ? "err" : undefined);
  const ro = !!value.readOnly || !!value.lockedReason;
  useEffect(() => { if (state?.ok) { onDone(); router.refresh(); } }, [state, onDone, router]);
  const clients = [...new Set(opts.projects.map((p) => p.client))];

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 id="entry-title">{value.id ? (ro ? "Time entry" : "Edit time") : "Add time"}</h2>
        <button type="button" className="btn sm" onClick={onDone}>Close</button>
      </div>
      {value.ownerName && <p className="sub">{value.ownerName}</p>}
      {value.lockedReason && <p className="alert info">{value.lockedReason}</p>}
      {!ro && <p className="sub">Required fields are marked *</p>}
      <form onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => action(fd)); }}>
        <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
          <input type="hidden" name="id" value={value.id ?? ""} />
          <div className="row">
            <div style={{ flexBasis: "100%" }}>
              <label htmlFor="e-project">Project<span className="req"> *</span></label>
              <select id="e-project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={bad("projectId")}>
                {value.projectId && !opts.projects.some((p) => p.id === value.projectId) && <option value={value.projectId}>{value.projectName ?? "Other project"}</option>}
                {clients.map((c) => (
                  <optgroup key={c} label={c}>
                    {opts.projects.filter((p) => p.client === c).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="e-phase">Phase<span className="req"> *</span></label>
              <select id="e-phase" name="phaseId" key={projectId} defaultValue={project?.phases.some((p) => p.id === value.phaseId) ? value.phaseId ?? "" : ""} className={bad("Phase")}>
                <option value="">Choose a phase</option>
                {project?.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="e-tag">Tag{opts.requireTag && <span className="req"> *</span>}</label>
              <select id="e-tag" name="tagId" defaultValue={value.tagId ?? ""} className={bad("Tag")}>
                <option value="">No tag</option>
                {opts.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {opts.fields.map((f) => (
              <div key={f.id}>
                <label htmlFor={"e-cf-" + f.id}>{f.name}{f.required && <span className="req"> *</span>}</label>
                {f.type === "select" ? (
                  <select id={"e-cf-" + f.id} name={"cf_" + f.id} defaultValue={value.custom?.[f.id] ?? ""} className={bad(f.name)}>
                    <option value="">Choose</option>
                    {f.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id={"e-cf-" + f.id} name={"cf_" + f.id} defaultValue={value.custom?.[f.id] ?? ""} className={bad(f.name)} />
                )}
              </div>
            ))}
            <div style={{ flexBasis: "100%" }}>
              <label htmlFor="e-desc">Description{opts.requireDescription && <span className="req"> *</span>}</label>
              <input id="e-desc" name="description" defaultValue={value.description ?? ""} placeholder="What did you work on?" className={bad("Description")} />
            </div>
            <div><label htmlFor="e-date">Date</label><input id="e-date" type="date" name="date" defaultValue={value.date} required /></div>
            <div><label htmlFor="e-start">Start</label><input id="e-start" type="time" name="start" defaultValue={hhmm(value.startMin ?? 540)} /></div>
            <div><label htmlFor="e-dur">Duration</label><input id="e-dur" name="duration" defaultValue={dur(value.minutes, opts.timeFormat)} placeholder="1.5 or 1:30" className={bad("duration")} /></div>
          </div>
        </fieldset>
        {state?.error && <p className="err-text" role="alert">{state.error}</p>}
        {!ro && (
          <div className="row between" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={pending}>{pending ? "Saving…" : value.id ? "Save changes" : "Add entry"}</button>
            {value.id && (
              <button type="button" className="btn bad" onClick={async () => { const fd = new FormData(); fd.set("id", value.id!); await deleteEntry(fd); onDone(); router.refresh(); }}>Delete entry</button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
