import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { scopeLabel, visibleUsersWhere } from "@/lib/scope";
import { GROUPS, TIME_GROUPS, TABS, STATUSES, parseReportParams, reportWhere, reportQuery, stepRange } from "@/lib/report";
import { DAYS, RANGES, addDays, dow, longDate, monday, today, toDate, toStr, shortDate } from "@/lib/dates";
import { clock, fmtHours, pct } from "@/lib/format";
import { tagText } from "@/lib/tags";
import AutoForm from "@/components/AutoForm";
import Link from "next/link";
import { PageHead, Ifld } from "@/components/ui";
import FilterMenu from "@/components/FilterMenu";
import ExportMenu from "@/components/ExportMenu";
import PrintButton from "@/components/PrintButton";
import ReportTable, { type RRow } from "@/components/ReportTable";
import { BarChart, Donut, OTHER, PALETTE } from "@/components/ReportCharts";

const STACK_FIELD: Record<string, string> = { project: "projectId", client: "projectId", person: "userId", team: "userId", location: "userId", tag: "tagIds", phase: "phaseId", description: "description" };
type Rec = { userId?: string; projectId?: string; phaseId?: string | null; tagIds?: string[]; description?: string; date?: Date };
type Combo = Rec & { userId: string; projectId: string; _sum: { minutes: number | null }; _count: number };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser();
  const settings = await getSettings();
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  const raw = await searchParams;
  const p = parseReportParams(raw, me);
  const fromApprovals = raw.ref === "approvals";
  const scope = { user: visibleUsersWhere(me) };

  // Dropdown options first: only what this person can see.
  const [people, scopeProjects, tags, locations] = await Promise.all([
    db.user.findMany({ where: visibleUsersWhere(me), include: { team: true, location: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { entries: { some: scope } }, include: { client: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    me.role === "ADMIN" ? db.location.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const teams = [...new Map(people.filter((u) => u.team).map((u) => [u.teamId!, `${u.team!.name}, ${u.location.name}`]))].sort((a, b) => a[1].localeCompare(b[1]));
  const clients = [...new Map(scopeProjects.map((x) => [x.clientId, x.client.name]))].sort((a, b) => a[1].localeCompare(b[1]));
  // A filter whose value isn't among its options (e.g. a project from another client) would silently empty the report
  // while its list shows nothing ticked, so drop it.
  const keep = (v: string[], ok: string[]) => v.filter((x) => ok.includes(x));
  p.person = keep(p.person, people.map((u) => u.id));
  p.team = keep(p.team, teams.map(([id]) => id));
  p.client = keep(p.client, clients.map(([id]) => id));
  const projOpts = scopeProjects.filter((x) => !p.client.length || p.client.includes(x.clientId)).map((x) => [x.id, x.name] as [string, string]);
  p.project = keep(p.project, projOpts.map(([id]) => id));
  p.tag = keep(p.tag, tags.map((t) => t.id));
  p.location = keep(p.location, locations.map((l) => l.id));
  const phaseNames = await db.phase.findMany({ where: { entries: { some: { ...scope, ...(p.project.length ? { projectId: { in: p.project } } : {}) } } }, distinct: ["name"], select: { name: true }, orderBy: { name: "asc" } });
  p.phase = keep(p.phase, phaseNames.map((x) => x.name));

  const { where, from, to, statusTooWide } = await reportWhere(me, p);
  const g2 = p.tab === "summary" ? p.group2 : undefined;
  const groupsUsed = [p.group, g2].filter(Boolean) as string[];
  const needDate = p.tab === "weekly" || groupsUsed.some((g) => TIME_GROUPS.includes(g));
  const by = ["userId", "projectId", "phaseId", "tagIds", ...(groupsUsed.includes("description") ? ["description"] : []), ...(needDate ? ["date"] : [])];
  const colored = !TIME_GROUPS.includes(p.group);
  const stackField = p.tab === "summary" && colored ? STACK_FIELD[p.group] : undefined;
  const CAP = 500;
  const [combos, byDate, detailRows] = await Promise.all([
    db.timeEntry.groupBy({ by: by as Prisma.TimeEntryScalarFieldEnum[], where, _sum: { minutes: true }, _count: true }) as unknown as Promise<Combo[]>,
    p.tab === "summary" ? (db.timeEntry.groupBy({ by: (stackField ? ["date", stackField] : ["date"]) as Prisma.TimeEntryScalarFieldEnum[], where, _sum: { minutes: true } }) as unknown as Promise<(Rec & { _sum: { minutes: number | null } })[]>) : Promise.resolve([]),
    p.tab === "detailed"
      ? db.timeEntry.findMany({ where, orderBy: [{ date: "desc" }, { startMin: "desc" }], take: CAP, include: { user: { select: { id: true, name: true } }, project: { select: { name: true, client: { select: { name: true } } } }, phase: { select: { name: true } } } })
      : Promise.resolve([]),
  ]);
  const phases = combos.length ? await db.phase.findMany({ where: { id: { in: [...new Set(combos.map((c) => c.phaseId).filter(Boolean))] as string[] } }, select: { id: true, name: true } }) : [];
  const U = new Map(people.map((u) => [u.id, u])), P = new Map(scopeProjects.map((x) => [x.id, x])), T = new Map(tags.map((t) => [t.id, t.name])), PH = new Map(phases.map((x) => [x.id, x.name]));
  const dupProjectName = (name: string) => scopeProjects.filter((x) => x.name === name).length > 1;
  const dupPersonName = (name: string) => people.filter((x) => x.name === name).length > 1;

  const total = combos.reduce((a, c) => a + (c._sum.minutes ?? 0), 0);
  const entryCount = combos.reduce((a, c) => a + c._count, 0);
  // Groups are keyed by id, so two projects (or people) with the same name stay separate; the label tells them apart.
  const labelOf = (g: string, c: Rec): [string, string] => {
    const u = c.userId ? U.get(c.userId) : undefined, pr = c.projectId ? P.get(c.projectId) : undefined;
    switch (g) {
      case "client": return [pr?.clientId ?? "?", pr?.client.name ?? "Unknown"];
      case "person": return [c.userId ?? "?", u ? (dupPersonName(u.name) ? `${u.name} (${u.location.name})` : u.name) : "Unknown"];
      case "team": return [u?.teamId ?? "-", u?.team ? `${u.team.name}, ${u.location.name}` : "No team"];
      case "location": return [u?.locationId ?? "?", u?.location.name ?? "Unknown"];
      case "phase": { const n = (c.phaseId && PH.get(c.phaseId)) || "No phase"; return [n, n]; }
      case "description": return [c.description ?? "", c.description || "No description"];
      case "day": { const d = toStr(c.date!); return [d, longDate(d)]; }
      case "month": { const k = toStr(c.date!).slice(0, 7); return [k, toDate(k + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })]; }
      default: return [c.projectId ?? "?", pr ? (dupProjectName(pr.name) ? `${pr.name} (${pr.client.name})` : pr.name) : "Unknown"];
    }
  };
  // An entry with several tags counts under each of them; every other grouping puts an entry in exactly one group.
  const shownTags = (c: Rec) => (p.tag.length ? (c.tagIds ?? []).filter((id) => p.tag.includes(id)) : c.tagIds ?? []); // with a tag filter, only the ticked tags are listed
  const keysOf = (g: string, c: Rec): [string, string][] => g === "tag"
    ? (shownTags(c).length ? shownTags(c).map((id) => [id, T.get(id) ?? "Removed tag"] as [string, string]) : [["-", "No tag"]])
    : [labelOf(g, c)];
  const tagOverlap = p.tab !== "detailed" && (p.group === "tag" || g2 === "tag") && combos.some((c) => shownTags(c).length > 1);
  const linkOf = (g: string, k: string) => (g === "person" && U.has(k) ? `/profile/${k}` : undefined);

  // The Summary table: one row per group, with the second grouping (if chosen) inside it.
  type Node = { label: string; m: number; people: Set<string>; kids: Map<string, { label: string; m: number }> };
  const tree = new Map<string, Node>();
  if (p.tab !== "detailed") {
    for (const c of combos) {
      const min = c._sum.minutes ?? 0;
      for (const [k, label] of keysOf(p.group, c)) {
        const n = tree.get(k) ?? { label, m: 0, people: new Set(), kids: new Map() };
        n.m += min; n.people.add(c.userId); tree.set(k, n);
        if (g2) for (const [k2, l2] of keysOf(g2, c)) { const kid = n.kids.get(k2) ?? { label: l2, m: 0 }; kid.m += min; n.kids.set(k2, kid); }
      }
    }
  }
  const order = (g: string) => (a: [string, { m: number }], b: [string, { m: number }]) => (TIME_GROUPS.includes(g) ? a[0].localeCompare(b[0]) : b[1].m - a[1].m);
  const sorted = [...tree].sort(order(p.group));
  const rank = new Map(sorted.map(([k], i) => [k, i]));
  const colorOf = (k: string) => (colored ? (rank.get(k)! < PALETTE.length ? PALETTE[rank.get(k)!] : OTHER) : undefined);
  const share = (m: number) => (total ? `${((m / total) * 100).toFixed(1)}%` : "0%");
  const usage = p.est && p.group === "project" ? await db.timeEntry.groupBy({ by: ["projectId"], _sum: { minutes: true } }) : [];
  const usedMin = new Map(usage.map((u) => [u.projectId, u._sum.minutes ?? 0]));
  const tableRows: RRow[] = sorted.map(([k, n]) => {
    const budget = p.group === "project" ? P.get(k)?.budgetHours : null;
    const used = usedMin.get(k) ?? 0;
    return {
      key: k, label: n.label, href: linkOf(p.group, k), minutes: n.m, dur: f(n.m), pct: share(n.m), people: n.people.size, color: colorOf(k),
      budget: budget ? f(budget * 60) : undefined, used: budget ? { frac: used / 60 / budget, label: `${pct(used / 60 / budget)} · ${f(used)}` } : undefined,
      kids: [...n.kids].sort(order(g2 ?? "")).map(([k2, kid]) => ({ key: k2, label: kid.label, href: g2 ? linkOf(g2, k2) : undefined, minutes: kid.m, dur: f(kid.m), pct: share(kid.m) })),
    };
  });
  const slices = [...sorted.slice(0, PALETTE.length).map(([k, n]) => ({ key: k, label: n.label, value: n.m, color: colorOf(k)! })),
    ...(sorted.length > PALETTE.length ? [{ key: "other", label: `${sorted.length - PALETTE.length} others`, value: sorted.slice(PALETTE.length).reduce((a, [, n]) => a + n.m, 0), color: OTHER }] : [])];
  const groupLabel = GROUPS.find((g) => g[0] === p.group)![1];

  // Hours over time. "All time" runs from the first entry to the last (which can be in the future).
  const dates = p.tab === "summary" ? byDate.map((r) => toStr(r.date!)) : p.tab === "weekly" ? combos.map((c) => toStr(c.date!)) : [];
  const firstDate = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today();
  const lastDate = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : today();
  const shownFrom = p.range === "all" ? firstDate : from;
  const shownTo = p.range === "all" ? (lastDate > today() ? lastDate : today()) : to;
  const span = (toDate(shownTo).getTime() - toDate(shownFrom).getTime()) / 864e5 + 1;
  const unit = p.tab === "weekly" ? (span <= 14 ? "day" : span <= 140 ? "week" : "month") : span <= 35 ? "day" : span <= 200 ? "week" : "month";
  const kOf = (d: string) => (unit === "day" ? d : unit === "week" ? monday(d) : d.slice(0, 7));
  const keys: string[] = [];
  const end = p.range === "all" || p.tab === "weekly" ? shownTo : to < addDays(today(), 6) ? to : addDays(today(), 6);
  for (let d = shownFrom; d <= end; d = addDays(d, 1)) { const k = kOf(d); if (keys[keys.length - 1] !== k) keys.push(k); }
  const lbl = (k: string) => (unit === "month" ? toDate(k + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) : unit === "day" ? `${DAYS[dow(k)]}, ${shortDate(k)}` : shortDate(k));
  const series = colored ? slices : [{ key: "all", label: "Hours", value: total, color: "var(--s1)" }];
  const B: Record<string, Record<string, number>> = {};
  const BT: Record<string, number> = {}; // each bar's true hours: an entry with several tags is in several stacks but counted once here
  for (const r of byDate) {
    const b = kOf(toStr(r.date!));
    BT[b] = (BT[b] ?? 0) + (r._sum.minutes ?? 0) / 60;
    for (const [sk] of stackField ? keysOf(p.group, r) : [["all"]]) {
      const key = colored ? (rank.get(sk)! < PALETTE.length ? sk : "other") : sk;
      const bucket = (B[b] ??= {});
      bucket[key] = (bucket[key] ?? 0) + (r._sum.minutes ?? 0) / 60;
    }
  }

  // The Weekly grid: one row per group, one column per day (or week, for long ranges).
  const week = new Map<string, { label: string; href?: string; total: number; cells: Record<string, number> }>();
  if (p.tab === "weekly") {
    for (const c of combos) {
      const min = c._sum.minutes ?? 0, b = kOf(toStr(c.date!));
      for (const [k, label] of keysOf(p.group, c)) {
        const r = week.get(k) ?? { label, href: linkOf(p.group, k), total: 0, cells: {} };
        r.total += min; r.cells[b] = (r.cells[b] ?? 0) + min; week.set(k, r);
      }
    }
  }
  const weekRows = [...week].sort((a, b) => (TIME_GROUPS.includes(p.group) ? a[0].localeCompare(b[0]) : b[1].total - a[1].total));
  // Column totals count each entry once, even when grouped by tag.
  const colTotals: Record<string, number> = {};
  if (p.tab === "weekly") for (const c of combos) { const b = kOf(toStr(c.date!)); colTotals[b] = (colTotals[b] ?? 0) + (c._sum.minutes ?? 0); }

  const nf = [p.person, p.team, p.client, p.project, p.phase, p.tag, p.status, p.location].filter((a) => a.length).length + (p.desc ? 1 : 0);
  const clearHref = `/reports?${reportQuery(p, { person: [], team: [], client: [], project: [], phase: [], tag: [], status: [], location: [], desc: undefined })}`;
  const prev = stepRange(from, to, -1), next = stepRange(from, to, 1);
  const stepHref = (r: [string, string]) => `/reports?${reportQuery(p, { range: "custom", from: r[0], to: r[1] })}`;
  const opts = (a: [string, string][]) => a.map(([value, label]) => ({ value, label }));
  const hidden = (k: string, v?: string) => (v ? <input type="hidden" name={k} value={v} /> : null);

  return (
    <>
      <PageHead title="Reports"
        actions={fromApprovals ? <Link className="btn" href="/approvals">Back to Approvals</Link> : undefined}
        sub={`Showing: ${scopeLabel(me)} · ${longDate(shownFrom)} to ${longDate(shownTo)}`} />
      <AutoForm key={reportQuery(p)} manual className="rform">
        {hidden("tab", p.tab === "summary" ? undefined : p.tab)}
        {fromApprovals && <input type="hidden" name="ref" value="approvals" />}
        {p.tab === "detailed" && <>{hidden("group", p.group)}{hidden("group2", p.group2)}</>}
        {p.tab === "weekly" && <>{hidden("group2", p.group2)}</>}
        <div className="rtools">
          <nav className="seg rtabs" aria-label="Report view">
            {TABS.map(([k, l]) => <Link key={k} href={`/reports?${reportQuery(p, { tab: k })}`} aria-pressed={p.tab === k}>{l}</Link>)}
          </nav>
          <div className="rtools-r">
            <div className="rdate">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
              <select id="rp-range" name="range" data-auto defaultValue={p.range} aria-label="Date range">{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              {p.range === "all"
                ? <><span className="rdate-nav off" aria-hidden="true" aria-disabled="true">‹</span><span className="rdate-nav off" aria-hidden="true" aria-disabled="true">›</span></>
                : <><Link className="rdate-nav" href={stepHref(prev)} aria-label="Previous period" scroll={false}>‹</Link><Link className="rdate-nav" href={stepHref(next)} aria-label="Next period" scroll={false}>›</Link></>}
            </div>
            {p.range === "custom" && <div className="rdate-c">
              <div className="ifld"><label htmlFor="rp-from">From</label><input type="date" id="rp-from" name="from" data-auto defaultValue={from} min="2000-01-01" /></div>
              <div className="ifld"><label htmlFor="rp-to">To</label><input type="date" id="rp-to" name="to" data-auto defaultValue={to} /></div>
            </div>}
            <ExportMenu csvHref={`/reports/export?${reportQuery(p)}`} />
          </div>
        </div>

        <section className="panel rfilters" aria-label="Filters">
          <span className="rflabel">FILTER</span>
          {people.length > 1 && <FilterMenu name="person" label="Person" options={opts(people.map((u) => [u.id, u.name]))} selected={p.person} />}
          {teams.length > 1 && <FilterMenu name="team" label="Team" options={opts(teams)} selected={p.team} />}
          <FilterMenu name="client" label="Client" options={opts(clients)} selected={p.client} />
          <FilterMenu name="project" label="Project" options={opts(projOpts)} selected={p.project} />
          <FilterMenu name="phase" label="Phase" options={opts(phaseNames.map((x) => [x.name, x.name]))} selected={p.phase} />
          <FilterMenu name="tag" label="Tag" options={opts(tags.map((t) => [t.id, t.name]))} selected={p.tag} />
          <FilterMenu name="status" label="Status" options={opts(STATUSES)} selected={p.status} />
          {me.role === "ADMIN" && <FilterMenu name="location" label="Location" options={opts(locations.map((l) => [l.id, l.name]))} selected={p.location} />}
          <input type="search" className="fm-desc" name="desc" defaultValue={p.desc ?? ""} placeholder="Description contains…" aria-label="Description contains" autoComplete="off" />
          <span className="sp" />
          {nf > 0 && <Link className="btn" href={clearHref}>Clear {nf} filter{nf > 1 ? "s" : ""}</Link>}
          <button type="submit" className="btn primary">Apply filter</button>
        </section>

        {statusTooWide && <p className="note rwarn">The Status filter works on up to a few years at a time. Choose a shorter date range to use it.</p>}

        <section className="rcard">
          <div className="rhead">
            <span className="rtotal">Total: <b>{f(total)}</b></span>
            <span className="rcounts">{plural(new Set(combos.map((c) => c.projectId)).size, "project")} · {plural(new Set(combos.map((c) => c.userId)).size, "person", "people")} · {plural(entryCount, "entry", "entries")}</span>
            <span className="sp" />
            <PrintButton />
          </div>

          {p.tab === "summary" && <div className="rchart"><BarChart keys={keys} data={B} totals={BT} series={series} unit={unit} lbl={lbl} f={f} empty={total === 0} /></div>}

          {p.tab !== "detailed" && (
            <div className="rgroup">
              <Ifld id="rp-group" label="Group by" name="group" data-auto defaultValue={p.group}>{GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Ifld>
              {p.tab === "summary" && <Ifld id="rp-group2" label="then by" name="group2" data-auto defaultValue={p.group2 ?? ""}>
                <option value="">Nothing</option>{GROUPS.filter(([k]) => k !== p.group).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Ifld>}
              {p.tab === "summary" && p.group === "project" && (
                <label className="tog"><input type="checkbox" role="switch" name="est" value="1" data-auto defaultChecked={!!p.est} /><span aria-hidden="true" /> Show budget</label>
              )}
            </div>
          )}

          {tagOverlap && <p className="note" style={{ margin: "0 0 8px" }}>Time with several tags counts under each of its tags, so the tag rows and the coloured bars can add up to more than the total.</p>}

          {p.tab === "summary" && (
            <div className="rsplit">
              <ReportTable rows={tableRows} titleLabel={groupLabel} showPeople={p.group !== "person"} showEstimate={!!p.est} empty="No time in this range." />
              {colored && total > 0 && !(tagOverlap && p.group === "tag") && <aside className="rdonut" aria-label={`Share of hours by ${groupLabel.toLowerCase()}`}><Donut slices={slices} total={total} centre={f(total)} /></aside>}
            </div>
          )}

          {p.tab === "weekly" && (
            <div className="tablebox"><table className="rtable rweek">
              <thead><tr>
                <th>{groupLabel.toUpperCase()}</th>
                {keys.map((k) => <th key={k} className="num">{unit === "day" ? <>{DAYS[dow(k)]}<br /><span className="note">{shortDate(k)}</span></> : lbl(k)}</th>)}
                <th className="num">TOTAL</th>
              </tr></thead>
              <tbody>
                {weekRows.map(([k, r]) => (
                  <tr key={k}>
                    <td data-l={groupLabel}>{r.href ? <Link className="plink" href={r.href}>{r.label}</Link> : r.label}</td>
                    {keys.map((b) => <td key={b} className="num">{r.cells[b] ? f(r.cells[b]) : <span className="note">–</span>}</td>)}
                    <td className="num"><b>{f(r.total)}</b></td>
                  </tr>
                ))}
                {!weekRows.length && <tr><td colSpan={keys.length + 2} className="empty">No time in this range.</td></tr>}
              </tbody>
              {weekRows.length > 0 && <tfoot><tr><td>Total</td>{keys.map((b) => <td key={b} className="num">{colTotals[b] ? f(colTotals[b]) : <span className="note">–</span>}</td>)}<td className="num">{f(total)}</td></tr></tfoot>}
            </table></div>
          )}

          {p.tab === "detailed" && (
            <div className="tablebox">
              <table className="rtable">
                <thead><tr><th>DATE</th><th>TIME</th><th>PERSON</th><th>CLIENT</th><th>PROJECT</th><th>PHASE</th><th>TAGS</th><th>DESCRIPTION</th><th className="num">HOURS</th></tr></thead>
                <tbody>
                  {detailRows.map((e) => (
                    <tr key={e.id}>
                      <td data-l="Date">{shortDate(toStr(e.date))}, {toStr(e.date).slice(0, 4)}</td>
                      <td data-l="Time" className="nw">{clock(e.startMin)} – {clock(e.startMin + e.minutes)}</td>
                      <td data-l="Person"><Link className="plink" href={`/profile/${e.user.id}`}>{e.user.name}</Link></td>
                      <td data-l="Client">{e.project.client.name}</td>
                      <td data-l="Project">{e.project.name}</td><td data-l="Phase">{e.phase?.name ?? ""}</td><td data-l="Tags">{tagText(e.tagIds, T)}</td><td data-l="Description">{e.description}</td>
                      <td className="num" data-l="Hours">{f(e.minutes)}</td>
                    </tr>
                  ))}
                  {!detailRows.length && <tr><td colSpan={9} className="empty">No time in this range.</td></tr>}
                </tbody>
              </table>
              {entryCount > CAP && <p className="note rcap">Showing the latest {CAP} of {entryCount.toLocaleString("en-US")} entries. Use Export to get all of them.</p>}
            </div>
          )}
        </section>
      </AutoForm>
    </>
  );
}

const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
