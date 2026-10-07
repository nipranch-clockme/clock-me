"use client";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

export type RKid = { key: string; label: string; href?: string; minutes: number; dur: string; pct: string };
export type RRow = RKid & { people: number; color?: string; budget?: string; used?: { frac: number; label: string }; kids: RKid[] };

type Sort = { by: "title" | "dur"; dir: 1 | -1 } | null;

/** The Summary report's table: one row per group, click a row's arrow to see what is inside it, click a heading to sort. */
export default function ReportTable({ rows, titleLabel, showPeople, showEstimate, empty }: { rows: RRow[]; titleLabel: string; showPeople: boolean; showEstimate: boolean; empty: string }) {
  const [sort, setSort] = useState<Sort>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const hasKids = rows.some((r) => r.kids.length > 0);
  const cmp = (a: RKid, b: RKid) => (sort ? (sort.by === "title" ? a.label.localeCompare(b.label) : a.minutes - b.minutes) * sort.dir : 0);
  const ordered = useMemo(() => (sort ? [...rows].sort(cmp) : rows), [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const allOpen = hasKids && rows.filter((r) => r.kids.length).every((r) => open.has(r.key));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // Hours go biggest first, then smallest first, then back to the report's own order; names go A to Z, Z to A, then back.
  const flip = (by: "title" | "dur") => setSort((s) => {
    const first = by === "dur" ? -1 : 1;
    if (s?.by !== by) return { by, dir: first };
    return s.dir === first ? { by, dir: (first * -1) as 1 | -1 } : null;
  });
  const arrow = (by: "title" | "dur") => (sort?.by === by ? (sort.dir === 1 ? "▲" : "▼") : "⇅");
  const cols = 3 + (showPeople ? 1 : 0) + (showEstimate ? 2 : 0);
  return (
    <div className="tablebox"><table className="rtable">
      <thead><tr>
        <th>
          {hasKids && <button type="button" className="rg-chev all" aria-label={allOpen ? "Collapse all" : "Expand all"} aria-expanded={allOpen}
            onClick={() => setOpen(allOpen ? new Set() : new Set(rows.filter((r) => r.kids.length).map((r) => r.key)))}><i /></button>}
          <button type="button" className="sorter" onClick={() => flip("title")} aria-label={`Sort by ${titleLabel.toLowerCase()}`}>{titleLabel.toUpperCase()} <span aria-hidden="true">{arrow("title")}</span></button>
        </th>
        {showPeople && <th className="num c-people">PEOPLE</th>}
        {showEstimate && <><th className="num">BUDGET</th><th>USED, ALL TIME</th></>}
        <th className="num"><button type="button" className="sorter" onClick={() => flip("dur")} aria-label="Sort by hours">HOURS <span aria-hidden="true">{arrow("dur")}</span></button></th>
        <th className="num">SHARE</th>
      </tr></thead>
      <tbody>
        {ordered.map((r) => {
          const isOpen = open.has(r.key);
          return (
            <Fragment key={r.key}>
            <tr className="rg-row">
              <td data-l={titleLabel}><div className="rg-t">
                {r.kids.length > 0 ? <button type="button" className={`rg-chev${isOpen ? " open" : ""}`} aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} what is inside ${r.label}`} onClick={() => toggle(r.key)}><i /></button> : hasKids && <span className="rg-chev sp" />}
                {r.color && <i className="dot" style={{ background: r.color }} />}
                {r.href ? <Link className="plink" href={r.href}>{r.label}</Link> : r.label}
              </div></td>
              {showPeople && <td className="num c-people" data-l="People">{r.people}</td>}
              {showEstimate && <>
                <td className="num" data-l="Budget">{r.budget ?? "–"}</td>
                <td data-l="Used">{r.used ? <><div className="meter"><i className={r.used.frac > 1 ? "over" : r.used.frac > 0.85 ? "hi" : ""} style={{ width: `${Math.min(100, r.used.frac * 100)}%` }} /></div><div className="note">{r.used.label}</div></> : <span className="note">No budget</span>}</td>
              </>}
              <td className="num" data-l="Hours">{r.dur}</td>
              <td className="num note" data-l="Share">{r.pct}</td>
            </tr>
            {isOpen &&  [...r.kids].sort(cmp).map((k) => (
              <tr key={`${r.key}/${k.key}`} className="rg-kid">
                <td data-l="">{k.href ? <Link className="plink" href={k.href}>{k.label}</Link> : k.label}</td>
                {showPeople && <td className="c-people" />}
                {showEstimate && <><td /><td /></>}
                <td className="num">{k.dur}</td>
                <td className="num note">{k.pct}</td>
              </tr>
            ))}
            </Fragment>
          );
        })}
        {!rows.length && <tr><td colSpan={cols} className="empty">{empty}</td></tr>}
      </tbody>
    </table></div>
  );
}
