import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { scopeLabel, visibleUsersWhere } from "@/lib/scope";
import { addDays, addMonths, endOfMonth, longDate, rangeDates, today, toDate, workdaysSoFar } from "@/lib/dates";
import { fmtHours, pct } from "@/lib/format";
import AutoForm from "@/components/AutoForm";
import { trackingStarts } from "@/lib/startDates";

const PERIODS: [string, string][] = [["thisweek", "This week"], ["lastweek", "Last week"], ["thismonth", "This month"], ["lastmonth", "Last month"], ["thisquarter", "This quarter"], ["thisyear", "This year"], ["lastyear", "Last year"]];
const OFFCOL = ["s1", "s2", "s3", "s4"];
type Row = { id: string; name: string; title: string; team: string; locationId: string; m: number; tg: number; prod: number };
const sum = (rows: Row[]) => { const m = rows.reduce((a, r) => a + r.m, 0), tg = rows.reduce((a, r) => a + r.tg, 0); return { m, tg, prod: tg ? m / tg : 0, n: rows.length, avg: rows.length ? m / rows.length : 0 }; };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; rank?: string }> }) {
  const sp = await searchParams;
  const me = await requireTab("dashboard");
  const settings = await getSettings();
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  const range = PERIODS.some((p) => p[0] === sp.range) ? sp.range! : "thismonth";
  const rank = sp.rank === "total" ? "total" : "prod";
  const [a, bRaw] = rangeDates(range);
  const yesterday = addDays(today(), -1);
  const b = bRaw < yesterday ? bRaw : yesterday; // count complete days only, so hours and targets cover the same days

  const users = await db.user.findMany({ where: { AND: [visibleUsersWhere(me), { active: true, passwordHash: { not: null }, weeklyTarget: { gt: 0 } }] }, include: { team: true, location: true }, orderBy: { name: "asc" } });
  const ids = users.map((u) => u.id);
  const sums = b >= a ? await db.timeEntry.groupBy({ by: ["userId"], where: { userId: { in: ids }, date: { gte: toDate(a), lte: toDate(b) } }, _sum: { minutes: true } }) : [];
  const byUser = new Map(sums.map((s) => [s.userId, s._sum.minutes ?? 0]));
  const starts = await trackingStarts(users);
  // Target hours only count working days from when each person started (see trackingStarts).
  const workdays = (uid: string, from: string, to: string) => { const st = starts.get(uid)!; return workdaysSoFar(st > from ? st : from, to); };
  const rows: Row[] = users.map((u) => { const m = byUser.get(u.id) ?? 0, tg = (u.weeklyTarget / 5) * (b >= a ? workdays(u.id, a, b) : 0) * 60; return { id: u.id, name: u.name, title: u.title, team: u.team?.name ?? "No team", locationId: u.locationId, m, tg, prod: tg ? m / tg : 0 }; });
  const locs = [...new Map(users.map((u) => [u.locationId, u.location])).values()].sort((x, y) => x.name.localeCompare(y.name));
  const allLocs = await db.location.findMany({ orderBy: { name: "asc" }, select: { id: true } });
  const colorOf = (id: string) => OFFCOL[Math.max(0, allLocs.findIndex((l) => l.id === id)) % 4];
  const all = sum(rows);
  const top = (list: Row[]) => [...list].sort((x, y) => (rank === "total" ? y.m - x.m : y.prod - x.prod)).slice(0, 5);
  const multiOffice = locs.length > 1;

  // Monthly productivity per office, last 12 full months
  const firstMonth = addMonths(today().slice(0, 7), -12);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(firstMonth, i));
  const monthly = ids.length
    ? await db.$queryRaw<{ userId: string; m: string; minutes: bigint }[]>(Prisma.sql`
        SELECT "userId", to_char(date, 'YYYY-MM') AS m, SUM(minutes)::bigint AS minutes FROM "TimeEntry"
        WHERE "userId" IN (${Prisma.join(ids)}) AND date >= ${toDate(firstMonth + "-01")} AND date <= ${toDate(endOfMonth(months[11]))}
        GROUP BY 1, 2`)
    : [];
  const mm = new Map(monthly.map((r) => [`${r.userId}|${r.m}`, Number(r.minutes)]));
  const series = locs.map((l) => ({
    id: l.id, name: l.name, color: colorOf(l.id),
    v: months.map((m) => {
      const us = users.filter((u) => u.locationId === l.id);
      const tg = us.reduce((s, u) => s + (u.weeklyTarget / 5) * workdays(u.id, m + "-01", endOfMonth(m)) * 60, 0);
      return tg ? us.reduce((s, u) => s + (mm.get(`${u.id}|${m}`) ?? 0), 0) / tg : null;
    }),
  }));

  const topTable = (list: Row[], showOffice: boolean) => (
    <div className="tablebox"><table>
      <thead><tr><th className="num">#</th><th>Person</th>{showOffice && <th>Office</th>}<th className="num">Productivity</th><th className="num">Hours</th><th className="num">Target h</th></tr></thead>
      <tbody>
        {top(list).map((r, i) => (
          <tr key={r.id}><td className="num">{i + 1}</td><td>{r.name}<div className="note">{r.title} · {r.team}</div></td>{showOffice && <td>{locs.find((l) => l.id === r.locationId)?.name}</td>}<td className="num">{pct(r.prod)}</td><td className="num">{f(r.m)}</td><td className="num">{f(r.tg)}</td></tr>
        ))}
        {!list.length && <tr><td colSpan={6} className="empty">Nobody to show.</td></tr>}
      </tbody>
    </table></div>
  );

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <AutoForm className="row" key={range + rank}>
          <div><label htmlFor="ds-range">Period</label><select id="ds-range" name="range" defaultValue={range}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label htmlFor="ds-rank">Rank performers by</label><select id="ds-rank" name="rank" defaultValue={rank}><option value="prod">Productivity</option><option value="total">Total hours</option></select></div>
          <div style={{ flex: "2 1 300px" }}><p className="note" style={{ margin: 0 }}>{b >= a ? `${longDate(a)} to ${longDate(b)}. ` : "No complete days in this period yet. "}Productivity is hours logged divided by target hours. Each person&apos;s weekly target is spread over Monday to Friday, up to yesterday, from the day they started. People with a target of 0 are left out.</p></div>
        </AutoForm>
      </section>
      <div className="grid g2">
        <section className="panel full">
          <h3>{scopeLabel(me)}</h3>
          <div className="stats">
            <div className="stat"><b>{pct(all.prod)}</b><span>productivity</span></div>
            <div className="stat"><b>{f(all.m)}</b><span>total hours</span></div>
            <div className="stat"><b>{f(all.tg)}</b><span>target hours</span></div>
            <div className="stat"><b>{f(all.avg)}</b><span>average hours per person</span></div>
            <div className="stat"><b>{all.n}</b><span>people</span></div>
          </div>
        </section>
        {me.role === "ADMIN" && locs.map((l) => {
          const o = sum(rows.filter((r) => r.locationId === l.id));
          return (
            <section className="panel" key={l.id}>
              <div className="row between"><h3 style={{ margin: 0 }}><span className="dot" style={{ background: `var(--${colorOf(l.id)})` }} />{l.name} office</h3><span className="note">{o.n} people</span></div>
              <div className="stat" style={{ margin: "12px 0 8px" }}><b>{pct(o.prod)}</b><span>total productivity</span></div>
              <div className="meter" style={{ height: 10 }}><i className={o.prod >= 0.75 ? "done" : o.prod < 0.5 ? "hi" : ""} style={{ width: `${Math.min(100, o.prod * 100)}%` }} /></div>
              <div className="row" style={{ marginTop: 12, gap: 20 }}>
                <div className="stat"><b style={{ fontSize: 18 }}>{f(o.m)}</b><span>total hours</span></div>
                <div className="stat"><b style={{ fontSize: 18 }}>{f(o.tg)}</b><span>target hours</span></div>
                <div className="stat"><b style={{ fontSize: 18 }}>{f(o.avg)}</b><span>average per person</span></div>
              </div>
            </section>
          );
        })}
        <section className="panel full">
          <h3>Productivity by month, last 12 full months</h3>
          <TrendChart months={months} series={series} />
          <div className="legend">{series.map((s) => <span key={s.id}><i style={{ background: `var(--${s.color})` }} />{s.name}</span>)}</div>
        </section>
        <section className="panel full">
          <div className="row between"><h3 style={{ margin: 0 }}>Top 5 performers, {me.role === "ADMIN" ? "all offices" : scopeLabel(me)}</h3><span className="note">Ranked by {rank === "total" ? "total hours" : "productivity"}</span></div>
          <div style={{ marginTop: 10 }}>{topTable(rows, multiOffice)}</div>
        </section>
        {multiOffice && locs.map((l) => <section className="panel" key={l.id}><h3>Top 5 in {l.name}</h3>{topTable(rows.filter((r) => r.locationId === l.id), false)}</section>)}
      </div>
    </>
  );
}

function TrendChart({ months, series }: { months: string[]; series: { id: string; name: string; color: string; v: (number | null)[] }[] }) {
  const W = 900, H = 250, pl = 44, pr = 90, pt = 14, pb = 28, iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(1, ...series.flatMap((s) => s.v.filter((v): v is number => v != null)));
  const top = Math.ceil(max * 4) / 4;
  const x = (i: number) => pl + i * (iw / 11), y = (v: number) => pt + ih - (v / top) * ih;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += 0.25) ticks.push(v);
  const lines = series.map((s) => ({ s, pts: s.v.map((v, i) => (v == null ? null : ([x(i), y(v), v] as const))).filter((p): p is readonly [number, number, number] => !!p) }));
  const labels = lines.filter((l) => l.pts.length).map((l) => ({ l, y: l.pts[l.pts.length - 1][1] })).sort((p, q) => p.y - q.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
  const mlabel = (m: string, long = false) => toDate(m + "-01").toLocaleDateString("en-US", long ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" });
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly productivity by office">
        {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{Math.round(v * 100)}%</text></g>)}
        {months.map((m, i) => <text key={m} x={x(i)} y={H - 8} textAnchor="middle">{mlabel(m)}</text>)}
        {lines.map(({ s, pts }) => (
          <g key={s.id}>
            <polyline points={pts.map((p) => `${p[0]},${p[1]}`).join(" ")} fill="none" stroke={`var(--${s.color})`} strokeWidth="2" strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill={`var(--${s.color})`} stroke="var(--surface)" strokeWidth="2"><title>{`${s.name}, ${mlabel(months[s.v.findIndex((_, j) => x(j) === p[0])], true)}: ${pct(p[2])}`}</title></circle>)}
          </g>
        ))}
        {labels.map((o) => { const last = o.l.pts[o.l.pts.length - 1]; return <text key={o.l.s.id} x={last[0] + 10} y={o.y + 4} style={{ fill: "var(--ink)" }}>{o.l.s.name}</text>; })}
      </svg>
    </div>
  );
}
