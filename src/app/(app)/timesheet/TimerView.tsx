"use client";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import EntryDialog from "@/components/EntryDialog";
import type { EntryOptions } from "@/components/entryTypes";
import { draftEdit, useRestoreDraft, type EntryEdit } from "@/components/entryDraft";
import type { SheetEntry } from "./TimesheetGrid";
import { discardTimer, startTimer, stopTimer, type TimerResult } from "./timer-actions";
import { saveEntry, type EntryResult } from "./actions";
import BarProject from "./BarProject";
import TagPicker from "@/components/TagPicker";
import { ICONS } from "@/components/icons";
import { DESCRIPTION_MAX, parseDuration } from "@/lib/format";

export type RunningTimer = { projectId: string; phaseId: string | null; tagIds: string[]; description: string; startedAt: string };
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;
const clock = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, "0")).join(":");
const fmt = (m: number, f: "decimal" | "hhmm") => (f === "hhmm" ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : (m / 60).toFixed(2));
// Clock time in company time, like the entries it adds, so the server and every browser show the same text.
const companyHM = (d: Date, timeZone: string) => {
  const f = (tz: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(d);
  try { return f(timeZone); } catch { return f("UTC"); }
};

/** Timesheet view 3: start and stop a timer on one project, or type a time and add it. Stopping, or adding, makes entries. */
export default function TimerView({ opts, meId, run, entries, dates, today, locked, blocked, timeZone }: {
  opts: EntryOptions; run: RunningTimer | null; entries: SheetEntry[]; dates: string[]; today: string; locked: (string | null)[]; blocked: string | null; timeZone: string; meId: string;
}) {
  const router = useRouter();
  const [startState, startAction, starting] = useActionState<TimerResult, FormData>(startTimer, null);
  const [stopState, stopAction, stopping] = useActionState<TimerResult, FormData>(stopTimer, null);
  const [addState, addAction, adding] = useActionState<EntryResult, FormData>(saveEntry, null);
  const [lastAdd, setLastAdd] = useState(false);
  const [projectId, setProjectId] = useState(run?.projectId ?? "");
  const [phaseId, setPhaseId] = useState(run?.phaseId ?? "");
  const [desc, setDesc] = useState(run?.description ?? "");
  const [tagN, setTagN] = useState(run?.tagIds.length ?? 0);
  const [typed, setTyped] = useState("");
  const [clockErr, setClockErr] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);
  const tagsRef = useRef<HTMLDetailsElement>(null);
  const started = useRef(false);
  const pickProject = (v: string) => { if (v !== projectId) setPhaseId(""); setProjectId(v); };
  const closeTags = () => { if (tagsRef.current) tagsRef.current.open = false; };
  // Moves the keyboard on after Start, Stop or a saved manual entry (whose form has just closed), unless the person has gone elsewhere on the page.
  const focusHere = (el: HTMLElement | null) => { const a = document.activeElement; if (!a || a === document.body || formRef.current?.contains(a) || a.closest("dialog")) el?.focus(); };
  // Tags are plain tick boxes, so clear them by hand when the bar is emptied.
  const clearTags = () => { formRef.current?.querySelectorAll<HTMLInputElement>('input[name="tagIds"]').forEach((i) => { i.checked = false; }); setTagN(0); };
  // Once time is added (by the timer, Add Time or a manual entry), the bar is empty and ready for the next one.
  const clearBar = () => { setProjectId(""); setPhaseId(""); setDesc(""); setTyped(""); clearTags(); closeTags(); focusHere(descRef.current); };
  const project = opts.projects.find((p) => p.id === projectId);
  const [now, setNow] = useState<number | null>(null);
  const [edit, setEdit] = useState<EntryEdit | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (startState?.ok) { started.current = true; closeTags(); router.refresh(); } }, [startState, router]);
  // Start turns into Stop once the running timer arrives: keep the keyboard on it.
  useEffect(() => { if (run && started.current) { started.current = false; focusHere(mainRef.current); } }, [run]);
  useEffect(() => { if (stopState?.ok) { setMsg(stopState.message ?? ""); clearBar(); router.refresh(); } }, [stopState, router]);
  useEffect(() => { if (addState?.ok) { setMsg("Time added for today."); clearBar(); router.refresh(); } }, [addState, router]);
  // The Tags pop-up closes when a click or the keyboard goes somewhere else on the page.
  useEffect(() => {
    const away = (e: PointerEvent) => { const t = tagsRef.current; if (t?.open && !t.contains(e.target as Node)) t.open = false; };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);
  // Only the result of the action on screen counts: a failed Stop is not shown once the timer has gone, and a Start error is not hidden by one.
  const state = run ? stopState : lastAdd ? addState : startState;
  const bad = (k: string) => (state?.fields?.includes(k) ? "err" : undefined);
  const secs = run && now ? Math.max(0, Math.floor((now - new Date(run.startedAt).getTime()) / 1000)) : 0;
  const busy = starting || stopping || adding;
  // The message names the field only ("Check this field: Duration."), so the reason for each field is added after it.
  const addReason = !run && lastAdd && addState && !addState.ok ? Object.values(addState.fieldErrors ?? {}).join(" ") : "";
  // Sent from here rather than as a form action, which would reset the form afterwards and so blank the phase and tags the timer runs with.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget), act = run ? stopAction : startAction;
    closeTags();
    setLastAdd(false);
    startTransition(() => act(fd));
  };
  const days = [...dates].reverse().filter((d) => entries.some((e) => e.date === d));
  const lockFor = (d: string) => locked[dates.indexOf(d)] ?? null;
  const entryForm = (e: SheetEntry): EntryEdit => ({ ...e, fixed: true, lockedReason: lockFor(e.date), context: `${e.projectName} · ${e.clientName} · ${dayLabel(e.date)}` });
  const open = (e: SheetEntry) => setEdit(entryForm(e));
  // A draft from before the session ended reopens its form: a list entry being changed if it is still there, otherwise the manual entry.
  useRestoreDraft({ by: meId, forId: meId, editable: true }, (d) => {
    const e = d.id ? entries.find((x) => x.id === d.id) : undefined;
    setEdit({ ...(e ? entryForm(e) : { lockedReason: blocked }), ...draftEdit(d) });
  });
  // A manual entry starts from what is on the bar: the project, phase, tags and description.
  const manual = () => {
    const fd = new FormData(formRef.current ?? undefined);
    setEdit({ projectId: projectId || undefined, projectName: project?.name, phaseId: phaseId || null, tagIds: fd.getAll("tagIds").map(String), description: desc, date: today, lockedReason: blocked });
  };
  // Add Time: a time typed on the clock is added for today, ending now, with no pop-up. With the clock empty, or a timer running, it opens the form instead.
  const addTime = () => {
    const t = run ? "" : typed.trim().replace(/^(\d+):(\d{2}):00$/, "$1:$2");
    if (!t) { manual(); return; }
    if (adding) return;
    const len = parseDuration(t) || 0, hhmm = companyHM(new Date(), timeZone);
    const startMin = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) - len;
    if (startMin < 0) { setClockErr("That is more than has passed today. Clear the clock and press Add Time to set the start in a form."); return; }
    setClockErr("");
    const fd = new FormData(formRef.current ?? undefined);
    fd.set("userId", meId); fd.set("date", today); fd.set("start", hm(startMin)); fd.set("duration", t);
    setLastAdd(true);
    startTransition(() => addAction(fd));
  };
  const discard = () => startTransition(async () => { await discardTimer(); clearBar(); router.refresh(); });
  return (
    <>
      <form action={run ? stopAction : startAction} onSubmit={submit} ref={formRef}>
        <div className={`tmcard${run ? " on" : ""}`}>
          <input id="tm-desc" ref={descRef} name="description" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What did you work on?" aria-label="Description" aria-required={opts.requireDescription || undefined} maxLength={DESCRIPTION_MAX} className={`tmdesc${bad("Description") ? " err" : ""}`} />
          <div className="tmproj">
            <BarProject value={projectId} onChange={pickProject} invalid={!!bad("projectId")}
              options={opts.projects.map((p) => ({ value: p.id, label: p.name, group: p.client }))} />
          </div>
          <select id="tm-phase" name="phaseId" aria-label="Phase" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className={`tmphase${bad("Phase") ? " err" : ""}`}>
            <option value="">Phase *</option>
            {project?.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <details className="tmtags" ref={tagsRef}
            onKeyDown={(e) => { if (e.key === "Escape" && e.currentTarget.open) { e.preventDefault(); e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}
            onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false; }}>
            <summary className={`tmtag-btn${state?.fields?.includes("Tags") ? " err" : ""}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS.tag }} />Tags{tagN > 0 && <b className="tmtag-n">{tagN}</b>}</summary>
            <div onChange={(e) => setTagN(e.currentTarget.querySelectorAll("input:checked").length)}>
              <TagPicker id="tm-tag" tags={opts.tags} selected={run?.tagIds ?? []} required={opts.requireTag} invalid={state?.fields?.includes("Tags")} />
            </div>
          </details>
          {run
            ? <span className="tmclock" role="timer" aria-label="Time on the timer">{clock(secs)}</span>
            : <input className="tmclock-in" name="duration" value={typed} placeholder="00:00:00" aria-label="Time to add, like 1:30 or 1.5. Leave empty to set the start in a form"
                inputMode="decimal" autoComplete="off" onChange={(e) => { setTyped(e.target.value); setClockErr(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTime(); } }} />}
          {/* One button that turns from Start Timer into Stop, so the keyboard stays on it. While waiting it is only marked busy, as a disabled button would lose focus. */}
          <button ref={mainRef} className="btn primary" disabled={!run && (!!blocked || !projectId)} aria-disabled={busy || undefined}>{run ? "Stop" : "Start Timer"}</button>
          {run && <button type="button" className="btn" onClick={discard}>Discard</button>}
          <button type="button" className="btn tmadd" onClick={addTime} aria-disabled={adding || undefined} disabled={!!blocked || !projectId} title={blocked ?? (projectId ? undefined : "Choose a project first")}>Add Time</button>
        </div>
      </form>
      {(clockErr || state?.error) && <p className="alert bad" role="alert" style={{ marginTop: 8 }}>{clockErr || [state?.error, addReason].filter(Boolean).join(" ")}</p>}
      {msg && !run && <p className="alert info" role="status" style={{ marginTop: 8 }}>{msg}</p>}
      <p className="note tmnote">
        {blocked ? `${blocked} So the timer and Add Time can't add time today.`
          : run ? `Started ${companyHM(new Date(run.startedAt), timeZone)}. Stopping adds the time as an entry. You can change the project and details while it runs.`
          : "Pick a project and press Start Timer. When you stop, the time is added as an entry for today. Or type a time on the clock and press Add Time to add it for today, ending now."}
      </p>
      {days.map((d) => {
        const es = entries.filter((e) => e.date === d).sort((a, b) => b.startMin - a.startMin);
        return (
          <div key={d}>
            <div className="tmday"><span>{dayLabel(d)}{d === today ? " · today" : ""}</span><span>{fmt(es.reduce((a, e) => a + e.minutes, 0), opts.timeFormat)} h</span></div>
            {es.map((e) => (
              <button key={e.id} type="button" className="tmrow" onClick={() => open(e)} aria-label={`${lockFor(d) ? "View" : "Edit"} entry: ${e.projectName}, ${fmt(e.minutes, opts.timeFormat)} hours`}>
                <span className="dot" style={{ background: `var(--${e.clientColor})` }} />
                <span className="tmn">{e.description
                  ? <><b title={e.description}><bdi>{e.description}</bdi></b><small><bdi>{[e.projectName, e.clientName, e.phaseName, e.tagName].filter(Boolean).join(" · ")}</bdi></small></>
                  : <><b>{e.projectName}</b><small><bdi>{[e.clientName, e.phaseName, e.tagName].filter(Boolean).join(" · ")}</bdi></small></>}</span>
                <span className="tmt">{hm(e.startMin)} to {hm(e.startMin + e.minutes)}</span>
                <span className="tmh">{fmt(e.minutes, opts.timeFormat)}</span>
              </button>
            ))}
          </div>
        );
      })}
      {/* Only a new manual entry starts from the bar, so only that clears it. Editing an entry from the list leaves the bar alone. */}
      <EntryDialog opts={opts} value={edit} meId={meId} today={today} onClose={() => setEdit(null)} onSaved={edit && !edit.id ? clearBar : undefined} />
    </>
  );
}
