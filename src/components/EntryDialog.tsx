"use client";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { saveEntry, deleteEntry, type DeleteResult, type EntryResult } from "@/app/(app)/timesheet/actions";
import type { EntryOptions, EntryValue } from "./entryTypes";
import SearchSelect from "@/components/SearchSelect";
import TagPicker from "@/components/TagPicker";
import { DESCRIPTION_MAX, parseDuration } from "@/lib/format";
import { addDays, monday } from "@/lib/dates";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dur = (m: number | undefined, f: "decimal" | "hhmm") => (m == null ? (f === "hhmm" ? "1:00" : "1.00") : f === "hhmm" ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : (m / 60).toFixed(2));
const SAVE_FAILED = "Couldn't save. Check your connection and try again.";
const DELETE_FAILED = "Couldn't delete. Check your connection and try again.";

/** The last day the date picker offers: the end of the current week. Without the company's date it goes from the browser's, a day ahead so
 *  nobody behind the company's time zone is stopped early. The server checks the exact rule either way. */
function lastDay(today?: string) {
  const d = new Date(Date.now() + 864e5);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return addDays(monday(today ?? local), 6);
}

/** saveEntry, with a request that fails on the way (no connection, or too large to send) shown as a message instead of crashing the page. */
async function save(prev: EntryResult, fd: FormData): Promise<EntryResult> {
  try {
    return await saveEntry(prev, fd);
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: SAVE_FAILED };
  }
}

// Without scrolling, so a mouse user who deleted an entry low on the page isn't thrown back to the top.
const focusHeading = () => document.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });

/** `value.ownerId` is set when the time belongs to someone else (a location manager or admin adding or changing it on their behalf). It is fixed when the form opens, so the person shown is the person saved.
 *  `today` (the company's date) sets the last date the picker offers. */
export default function EntryDialog({ opts, value, onClose, onSaved, today }: { opts: EntryOptions; value: EntryValue | null; onClose: () => void; onSaved?: () => void; today?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Focus goes back to whatever opened the dialog. A deleted entry's button leaves the page, so then the page heading takes focus.
  const opener = useRef<HTMLElement | null>(null);
  const deleted = useRef(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (value && !d.open) {
      const a = document.activeElement;
      opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
      deleted.current = false;
      d.showModal();
      // showModal focuses the first button (Close), so start on the first field: Project when it's shown, otherwise Phase.
      const first = d.querySelector<HTMLElement>("#e-project, #e-phase");
      if (first && !first.matches(":disabled")) first.focus();
    }
    if (!value && d.open) d.close();
  }, [value]);
  // The deleted entry's button can go after the dialog has closed (when the page refreshes), taking focus with it.
  useEffect(() => {
    if (value || !deleted.current || !opener.current || opener.current.isConnected) return;
    deleted.current = false;
    if (!document.activeElement || document.activeElement === document.body) focusHeading();
  });
  // The browser has usually put focus back already, and a save may have moved it on purpose (the Timer goes to its description), so
  // only step in when focus was lost.
  const restoreFocus = () => {
    const el = opener.current;
    const a = document.activeElement;
    if (el && !el.isConnected) focusHeading();
    else if (el && (!a || a === document.body || ref.current?.contains(a))) el.focus();
  };
  return (
    <dialog ref={ref} className="wide" onClose={() => { restoreFocus(); onClose(); }} aria-labelledby="entry-title">
      {value && <EntryForm key={(value.id ?? "") + value.date + (value.startMin ?? "") + (value.ownerId ?? "")} opts={opts} value={value} today={today} onDone={() => ref.current?.close()} onSaved={onSaved} onDeleted={() => { deleted.current = true; }} />}
    </dialog>
  );
}

function EntryForm({ opts, value, today, onDone, onSaved, onDeleted }: { opts: EntryOptions; value: EntryValue; today?: string; onDone: () => void; onSaved?: () => void; onDeleted: () => void }) {
  const ownerId = value.ownerId;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<EntryResult, FormData>(save, null);
  const [projectId, setProjectId] = useState(value.projectId ?? opts.projects[0]?.id ?? "");
  const project = opts.projects.find((p) => p.id === projectId);
  const fe = state?.fieldErrors ?? {};
  const bad = (k: string) => (fe[k] || state?.fields?.includes(k) ? "err" : undefined);
  // An invalid field is marked and linked to the message under it.
  const invalid = (k: string, id: string) => (fe[k] ? { "aria-invalid": true, "aria-describedby": id + "-err" } : {});
  const errLine = (k: string, id: string) => fe[k] && <p className="fielderr" id={id + "-err"}>{fe[k]}</p>;
  const ro = !!value.readOnly || !!value.lockedReason;
  // An existing entry may sit on a phase the project manager has since removed: show it so it can be kept.
  const keepOldPhase = !!value.id && !!value.phaseId && !!value.phaseName && !project?.phases.some((p) => p.id === value.phaseId);
  useEffect(() => { if (state?.ok) { onDone(); onSaved?.(); router.refresh(); } }, [state, onDone, onSaved, router]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [delError, setDelError] = useState("");
  const keepRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  // The question replaces the Delete entry button, so focus moves to Keep, and back to Delete entry when it's answered.
  useEffect(() => {
    if (confirming) { asked.current = true; keepRef.current?.focus(); }
    else if (asked.current) { asked.current = false; deleteRef.current?.focus(); }
  }, [confirming]);

  // After a failed save: SearchSelect and TagPicker take no ARIA props, so their controls are linked to their messages here. Then focus moves
  // to the first field with a problem.
  useEffect(() => {
    const form = formRef.current;
    if (!form || !state || state.ok) return;
    const fields = state.fieldErrors ?? {};
    const proj = form.querySelector("#e-project");
    if (proj && fields.projectId) { proj.setAttribute("aria-invalid", "true"); proj.setAttribute("aria-describedby", "e-project-err"); }
    else if (proj) { proj.removeAttribute("aria-invalid"); proj.removeAttribute("aria-describedby"); }
    const tags = form.querySelector("fieldset.tagpick");
    const describedBy = [opts.tags.length ? "e-tag-h" : "", fields.Tags ? "e-tag-err" : ""].filter(Boolean).join(" ");
    if (tags && describedBy) tags.setAttribute("aria-describedby", describedBy);
    else if (tags) tags.removeAttribute("aria-describedby");
    form.querySelector<HTMLElement>('[aria-invalid="true"], fieldset.tagpick.err input')?.focus();
  }, [state, opts.tags.length]);

  const fixed = !!value.fixed;
  // Editing an entry always shows its date and start time, so both can be corrected. A new entry from a Timesheet cell keeps the cell's date.
  const showWhen = !fixed || !!value.id;
  const shown = (k: string) => (k === "projectId" ? !fixed : k === "date" || k === "start" ? showWhen : true);
  const phaseField = (
    <div>
      <label htmlFor="e-phase">Phase<span className="req"> *</span></label>
      <select id="e-phase" name="phaseId" key={projectId} required defaultValue={project?.phases.some((p) => p.id === value.phaseId) || (keepOldPhase && projectId === value.projectId) ? value.phaseId ?? "" : ""} className={bad("Phase")} {...invalid("Phase", "e-phase")}>
        <option value="">Choose a phase</option>
        {keepOldPhase && projectId === value.projectId && <option value={value.phaseId!}>{value.phaseName}{project ? " (removed from project)" : ""}</option>}
        {project?.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {errLine("Phase", "e-phase")}
    </div>
  );
  const tagField = (
    <div style={{ flexBasis: "100%" }}>
      <TagPicker id="e-tag" tags={opts.tags} selected={value.tagIds ?? []} required={opts.requireTag} invalid={!!bad("Tags")} readOnly={ro} />
      {errLine("Tags", "e-tag")}
    </div>
  );
  const customFields = opts.fields.map((f) => (
    <div key={f.id}>
      <label htmlFor={"e-cf-" + f.id}>{f.name}{f.required && <span className="req"> *</span>}</label>
      {f.type === "select" ? (
        <select id={"e-cf-" + f.id} name={"cf_" + f.id} defaultValue={value.custom?.[f.id] ?? ""} className={bad(f.name)} {...invalid(f.name, "e-cf-" + f.id)}>
          <option value="">Choose</option>
          {/* Keep a saved value an admin has since taken off the list, so editing doesn't blank it. */}
          {!!value.custom?.[f.id] && !f.options.includes(value.custom[f.id]) && <option>{value.custom[f.id]}</option>}
          {f.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input id={"e-cf-" + f.id} name={"cf_" + f.id} defaultValue={value.custom?.[f.id] ?? ""} className={bad(f.name)} {...invalid(f.name, "e-cf-" + f.id)} />
      )}
      {errLine(f.name, "e-cf-" + f.id)}
    </div>
  ));
  const descField = (
    <div style={{ flexBasis: "100%" }}>
      <label htmlFor="e-desc">Description{opts.requireDescription && <span className="req"> *</span>}</label>
      <input id="e-desc" name="description" defaultValue={value.description ?? ""} placeholder="What did you work on?" maxLength={DESCRIPTION_MAX} required={opts.requireDescription} className={bad("Description")} {...invalid("Description", "e-desc")} />
      {errLine("Description", "e-desc")}
    </div>
  );
  const dateField = (
    <div>
      <label htmlFor="e-date">Date<span className="req"> *</span></label>
      <input id="e-date" type="date" name="date" defaultValue={value.date} required min="2000-01-01" max={lastDay(today)} className={bad("date")} {...invalid("date", "e-date")} />
      {errLine("date", "e-date")}
    </div>
  );
  const startField = (
    <div>
      <label htmlFor="e-start">Start<span className="req"> *</span></label>
      <input id="e-start" type="time" name="start" defaultValue={hhmm(value.startMin ?? 540)} required className={bad("start")} {...invalid("start", "e-start")} />
      {errLine("start", "e-start")}
    </div>
  );
  const durField = (
    <div>
      <label htmlFor="e-dur">Duration<span className="req"> *</span></label>
      <input id="e-dur" name="duration" defaultValue={dur(value.minutes, opts.timeFormat)} placeholder="1.5 or 1:30" required className={bad("duration")} {...invalid("duration", "e-dur")} />
      {errLine("duration", "e-dur")}
    </div>
  );

  // Under the form: the summary naming the fields to check, or the reason the save was refused. A problem with a field this form doesn't
  // show (a Timesheet cell's project or date) is spelled out here instead.
  const keys = Object.keys(fe);
  const hidden = keys.filter((k) => !shown(k));
  const alerts = state && !state.ok ? (keys.length ? [hidden.length < keys.length ? state.error : "", ...hidden.map((k) => fe[k])] : [state.error]).filter(Boolean) : [];

  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (pending || deleting) return;
    const fd = new FormData(ev.currentTarget);
    // A new entry from a Timesheet cell starts after the day's last entry. If that would run past midnight, it starts earlier instead.
    if (fixed && !value.id) {
      const m = parseDuration(String(fd.get("duration") ?? ""));
      if (m > 0 && m <= 1440) fd.set("start", hhmm(Math.min(value.startMin ?? 540, 1440 - m)));
    }
    startTransition(() => action(fd));
  };
  const remove = () => {
    if (deleting || !value.id) return;
    setDelError("");
    const fd = new FormData();
    fd.set("id", value.id);
    startDelete(async () => {
      let res: DeleteResult;
      try {
        res = await deleteEntry(fd);
      } catch (e) {
        unstable_rethrow(e);
        setDelError(DELETE_FAILED);
        setConfirming(false);
        return;
      }
      if (!res.ok) {
        setDelError(res.error ?? DELETE_FAILED);
        setConfirming(false);
        router.refresh();
        return;
      }
      onDeleted();
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 id="entry-title">{value.id ? (ro ? "Time entry" : "Edit time") : "Add time"}</h2>
        <button type="button" className="btn sm" onClick={onDone}>Close</button>
      </div>
      {value.context && <p className="sub" style={{ marginBottom: 6 }}>{value.context}</p>}
      {value.ownerName && <p className="sub">{ownerId ? `On behalf of ${value.ownerName}` : value.ownerName}</p>}
      {value.lockedReason && <p className="alert info">{value.lockedReason}</p>}
      {!ro && <p className="sub">Required fields are marked *</p>}
      {/* The server checks every field and returns all problems at once, so the browser's own one-at-a-time checks are off. */}
      <form ref={formRef} noValidate onSubmit={submit}>
        <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
          <input type="hidden" name="id" value={value.id ?? ""} />
          {ownerId && <input type="hidden" name="userId" value={ownerId} />}
          {fixed ? (
            <div className="row">
              <input type="hidden" name="projectId" value={projectId} />
              {!showWhen && <input type="hidden" name="date" value={value.date} />}
              {!showWhen && <input type="hidden" name="start" value={hhmm(value.startMin ?? 540)} />}
              {phaseField}
              {showWhen && dateField}
              {showWhen && startField}
              {durField}
              {customFields}
              {tagField}
              {descField}
            </div>
          ) : (
            <div className="row">
              <div style={{ flexBasis: "100%" }}>
                <label htmlFor="e-project">Project<span className="req"> *</span></label>
                <SearchSelect id="e-project" name="projectId" value={projectId} onChange={setProjectId} className={bad("projectId")} searchLabel="Search projects"
                  options={[...(value.projectId && !opts.projects.some((p) => p.id === value.projectId) ? [{ value: value.projectId, label: value.projectName ?? "Other project" }] : []), ...opts.projects.map((p) => ({ value: p.id, label: p.name, group: p.client }))]} />
                {errLine("projectId", "e-project")}
              </div>
              {phaseField}
              {customFields}
              {tagField}
              {descField}
              {dateField}
              {startField}
              {durField}
            </div>
          )}
        </fieldset>
        {alerts.length > 0 && <p className="err-text" role="alert">{alerts.join(" ")}</p>}
        {delError && <p className="err-text" role="alert">{delError}</p>}
        {!ro && (
          <div className="row between" style={{ marginTop: 14 }}>
            <button className="btn primary" aria-disabled={pending || deleting || undefined}>{pending ? "Saving…" : value.id ? "Save changes" : "Add entry"}</button>
            {value.id && (confirming ? (
              <div className="row" role="group" aria-labelledby="e-del-q">
                <span id="e-del-q">Delete this entry?</span>
                <button type="button" className="btn bad" aria-disabled={deleting || undefined} onClick={remove}>{deleting ? "Deleting…" : "Delete"}</button>
                <button type="button" ref={keepRef} className="btn" aria-disabled={deleting || undefined} onClick={() => { if (!deleting) setConfirming(false); }}>Keep</button>
              </div>
            ) : (
              <button type="button" ref={deleteRef} className="btn bad" onClick={() => { setDelError(""); setConfirming(true); }}>Delete entry</button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
