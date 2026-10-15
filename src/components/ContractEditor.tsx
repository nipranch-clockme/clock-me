"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MONTH_ABBR, cellName, cellNumber, cellText, type GridResult } from "@/lib/monthGrid";
import type { GridRow, Option, Tag } from "./MonthGrid";

const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Past months are locked because their hours are already reported. Changing one asks twice; true only when both are confirmed. */
export function confirmUnlockPast() {
  if (!window.confirm("Past months are locked, because their hours are already reported on the Clients page. Change past months? (Warning 1 of 2)")) return false;
  return window.confirm("Warning 2 of 2: this changes figures already reported for past months. Only do this to correct a figure. Continue?");
}

type Props = {
  /** The client being edited, or null when the dialog is closed. */
  row: GridRow | null;
  action: (prev: GridResult, form: FormData) => Promise<GridResult>;
  year: number; months: string[];
  /** How many months from January are past (their boxes are locked until confirmed). */
  past: number;
  tags: Tag[]; statuses: Option[]; drawings: Option[];
  onClose: () => void;
};

/** One client's contract in a dialog: its hours for each month, status, drawing standard and work types, saved together through the table's own action. */
export default function ContractEditor(props: Props) {
  const { row, onClose } = props;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (row && !d.open) d.showModal(); if (!row && d.open) d.close(); }, [row]);
  return (
    <dialog ref={ref} className="wide cedit" onClose={onClose} aria-labelledby="ce-title">
      {row && <ContractForm {...props} row={row} />}
    </dialog>
  );
}

/** The form. Only the figures and choices the person changed are sent, so a dialog left open cannot write back an old value over someone's newer one. */
function ContractForm({ row, action, year, months, past, tags, statuses, drawings, onClose }: Props & { row: GridRow }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const [vals, setVals] = useState<string[]>(() => row.values.map((v) => cellText(v, row.usual)));
  const [wts, setWts] = useState<string[]>(() => row.workTypes ?? []);
  const [status, setStatus] = useState(row.status ?? "");
  const [drawing, setDrawing] = useState(row.drawing ?? "");
  const [unlocked, setUnlocked] = useState(false);
  // Closes and reloads the table once the save has gone through. The page is reloaded, not the dialog state, so this runs once per result.
  useEffect(() => { if (state?.ok) { onClose(); router.refresh(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const changedMonth = (i: number) => cellNumber(vals[i]) !== row.values[i];
  const changedWts = !same(wts, row.workTypes ?? []);
  const changedStatus = status !== (row.status ?? "");
  const changedDrawing = drawing !== (row.drawing ?? "");
  const dirty = vals.some((_, i) => changedMonth(i)) || changedWts || changedStatus || changedDrawing;
  const locked = (i: number) => i < past && !unlocked;
  const kindsName = changedWts ? `w|${row.id}` : undefined;
  const statusName = changedStatus ? `st|${row.id}` : undefined;
  const drawingName = changedDrawing ? `dr|${row.id}` : undefined;
  const picked = tags.filter((t) => wts.includes(t.id)).map((t) => t.name);

  // Saved by hand, as the table does, so what was typed stays if the save comes back with an error.
  const save = (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => formAction(fd)); };
  const unlock = () => { if (confirmUnlockPast()) setUnlocked(true); };

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 4 }}>
        <h2 id="ce-title">Edit {row.name}</h2>
        <button type="button" className="btn sm" onClick={onClose}>Close</button>
      </div>
      <p className="note" style={{ margin: "0 0 14px" }}>{row.usual > 0 ? `Usual ${fmt(row.usual)} hours a month.` : "No usual monthly hours."} A month left at the usual figure follows it. Type 0 for a month with no contract.</p>
      <form onSubmit={save}>
        <input type="hidden" name="year" value={year} />
        {unlocked && <input type="hidden" name="pastOk" value="1" />}

        <fieldset className="ce-sec">
          <legend>Hours, {year}</legend>
          <div className="ce-months">
            {months.map((m, i) => {
              const id = `ce-${row.id}-m${i}`;
              return (
                <div key={m} className={`ce-month${i < past ? " past" : ""}${changedMonth(i) ? " chg" : ""}`}>
                  <label htmlFor={id}>{MONTH_ABBR[i]}</label>
                  <input id={id} className="cell" type="number" min="0" step="any" inputMode="decimal" value={vals[i]} disabled={locked(i)}
                    name={changedMonth(i) ? cellName(row.id, m) : undefined}
                    title={locked(i) ? "A past month is locked. Choose Change past months to edit it." : undefined}
                    onChange={(e) => setVals((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
              );
            })}
          </div>
          {past > 0 && (unlocked
            ? <p className="note" style={{ margin: "8px 0 0" }}>Past months are unlocked. They lock again after you save.</p>
            : <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={unlock}>Change past months</button>)}
        </fieldset>

        <div className="ce-row">
          <div>
            <label htmlFor={`ce-${row.id}-st`}>Status</label>
            <select id={`ce-${row.id}-st`} name={statusName} value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`ce-${row.id}-dr`}>Standard</label>
            <select id={`ce-${row.id}-dr`} name={drawingName} value={drawing} onChange={(e) => setDrawing(e.target.value)}>
              <option value="">Not set</option>
              {drawings.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>

        {tags.length > 0 && (
          <fieldset className="ce-sec">
            <legend>Work type{picked.length ? `: ${picked.join(" + ")}` : ""}</legend>
            {kindsName && <input type="hidden" name={kindsName} value="" />}
            <div className="ce-tags">{tags.map((t) => (
              <label key={t.id} className="tagpick-i"><input type="checkbox" name={kindsName} value={t.id} checked={wts.includes(t.id)}
                onChange={(e) => setWts((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))} />{t.name}</label>
            ))}</div>
          </fieldset>
        )}

        {state?.error && <p className="err-text" role="alert" style={{ margin: "12px 0 0" }}>{state.error}</p>}
        <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <button className="btn primary" disabled={pending || !dirty}>{pending ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}
