import { NOT_A_RESOURCE, SEES_COMPANY_UTILISATION } from "@/lib/roles";
import Link from "next/link";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { expectsHoursWhere, scopeLabel, utilisationUsersWhere } from "@/lib/scope";
import { addMonths, endOfMonth, longDate, rangeDates, today, toDate } from "@/lib/dates";
import { fmtHours, pct } from "@/lib/format";
import { completeEnd, targetMinutes } from "@/lib/productivity";
import AutoForm from "@/components/AutoForm";
import MyStats from "@/components/MyStats";
import TrendChart from "@/components/TrendChart";
import MonthBars from "@/components/MonthBars";
import { PageHead, Ifld } from "@/components/ui";
import MonthlyReportTable from "@/components/MonthlyReportTable";
import { ALL_OFFICES, monthlyReport, reportYears } from "@/lib/monthlyReport";
import { clientPeriod } from "@/lib/clients";
import { PeriodPicker, periodNote } from "../clients/parts";
import ClientOverview from "./ClientOverview";

const PERIODS: [string, string][] = [["thisweek", "This week"], ["lastweek", "Last week"], ["thismonth", "This month"], ["lastmonth", "Last month"], ["thisquarter", "This quarter"], ["thisyear", "This year"], ["lastyear", "Last year"]];
const OFFCOL = ["s1", "s2", "s8", "s3", "s6"];
const TEAMCOL = ["s1", "s2", "s8", "s3", "s6", "s7", "s5"]; // one colour per team in an office, the same on its card and in the chart
type Row = { id: string; name: string; title: string; team: string; locationId: string; m: number; tg: number; prod: number };
const sum = (rows: Row[]) => { const m = rows.reduce((a, r) => a + r.m, 0), tg = rows.reduce((a, r) => a + r.tg, 0); return { m, tg, prod: tg ? m / tg : 0, n: rows.length, avg: rows.length ? m / rows.length : 0 }; };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; rank?: string; ryear?: string; roffice?: string; crange?: string; tab?: string }> }) {
  const sp = await searchParams;
  const me = await requireTab("dashboard");
  const settings = await getSettings();
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  // Team members get their own numbers; everyone else sees them above the numbers for the people they look after.
  if (me.role === "MEMBER") return <><PageHead title="Dashboard" sub="How your logged time compares with what is expected of you." /><div className="grid g2"><MyStats me={me} timeFormat={settings.timeFormat} /></div></>;
  const range = PERIODS.some((p) => p[0] === sp.range) ? sp.range! : "thismonth";
  const rank = sp.rank === "total" ? "total" : "prod";
  // Location managers and admins have three tabs: Team Overview (below), Client overview (each client's hours and utilisation, which used to be
  // the Clients page's overview) and Detailed Utilization, the office's monthly report like the sheet they kept before. Location managers see
  // their office; admins the office they pick. Human Resource sees the company's utilisation (Team Overview and Detailed Utilization, every
  // office) without anything about clients. Each tab keeps the other's choices in its links.
  const company = SEES_COMPANY_UTILISATION.includes(me.role);
  const tabs = me.role === "LOCATION" || company;
  const clientTabs = me.role === "LOCATION" || me.role === "ADMIN";
  const keep = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString();
  const shared = { range: sp.range, rank: sp.rank, crange: sp.crange, ryear: sp.ryear, roffice: sp.roffice };
  const tabNav = (on: "overview" | "clients" | "detailed") => tabs && (
    <nav className="seg rtabs dtabs" aria-label="Dashboard view">
      <Link href={`/dashboard?${keep(shared)}`} aria-pressed={on === "overview"}>Team Overview</Link>
      {clientTabs && <Link href={`/dashboard?${keep({ tab: "clients", ...shared })}`} aria-pressed={on === "clients"}>Client overview</Link>}
      <Link href={`/dashboard?${keep({ tab: "detailed", ...shared })}`} aria-pressed={on === "detailed"}>Detailed Utilization</Link>
    </nav>
  );
  if (clientTabs && sp.tab === "clients") {
    const per = clientPeriod(sp.crange);
    return (
      <>
        <PageHead title="Dashboard" actions={<PeriodPicker per={per} id="cl-range" name="crange" keep={{ tab: "clients" }} />} sub={periodNote(per)} />
        {tabNav("clients")}
        <div className="grid"><ClientOverview per={per} f={f} /></div>
      </>
    );
  }
  if (tabs && sp.tab === "detailed") {
    const offices = company ? await db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [{ id: me.locationId, name: me.location.name }];
    // Admins and Human Resource can also pick every office together (ALL_OFFICES): the company's numbers, the offices added up.
    const choices = company ? [{ id: ALL_OFFICES, name: "All offices" }, ...offices] : offices;
    const office = choices.find((o) => o.id === sp.roffice) ?? offices[0];
    const locationId = office && office.id !== ALL_OFFICES ? office.id : null;
    const years = office ? await reportYears(locationId) : [];
    const year = years.includes(Number(sp.ryear)) ? Number(sp.ryear) : years[0];
    return (
      <>
        <PageHead title="Dashboard" sub="Each office's, or all offices' together, month by month numbers for the year: inventory, hours logged, people, utilisation, contract fulfilment and hours by tag." />
        {tabNav("detailed")}
        <div className="grid g3">
          {office
            ? <MonthlyReportTable report={await monthlyReport(locationId, year)} office={office} offices={company ? choices : undefined} contracts={me.role !== "HUMAN_RESOURCE"} years={years}
                keep={Object.fromEntries(Object.entries({ tab: "detailed", range: sp.range, rank: sp.rank }).filter((e): e is [string, string] => !!e[1]))} />
            : <p className="note full">No offices yet.</p>}
        </div>
      </>
    );
  }
  const closedMyNumbers = (await cookies()).get("tsink-mynumbers")?.value === "0"; // "Your numbers" folded up, kept per browser
  const [a, bRaw] = rangeDates(range);
  const b = completeEnd(bRaw); // count complete days only, so hours and targets cover the same days

  const users = await db.user.findMany({ where: { AND: [utilisationUsersWhere(me), { active: true, passwordHash: { not: null }, role: { notIn: NOT_A_RESOURCE } }, expectsHoursWhere] }, include: { team: true, location: true }, orderBy: { name: "asc" } });
  const ids = users.map((u) => u.id);
  const sums = b >= a ? await db.timeEntry.groupBy({ by: ["userId"], where: { userId: { in: ids }, date: { gte: toDate(a), lte: toDate(b) } }, _sum: { minutes: true } }) : [];
  const byUser = new Map(sums.map((s) => [s.userId, s._sum.minutes ?? 0]));
  // Target hours only count working days from when each person started, less their office's public holidays and their time off (see expected.ts).
  const target = await targetMinutes(users);
  const rows: Row[] = users.map((u) => { const m = byUser.get(u.id) ?? 0, tg = b >= a ? target(u, a, b) : 0; return { id: u.id, name: u.name, title: u.title, team: u.team?.name ?? "No team", locationId: u.locationId, m, tg, prod: tg ? m / tg : 0 }; });
  const locs = [...new Map(users.map((u) => [u.locationId, u.location])).values()].sort((x, y) => x.name.localeCompare(y.name));
  const allLocs = await db.location.findMany({ orderBy: { name: "asc" }, select: { id: true } });
  const colorOf = (id: string) => OFFCOL[Math.max(0, allLocs.findIndex((l) => l.id === id)) % OFFCOL.length];
  const all = sum(rows);
  // Someone with nothing expected in the period (off the whole time) has no productivity to rank.
  const ranking = (list: Row[]) => [...list].filter((r) => rank === "total" || r.tg > 0).sort((x, y) => (rank === "total" ? y.m - x.m : y.prod - x.prod));
  // The bottom five are the last of the ranking, never anyone already in the top five.
  const bottom = (list: Row[]) => { const up = ranking(list); return up.slice(Math.max(5, up.length - 5)); };
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

  // Location managers and admins also see, for each office, its inventory against what it actually logged, month by month. Inventory is the
  // office's capacity: each person's expected hours for the month added up (see expected.ts), so it already allows for holidays and time off.
  const inventory: { id: string; name: string; series: { id: string; name: string; color: string; dashed?: boolean; v: (number | null)[] }[] }[] = [];
  if (me.role === "LOCATION" || company) {
    for (const l of locs) {
      const us = users.filter((u) => u.locationId === l.id);
      const inv = months.map((m) => us.reduce((t, u) => t + target(u, m + "-01", endOfMonth(m)), 0) / 60);
      const actual = months.map((m) => us.reduce((t, u) => t + (mm.get(`${u.id}|${m}`) ?? 0), 0) / 60);
      inventory.push({ id: l.id, name: l.name, series: [
        { id: "actual", name: "Actual", color: "s1", v: actual.map((v, i) => (v || inv[i] ? v : null)) },
        { id: "inventory", name: "Inventory", color: "s4", dashed: true, v: inv.map((v) => v || null) },
      ] });
    }
  }
  const hoursText = (v: number) => `${Math.round(v).toLocaleString("en-US")} h`;

  // The # column is the place in the full ranking, so the bottom five read as, say, 9th to 12th.
  const topTable = (list: Row[], showOffice: boolean, lowest = false) => {
    const up = ranking(list);
    const shown = lowest ? bottom(list) : up.slice(0, 5);
    return (
      <div className="tablebox"><table>
        <thead><tr><th className="num">#</th><th>Person</th>{showOffice && <th>Office</th>}<th className="num">Productivity</th><th className="num">Hours</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}><td className="num">{up.indexOf(r) + 1}</td><td><Link href={`/profile/${r.id}`}>{r.name}</Link><div className="note">{r.title} · {r.team}</div></td>{showOffice && <td>{locs.find((l) => l.id === r.locationId)?.name}</td>}<td className="num">{r.tg ? pct(r.prod) : "–"}</td><td className="num">{f(r.m)}</td></tr>
          ))}
          {!shown.length && <tr><td colSpan={showOffice ? 5 : 4} className="empty">{lowest && up.length ? "Everyone is in the top 5." : "Nobody to show."}</td></tr>}
        </tbody>
      </table></div>
    );
  };

  return (
    <>
      <PageHead title="Dashboard"
        actions={<AutoForm className="phd-a" key={range + rank}>
          {sp.ryear && <input type="hidden" name="ryear" value={sp.ryear} />}{sp.roffice && <input type="hidden" name="roffice" value={sp.roffice} />}
          <Ifld id="ds-range" label="Period" name="range" defaultValue={range}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Ifld>
          <Ifld id="ds-rank" label="Rank performers by" name="rank" defaultValue={rank}><option value="prod">Productivity</option><option value="total">Total hours</option></Ifld>
        </AutoForm>}
        sub={`${b >= a ? `${longDate(a)} to ${longDate(b)}. ` : "No complete days in this period yet. "}Productivity is hours logged divided by inventory hours (each person's expected hours per week, counted per working day so far, less their office's public holidays and their time off). When ranked by productivity, people with 0 inventory hours are left out; admins (who are not a resource) are always left out.`} />
      {tabNav("overview")}
      <div className="grid g3">
        <MyStats me={me} timeFormat={settings.timeFormat} collapsible closed={closedMyNumbers} />
        <section className="panel full">
          <h3>{scopeLabel(me)}</h3>
          <div className="stats spread">
            <div className="stat"><b>{pct(all.prod)}</b><span>productivity</span></div>
            <div className="stat"><b>{f(all.m)}</b><span>total hours</span></div>
            <div className="stat"><b>{f(all.tg)}</b><span>inventory hours</span></div>
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
                      <div className="stat"><b>{f(o.tg)}</b><span>inventory hours</span></div>
                      <div className="stat"><b>{f(o.avg)}</b><span>per person</span></div>
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="note" style={{ margin: "8px 0 0" }}>Bar colours: green is 75% or more of inventory, blue is 50% to 75%, orange is under 50%.</p>
          </div>
        )}
        {company && locs.map((l) => {
          const o = sum(rows.filter((r) => r.locationId === l.id));
          return (
            <section className="panel" key={l.id}>
              <div className="row between"><h3 style={{ margin: 0 }}><span className="dot" style={{ background: `var(--${colorOf(l.id)})` }} />{l.name} office</h3><span className="note">{o.n} people</span></div>
              <div className="stat" style={{ margin: "12px 0 8px" }}><b>{pct(o.prod)}</b><span>total productivity</span></div>
              <div className="meter" style={{ height: 10 }}><i className={o.prod >= 0.75 ? "done" : o.prod < 0.5 ? "hi" : ""} style={{ width: `${Math.min(100, o.prod * 100)}%` }} /></div>
              <div className="stats spread sm" style={{ marginTop: 12 }}>
                <div className="stat"><b>{f(o.m)}</b><span>total hours</span></div>
                <div className="stat"><b>{f(o.tg)}</b><span>inventory hours</span></div>
              </div>
            </section>
          );
        })}
        {company && locs.length > 0 && <p className="note full" style={{ margin: 0 }}>Bar colours: green is 75% or more of inventory, blue is 50% to 75%, orange is under 50%.</p>}
        <section className="panel full">
          <h3>Productivity by month, last 12 full months{me.role === "LOCATION" ? `, by team in ${me.location.name}` : ""}</h3>
          <TrendChart months={months} series={series} label={me.role === "LOCATION" ? "Monthly productivity by team" : "Monthly productivity by office"} />
          <div className="legend">{series.map((s) => <span key={s.id}><i style={{ background: `var(--${s.color})` }} />{s.name}</span>)}</div>
        </section>
        {inventory.map((o) => (
          <section className="panel full" key={o.id}>
            <h3>Inventory vs actual, last 12 full months, {o.name}</h3>
            <MonthBars months={months} series={o.series} fmt={hoursText} label={`Inventory and actual hours by month, ${o.name}`} />
            <div className="legend">{o.series.map((x) => <span key={x.id}><i style={{ background: `var(--${x.color})` }} />{x.name}</span>)}</div>
            <p className="note" style={{ margin: "8px 0 0" }}>Inventory is the office&apos;s capacity: each person&apos;s expected hours for the month, added up (their weekly hours for that month, less public holidays and time off; admins are not counted). Actual is the hours the office&apos;s people logged that month.</p>
          </section>
        ))}
        <section className="panel full">
          <div className="row between"><h3 style={{ margin: 0 }}>Top 5 performers, {company ? "all offices" : scopeLabel(me)}</h3><span className="note">Ranked by {rank === "total" ? "total hours" : "productivity"}</span></div>
          <div style={{ marginTop: 10 }}>{topTable(rows, multiOffice)}</div>
          {me.role === "LOCATION" && <>
            <div className="row between" style={{ marginTop: 18 }}><h3 style={{ margin: 0 }}>Bottom 5 performers, {scopeLabel(me)}</h3></div>
            <div style={{ marginTop: 10 }}>{topTable(rows, false, true)}</div>
          </>}
        </section>
        {multiOffice && locs.map((l) => {
          const office = rows.filter((r) => r.locationId === l.id);
          return (
            <section className="panel" key={l.id}>
              <h3>Top 5 in {l.name}</h3>{topTable(office, false)}
              <h3 style={{ marginTop: 18 }}>Bottom 5 in {l.name}</h3>{topTable(office, false, true)}
            </section>
          );
        })}
      </div>
    </>
  );
}
