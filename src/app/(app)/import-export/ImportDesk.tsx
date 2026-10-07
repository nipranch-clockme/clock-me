"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseCsv } from "@/lib/csv";
import { MAX_IMPORT_BYTES } from "@/lib/importTypes";
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
  defaultOffice?: string; // the office chosen to start with: the person's own
  canCreate: boolean; // admins may let a timesheet add missing projects, phases and tags
  emailOn: boolean;
  viewHref: string; // where to look at what was just imported
};

const bytesOf = (t: string) => new TextEncoder().encode(t).length;
const TOO_BIG = "That is more than 3.5 MB. Split it into smaller files.";
const csvCell = (raw: string) => {
  const c = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; // an apostrophe stops spreadsheets running text as a formula
  return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
};
const plural = (n: number, [one, many]: [string, string]) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const SOMETHING_WRONG = "Something went wrong and nothing was saved. Try again, or split the file into smaller ones.";

export default function ImportDesk({ kind, info, templateHref, templateFile, offices, defaultOffice, canCreate, emailOn, viewHref }: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [fileNote, setFileNote] = useState("");
  const [drag, setDrag] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [office, setOffice] = useState(offices.find((o) => o.id === defaultOffice)?.id ?? offices[0]?.id ?? "");
  const [create, setCreate] = useState(false);
  const [emailInvites, setEmailInvites] = useState(false);
  const [sampleOk, setSampleOk] = useState(false);
  const [view, setView] = useState<"all" | "ok" | "notes" | "bad">("all");
  const [rev, setRev] = useState(0); // goes up whenever the file or an option changes, so an old check isn't shown for a new file
  const [ranRev, setRanRev] = useState(-1);
  const [state, setState] = useState<ImportResult>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState("");
  const busy = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const touch = () => { setRev((r) => r + 1); setSampleOk(false); };

  const res = state && ranRev === rev && state.kind === kind ? state : null;
  const done = res?.imported != null;
  const hasLinks = !!(done && res?.links?.length);
  const rowsInFile = useMemo(() => Math.max(0, parseCsv(text).rows.length - 1), [text]);
  const step = done ? 4 : res && !res.error ? 3 : text.trim() ? 2 : 1;

  // A file that was just chosen takes the focus (the box it came from is gone), and so does the result of a check.
  useEffect(() => { if (fileName) chipRef.current?.focus(); }, [fileName]);
  useEffect(() => { if (state && !pending) headRef.current?.focus(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  // The invite links exist only on this screen, so leaving it asks first.
  useEffect(() => {
    if (!hasLinks) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasLinks]);

  const send = async (commit: boolean) => {
    if (busy.current) return;
    if (bytesOf(text) > MAX_IMPORT_BYTES) { setFileError(TOO_BIG); return; }
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("text", text);
    if (kind === "people" && office) fd.set("office", office);
    if (kind === "time" && create) fd.set("create", "1");
    if (kind === "people" && emailInvites) fd.set("email", "1");
    if (commit) fd.set("commit", "1");
    busy.current = true;
    setFileError("");
    setRanRev(rev);
    setView("all");
    setPending(true);
    try { setState(await previewImport(null, fd)); }
    catch { setState({ kind, headers: [], rows: [], total: 0, summary: { ok: 0, withNotes: 0, bad: 0, reasons: [], moreReasons: 0 }, adds: [], columnNotes: [], error: SOMETHING_WRONG }); }
    finally { busy.current = false; setPending(false); }
  };
  const take = async (file: File | undefined, count = 1) => {
    setFileError(""); setFileNote("");
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES * 1.2) { setFileError(TOO_BIG); return; }
    const t = await file.text();
    if (bytesOf(t) > MAX_IMPORT_BYTES) { setFileError(TOO_BIG); return; }
    if (!t.trim()) { setFileError("That file is empty."); return; }
    setText(t);
    setFileName(file.name);
    if (count > 1) setFileNote(`Only the first file, ${file.name}, was used.`);
    touch();
  };
  const clear = () => {
    setText(""); setFileName(""); setFileError(""); setFileNote(""); setState(null);
    if (fileRef.current) fileRef.current.value = "";
    touch();
    setTimeout(() => fileRef.current?.focus(), 0);
  };
  const copy = async (key: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? "" : c)), 2000); }
    catch { setCopied("failed"); }
  };
  const another = () => { if (hasLinks && !window.confirm("The invite links on this screen will be gone. Have you copied or downloaded them?")) return; clear(); };

  const rows = res?.rows ?? [];
  const shown = view === "bad" ? rows.filter((r) => r.error) : view === "notes" ? rows.filter((r) => !r.error && r.notes.length) : view === "ok" ? rows.filter((r) => !r.error) : rows;
  const s = res?.summary;
  const tile = (v: "ok" | "notes" | "bad") => ({ "aria-pressed": view === v, onClick: () => setView(view === v ? "all" : v) });
  const linksCsv = res?.links ? ["Name,Email,Invite link", ...res.links.map((l) => [l.name, l.email, l.link].map(csvCell).join(","))].join("\r\n") + "\r\n" : "";
  const live = done ? "Import finished." : res?.error ? res.error : res && s ? `Checked ${res.total} rows: ${s.ok} ready, ${s.bad} will be skipped.` : "";

  return (
    <div className="idesk"
      onDragOver={(e) => { if (!fileName && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }}
      onDrop={(e) => { if (fileName) return; e.preventDefault(); setDrag(false); void take(e.dataTransfer.files[0], e.dataTransfer.files.length); }}>
      <p className="sr-only" role="status" aria-live="polite">{live}</p>
      <ol className="isteps">
        {!done && (
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
        )}

        {!done && (
          <li className={`istep ${step > 2 ? "done" : step === 2 || step === 1 ? "now" : ""}`}>
            <span className="inum" aria-hidden="true">{step > 2 ? "✓" : "2"}</span>
            <div className="ibody">
              <h3>Add your file</h3>
              {!fileName ? (
                <label className={`idrop${drag ? " over" : ""}`} htmlFor={`imp-file-${kind}`}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V5m0 0l-4 4m4-4l4 4M5 19h14" /></svg>
                  <b>Drop your CSV here</b>
                  <span>or click to choose a file</span>
                </label>
              ) : (
                <div className="ichip" ref={chipRef} tabIndex={-1}>
                  <b>{fileName}</b>
                  <span className="note">{plural(rowsInFile, ["row", "rows"])}</span>
                  <button type="button" className="btn sm" onClick={clear}>Remove</button>
                </div>
              )}
              <input ref={fileRef} id={`imp-file-${kind}`} className="isr" type="file" accept=".csv,text/csv,text/plain" disabled={!!fileName} aria-label="CSV file"
                onChange={(e) => void take(e.target.files?.[0], e.target.files?.length ?? 1)} />
              {fileError && <p className="err-text" role="alert">{fileError}</p>}
              {fileNote && <p className="note" role="status">{fileNote}</p>}
              {!fileName && (
                <details className="idetails" open={pasteOpen} onToggle={(e) => setPasteOpen(e.currentTarget.open)}>
                  <summary>Paste CSV text instead</summary>
                  <textarea id={`imp-text-${kind}`} rows={5} placeholder="Name,Email,…" aria-label="CSV text" value={text}
                    onChange={(e) => { setText(e.target.value); setState(null); touch(); }} className="imono" />
                  {text.trim() && <p className="note" style={{ margin: "6px 0 0" }}>{plural(rowsInFile, ["row", "rows"])}. <button type="button" className="linkbtn" onClick={clear}>Clear</button></p>}
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
                <button type="button" className={res && !res.error ? "btn" : "btn primary"} disabled={pending || !text.trim()} onClick={() => void send(false)}>{pending ? "Checking…" : res && !res.error ? "Check again" : "Check file"}</button>
                <span className="note">Nothing is saved yet.</span>
              </div>
            </div>
          </li>
        )}

        <li className={`istep ${done ? "done" : step === 3 ? "now" : ""}`}>
          <span className="inum" aria-hidden="true">{done ? "✓" : "3"}</span>
          <div className="ibody">
            <h3 ref={headRef} tabIndex={-1}>{done ? "Imported" : "Look it over, then import"}</h3>
            {!res && <p className="note">After you check the file, you will see what we understood from every row here.</p>}
            {res?.error && <p className="alert bad" role="alert">{res.error}</p>}

            {res && !res.error && s && (
              <div>
                {done ? (
                  <div className="alert ok idone">
                    {res.done?.map((d, i) => <p key={i} style={{ margin: 0 }}>{d}</p>)}
                    {s.bad > 0 && <p style={{ margin: 0 }}>{plural(s.bad, ["row was", "rows were"])} skipped.</p>}
                  </div>
                ) : (
                  <>
                    <div className="itiles">
                      <button type="button" className={`itile ok${view === "ok" ? " on" : ""}`} disabled={!s.ok} {...tile("ok")}><b>{s.ok.toLocaleString("en-US")}</b><span>ready to import</span></button>
                      <button type="button" className={`itile warn${view === "notes" ? " on" : ""}`} disabled={!s.withNotes} {...tile("notes")}><b>{s.withNotes.toLocaleString("en-US")}</b><span>with a heads-up</span></button>
                      <button type="button" className={`itile bad${view === "bad" ? " on" : ""}`} disabled={!s.bad} {...tile("bad")}><b>{s.bad.toLocaleString("en-US")}</b><span>will be skipped</span></button>
                    </div>
                    {s.reasons.length > 0 && (
                      <div className="ireasons">
                        <b>Why rows are skipped</b>
                        <ul>
                          {s.reasons.map((r) => <li key={r.text}><span>{r.text}</span><i>{r.count.toLocaleString("en-US")}</i></li>)}
                          {s.moreReasons > 0 && <li><span>Other reasons</span><i>{s.moreReasons.toLocaleString("en-US")}</i></li>}
                        </ul>
                      </div>
                    )}
                    {res.sample ? (
                      <div className="alert warn">
                        <b>{plural(res.sample, ["row", "rows"])} still the template&rsquo;s example {res.sample === 1 ? "row" : "rows"}</b>
                        <p style={{ margin: "2px 0 8px" }}>The examples are made-up {kind === "people" ? "people (some are admins)" : kind === "projects" ? "projects and clients" : "time entries"}. Delete them from your file and check it again, unless you really want them.</p>
                        <label className="icheck"><input type="checkbox" checked={sampleOk} onChange={(e) => setSampleOk(e.target.checked)} /><span>Yes, import the example rows too</span></label>
                      </div>
                    ) : null}
                    {res.adds.length > 0 && <div className="alert info"><b>This import will also add</b>{res.adds.map((a, i) => <p key={i} style={{ margin: "2px 0 0" }}>{a}</p>)}</div>}
                    {res.columnNotes.length > 0 && <ul className="icolnotes">{res.columnNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                    <p className="note ishowing">{view === "all" ? `Showing all ${rows.length.toLocaleString("en-US")} rows. Pick a box above to show only some.` : `Showing ${shown.length.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} rows. Pick the same box again to show all.`}</p>
                    <div className="tablebox ipreview"><table className="imptable">
                      <thead><tr><th className="num">Row</th>{res.headers.map((h) => <th key={h}>{h}</th>)}<th>Check</th></tr></thead>
                      <tbody>
                        {shown.map((r) => (
                          <tr key={r.line} className={r.error ? "bad" : ""}>
                            <td className="num" data-l="Row">{r.line}</td>
                            {r.cells.map((c, i) => <td key={i} data-l={res.headers[i]}>{c}</td>)}
                            <td className="ichk">{r.error ? <span className="pill p-bad">{r.error}</span> : <><span className="pill p-ok">Ready</span>{r.notes.map((n, i) => <small key={i} className="inote">{n}</small>)}</>}</td>
                          </tr>
                        ))}
                        {!shown.length && <tr><td colSpan={res.headers.length + 2} className="empty">Nothing to show here.</td></tr>}
                      </tbody>
                    </table></div>
                    {res.total > rows.length && <p className="note">Showing {rows.length.toLocaleString("en-US")} of {res.total.toLocaleString("en-US")} rows: the first 1,000, and every later row with a problem or a heads-up. All of them are checked.</p>}
                    <div className="row" style={{ marginTop: 12 }}>
                      <button type="button" className="btn primary" disabled={pending || !s.ok || (!!res.sample && !sampleOk)} onClick={() => void send(true)}>{pending ? "Importing…" : `Import ${plural(s.ok, info.noun)}`}</button>
                      {s.bad > 0 && s.ok > 0 && <span className="note">The {plural(s.bad, ["row", "rows"])} with problems will be left out.</span>}
                    </div>
                  </>
                )}

                {done && res.links && res.links.length > 0 && (
                  <div className="ilinks">
                    <h4>Invite links</h4>
                    <p className="note"><b>These links are shown only once.</b> Copy them or download the file now. Each link lets one person set a password and sign in, and works for 7 days. Send every link only to its own person. You can always make a new link for anyone from the People page.</p>
                    <div className="row">
                      <button type="button" className="btn sm" onClick={() => void copy("all", res.links!.map((l) => `${l.name} <${l.email}>: ${l.link}`).join("\n"))}>{copied === "all" ? "Copied" : "Copy all"}</button>
                      <a className="btn sm" download="the-time-sink-invite-links.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(linksCsv)}`}>Download as CSV</a>
                    </div>
                    {copied === "failed" && <p className="err-text" role="alert">Couldn&rsquo;t copy automatically. Download the CSV instead, or select a link and copy it by hand.</p>}
                    <div className="tablebox"><table>
                      <thead><tr><th>Name</th><th>Email</th><th>Link</th></tr></thead>
                      <tbody>{res.links.map((l) => (
                        <tr key={l.email}><td>{l.name}</td><td>{l.email}</td>
                          <td><div className="ilink"><input readOnly value={l.link} aria-label={`Invite link for ${l.name}`} className="imono" onFocus={(e) => e.currentTarget.select()} />
                            <button type="button" className="btn sm" onClick={() => void copy(l.email, l.link)}>{copied === l.email ? "Copied" : "Copy link"}</button></div></td></tr>
                      ))}</tbody>
                    </table></div>
                  </div>
                )}
                {done && <div className="row" style={{ marginTop: 12 }}><a className="btn" href={viewHref}>{kind === "people" ? "See the people" : kind === "projects" ? "See the projects" : "See the time in Reports"}</a><button type="button" className="btn" onClick={another}>Import another file</button></div>}
              </div>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}
