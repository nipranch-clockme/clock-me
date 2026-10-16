"use client";
import { useState } from "react";
import { addHistoryChunk, finishHistoryImport, removeHistoryImport, startHistoryImport, type HistoryResult } from "./history-actions";
import type { HistoryStatus } from "@/lib/historyImport";
import { parseHistory, type HistoryPlan } from "@/lib/historyParse";
import { dateWithYear } from "@/lib/dates";

const CHUNK = 2500; // same as HISTORY_CHUNK on the server
const ROLE_LABEL: Record<string, string> = { MEMBER: "Team members", LEADER: "Team/Project Managers", LOCATION: "Location managers", ADMIN: "Admins", GUEST: "Guests" };
const n = (x: number) => x.toLocaleString("en-US");

/** Loads time from another tool (a Clockify detailed report CSV), in steps, and can take it all away again. */
export default function HistoryImport({ initial, offices }: { initial: HistoryStatus; offices: { id: string; name: string }[] }) {
  const [status, setStatus] = useState<HistoryStatus>(initial);
  const [plan, setPlan] = useState<HistoryPlan | null>(null);
  const [officeIds, setOfficeIds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "read" | "add" | "remove">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");

  const take = (r: HistoryResult) => { setStatus(r.status); if (!r.ok) setError(r.error ?? "Something went wrong."); return r.ok; };

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy("read"); setError(""); setMessage(""); setPlan(null);
    try {
      const r = parseHistory(await file.text());
      if ("error" in r) { setError(r.error); return; }
      if (status.state === "partial" && r.plan.fileKey !== status.fileKey) { setError("That isn't the file this import was started with. Choose the same file to continue, or remove the imported history first."); return; }
      const ids: Record<string, string> = {};
      for (const code of r.plan.offices) ids[code] = offices.find((o) => o.name.trim().toLowerCase() === code.trim().toLowerCase())?.id ?? "";
      setOfficeIds(ids);
      setPlan(r.plan);
    } catch { setError("That file couldn't be read."); }
    finally { setBusy(""); }
  }

  async function run() {
    if (!plan) return;
    const resume = status.state === "partial";
    if (!resume && !confirm(`Import ${n(plan.entries.length)} time entries for ${plan.people.length} people? Every week from ${dateWithYear(plan.from)} to ${dateWithYear(plan.to)} will be marked Approved. You can remove it all afterwards with one click.`)) return;
    setBusy("add"); setError(""); setMessage("");
    try {
      const { entries, skipped: _skipped, ...setup } = plan;
      void _skipped;
      if (!resume) { setProgress("Adding people, clients and projects…"); if (!take(await startHistoryImport({ ...setup, officeIds }))) return; }
      const total = Math.ceil(entries.length / CHUNK);
      let done = resume ? status.chunksDone : 0;
      for (; done < total; done++) {
        setProgress(`Adding time: ${n(Math.min(entries.length, done * CHUNK))} of ${n(entries.length)} entries`);
        if (!take(await addHistoryChunk(plan.fileKey, done, total, entries.slice(done * CHUNK, (done + 1) * CHUNK)))) return;
      }
      setProgress("Marking the weeks Approved…");
      if (!take(await finishHistoryImport(plan.fileKey))) return;
      setPlan(null);
      setMessage("Done. The history is in.");
    } catch { setError("The connection dropped. Choose the file again to continue where it stopped."); }
    finally { setBusy(""); setProgress(""); }
  }

  async function remove() {
    if (!confirm("Remove the imported history? The time it added, the weeks it approved, and the people, clients and projects it created are deleted. Anything that was here before stays.")) return;
    setBusy("remove"); setError(""); setMessage(""); setProgress("Removing…");
    try { const r = await removeHistoryImport(); if (take(r)) { setMessage(r.message ?? "Removed."); setPlan(null); } }
    catch { setError("The connection dropped. Press Remove imported history again."); }
    finally { setBusy(""); setProgress(""); }
  }

  const roles = plan ? Object.entries(plan.people.reduce<Record<string, number>>((a, p) => ({ ...a, [p.role]: (a[p.role] ?? 0) + 1 }), {})) : [];
  const unmatched = plan ? plan.offices.filter((c) => !officeIds[c]) : [];
  return (
    <section className="panel full" aria-labelledby="history-h">
      <h3 id="history-h">Import history</h3>
      <p className="note" style={{ margin: "0 0 10px", maxWidth: "75ch" }}>
        Bring in past time from Clockify: export a Detailed report as CSV and choose it here. People are matched by email, clients and projects by name;
        anything missing is added. New people can&apos;t sign in until you send them an invite from People. Every imported week is marked Approved.
      </p>
      <p style={{ margin: "0 0 10px" }} role="status">
        {status.state === "none" && !plan && <>Nothing imported.</>}
        {status.state === "ready" && <><strong>Imported:</strong> {n(status.entries)} time entries from {dateWithYear(status.from)} to {dateWithYear(status.to)} for {status.people} people ({status.newPeople} new), on {n(status.projects)} projects ({n(status.newProjects)} new). {n(status.sheets)} weeks marked Approved.</>}
        {status.state === "partial" && <><strong>Stopped part-way:</strong> {n(status.entries)} time entries added so far. Choose the same file again to continue.</>}
        {progress && <span className="note"> {progress}</span>}
      </p>
      {error && <p className="err-text" role="alert">{error}</p>}
      {message && <p className="alert info" role="status" style={{ marginBottom: 10 }}>{message}</p>}

      {plan && (
        <div style={{ margin: "0 0 12px" }}>
          <p style={{ margin: "0 0 6px" }}>
            <strong>{n(plan.entries.length)} time entries</strong> ({n(Math.round(plan.minutes / 60))} hours) from {dateWithYear(plan.from)} to {dateWithYear(plan.to)}:
            {" "}{plan.people.length} people ({roles.map(([r, c]) => `${c} ${ROLE_LABEL[r] ?? r}`).join(", ")}), {plan.teams.length} teams, {plan.clients.length} clients, {n(plan.projects.length)} projects, tags {plan.tags.join(", ")}.
          </p>
          {plan.split > 0 && <p className="note" style={{ margin: "0 0 6px" }}>{plan.split} {plan.split === 1 ? "entry runs" : "entries run"} past midnight and will be split over two days.</p>}
          {plan.skipped.length > 0 && (
            <details style={{ margin: "0 0 6px" }}><summary className="err-text">{plan.skipped.length} {plan.skipped.length === 1 ? "row" : "rows"} can&apos;t be read and will be left out</summary>
              <ul className="note">{plan.skipped.slice(0, 50).map((s) => <li key={s}>{s}</li>)}</ul></details>
          )}
          {status.state !== "partial" && (
            <div className="row" style={{ gap: 12, flexWrap: "wrap", margin: "6px 0" }}>
              {plan.offices.map((code) => (
                <label key={code} className="row" style={{ gap: 6 }}>
                  <span>Office <strong>{code}</strong> is</span>
                  <select value={officeIds[code] ?? ""} onChange={(e) => setOfficeIds({ ...officeIds, [code]: e.target.value })} aria-label={`Office for ${code}`} style={{ maxWidth: 220 }}>
                    <option value="">Choose…</option>
                    {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        {status.state !== "ready" && (
          <label className="btn">
            {busy === "read" ? "Reading…" : plan ? "Choose another file" : status.state === "partial" ? "Choose the file to continue" : "Choose CSV file"}
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" disabled={!!busy} aria-label="Clockify CSV file" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}
        {plan && <button type="button" className="btn primary" disabled={!!busy || (status.state !== "partial" && unmatched.length > 0)} onClick={run}>{busy === "add" ? "Importing…" : status.state === "partial" ? "Continue import" : "Import"}</button>}
        {status.state !== "none" && <button type="button" className="btn bad" disabled={!!busy} onClick={remove}>{busy === "remove" ? "Removing…" : "Remove imported history"}</button>}
      </div>
    </section>
  );
}
