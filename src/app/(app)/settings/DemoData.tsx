"use client";
import { useState } from "react";
import { continueDemoData, removeDemoData, startDemoData, type DemoResult } from "./demo-actions";
import type { DemoStatus } from "@/lib/demoData";

const TOTAL = 30;

/** Try the app with sample people and a year of time, and take it all away again with one click. */
export default function DemoData({ initial }: { initial: DemoStatus }) {
  const [status, setStatus] = useState<DemoStatus>(initial);
  const [busy, setBusy] = useState<"" | "add" | "remove">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");

  const take = (r: NonNullable<DemoResult>) => { setStatus(r.status); if (!r.ok) setError(r.error ?? "Something went wrong."); return r.ok; };

  async function add(resume: boolean) {
    if (!resume && !confirm(`Add ${TOTAL} demo people, some projects and a year of time? You can remove all of it afterwards with one click.`)) return;
    setBusy("add"); setError(""); setMessage("");
    try {
      if (!resume) { setProgress("Adding people and projects…"); if (!take(await startDemoData())) return; }
      for (let guard = 0; guard < 40; guard++) {
        const r = await continueDemoData();
        if (!take(r)) return;
        setProgress(`Adding a year of time: ${r.status.done} of ${TOTAL} people`);
        if (r.finished) { setMessage("Done. The demo data is in."); return; }
      }
    } catch { setError("The connection dropped. Press Continue to carry on."); }
    finally { setBusy(""); setProgress(""); }
  }
  async function remove() {
    if (!confirm("Remove all demo people, demo projects and their time? Any time someone logged on a demo project goes too. Your real people, clients and projects are not touched.")) return;
    setBusy("remove"); setError(""); setMessage(""); setProgress("Removing…");
    try { const r = await removeDemoData(); if (take(r)) setMessage(r.message ?? "Removed."); }
    catch { setError("The connection dropped. Press Remove demo data again."); }
    finally { setBusy(""); setProgress(""); }
  }

  const partial = status.state === "partial";
  return (
    <section className="panel full" aria-labelledby="demo-h">
      <h3 id="demo-h">Demo data</h3>
      <p className="note" style={{ margin: "0 0 10px", maxWidth: "75ch" }}>
        Fill the app with sample data to try it out: {TOTAL} people spread across your offices and teams, a few projects on your existing clients, and a year of time logged with your existing tags.
        Demo people can&apos;t sign in and never get emails. Remove it all with one click before you start with real time.
      </p>
      <p style={{ margin: "0 0 10px" }} role="status">
        {status.state === "none" && <>Not added.</>}
        {status.state === "ready" && <><strong>Added:</strong> {status.people} people, {status.projects} projects and {status.entries.toLocaleString("en-US")} time entries.</>}
        {partial && <><strong>Partly added:</strong> {status.people} people and {status.projects} projects, with time for {status.done} of {TOTAL} people so far.</>}
        {progress && <span className="note"> {progress}</span>}
      </p>
      {error && <p className="err-text" role="alert">{error}</p>}
      {message && <p className="alert info" role="status" style={{ marginBottom: 10 }}>{message}</p>}
      <div className="row" style={{ gap: 8 }}>
        {status.state === "none" && <button type="button" className="btn primary" disabled={!!busy} onClick={() => add(false)}>{busy === "add" ? "Adding…" : "Add demo data"}</button>}
        {partial && <button type="button" className="btn primary" disabled={!!busy} onClick={() => add(true)}>{busy === "add" ? "Adding…" : "Continue"}</button>}
        {status.state !== "none" && <button type="button" className="btn bad" disabled={!!busy} onClick={remove}>{busy === "remove" ? "Removing…" : "Remove demo data"}</button>}
      </div>
    </section>
  );
}
