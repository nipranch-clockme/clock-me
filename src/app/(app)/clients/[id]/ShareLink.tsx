"use client";
import { useEffect, useState, useTransition } from "react";
import { changeShareLink, type ShareOp } from "./actions";

/** The admin's controls for a client's view-only report link: create, copy, open, turn off, make a new one, and count approved time only. */
export default function ShareLink({ clientId, path, approvedOnly, opened }: { clientId: string; path: string | null; approvedOnly: boolean; opened: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = path ? `${origin}${path}` : "";

  const run = (op: ShareOp, ask?: string) => {
    if (ask && !window.confirm(ask)) return;
    setError("");
    start(async () => { const r = await changeShareLink(clientId, op); if (!r.ok) setError(r.error ?? "That didn't work. Try again."); });
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Couldn't copy. Select the link and copy it yourself."); }
  };

  if (!path) {
    return (
      <div className="shadmin">
        <p className="note">Give this client a private link to a view-only report: hours per project and tag, with filters. They don&rsquo;t need to log in. It never shows people, descriptions or phases.</p>
        <button type="button" className="btn primary" disabled={pending} onClick={() => run("on")}>{pending ? "Creating…" : "Create link"}</button>
        {error && <p className="err-text" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="shadmin">
      <p className="note">Anyone with this link can see the report, so send it only to the client. It shows hours per project and tag, never people, descriptions or phases.</p>
      <div className="shlink">
        <input readOnly value={url} aria-label="The client's link" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={copy} disabled={!url}>{copied ? "Copied" : "Copy link"}</button>
        <a className="btn" href={path} target="_blank" rel="noopener noreferrer">Open</a>
      </div>
      <label className="tog" style={{ marginTop: 12 }}>
        <input type="checkbox" role="switch" checked={approvedOnly} disabled={pending} onChange={(e) => run(e.target.checked ? "approvedOnly" : "allTime")} /><span aria-hidden="true" /> Count only approved time
      </label>
      <p className="note" style={{ margin: "4px 0 0" }}>{approvedOnly ? "Time in weeks that haven't been approved yet is left out." : "Counts everything logged, so it matches your Reports page."}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" disabled={pending} onClick={() => run("renew", "Make a new link? The old link will stop working, so send the new one to your client.")}>Make a new link</button>
        <button type="button" className="btn" disabled={pending} onClick={() => run("off", "Turn off this link? Anyone using it will see nothing. You can turn it on again later with a new link.")}>Turn off</button>
        <span className="note">{opened}</span>
      </div>
      {error && <p className="err-text" role="alert">{error}</p>}
    </div>
  );
}
