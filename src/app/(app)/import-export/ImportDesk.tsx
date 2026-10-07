"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { previewImport, type ImportResult } from "./actions";

export type DeskInfo = {
  noun: [string, string]; // "person", "people"
  required: string; // the columns a file must have
  columns: [string, string, boolean?][]; // each column of the template, what we do with it, and true when we don't use it
  extras: string; // optional columns the template doesn't have
};
type Props = {
  kind: "people" | "projects" | "time";
  info: DeskInfo;
  templateHref: string;
  templateFile: string;
  offices: { id: string; name: string }[]; // offices this person can add people to (people import only)
  canCreate: boolean; // admins may let a timesheet add missing projects, phases and tags
  emailOn: boolean;
};

const MAX_BYTES = 4 * 1024 * 1024;
const csvCell = (raw: string) => {
  const c = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; // an apostrophe stops spreadsheets running text as a formula
  return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
};
const plural = (n: number, [one, many]: [string, string]) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const lineCount = (t: string) => Math.max(0, t.split(/\r?\n/).filter((l) => l.trim()).length - 1);

export default function ImportDesk({ kind, info, templateHref, templateFile, offices, canCreate, emailOn }: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [drag, setDrag] = useState(false);
  const [office, setOffice] = useState(offices[0]?.id ?? "");
  const [create, setCreate] = useState(false);
  const [emailInvites, setEmailInvites] = useState(false);
  const [view, setView] = useState<"all" | "bad" | "notes">("all");
  const [rev, setRev] = useState(0); // goes up whenever the file or an option changes, so an old check isn't shown for a new file
  const [ranRev, setRanRev] = useState(-1);
  const [state, action, pending] = useActionState<ImportResult, FormData>(previewImport, null);
  const fileRef = useRef<HTMLInputElement>(null);
  const touch = () => setRev((r) => r + 1);

  const res = state && ranRev === rev && state.kind === kind ? state : null;
  const done = res?.imported != null;
  const rowsInFile = lineCount(text);
  const step = done ? 4 : res && !res.error ? 3 : text.trim() ? 2 : 1;

  const send = (commit: boolean) => {
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("text", text);
    if (kind === "people" && office) fd.set("office", office);
    if (kind === "time" && create) fd.set("create", "1");
    if (kind === "people" && emailInvites) fd.set("email", "1");
    if (commit) fd.set("commit", "1");
    setRanRev(rev);
    setView("all");
    startTransition(() => action(fd));
  };
  const take = async (file: File | undefined) => {
    setFileError("");
    if (!file) return;
    if (file.size > MAX_BYTES) { setFileError("That file is bigger than 4 MB. Split it into smaller files."); return; }
    setText(await file.text());
    setFileName(file.name);
    touch();
  };
  const clear = () => { setText(""); setFileName(""); setFileError(""); if (fileRef.current) fileRef.current.value = ""; touch(); };

  const rows = res?.rows ?? [];
  const shown = view === "bad" ? rows.filter((r) => r.error) : view === "notes" ? rows.filter((r) => !r.error && r.notes.length) : rows;
  const s = res?.summary;
  const linksCsv = res?.links ? ["Name,Email,Invite link", ...res.links.map((l) => [l.name, l.email, l.link].map(csvCell).join(","))].join("\r\n") + "\r\n" : "";

  return (
    <div className="idesk">
      <ol className="isteps">
        <li className={`istep ${step > 1 ? "done" : "now"}`}>
          <span className="inum" aria-hidden="true">{step > 1 ? "✓" : "1"}</span>
          <div className="ibody">
            <h3>Start from the template</h3>
            <p className="note">Keep the first row as it is and replace the sample rows with yours. Required columns: {info.required}.</p>
            <div className="row">
              <a className="btn" href={templateHref} download={templateFile}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" /></svg>
                Download template
              </a>
              <code className="ifile">{templateFile}</code>
            </div>
            <details className="idetails">
              <summary>What each column does</summary>
              <dl className="icols">
                {info.columns.map(([name, what, unused]) => <div key={name} className={unused ? "off" : ""}><dt>{name}</dt><dd>{what}</dd></div>)}
              </dl>
              <p className="note">Optional extra columns you can add: {info.extras}.</p>
            </details>
          </div>
        </li>

        <li className={`istep ${step > 2 ? "done" : step === 2 || step === 1 ? "now" : ""}`}>
          <span className="inum" aria-hidden="true">{step > 2 ? "✓" : "2"}</span>
          <div className="ibody">
            <h3>Add your file</h3>
            {!text.trim() ? (
              <label className={`idrop${drag ? " over" : ""}`} htmlFor={`imp-file-${kind}`}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer.files[0]); }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V5m0 0l-4 4m4-4l4 4M5 19h14" /></svg>
                <b>Drop your CSV here</b>
                <span>or click to choose a file</span>
              </label>
            ) : (
              <div className="ichip" role="status">
                <b>{fileName || "Pasted text"}</b>
                <span className="note">{plural(rowsInFile, ["row", "rows"])}</span>
                <button type="button" className="btn sm" onClick={clear}>Remove</button>
              </div>
            )}
            <input ref={fileRef} id={`imp-file-${kind}`} className="isr" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void take(e.target.files?.[0])} />
            {fileError && <p className="err-text" role="alert">{fileError}</p>}
            {!text.trim() && (
              <details className="idetails">
                <summary>Paste CSV text instead</summary>
                <textarea id={`imp-text-${kind}`} rows={5} placeholder="Name,Email,…" aria-label="CSV text" value={text}
                  onChange={(e) => { setText(e.target.value); setFileName(""); touch(); }} className="imono" />
              </details>
            )}

            {kind === "people" && (
              <div className="iopts">
                {offices.length > 1 ? (
                  <div className="ifld"><label htmlFor="imp-office">Office</label>
                    <select id="imp-office" value={office} onChange={(e) => { setOffice(e.target.value); touch(); }}>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                  </div>
                ) : offices[0] && <p className="note" style={{ margin: 0 }}>Everyone joins the <b>{offices[0].name}</b> office.</p>}
                {offices.length > 1 && <p className="note" style={{ margin: 0 }}>Used for everyone, unless your file has an Office column.</p>}
                <label className="icheck"><input type="checkbox" checked={emailInvites} disabled={!emailOn} onChange={(e) => setEmailInvites(e.target.checked)} />
                  <span>Email everyone their invite link{!emailOn && <small> (email isn&rsquo;t switched on yet, so you&rsquo;ll share the links yourself)</small>}</span></label>
              </div>
            )}
            {kind === "time" && canCreate && (
              <div className="iopts">
                <label className="icheck"><input type="checkbox" checked={create} onChange={(e) => { setCreate(e.target.checked); touch(); }} />
                  <span>Add what&rsquo;s missing<small> Projects, clients, phases (the Task column) and tags that the file names but we don&rsquo;t have yet will be created for you.</small></span></label>
              </div>
            )}

            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" disabled={pending || !text.trim()} onClick={() => send(false)}>{pending && !done ? "Checking…" : res && !res.error ? "Check again" : "Check file"}</button>
              <span className="note">Nothing is saved yet.</span>
            </div>
          </div>
        </li>

        <li className={`istep ${done ? "done" : step === 3 ? "now" : ""}`}>
          <span className="inum" aria-hidden="true">{done ? "✓" : "3"}</span>
          <div className="ibody">
            <h3>{done ? "Imported" : "Look it over, then import"}</h3>
            {!res && <p className="note">After you check the file, you will see what we understood from every row here.</p>}
            {res?.error && <p className="alert bad" role="alert">{res.error}</p>}

            {res && !res.error && s && (
              <div role="status">
                {done ? (
                  <div className="alert ok idone">
                    {res.done?.map((d, i) => <p key={i} style={{ margin: 0 }}>{d}</p>)}
                    {s.bad > 0 && <p style={{ margin: 0 }}>{plural(s.bad, ["row was", "rows were"])} skipped.</p>}
                  </div>
                ) : (
                  <>
                    <div className="itiles">
                      <button type="button" className={`itile ok${view === "all" ? " on" : ""}`} onClick={() => setView("all")}><b>{s.ok.toLocaleString("en-US")}</b><span>ready to import</span></button>
                      <button type="button" className={`itile warn${view === "notes" ? " on" : ""}`} onClick={() => setView("notes")} disabled={!s.withNotes}><b>{s.withNotes.toLocaleString("en-US")}</b><span>with a heads-up</span></button>
                      <button type="button" className={`itile bad${view === "bad" ? " on" : ""}`} onClick={() => setView("bad")} disabled={!s.bad}><b>{s.bad.toLocaleString("en-US")}</b><span>will be skipped</span></button>
                    </div>
                    {s.reasons.length > 0 && (
                      <div className="ireasons">
                        <b>Why rows are skipped</b>
                        <ul>{s.reasons.map((r) => <li key={r.text}><span>{r.text}</span><i>{r.count.toLocaleString("en-US")}</i></li>)}</ul>
                      </div>
                    )}
                    {res.adds.length > 0 && <div className="alert info"><b>This import will also add</b>{res.adds.map((a, i) => <p key={i} style={{ margin: "2px 0 0" }}>{a}</p>)}</div>}
                    {res.columnNotes.length > 0 && <ul className="icolnotes">{res.columnNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                    <div className="tablebox ipreview"><table className="imptable">
                      <thead><tr><th className="num">Row</th>{res.headers.map((h) => <th key={h}>{h}</th>)}<th>Check</th></tr></thead>
                      <tbody>
                        {shown.map((r) => (
                          <tr key={r.line} className={r.error ? "bad" : ""}>
                            <td className="num" data-l="Row">{r.line}</td>
                            {r.cells.map((c, i) => <td key={i} data-l={res.headers[i]}>{c}</td>)}
                            <td>{r.error ? <span className="pill p-bad">{r.error}</span> : <><span className="pill p-ok">Ready</span>{r.notes.map((n, i) => <small key={i} className="inote">{n}</small>)}</>}</td>
                          </tr>
                        ))}
                        {!shown.length && <tr><td colSpan={res.headers.length + 2} className="empty">Nothing to show here.</td></tr>}
                      </tbody>
                    </table></div>
                    {res.total > rows.length && <p className="note">Showing the first {rows.length.toLocaleString("en-US")} of {res.total.toLocaleString("en-US")} rows. All of them are checked.</p>}
                    <div className="row" style={{ marginTop: 12 }}>
                      <button type="button" className="btn primary" disabled={pending || !s.ok} onClick={() => send(true)}>{pending ? "Importing…" : `Import ${plural(s.ok, info.noun)}`}</button>
                      {s.bad > 0 && s.ok > 0 && <span className="note">The {plural(s.bad, ["row", "rows"])} with problems will be left out.</span>}
                    </div>
                  </>
                )}

                {done && res.links && res.links.length > 0 && (
                  <div className="ilinks">
                    <h4>Invite links</h4>
                    <p className="note">Each link lets one person set a password and sign in. It works for 7 days. Send every link only to its own person.</p>
                    <div className="row">
                      <button type="button" className="btn sm" onClick={() => void navigator.clipboard?.writeText(res.links!.map((l) => `${l.name} <${l.email}>: ${l.link}`).join("\n"))}>Copy all</button>
                      <a className="btn sm" download="the-time-sink-invite-links.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(linksCsv)}`}>Download as CSV</a>
                    </div>
                    <div className="tablebox"><table>
                      <thead><tr><th>Name</th><th>Email</th><th>Link</th></tr></thead>
                      <tbody>{res.links.map((l) => (
                        <tr key={l.email}><td>{l.name}</td><td>{l.email}</td>
                          <td><button type="button" className="btn sm" onClick={() => void navigator.clipboard?.writeText(l.link)}>Copy link</button></td></tr>
                      ))}</tbody>
                    </table></div>
                  </div>
                )}
                {done && <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={clear}>Import another file</button></div>}
              </div>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}
