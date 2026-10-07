import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { scopeLabel, visibleUsersWhere } from "@/lib/scope";
import { addMonths, endOfMonth, longDate, rangeDates, today, toDate } from "@/lib/dates";
import { fmtHours, pct } from "@/lib/format";
import { completeEnd, targetMinutes } from "@/lib/productivity";
import AutoForm from "@/components/AutoForm";
import MyStats from "@/components/MyStats";
import TrendChart from "@/components/TrendChart";
import { PageHead, Ifld } from "@/components/ui";

const PERIODS: [string, string][] = [["thisweek", "This week"], ["lastweek", "Last week"], ["thismonth", "This month"], ["lastmonth", "Last month"], ["thisquarter", "This quarter"], ["thisyear", "This year"], ["lastyear", "Last year"]];
const OFFCOL = ["s1", "s2", "s8", "s3", "s6"];
const TEAMCOL = ["s1", "s2", "s8", "s3", "s6", "s7", "s5"]; // one colour per team in an office, the same on its card and in the chart
type Row = { id: string; name: string; title: string; team: string; locationId: string; m: number; tg: number; prod: number };
const sum = (rows: Row[]) => { const m = rows.reduce((a, r) => a + r.m, 0), tg = rows.reduce((a, r) => a + r.tg, 0); return { m, tg, prod: tg ? m / tg : 0, n: rows.length, avg: rows.length ? m / rows.length : 0 }; };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; rank?: string }> }) {
  const sp = await searchParams;
  const me = await requireTab("dashboard");
  const settings = await getSettings();
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  // Team members get their own numbers; everyone else sees them above the numbers for the people they look after.
  if (me.role === "MEMBER") return <><PageHead title="Dashboard" sub="How your logged time compares with what is expected of you." /><div className="grid g2"><MyStats me={me} timeFormat={settings.timeFormat} /></div></>;
  const range = PERIODS.some((p) => p[0] === sp.range) ? sp.range! : "thismonth";
  const rank = sp.rank === "total" ? "total" : "prod";
  const [a, bRaw] = rangeDates(range);
  const b = completeEnd(bRaw); // count complete days only, so hours and targets cover the same days

  const users = await db.user.findMany({ where: { AND: [visibleUsersWhere(me), { active: true, passwordHash: { not: null }, weeklyTarget: { gt: 0 } }] }, include: { team: true, location: true }, orderBy: { name: "asc" } });
  const ids = users.map((u) => u.id);
  const sums = b >= a ? await db.timeEntry.groupBy({ by: ["userId"], where: { userId: { in: ids }, date: { gte: toDate(a), lte: toDate(b) } }, _sum: { minutes: true } }) : [];
  const byUser = new Map(sums.map((s) => [s.userId, s._sum.minutes ?? 0]));
  // Target hours only count working days from when each person started (see trackingStarts).
  const target = await targetMinutes(users);
  const rows: Row[] = users.map((u) => { const m = byUser.get(u.id) ?? 0, tg = b >= a ? target(u, a, b) : 0; return { id: u.id, name: u.name, title: u.title, team: u.team?.name ?? "No team", locationId: u.locationId, m, tg, prod: tg ? m / tg : 0 }; });
  const locs = [...new Map(users.map((u) => [u.locationId, u.location])).values()].sort((x, y) => x.name.localeCompare(y.name));
  const allLocs = await db.location.findMany({ orderBy: { name: "asc" }, select: { id: true } });
  const colorOf = (id: string) => OFFCOL[Math.max(0, allLocs.findIndex((l) => l.id === id)) % OFFCOL.length];
  const all = sum(rows);
  const top = (list: Row[]) => [...list].sort((x, y) => (rank === "total" ? y.m - x.m : y.prod - x.prod)).slice(0, 5);
  const multiOffice = locs.length > 1;
  // Location managers also see a card for each team in their office (the cards add up to the office total).
  const teamMap = new Map<string, Row[]>();
  if (me.role === "LOCATION") for (const r of rows) teamMap.set(r.team, [...(teamMap.get(r.team) ?? []), r]);
  const teamCards = [...teamMap.entries()].sort((x, y) => Number(x[0] === "Operations") - Number(y[0] === "Operations") || x[0].localeCompare(y[0]));

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
  // A location manager sees one line per team in their office; everyone else sees one line per office.
  const lines = me.role === "LOCATION"
    ? teamCards.map(([t], i) => ({ id: t, name: t, color: TEAMCOL[i % TEAMCOL.length], us: users.filter((u) => (u.team?.name ?? "No team") === t) }))
    : locs.map((l) => ({ id: l.id, name: l.name, color: colorOf(l.id), us: users.filter((u) => u.locationId === l.id) }));
  const series = lines.map(({ us, ...line }) => ({
    ...line,
    v: months.map((m) => {
      const tg = us.reduce((s, u) => s + target(u, m + "-01", endOfMonth(m)), 0);
      return tg ? us.reduce((s, u) => s + (mm.get(`${u.id}|${m}`) ?? 0), 0) / tg : null;
    }),
  }));

  const topTable = (list: Row[], showOffice: boolean) => (
    <div className="tablebox"><table>
      <thead><tr><th className="num">#</th><th>Person</th>{showOffice && <th>Office</th>}<th className="num">Productivity</th><th className="num">Hours</th><th className="num">Target h</th></tr></thead>
      <tbody>
        {top(list).map((r, i) => (
          <tr key={r.id}><td className="num">{i + 1}</td><td><Link href={`/profile/${r.id}`}>{r.name}</Link><div className="note">{r.title} · {r.team}</div></td>{showOffice && <td>{locs.find((l) => l.id === r.locationId)?.name}</td>}<td className="num">{pct(r.prod)}</td><td className="num">{f(r.m)}</td><td className="num">{f(r.tg)}</td></tr>
        ))}
        {!list.length && <tr><td colSpan={6} className="empty">Nobody to show.</td></tr>}
      </tbody>
    </table></div>
  );

  return (
    <>
      <PageHead title="Dashboard"
        actions={<AutoForm className="phd-a" key={range + rank}>
          <Ifld id="ds-range" label="Period" name="range" defaultValue={range}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Ifld>
          <Ifld id="ds-rank" label="Rank performers by" name="rank" defaultValue={rank}><option value="prod">Productivity</option><option value="total">Total hours</option></Ifld>
        </AutoForm>}
        sub={`${b >= a ? `${longDate(a)} to ${longDate(b)}. ` : "No complete days in this period yet. "}Productivity is hours logged divided by target hours (each person's expected hours per week, counted per working day so far). People with a target of 0 are left out.`} />
      <div className="grid g3">
        <MyStats me={me} timeFormat={settings.timeFormat} />
        <section className="panel full">
          <h3>{scopeLabel(me)}</h3>
          <div className="stats spread">
            <div className="stat"><b>{pct(all.prod)}</b><span>productivity</span></div>
            <div className="stat"><b>{f(all.m)}</b><span>total hours</span></div>
            <div className="stat"><b>{f(all.tg)}</b><span>target hours</span></div>
            <div className="stat"><b>{f(all.avg)}</b><span>average hours per person</span></div>
            <div className="stat"><b>{all.n}</b><span>people</span></div>
          </div>
        </section>
        {me.role === "LOCATION" && teamCards.length > 0 && (
          <div className="full offwrap">
            <div className="ch" style={{ margin: "0 0 8px" }}><h3>Teams in {me.location.name}</h3><span className="cd">{PERIODS.find((p) => p[0] === range)![1]}</span></div>
            <div className="offs">
              {teamCards.map(([t, list], i) => {
                const o = sum(list);
                return (
                  <section className={`panel${i >= teamCards.length - ({ 2: 2, 1: 4 }[teamCards.length % 3] ?? 0) ? " w3" : ""}`} key={t}>
                    <div className="ch"><h3><span className="dot" style={{ background: `var(--${TEAMCOL[i % TEAMCOL.length]})` }} />{t === "No team" ? t : `${t} team`}</h3><span className="cd">{o.n === 1 ? "1 person" : `${o.n} people`}</span></div>
                    <div className="stat" style={{ margin: "4px 0 10px" }}><b>{pct(o.prod)}</b><span>team productivity</span></div>
                    <div className="meter"><i className={o.prod >= 0.75 ? "done" : o.prod < 0.5 ? "hi" : ""} style={{ width: `${Math.min(100, o.prod * 100)}%` }} /></div>
                    <div className="stats spread sm" style={{ marginTop: 14 }}>
                      <div className="stat"><b>{f(o.m)}</b><span>total hours</span></div>
                      <div className="stat"><b>{f(o.tg)}</b><span>target hours</span></div>
                      <div className="stat"><b>{f(o.avg)}</b><span>per person</span></div>
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="note" style={{ margin: "8px 0 0" }}>Bar colours: green is 75% or more of target, blue is 50% to 75%, orange is under 50%.</p>
          </div>
        )}
        {me.role === "ADMIN" && locs.map((l) => {
          const o = sum(rows.filter((r) => r.locationId === l.id));
          return (
            <section className="panel" key={l.id}>
              <div className="row between"><h3 style={{ margin: 0 }}><span className="dot" style={{ background: `var(--${colorOf(l.id)})` }} />{l.name} office</h3><span className="note">{o.n} people</span></div>
              <div className="stat" style={{ margin: "12px 0 8px" }}><b>{pct(o.prod)}</b><span>total productivity</span></div>
              <div className="meter" style={{ height: 10 }}><i className={o.prod >= 0.75 ? "done" : o.prod < 0.5 ? "hi" : ""} style={{ width: `${Math.min(100, o.prod * 100)}%` }} /></div>
              <div className="stats spread sm" style={{ marginTop: 12 }}>
                <div className="stat"><b>{f(o.m)}</b><span>total hours</span></div>
                <div className="stat"><b>{f(o.tg)}</b><span>target hours</span></div>
                <div className="stat"><b>{f(o.avg)}</b><span>average per person</span></div>
              </div>
            </section>
          );
        })}
        {me.role === "ADMIN" && locs.length > 0 && <p className="note full" style={{ margin: 0 }}>Bar colours: green is 75% or more of target, blue is 50% to 75%, orange is under 50%.</p>}
        <section className="panel full">
          <h3>Productivity by month, last 12 full months{me.role === "LOCATION" ? `, by team in ${me.location.name}` : ""}</h3>
          <TrendChart months={months} series={series} label={me.role === "LOCATION" ? "Monthly productivity by team" : "Monthly productivity by office"} />
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
