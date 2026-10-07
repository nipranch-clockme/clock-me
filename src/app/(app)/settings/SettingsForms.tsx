"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { addField, addTag, addTemplate, saveSettings, type SettingsResult } from "./actions";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type General = { timeZone: string; timeFormat: string; requireTag: boolean; requireDescription: boolean; lockBefore: string; dailyMinimum: number; remindSubmit: boolean; remindSubmitDay: number; remindDaily: boolean; remindApprovers: boolean };

export function GeneralForm({ s, emailOn, cronOn, zones }: { s: General; emailOn: boolean; cronOn: boolean; zones: string[] }) {
  const [state, action, pending] = useActionState<SettingsResult, FormData>(saveSettings, null);
  const [lock, setLock] = useState(s.lockBefore);
  return (
    <form action={action} className="panel full">
      <div className="grid g2" style={{ gap: 24 }}>
        <div>
          <h3>Time zone</h3>
          <select name="timeZone" defaultValue={s.timeZone} aria-label="Company time zone" style={{ maxWidth: 320 }}>
            {!zones.includes(s.timeZone) && <option value={s.timeZone}>{s.timeZone}</option>}
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
          <p className="note" style={{ margin: "4px 0 0" }}>Decides when a new day and a new week start, for &ldquo;today&rdquo;, &ldquo;this week&rdquo; and reminders.</p>
          <h3 style={{ marginTop: 18 }}>Time format</h3>
          <label className="check"><input type="radio" name="timeFormat" value="decimal" defaultChecked={s.timeFormat !== "hhmm"} /> Decimal (7.50)</label>
          <label className="check"><input type="radio" name="timeFormat" value="hhmm" defaultChecked={s.timeFormat === "hhmm"} /> Hours and minutes (7:30)</label>
          <h3 style={{ marginTop: 18 }}>Required fields</h3>
          <p className="note" style={{ margin: "0 0 6px" }}>Project and Phase are always required. Custom fields are set below.</p>
          <label className="check"><input type="checkbox" name="requireTag" defaultChecked={s.requireTag} /> Tag</label>
          <label className="check"><input type="checkbox" name="requireDescription" defaultChecked={s.requireDescription} /> Description</label>
          <h3 style={{ marginTop: 18 }}>Lock timesheets</h3>
          <div className="row">
            <div><label htmlFor="st-lock">Lock all time on or before</label><input id="st-lock" type="date" name="lockBefore" style={{ maxWidth: 220 }} value={lock} onChange={(e) => setLock(e.target.value)} /></div>
            {lock && <button type="button" className="btn sm" onClick={() => setLock("")}>No lock</button>}
          </div>
          <p className="note" style={{ margin: "6px 0 0" }}>Nobody can add, change or delete locked time, admins included.</p>
        </div>
        <div>
          <h3>Targets and reminders</h3>
          <div style={{ maxWidth: 220 }}><label htmlFor="st-min">Daily minimum (hours)</label><input id="st-min" name="dailyMinimum" type="number" min="0" max="24" step="0.5" defaultValue={s.dailyMinimum} /></div>
          <p className="note" style={{ margin: "4px 0 10px" }}>Expected hours per week are set for each person on the People page or their profile.</p>
          <label className="check"><input type="checkbox" name="remindSubmit" defaultChecked={s.remindSubmit} /> Remind people to submit their timesheet on</label>
          <select name="remindSubmitDay" defaultValue={s.remindSubmitDay} aria-label="Reminder day" style={{ maxWidth: 200, marginLeft: 24 }}>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
          <p className="note" style={{ margin: "2px 0 0 24px" }}>On Monday or Tuesday it&apos;s about the week that just ended; on other days, the current week.</p>
          <label className="check" style={{ marginTop: 6 }}><input type="checkbox" name="remindDaily" defaultChecked={s.remindDaily} /> Remind people who logged less than the daily minimum on the previous workday</label>
          <label className="check"><input type="checkbox" name="remindApprovers" defaultChecked={s.remindApprovers} /> Remind approvers about timesheets waiting for them</label>
          <p className={emailOn && cronOn ? "note" : "alert info"} style={{ margin: "10px 0 0" }}>
            {emailOn && cronOn ? "Reminder emails go out once a day, in the afternoon (UTC)."
              : !emailOn && !cronOn ? "Automatic reminders are off. To turn them on, add RESEND_API_KEY, EMAIL_FROM and CRON_SECRET in Vercel (see the setup guide)."
              : !emailOn ? "Email isn't switched on yet, so reminders are only written to the server log. Add RESEND_API_KEY and EMAIL_FROM in Vercel."
              : "The daily reminder job is off. Add CRON_SECRET (any long random string) in Vercel to turn it on."}
          </p>
        </div>
      </div>
      <div className="row" style={{ marginTop: 16, alignItems: "center" }}>
        <button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {state?.ok && !pending && <span className="note" role="status">Saved.</span>}
        {state?.error && <span className="err-text" role="alert">{state.error}</span>}
      </div>
    </form>
  );
}

function useAddForm(fn: (s: SettingsResult, f: FormData) => Promise<SettingsResult>) {
  const [state, action, pending] = useActionState<SettingsResult, FormData>(fn, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return { state, action, pending, ref };
}

export function TagForm() {
  const { state, action, pending, ref } = useAddForm(addTag);
  return (
    <form ref={ref} action={action} className="row" style={{ marginTop: 10 }}>
      <div><label htmlFor="st-tag">New tag</label><input id="st-tag" name="name" placeholder="e.g. Research" /></div>
      <button className="btn" disabled={pending}>Add tag</button>
      {state?.error && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.error}</p>}
    </form>
  );
}

export function TemplateForm() {
  const { state, action, pending, ref } = useAddForm(addTemplate);
  return (
    <form ref={ref} action={action} className="row" style={{ marginTop: 10 }}>
      <div><label htmlFor="st-tpl">Template name</label><input id="st-tpl" name="name" placeholder="e.g. Video production" /></div>
      <div style={{ flex: "2 1 240px" }}><label htmlFor="st-tpl-ph">Phases, separated by commas</label><input id="st-tpl-ph" name="phases" placeholder="Script, Shoot, Edit, Deliver" /></div>
      <button className="btn" disabled={pending}>Add template</button>
      {state?.error && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.error}</p>}
    </form>
  );
}

export function FieldForm() {
  const { state, action, pending, ref } = useAddForm(addField);
  const [type, setType] = useState("text");
  return (
    <form ref={ref} action={action} className="row" style={{ marginTop: 10 }} onReset={() => setType("text")}>
      <div><label htmlFor="st-cf">Field name</label><input id="st-cf" name="name" placeholder="e.g. Client reference" /></div>
      <div><label htmlFor="st-cf-type">Type</label><select id="st-cf-type" name="type" value={type} onChange={(e) => setType(e.target.value)}><option value="text">Text</option><option value="select">Dropdown</option></select></div>
      {type === "select" && <div style={{ flexBasis: "100%" }}><label htmlFor="st-cf-opt">Options, separated by commas</label><input id="st-cf-opt" name="options" placeholder="Low, Medium, High" /></div>}
      <label className="check" style={{ flex: "0 0 auto" }}><input type="checkbox" name="required" /> Required</label>
      <button className="btn" disabled={pending}>Add field</button>
      {state?.error && <p className="err-text" role="alert" style={{ flexBasis: "100%" }}>{state.error}</p>}
    </form>
  );
}

export function Confirm({ action, id, label, question }: { action: (f: FormData) => Promise<void>; id: string; label: string; question: string }) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(question)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn sm">{label}</button>
    </form>
  );
}
