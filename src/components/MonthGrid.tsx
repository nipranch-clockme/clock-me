"use client";
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import TableFilter from "./TableFilter";
import { MONTH_ABBR, cellName, type GridResult } from "@/lib/monthGrid";
import { labelOf } from "@/lib/clientStatus";

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
  /** The id of the location the row belongs to, for the location filter (contract tables only). */
  place?: string | null;
  /** The row's status and drawing standard, as values from the lists the table is given ("" for none; contract tables only). */
  status?: string;
  drawing?: string;
  /** The hours clocked on the row in each month, shown under the boxes when Show clocked hours is on (contract tables only). */
  clocked?: number[];
};
type Option = { value: string; label: string };
type Tag = { id: string; name: string };
type Props = {
  action: (prev: GridResult, form: FormData) => Promise<GridResult>;
  /** "contracts": hours a month per client, with a year total, work types, status and drawing standard. "hours": hours a week per person, with a yearly average. */
  kind: "contracts" | "hours";
  year: number; months: string[];
  /** The headings (<th>s) for the row's lead cells. */
  heads: React.ReactNode;
  /** How many columns the lead cells take (the client's name and, in contract tables, its status). */
  leadCols: number;
  rows: GridRow[];
  /** Index of the current month when the table shows this year, for its heading. */
  now: number | null;
  /** How many months from January are past. Their boxes are locked until an admin confirms a change twice. */
  past?: number;
  /** The month (index) that Per day is worked out from, and how many working days it has. */
  refMonth: number; refDays: number;
  tags?: Tag[];
  searchLabel: string;
  /** Words for a row in messages, e.g. "client". */
  noun: string;
  /** Contract tables only: the locations to filter by, and the choices for a client's status and drawing standard. */
  places?: { id: string; name: string }[];
  statuses?: Option[];
  drawings?: Option[];
};

// A blank cell and a 0 both mean nothing that month. A month the same as the usual figure shows it; it is stored only when it differs (see monthGrid.ts).
const show = (v: number, usual: number) => (v > 0 ? String(v) : usual > 0 ? "0" : "");
const num = (s: string) => { const n = s.trim() === "" ? 0 : Number(s); return Number.isFinite(n) && n >= 0 ? n : 0; };
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
type Cells = Record<string, string[]>;
type Kinds = Record<string, string[]>;
type Meta = { status: string; drawing: string };
type Metas = Record<string, Meta>;
const cellsOf = (rs: GridRow[], usualOf: (r: GridRow) => number) => Object.fromEntries(rs.map((r) => [r.id, r.values.map((v) => show(v, usualOf(r)))]));
const kindsOfRows = (rs: GridRow[]): Kinds => Object.fromEntries(rs.map((r) => [r.id, r.workTypes ?? []]));
const metasOfRows = (rs: GridRow[]): Metas => Object.fromEntries(rs.map((r) => [r.id, { status: r.status ?? "", drawing: r.drawing ?? "" }]));
const sameMeta = (a: Meta, b: Meta) => a.status === b.status && a.drawing === b.drawing;

/** A table with one row per client or person and a box for each month, saved together. Only the boxes, ticks and choices the person changed are sent,
 *  so a page left open while someone else changes another figure cannot write back the old one. */
export default function MonthGrid({ action, kind, year, months, heads, leadCols, rows, now, past = 0, refMonth, refDays, tags = [], searchLabel, noun, places, statuses, drawings }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const contracts = kind === "contracts";
  const usualOf = (r: GridRow) => r.usual;
  const initial = useMemo(() => cellsOf(rows, usualOf), [rows]); // the figures the server sent last
  const kinds = useMemo(() => kindsOfRows(rows), [rows]);
  const metas = useMemo(() => metasOfRows(rows), [rows]);
  const fromServer = JSON.stringify([initial, kinds, metas]); // by content, so a re-render with the same figures changes nothing
  const [vals, setVals] = useState<Cells>(initial);
  const [wts, setWts] = useState<Kinds>(kinds);
  const [mts, setMts] = useState<Metas>(metas);
  const [base, setBase] = useState({ json: fromServer, cells: initial, kinds, metas });
  // The server sent figures again (after a save, or a refresh): take them, but keep what the person has changed and not yet saved.
  if (base.json !== fromServer) {
    const nextVals: Cells = Object.fromEntries(Object.entries(initial).map(([id, cs]) => [id, cs.map((c, i) => {
      const typed = vals[id]?.[i] ?? c, was = base.cells[id]?.[i] ?? c;
      // Keep the person's own entry only while it differs from what the server has; a figure just saved (blank and 0 are the same) shows as the server sends it.
      return num(typed) !== num(was) && num(typed) !== num(c) ? typed : c;
    })]));
    const nextWts: Kinds = Object.fromEntries(Object.keys(kinds).map((id) => [id, same(wts[id] ?? kinds[id], base.kinds[id] ?? []) ? kinds[id] : (wts[id] ?? kinds[id])]));
    const nextMts: Metas = Object.fromEntries(Object.keys(metas).map((id) => [id, sameMeta(mts[id] ?? metas[id], base.metas[id] ?? metas[id]) ? metas[id] : (mts[id] ?? metas[id])]));
    setBase({ json: fromServer, cells: initial, kinds, metas });
    setVals(nextVals);
    setWts(nextWts);
    setMts(nextMts);
  }
  const [place, setPlace] = useState(""); // "" is every location
  const [unlocked, setUnlocked] = useState(false);
  const [clockedOn, setClockedOn] = useState(false); // the hours clocked under each box, off until asked for
  // Saving locks the past months again, so a later change to one needs both warnings again.
  useEffect(() => { if (state?.ok) setUnlocked(false); }, [state]);
  const editable = rows.filter((r) => r.editable);
  const valsOf = (r: GridRow) => vals[r.id] ?? initial[r.id];
  const changedCell = (r: GridRow, i: number) => num(valsOf(r)[i]) !== num(initial[r.id][i]);
  const changedKinds = (r: GridRow) => !same(wts[r.id] ?? [], kinds[r.id] ?? []);
  const changedMeta = (r: GridRow) => !sameMeta(mts[r.id] ?? { status: "", drawing: "" }, metas[r.id] ?? { status: "", drawing: "" });
  const dirty = editable.some((r) => valsOf(r).some((_, i) => changedCell(r, i)) || (contracts && (changedKinds(r) || changedMeta(r))));
  const cell = (r: GridRow, i: number, s: string) => setVals((p) => ({ ...p, [r.id]: (p[r.id] ?? initial[r.id]).map((x, j) => (j === i ? s : x)) }));
  const inPlace = (r: GridRow) => !place || r.place === place;
  const shown = rows.filter(inPlace);
  const placeName = places?.find((p) => p.id === place)?.name;
  const sums = months.map((_, i) => shown.reduce((a, r) => a + num(valsOf(r)[i]), 0));
  const clockedSums = months.map((_, i) => shown.reduce((a, r) => a + (r.clocked?.[i] ?? 0), 0));
  const showClocked = contracts && clockedOn && rows.some((r) => r.clocked);
  // Columns after the months: Current Per day and Work type, then Status and Standard when the table has them.
  const tailCols = 1 + (statuses ? 1 : 0) + (drawings ? 1 : 0);
  const isPast = (i: number) => i < past;
  // Saved by hand, not by a form action, so the browser does not clear the search box (or anything else) when the save comes back.
  const save = (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => formAction(fd)); };
  // A past month is already reported on the Clients page, so changing it takes two confirmations. Only the second one unlocks the boxes.
  const unlock = () => {
    if (!window.confirm("Past months are locked, because their hours are already reported on the Clients page. Change past months? (Warning 1 of 2)")) return;
    if (!window.confirm("Warning 2 of 2: this changes figures already reported for past months. Only do this to correct a figure. Continue?")) return;
    setUnlocked(true);
  };

  return (
    <form onSubmit={save}>
      <input type="hidden" name="year" value={year} />
      {unlocked && <input type="hidden" name="pastOk" value="1" />}
      {(contracts || (places && places.length > 0)) && (
        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 10px" }}>
          {places && places.length > 0 && (
            <div className="row" role="group" aria-label="Office" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div className="seg">
                <button type="button" aria-pressed={place === ""} onClick={() => setPlace("")}>All offices</button>
                {places.map((p) => <button key={p.id} type="button" aria-pressed={place === p.id} onClick={() => setPlace(p.id)}>{p.name}</button>)}
              </div>
              {place && <span className="note">{shown.length} of {rows.length} client{rows.length === 1 ? "" : "s"}</span>}
            </div>
          )}
          {contracts && <button type="button" className="btn sm" style={{ marginLeft: "auto" }} aria-pressed={clockedOn} onClick={() => setClockedOn((on) => !on)}
            title="Under each month's contracted hours, show the hours clocked for that client">{clockedOn ? "Hide clocked hours" : "Show clocked hours"}</button>}
        </div>
      )}
      <TableFilter label={searchLabel} placeholder={`${searchLabel}…`} />
      {contracts && (
        <div className="mg-legend" aria-hidden="true">
          <span><i className="lg usual" />Usual hours</span>
          <span><i className="lg own" />Own figure for the month</span>
          <span><i className="lg past" />Past month, locked</span>
        </div>
      )}
      <div className="tablebox"><table className="mgrid">
        <thead><tr>
          {heads}
          {months.map((m, i) => <th key={m} className={`num mo${i === now ? " now" : ""}${isPast(i) ? " past" : ""}`} scope="col">{MONTH_ABBR[i]}</th>)}
          {!contracts && <th className="num eh" scope="col">Average hours per week</th>}
          {contracts && <><th className="num" scope="col">Per day</th><th scope="col">Work type</th>{statuses && <th scope="col">Status</th>}{drawings && <th scope="col" className="dstd">Standard</th>}</>}
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const v = valsOf(r), total = v.reduce((a, s) => a + num(s), 0), perDay = refDays ? num(v[refMonth]) / refDays : 0;
            const picked = tags.filter((t) => (wts[r.id] ?? []).includes(t.id)).map((t) => t.name); // in the tags' own order, however they were ticked
            const kindsName = contracts && changedKinds(r) ? `w|${r.id}` : undefined;
            const mt = mts[r.id] ?? { status: "", drawing: "" };
            const statusName = contracts && mt.status !== (r.status ?? "") ? `st|${r.id}` : undefined;
            const drawingName = contracts && mt.drawing !== (r.drawing ?? "") ? `dr|${r.id}` : undefined;
            const setMeta = (field: keyof Meta, value: string) => setMts((p) => ({ ...p, [r.id]: { ...(p[r.id] ?? mt), [field]: value } }));
            return (
              <tr key={r.id} className={inPlace(r) ? undefined : "out"}>
                {r.lead}
                {months.map((m, i) => {
                  const diff = num(v[i]) !== r.usual, locked = isPast(i) && !unlocked;
                  return (
                    <td key={m} className={`num mo mc${isPast(i) ? " past" : ""}${i === now ? " cur" : ""}`} data-l={MONTH_ABBR[i]}>
                      {r.editable
                        ? <input className={`cell${diff ? " chg" : ""}`} type="number" min="0" step="any" inputMode="decimal" name={changedCell(r, i) ? cellName(r.id, m) : undefined} data-cell={cellName(r.id, m)} value={v[i]} disabled={locked}
                            onChange={(e) => cell(r, i, e.target.value)} aria-label={`${r.name}, ${MONTH_ABBR[i]} ${year}`}
                            title={locked ? "A past month is locked. Change past months above to edit it." : diff ? `Different from the usual ${fmt(r.usual)}` : undefined} />
                        : <span className={diff ? "chgtxt" : undefined}>{v[i] || "–"}</span>}
                      {showClocked && r.clocked && <span className="clk" title={`Hours clocked for ${r.name} in ${MONTH_ABBR[i]} ${year}`}>{fmt(r.clocked[i])}</span>}
                    </td>
                  );
                })}
                {!contracts && <td className="num tot">{fmt(total / 12)}</td>}
                {contracts && <>
                  <td className="num">{perDay ? fmt(perDay) : "–"}</td>
                  <td className="wt">
                    {r.editable && tags.length > 0
                      ? <details className="wtpick">
                          <summary>{picked.length ? picked.join(" + ") : <span className="note">Choose</span>}</summary>
                          {kindsName && <input type="hidden" name={kindsName} value="" />}
                          <div className="wtbox">{tags.map((t) => (
                            <label key={t.id} className="tagpick-i"><input type="checkbox" name={kindsName} value={t.id} checked={(wts[r.id] ?? []).includes(t.id)}
                              onChange={(e) => setWts((p) => ({ ...p, [r.id]: e.target.checked ? [...(p[r.id] ?? []), t.id] : (p[r.id] ?? []).filter((x) => x !== t.id) }))} />{t.name}</label>
                          ))}</div>
                        </details>
                      : picked.length ? picked.join(" + ") : <span className="note">–</span>}
                  </td>
                  {statuses && <td data-l="Status">
                    {r.editable
                      ? <select name={statusName} value={mt.status} onChange={(e) => setMeta("status", e.target.value)} aria-label={`${r.name} status`}>
                          {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      : labelOf(statuses, mt.status) || <span className="note">–</span>}
                  </td>}
                  {drawings && <td data-l="Standard" className="dstd">
                    {r.editable
                      ? <select name={drawingName} value={mt.drawing} onChange={(e) => setMeta("drawing", e.target.value)} aria-label={`${r.name} drawing standard`}>
                          <option value="">Not set</option>
                          {drawings.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      : labelOf(drawings, mt.drawing) || <span className="note">–</span>}
                  </td>}
                </>}
              </tr>
            );
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={leadCols} className="tl">{contracts ? (placeName ? `${placeName} total` : "All clients") : "Everyone listed"}</td>
              {months.map((m, i) => <td key={m} className="num mo">{fmt(sums[i])}</td>)}
              {contracts
                ? <><td className="num">{refDays && sums[refMonth] ? fmt(sums[refMonth] / refDays) : "–"}</td><td colSpan={tailCols} /></>
                : <td className="num">{fmt(sums.reduce((a, b) => a + b, 0) / 12)}</td>}
            </tr>
            {showClocked && (
              <tr className="clkrow">
                <td colSpan={leadCols} className="tl">{placeName ? `${placeName} clocked` : "All clients clocked"}</td>
                {months.map((m, i) => <td key={m} className="num mo">{fmt(clockedSums[i])}</td>)}
                <td colSpan={tailCols + 1} />
              </tr>
            )}
          </tfoot>
        )}
      </table></div>
      {editable.length > 0 && (
        <div className="mg-save">
          <button className="btn primary" disabled={pending || !dirty}>{pending ? "Saving…" : "Save changes"}</button>
          {contracts && past > 0 && (unlocked
            ? <span className="note">Past months are unlocked. They lock again after you save.</span>
            : <button type="button" className="btn" onClick={unlock}>Change past months</button>)}
          <span className="note" role="status">{state?.error ? <span className="err-text">{state.error}</span> : dirty ? `You have unsaved changes. Save before you change the year.` : state?.message ?? `Nothing to save yet. Change a ${noun}'s hours above.`}</span>
        </div>
      )}
    </form>
  );
}
