"use client";
import { useActionState, useMemo, useState } from "react";
import TableFilter from "./TableFilter";
import { MONTH_ABBR, cellName, type GridResult } from "@/lib/monthGrid";

export type GridRow = {
  id: string; name: string;
  /** The row's first cells (<td>s), before the months. */
  lead: React.ReactNode;
  /** The usual figure, which a month falls back to when nothing else is set for it. */
  usual: number;
  /** What each of the 12 months is. */
  values: number[];
  editable: boolean;
  /** Ids of the tags that are this client's kinds of work (contract tables only). */
  workTypes?: string[];
};
type Tag = { id: string; name: string };
type Props = {
  action: (prev: GridResult, form: FormData) => Promise<GridResult>;
  /** "contracts": hours a month per client, with a year total and work types. "hours": hours a week per person, with a yearly average. */
  kind: "contracts" | "hours";
  year: number; months: string[];
  /** The headings (<th>s) for the row's lead cells. */
  heads: React.ReactNode;
  /** How many columns the lead cells take. */
  leadCols: number;
  rows: GridRow[];
  /** Index of the current month when the table shows this year, for its heading. */
  now: number | null;
  /** The month (index) that Per day and Per week are worked out from, and how many working days it has. */
  refMonth: number; refDays: number;
  tags?: Tag[];
  searchLabel: string;
  /** Words for a row in messages, e.g. "client". */
  noun: string;
};

// A blank cell and a 0 both mean nothing that month. A month the same as the usual figure shows it; it is stored only when it differs (see monthGrid.ts).
const show = (v: number, usual: number) => (v > 0 ? String(v) : usual > 0 ? "0" : "");
const num = (s: string) => { const n = s.trim() === "" ? 0 : Number(s); return Number.isFinite(n) && n >= 0 ? n : 0; };
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** A table with one row per client or person and a box for each month, saved together. */
export default function MonthGrid({ action, kind, year, months, heads, leadCols, rows, now, refMonth, refDays, tags = [], searchLabel, noun }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const initial = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r.values.map((v) => show(v, r.usual))])), [rows]);
  const [vals, setVals] = useState<Record<string, string[]>>(initial);
  const kindsOf = () => Object.fromEntries(rows.map((r) => [r.id, r.workTypes ?? []]));
  const [wts, setWts] = useState<Record<string, string[]>>(kindsOf);
  // When the server sends fresh figures (after a save), the boxes show them: a blank box becomes the 0 it was stored as.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) { setSeen(initial); setVals(initial); setWts(kindsOf()); }
  const editable = rows.filter((r) => r.editable);
  const valsOf = (r: GridRow) => vals[r.id] ?? initial[r.id]; // a row that appeared after the table was loaded starts from what the server sent
  const dirty = editable.some((r) => valsOf(r).some((s, i) => num(s) !== num(initial[r.id][i])) || (kind === "contracts" && !same(wts[r.id] ?? [], r.workTypes ?? [])));
  const cell = (r: GridRow, i: number, s: string) => setVals((p) => ({ ...p, [r.id]: (p[r.id] ?? initial[r.id]).map((x, j) => (j === i ? s : x)) }));
  const sums = months.map((_, i) => rows.reduce((a, r) => a + num(valsOf(r)[i]), 0));
  const contracts = kind === "contracts";

  return (
    <form action={formAction}>
      <input type="hidden" name="year" value={year} />
      <TableFilter label={searchLabel} placeholder={`${searchLabel}…`} />
      <div className="tablebox"><table className="mgrid">
        <thead><tr>
          {heads}
          {months.map((m, i) => <th key={m} className={`num${i === now ? " now" : ""}`} scope="col">{MONTH_ABBR[i]}</th>)}
          <th className="num" scope="col">{contracts ? "Year total" : "Average a week"}</th>
          {contracts && <><th className="num" scope="col">Per day</th><th className="num" scope="col">Per week</th><th scope="col">Work type</th></>}
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const v = valsOf(r), total = v.reduce((a, s) => a + num(s), 0), perDay = refDays ? num(v[refMonth]) / refDays : 0;
            const picked = tags.filter((t) => (wts[r.id] ?? []).includes(t.id)).map((t) => t.name); // in the tags' own order, however they were ticked
            return (
              <tr key={r.id}>
                {r.lead}
                {months.map((m, i) => {
                  const diff = num(v[i]) !== r.usual;
                  return (
                    <td key={m} className="num mc" data-l={MONTH_ABBR[i]}>
                      {r.editable
                        ? <input className={`cell${diff ? " chg" : ""}`} type="number" min="0" step="any" inputMode="decimal" name={cellName(r.id, m)} value={v[i]}
                            onChange={(e) => cell(r, i, e.target.value)} aria-label={`${r.name}, ${MONTH_ABBR[i]} ${year}`} title={diff ? `Different from the usual ${fmt(r.usual)}` : undefined} />
                        : <span className={diff ? "chgtxt" : undefined}>{v[i] || "–"}</span>}
                    </td>
                  );
                })}
                <td className="num tot">{fmt(contracts ? total : total / 12)}</td>
                {contracts && <>
                  <td className="num">{perDay ? fmt(perDay) : "–"}</td>
                  <td className="num">{perDay ? fmt(perDay * 5) : "–"}</td>
                  <td className="wt">
                    {r.editable && tags.length > 0
                      ? <details className="wtpick">
                          <summary>{picked.length ? picked.join(" + ") : <span className="note">Choose</span>}</summary>
                          <input type="hidden" name={`w|${r.id}`} value="" />
                          <div className="wtbox">{tags.map((t) => (
                            <label key={t.id} className="tagpick-i"><input type="checkbox" name={`w|${r.id}`} value={t.id} checked={(wts[r.id] ?? []).includes(t.id)}
                              onChange={(e) => setWts((p) => ({ ...p, [r.id]: e.target.checked ? [...(p[r.id] ?? []), t.id] : (p[r.id] ?? []).filter((x) => x !== t.id) }))} />{t.name}</label>
                          ))}</div>
                        </details>
                      : picked.length ? picked.join(" + ") : <span className="note">–</span>}
                  </td>
                </>}
              </tr>
            );
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot><tr>
            <td colSpan={leadCols} className="tl">{contracts ? "All clients" : "Everyone listed"}</td>
            {months.map((m, i) => <td key={m} className="num">{fmt(sums[i])}</td>)}
            <td className="num">{fmt(contracts ? sums.reduce((a, b) => a + b, 0) : sums.reduce((a, b) => a + b, 0) / 12)}</td>
            {contracts && <td colSpan={3} />}
          </tr></tfoot>
        )}
      </table></div>
      {editable.length > 0 && (
        <div className="mg-save">
          <button className="btn primary" disabled={pending || !dirty}>{pending ? "Saving…" : "Save changes"}</button>
          <span className="note" role="status">{state?.error ? <span className="err-text">{state.error}</span> : dirty ? `You have unsaved changes. Save before you change the year.` : state?.message ?? `Nothing to save yet. Change a ${noun}'s hours above.`}</span>
        </div>
      )}
    </form>
  );
}
