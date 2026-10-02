"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { previewImport, type ImportResult } from "./actions";

const toCsv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");

export default function ImportPanel({ kind, title, help, template }: { kind: "time" | "projects"; title: string; help: string; template: string[][] }) {
  const [state, action, pending] = useActionState<ImportResult, FormData>(previewImport, null);
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const run = (commit: boolean) => {
    const fd = new FormData(formRef.current!);
    if (commit) fd.set("commit", "1");
    startTransition(() => action(fd));
  };
  const ok = state?.rows.filter((r) => !r.error).length ?? 0;
  const bad = (state?.rows.length ?? 0) - ok;
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(template))}`;

  return (
    <section className="panel">
      <h3>{title}</h3>
      <p className="note" style={{ margin: "0 0 10px" }}>{help} <a href={href} download={`clock-me-${kind}-template.csv`}>Download a template</a>.</p>
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); run(false); }} className="stack" style={{ gap: 10 }}>
        <input type="hidden" name="kind" value={kind} />
        <div><label htmlFor={`imp-file-${kind}`}>CSV file</label><input id={`imp-file-${kind}`} name="file" type="file" accept=".csv,text/csv" /></div>
        <div><label htmlFor={`imp-text-${kind}`}>Or paste CSV</label><textarea id={`imp-text-${kind}`} name="text" rows={4} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: "var(--mono)", fontSize: 12 }} /></div>
        <div className="row"><button className="btn" disabled={pending}>{pending ? "Checking…" : "Check file"}</button></div>
      </form>
      {state?.error && <p className="err-text" role="alert">{state.error}</p>}
      {state?.imported != null && <p className="alert ok" role="status">Imported {state.imported} {kind === "time" ? "entries" : "projects"}.{bad ? ` ${bad} row${bad > 1 ? "s were" : " was"} skipped.` : ""}</p>}
      {state && !state.error && state.imported == null && (
        <>
          <p style={{ margin: "12px 0 6px" }}><strong>{ok}</strong> row{ok === 1 ? "" : "s"} ready{bad ? <>, <strong>{bad}</strong> with problems (these will be skipped)</> : ""}. Nothing is saved until you import.</p>
          <div className="tablebox" style={{ maxHeight: 280, overflow: "auto" }}><table>
            <thead><tr><th className="num">Row</th>{state.headers.map((h) => <th key={h}>{h}</th>)}<th>Check</th></tr></thead>
            <tbody>{state.rows.slice(0, 500).map((r) => <tr key={r.line}><td className="num">{r.line}</td>{r.cells.map((c, i) => <td key={i}>{c}</td>)}<td>{r.error ? <span style={{ color: "var(--bad)" }}>{r.error}</span> : <span className="pill p-approved">OK</span>}</td></tr>)}</tbody>
          </table></div>
          {state.rows.length > 500 && <p className="note">Showing the first 500 rows.</p>}
          <div className="row" style={{ marginTop: 10 }}><button type="button" className="btn primary" disabled={pending || !ok} onClick={() => run(true)}>Import {ok} {kind === "time" ? "entries" : "projects"}</button></div>
        </>
      )}
    </section>
  );
}
