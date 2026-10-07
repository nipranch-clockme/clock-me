"use client";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EntryDialog from "@/components/EntryDialog";
import type { EntryOptions, EntryValue } from "@/components/entryTypes";
import type { SheetEntry } from "./TimesheetGrid";
import { discardTimer, startTimer, stopTimer, type TimerResult } from "./timer-actions";
import SearchSelect from "@/components/SearchSelect";
import TagPicker from "@/components/TagPicker";

export type RunningTimer = { projectId: string; phaseId: string | null; tagIds: string[]; description: string; startedAt: string };
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;
const clock = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, "0")).join(":");
const fmt = (m: number, f: "decimal" | "hhmm") => (f === "hhmm" ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : (m / 60).toFixed(2));

/** Timesheet view 3: start and stop a timer on one project. Stopping adds the time as entries. */
export default function TimerView({ opts, run, entries, dates, today, locked, blocked }: {
  opts: EntryOptions; run: RunningTimer | null; entries: SheetEntry[]; dates: string[]; today: string; locked: (string | null)[]; blocked: string | null;
}) {
  const router = useRouter();
  const [startState, startAction, starting] = useActionState<TimerResult, FormData>(startTimer, null);
  const [stopState, stopAction, stopping] = useActionState<TimerResult, FormData>(stopTimer, null);
  const [projectId, setProjectId] = useState(run?.projectId ?? "");
  const project = opts.projects.find((p) => p.id === projectId);
  const [now, setNow] = useState<number | null>(null);
  const [edit, setEdit] = useState<EntryValue | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (startState?.ok) router.refresh(); }, [startState, router]);
  useEffect(() => { if (stopState?.ok) { setMsg(stopState.message ?? ""); setProjectId(""); router.refresh(); } }, [stopState, router]);
  const state = stopState && !stopState.ok ? stopState : startState && !startState.ok ? startState : null;
  const bad = (k: string) => (state?.fields?.includes(k) ? "err" : undefined);
  const secs = run && now ? Math.max(0, Math.floor((now - new Date(run.startedAt).getTime()) / 1000)) : 0;
  const action = run ? stopAction : startAction;
  const days = [...dates].reverse().filter((d) => entries.some((e) => e.date === d));
  const lockFor = (d: string) => locked[dates.indexOf(d)] ?? null;
  const open = (e: SheetEntry) => setEdit({ ...e, fixed: true, lockedReason: lockFor(e.date), context: `${e.projectName} · ${e.clientName} · ${dayLabel(e.date)}` });
  return (
    <>
      <form action={action}>
        <div className={`tmcard${run ? " on" : ""}`}>
          <div className="row">
            <div>
              <label htmlFor="tm-project">Project<span className="req"> *</span></label>
              <SearchSelect id="tm-project" name="projectId" value={projectId} onChange={setProjectId} className={bad("projectId")} placeholder="Choose a project" searchLabel="Search projects"
                options={opts.projects.map((p) => ({ value: p.id, label: p.name, group: p.client }))} />
            </div>
            <div>
              <label htmlFor="tm-phase">Phase<span className="req"> *</span></label>
              <select id="tm-phase" name="phaseId" key={projectId} defaultValue={run && run.projectId === projectId ? run.phaseId ?? "" : ""} className={bad("Phase")}>
                <option value="">Choose a phase</option>
                {project?.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tm-desc">Description{opts.requireDescription && <span className="req"> *</span>}</label>
              <input id="tm-desc" name="description" defaultValue={run?.description ?? ""} maxLength={500} className={bad("Description")} />
            </div>
            <div>
              <TagPicker id="tm-tag" tags={opts.tags} selected={run?.tagIds ?? []} required={opts.requireTag} invalid={state?.fields?.includes("Tags")} />
            </div>
          </div>
          <div className="tmctl">
            <span className="tmclock" role="timer" aria-label="Time on the timer">{clock(secs)}</span>
            {run
              ? <><button className="btn primary" disabled={stopping}>Stop</button><button type="button" className="btn" onClick={() => startTransition(async () => { await discardTimer(); setProjectId(""); router.refresh(); })}>Discard</button></>
              : <button className="btn primary" disabled={!!blocked || starting || !projectId}>Start</button>}
          </div>
        </div>
      </form>
      {state?.error && <p className="alert bad" role="alert" style={{ marginTop: 8 }}>{state.error}</p>}
      {msg && !run && <p className="alert info" role="status" style={{ marginTop: 8 }}>{msg}</p>}
      <p className="note tmnote">
        {blocked ? `${blocked} So the timer can't add time today.`
          : run ? `Started ${new Date(run.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Stopping adds the time as an entry. You can change the project and details while it runs.`
          : "Pick a project and press Start. When you stop, the time is added as an entry for today."}
      </p>
      {days.map((d) => {
        const es = entries.filter((e) => e.date === d).sort((a, b) => b.startMin - a.startMin);
        return (
          <div key={d}>
            <div className="tmday"><span>{dayLabel(d)}{d === today ? " · today" : ""}</span><span>{fmt(es.reduce((a, e) => a + e.minutes, 0), opts.timeFormat)} h</span></div>
            {es.map((e) => (
              <button key={e.id} type="button" className="tmrow" onClick={() => open(e)} aria-label={`${lockFor(d) ? "View" : "Edit"} entry: ${e.projectName}, ${fmt(e.minutes, opts.timeFormat)} hours`}>
                <span className="dot" style={{ background: `var(--${e.clientColor})` }} />
                <span className="tmn"><b>{e.projectName}</b><small>{[e.clientName, e.phaseName, e.tagName].filter(Boolean).join(" · ")}</small>{e.description && <small>{e.description}</small>}</span>
                <span className="tmt">{hm(e.startMin)} to {hm(e.startMin + e.minutes)}</span>
                <span className="tmh">{fmt(e.minutes, opts.timeFormat)}</span>
              </button>
            ))}
          </div>
        );
      })}
      <EntryDialog opts={opts} value={edit} onClose={() => setEdit(null)} />
    </>
  );
}
