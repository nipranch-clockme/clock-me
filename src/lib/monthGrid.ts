import { today } from "./dates";

// The two monthly tables (contracted hours per client, expected weekly hours per person) share how they pick a year, name their fields and work out
// what a save changes. Both store only the months that differ from the usual figure, so "the usual" keeps following any later change to it.

/** Years the tables offer: last year, this year and next, the span the expected-hours loaders cover. */
export const gridYears = () => { const y = +today().slice(0, 4); return [y - 1, y, y + 1]; };
export const gridYear = (raw?: string) => { const y = parseInt(raw ?? "", 10); return gridYears().includes(y) ? y : +today().slice(0, 4); };
export const yearMonths = (y: number) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
export const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Field name for one cell of the table. */
export const cellName = (rowId: string, ym: string) => `m|${rowId}|${ym}`;

/** A box's text for a month: blank and 0 both mean nothing that month, and a month the same as the usual figure shows the usual figure. */
export const cellText = (v: number, usual: number) => (v > 0 ? String(v) : usual > 0 ? "0" : "");
/** A box's text as hours: blank, and anything that is not a number from 0 up, counts as 0. */
export const cellNumber = (s: string) => { const n = s.trim() === "" ? 0 : Number(s); return Number.isFinite(n) && n >= 0 ? n : 0; };

/** The cells a submitted table holds: row id, then "YYYY-MM", then what was typed. Anything that is not a well-formed cell is ignored. */
export function readCells(form: FormData, months: string[]): Map<string, Map<string, string>> {
  const ok = new Set(months), out = new Map<string, Map<string, string>>();
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string" || !k.startsWith("m|")) continue;
    const [, id, ym] = k.split("|");
    if (!id || !ym || !ok.has(ym)) continue;
    let r = out.get(id);
    if (!r) out.set(id, (r = new Map()));
    r.set(ym, v);
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export type RowEdit = { upsert: [string, number][]; remove: string[]; changed: { ym: string; from: number; to: number }[] };

/**
 * What saving one row changes. `current` holds the months stored as different from `usual`, and a cell typed the same as the usual figure removes
 * that month's own figure. A blank cell means 0. Returns an error text for a figure that is not a number from 0 to `max`.
 */
export function rowEdit(typed: Map<string, string>, current: Map<string, number> | undefined, usual: number, max: number): RowEdit | { error: string } {
  const u = r2(usual), out: RowEdit = { upsert: [], remove: [], changed: [] };
  for (const [ym, raw] of typed) {
    const t = raw.trim(), h = t === "" ? 0 : Number(t);
    if (!Number.isFinite(h) || h < 0 || h > max) return { error: `Enter hours from 0 to ${max.toLocaleString("en-US")}.` };
    const to = r2(h), had = current?.get(ym), from = had !== undefined ? r2(had) : u;
    if (to === u) { if (had !== undefined) out.remove.push(ym); } else if (had === undefined || r2(had) !== to) out.upsert.push([ym, to]);
    if (to !== from) out.changed.push({ ym, from, to });
  }
  return out;
}

/** "Mar 100 to 80, Apr 100 to 0" for the change log. */
export const changeText = (changed: RowEdit["changed"]) => changed.slice(0, 12).map((c) => `${MONTH_ABBR[+c.ym.slice(5) - 1]} ${c.from} to ${c.to}`).join(", ");

/** What a monthly table's save returns to the page. */
export type GridResult = { ok: boolean; error?: string; message?: string } | null;
