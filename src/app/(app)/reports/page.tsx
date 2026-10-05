import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { scopeLabel, visibleUsersWhere } from "@/lib/scope";
import { GROUPS, FILTER_KEYS, parseReportParams, reportWhere, reportQuery } from "@/lib/report";
import { RANGES, addDays, longDate, monday, today, toDate, toStr, shortDate } from "@/lib/dates";
import { fmtHours } from "@/lib/format";
import AutoForm from "@/components/AutoForm";
import Link from "next/link";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser();
  const settings = await getSettings();
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  const p = parseReportParams(await searchParams, me);
  const scope = { user: visibleUsersWhere(me) };

  // Dropdown options first: only what this person can see.
  const [people, scopeProjects, tags, descs, locations] = await Promise.all([
    db.user.findMany({ where: visibleUsersWhere(me), include: { team: true, location: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { entries: { some: scope } }, include: { client: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.timeEntry.findMany({ where: { ...scope, description: { not: "" } }, distinct: ["description"], select: { description: true }, orderBy: { description: "asc" }, take: 300 }),
    me.role === "ADMIN" ? db.location.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const teams = [...new Map(people.filter((u) => u.team).map((u) => [u.teamId!, `${u.team!.name}, ${u.location.name}`]))].sort((a, b) => a[1].localeCompare(b[1]));
  const clients = [...new Map(scopeProjects.map((x) => [x.clientId, x.client.name]))].sort((a, b) => a[1].localeCompare(b[1]));
  // A filter whose value isn't among its options (e.g. a project from another client) would silently empty the report
  // while its dropdown shows "All", so drop it.
  if (p.person && !people.some((u) => u.id === p.person)) p.person = undefined;
  if (p.team && !teams.some(([id]) => id === p.team)) p.team = undefined;
  if (p.client && !clients.some(([id]) => id === p.client)) p.client = undefined;
  const projOpts = scopeProjects.filter((x) => !p.client || x.clientId === p.client).map((x) => [x.id, x.name] as [string, string]);
  if (p.project && !projOpts.some(([id]) => id === p.project)) p.project = undefined;
  if (p.tag && !tags.some((t) => t.id === p.tag)) p.tag = undefined;
  if (p.location && !locations.some((l) => l.id === p.location)) p.location = undefined;
  const phaseNames = await db.phase.findMany({ where: { entries: { some: { ...scope, ...(p.project ? { projectId: p.project } : {}) } } }, distinct: ["name"], select: { name: true }, orderBy: { name: "asc" } });
  if (p.phase && !phaseNames.some((x) => x.name === p.phase)) p.phase = undefined;
  const descOpts = descs.map((x) => x.description);
  if (p.desc && !descOpts.includes(p.desc)) descOpts.unshift(p.desc);

  const { where, from, to } = reportWhere(me, p);
  const [combos, byDate] = await Promise.all([
    db.timeEntry.groupBy({ by: ["userId", "projectId", "phaseId", "tagId"], where, _sum: { minutes: true }, _count: true }),
    db.timeEntry.groupBy({ by: ["date"], where, _sum: { minutes: true }, orderBy: { date: "asc" } }),
  ]);
  const phases = combos.length ? await db.phase.findMany({ where: { id: { in: [...new Set(combos.map((c) => c.phaseId).filter(Boolean))] as string[] } }, select: { id: true, name: true } }) : [];
  const U = new Map(people.map((u) => [u.id, u])), P = new Map(scopeProjects.map((x) => [x.id, x])), T = new Map(tags.map((t) => [t.id, t.name])), PH = new Map(phases.map((x) => [x.id, x.name]));
  const dupProjectName = (name: string) => scopeProjects.filter((x) => x.name === name).length > 1;
  const dupPersonName = (name: string) => people.filter((x) => x.name === name).length > 1;

  const total = combos.reduce((a, c) => a + (c._sum.minutes ?? 0), 0);
  const entryCount = combos.reduce((a, c) => a + c._count, 0);
  // Rows are keyed by id, so two projects (or people) with the same name stay separate; the label tells them apart.
  const keyOf = (c: (typeof combos)[number]): [string, string] => {
    const u = U.get(c.userId), pr = P.get(c.projectId);
    switch (p.group) {
      case "client": return [pr?.clientId ?? "?", pr?.client.name ?? "Unknown"];
      case "person": return [c.userId, u ? (dupPersonName(u.name) ? `${u.name} (${u.location.name})` : u.name) : "Unknown"];
      case "team": return [u?.teamId ?? "-", u?.team ? `${u.team.name}, ${u.location.name}` : "No team"];
      case "location": return [u?.locationId ?? "?", u?.location.name ?? "Unknown"];
      case "tag": return [c.tagId ?? "-", (c.tagId && T.get(c.tagId)) || "No tag"];
      case "phase": { const n = (c.phaseId && PH.get(c.phaseId)) || "No phase"; return [n, n]; }
      default: return [c.projectId, pr ? (dupProjectName(pr.name) ? `${pr.name} (${pr.client.name})` : pr.name) : "Unknown"];
    }
  };
  const groups = new Map<string, { label: string; m: number; people: Set<string> }>();
  if (p.group === "month") {
    const userMonths = await db.timeEntry.groupBy({ by: ["userId", "date"], where, _sum: { minutes: true } });
    for (const r of userMonths) {
      const k = toStr(r.date).slice(0, 7);
      const g = groups.get(k) ?? { label: toDate(k + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }), m: 0, people: new Set() };
      g.m += r._sum.minutes ?? 0; g.people.add(r.userId); groups.set(k, g);
    }
  } else {
    for (const c of combos) { const [k, label] = keyOf(c); const g = groups.get(k) ?? { label, m: 0, people: new Set() }; g.m += c._sum.minutes ?? 0; g.people.add(c.userId); groups.set(k, g); }
  }
  const rows = [...groups].sort((a, b) => (p.group === "month" ? a[0].localeCompare(b[0]) : b[1].m - a[1].m));
  const maxG = Math.max(1, ...rows.map((r) => r[1].m));
  const groupLabel = GROUPS.find((g) => g[0] === p.group)![1];

  // Hours over time. "All time" runs from the first entry to the last (which can be in the future).
  const firstDate = byDate[0] ? toStr(byDate[0].date) : today();
  const lastDate = byDate.length ? toStr(byDate[byDate.length - 1].date) : today();
  const shownFrom = p.range === "all" ? firstDate : from;
  const shownTo = p.range === "all" ? (lastDate > today() ? lastDate : today()) : to;
  const span = (toDate(shownTo).getTime() - toDate(shownFrom).getTime()) / 864e5 + 1;
  const unit = span <= 35 ? "day" : span <= 200 ? "week" : "month";
  const kOf = (d: string) => (unit === "day" ? d : unit === "week" ? monday(d) : d.slice(0, 7));
  const keys: string[] = [];
  const end = p.range === "all" ? shownTo : to < addDays(today(), 6) ? to : addDays(today(), 6);
  for (let d = shownFrom; d <= end; d = addDays(d, 1)) { const k = kOf(d); if (keys[keys.length - 1] !== k) keys.push(k); }
  const B: Record<string, number> = {};
  byDate.forEach((r) => { const k = kOf(toStr(r.date)); B[k] = (B[k] ?? 0) + (r._sum.minutes ?? 0) / 60; });

  const sel = (id: (typeof FILTER_KEYS)[number], label: string, all: string, opts: [string, string][]) => (
    <div><label htmlFor={`rp-${id}`}>{label}</label><select id={`rp-${id}`} name={id} defaultValue={p[id] ?? ""}><option value="">{all}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );
  const nf = FILTER_KEYS.filter((k) => p[k]).length;

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <AutoForm className="row" key={reportQuery(p)}>
          <div><label htmlFor="rp-range">Date range</label><select id="rp-range" name="range" defaultValue={p.range}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {p.range === "custom" && <>
            <div><label htmlFor="rp-from">From</label><input type="date" id="rp-from" name="from" defaultValue={from} min="2000-01-01" /></div>
            <div><label htmlFor="rp-to">To</label><input type="date" id="rp-to" name="to" defaultValue={to} /></div>
          </>}
          <div><label htmlFor="rp-group">Group by</label><select id="rp-group" name="group" defaultValue={p.group}>{GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {people.length > 1 && sel("person", "Person", "Everyone", people.map((u) => [u.id, u.name]))}
          {teams.length > 1 && sel("team", "Team", "All teams", teams)}
          {sel("client", "Client", "All clients", clients)}
          {sel("project", "Project", "All projects", projOpts)}
          {sel("tag", "Tag", "All tags", tags.map((t) => [t.id, t.name]))}
          {sel("phase", "Phase", "All phases", phaseNames.map((x) => [x.name, x.name]))}
          {sel("desc", "Description", "Any description", descOpts.map((d) => [d, d.length > 60 ? d.slice(0, 57) + "…" : d]))}
          {me.role === "ADMIN" && sel("location", "Location", "All offices", locations.map((l) => [l.id, l.name]))}
          {nf > 0 && <Link className="btn" href={`/reports?${reportQuery({ range: p.range, from: p.from, to: p.to, group: p.group })}`}>Clear {nf} filter{nf > 1 ? "s" : ""}</Link>}
          <a className="btn" href={`/reports/export?${reportQuery(p)}`}>Export CSV</a>
          <noscript><button className="btn">Apply</button></noscript>
        </AutoForm>
        <p className="note" style={{ margin: "10px 0 0" }}>Showing: {scopeLabel(me)} · {longDate(shownFrom)} to {longDate(shownTo)}</p>
      </section>
      <div className="grid">
        <section className="panel full">
          <div className="stats spread">
            <div className="stat"><b>{f(total)}</b><span>total hours</span></div>
            <div className="stat"><b>{new Set(combos.map((c) => c.projectId)).size}</b><span>projects</span></div>
            <div className="stat"><b>{entryCount.toLocaleString("en-US")}</b><span>entries</span></div>
            <div className="stat"><b>{new Set(combos.map((c) => c.userId)).size}</b><span>people</span></div>
          </div>
        </section>
        <section className="panel full">
          <h3>Hours over time</h3>
          <BarChart keys={keys} values={B} unit={unit} />
        </section>
        <section className="panel full">
          <h3>By {groupLabel.toLowerCase()}</h3>
          <div className="tablebox"><table>
            <thead><tr><th>{groupLabel}</th><th className="num">Hours</th><th className="num">People</th><th style={{ width: "35%" }}>Share of hours</th></tr></thead>
            <tbody>
              {rows.map(([k, g]) => (
                <tr key={k}>
                  <td>{p.group === "person" && U.has(k) ? <Link className="plink" href={`/profile/${k}`}>{g.label}</Link> : g.label}</td>
                  <td className="num">{f(g.m)}</td><td className="num">{g.people.size}</td>
                  <td><div className="meter"><i style={{ width: `${(g.m / maxG) * 100}%` }} /></div><div className="note">{total ? ((g.m / total) * 100).toFixed(1) : 0}%</div></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="empty">No time in this range.</td></tr>}
            </tbody>
          </table></div>
        </section>
      </div>
    </>
  );
}

function BarChart({ keys, values, unit }: { keys: string[]; values: Record<string, number>; unit: string }) {
  const W = 900, H = 240, pl = 44, pr = 8, pt = 12, pb = 26, iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(1, ...keys.map((k) => values[k] ?? 0));
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000].find((s) => max / s <= 5) ?? 100000;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => pt + ih - (v / top) * ih;
  const bw = iw / Math.max(1, keys.length), gap = Math.min(6, bw * 0.25), every = Math.ceil(keys.length / 10);
  const lbl = (k: string) => (unit === "month" ? toDate(k + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) : shortDate(k));
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Hours per ${unit}`}>
        {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
        {keys.map((k, i) => {
          const x = pl + i * bw + gap / 2, w = Math.max(1, bw - gap), v = values[k] ?? 0;
          return (
            <g key={k}>
              {v > 0 && <rect x={x} y={y(v)} width={w} height={ih - (y(v) - pt)} fill="var(--s1)" rx={Math.min(3, w / 3)}><title>{`${lbl(k)}: ${v.toFixed(1)} h`}</title></rect>}
              {i % every === 0 && <text x={x + w / 2} y={H - 8} textAnchor="middle">{lbl(k)}</text>}
            </g>
          );
        })}
      </svg>
      <p className="note" style={{ margin: "6px 0 0" }}>Hours per {unit}</p>
    </div>
  );
}
