import Link from "next/link";
import { db } from "@/lib/db";
import type { Me } from "@/lib/auth";
import { addDays, addMonths, daysBetween, endOfMonth, monday, shortDate, today, toDate, toStr, workdays, workdaysSoFar } from "@/lib/dates";
import { fmtHours, pct, type TimeFormat } from "@/lib/format";
import { trackingStarts } from "@/lib/startDates";

const STATUS: Record<string, string> = { DRAFT: "not submitted yet", SUBMITTED: "waiting for approval", APPROVED: "approved", REJECTED: "sent back to you" };

/** One person's own numbers: how much of their expected hours they logged last week and last month, how this month compares with last month,
 *  and whether they are on pace. Hours over expected hours is the same utilisation figure the manager Dashboard and profiles use. */
export default async function MyStats({ me, timeFormat }: { me: Me; timeFormat: TimeFormat }) {
  const f = (m: number) => fmtHours(m, timeFormat);
  const t = today(), y = addDays(t, -1);
  const start = (await trackingStarts([me])).get(me.id) ?? t;
  const target = me.weeklyTarget;
  const expected = (a: string, b: string) => (target / 5) * workdaysSoFar(start > a ? start : a, b) * 60;

  const thisWs = monday(t), lastWs = addDays(thisWs, -7), lastWe = addDays(thisWs, -1);
  const thisYm = t.slice(0, 7), lastYm = addMonths(thisYm, -1);
  const thisMs = thisYm + "-01", lastMs = lastYm + "-01", lastMe = endOfMonth(lastYm);
  const weeks = Array.from({ length: 9 }, (_, i) => addDays(thisWs, (i - 8) * 7)); // eight full weeks and this one
  const from = [lastMs, weeks[0]].sort()[0];

  const [byDate, byProject, sheet, lastSheet] = await Promise.all([
    db.timeEntry.groupBy({ by: ["date"], where: { userId: me.id, date: { gte: toDate(from), lte: toDate(t) } }, _sum: { minutes: true } }),
    db.timeEntry.groupBy({ by: ["projectId"], where: { userId: me.id, date: { gte: toDate(thisMs), lte: toDate(t) } }, _sum: { minutes: true }, orderBy: { _sum: { minutes: "desc" } }, take: 5 }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: me.id, weekStart: toDate(thisWs) } }, select: { status: true } }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: me.id, weekStart: toDate(lastWs) } }, select: { status: true } }),
  ]);
  const days = new Map(byDate.map((r) => [toStr(r.date), r._sum.minutes ?? 0]));
  const logged = (a: string, b: string) => { let s = 0; for (const [d, m] of days) if (d >= a && d <= b) s += m; return s; };
  const projects = byProject.length ? await db.project.findMany({ where: { id: { in: byProject.map((p) => p.projectId) } }, select: { id: true, name: true, client: { select: { name: true } } } }) : [];
  const pname = new Map(projects.map((p) => [p.id, p]));

  // 1 and 2: last week and last month against expected hours
  const lwM = logged(lastWs, lastWe), lwE = expected(lastWs, lastWe);
  const lmM = logged(lastMs, lastMe), lmE = expected(lastMs, lastMe);
  // 3: this month so far against the same number of days of last month
  const n = y >= thisMs ? daysBetween(thisMs, y) + 1 : 0;
  const sameEnd = n ? (addDays(lastMs, n - 1) < lastMe ? addDays(lastMs, n - 1) : lastMe) : "";
  const tmM = n ? logged(thisMs, y) : 0, prevM = n ? logged(lastMs, sameEnd) : 0;
  const change = prevM ? (tmM - prevM) / prevM : null;
  // 4: pace this month
  const paceE = expected(thisMs, y), paceM = tmM, gap = paceM - paceE;
  const ratio = paceE ? paceM / paceE : null;
  const behind = ratio !== null && ratio < 0.9;
  const monthE = (target / 5) * workdays(start > thisMs ? start : thisMs, endOfMonth(thisYm)) * 60;
  const leftDays = workdays(t, endOfMonth(thisYm));
  const perDay = behind && leftDays ? Math.max(0, monthE - paceM) / leftDays : 0;

  const bars = weeks.map((ws) => ({ ws, m: logged(ws, addDays(ws, 6)) }));
  const top = Math.max(target * 60, ...bars.map((b) => b.m), 1);
  const projTotal = byProject.reduce((a, p) => a + (p._sum.minutes ?? 0), 0);

  if (!target) {
    return <section className="panel full"><h3>Your numbers</h3><p className="empty">Your expected hours per week are 0, so there is nothing to compare your time with. Ask your manager if that should change.</p></section>;
  }
  return (
    <section className="panel full" aria-label="Your numbers">
      <div className="ch"><h3>Your numbers</h3><span className="cd">Hours logged divided by your {f(target * 60)} expected hours a week, counting complete working days</span></div>
      <div className="insights">
        <div className="insight">
          <b>{lwE ? pct(lwM / lwE) : "–"}</b>
          <p>{lwE ? <>You logged {pct(lwM / lwE)} of your expected hours last week ({f(lwM)} of {f(lwE)} h).</> : "No expected hours for last week."}</p>
        </div>
        <div className="insight">
          <b>{lmE ? pct(lmM / lmE) : "–"}</b>
          <p>{lmE ? <>You logged {pct(lmM / lmE)} of your expected hours last month ({f(lmM)} of {f(lmE)} h).</> : "No expected hours for last month."}</p>
        </div>
        <div className="insight">
          <b>{change === null ? "–" : `${change >= 0 ? "+" : "−"}${pct(Math.abs(change))}`}</b>
          <p>{change === null ? (n ? "There is no time logged in the same days of last month to compare with." : "The month has only just started, so there is nothing to compare yet.")
            : Math.abs(change) < 0.005 ? "You logged about the same as in the same days of last month."
            : <>You logged {pct(Math.abs(change))} {change > 0 ? "more" : "less"} than in the same days of last month ({f(tmM)} against {f(prevM)} h).</>}</p>
        </div>
        <div className={`insight${behind ? " warn" : ""}`}>
          <b>{ratio === null ? "–" : pct(ratio)}</b>
          <p>{ratio === null ? "The month has only just started, so there is no pace to show yet."
            : behind ? <>You are clocking lower than expected: {f(Math.abs(gap))} h below the {f(paceE)} h expected so far this month{perDay ? <>. About {f(perDay)} h a working day for the rest of the month gets you there</> : null}.</>
            : ratio < 1 ? <>Just under pace: {f(Math.abs(gap))} h below the {f(paceE)} h expected so far this month.</>
            : <>You are on track: {f(gap)} h ahead of the {f(paceE)} h expected so far this month.</>}</p>
        </div>
      </div>

      <div className="mybars" role="img" aria-label={`Hours logged each week for the last nine weeks against ${f(target * 60)} expected`}>
        <div className="mybars-in"><div className="mybars-plot">
          <i className="mybars-target" style={{ bottom: `${(target * 60 / top) * 100}%` }}><span>{f(target * 60)} expected</span></i>
          {bars.map((b, i) => (
            <div className="mybar" key={b.ws} title={`${shortDate(b.ws)}: ${f(b.m)} h`}>
              <em>{b.m ? f(b.m) : ""}</em>
              <i className={b.m >= target * 60 ? "ok" : ""} style={{ height: `${(b.m / top) * 100}%`, opacity: i === bars.length - 1 ? 0.55 : 1 }} />
              <span>{shortDate(b.ws)}</span>
            </div>
          ))}
        </div></div>
        <p className="note" style={{ margin: "6px 0 0" }}>Hours per week, this week (paler bar) still in progress.</p>
      </div>

      <div className="mynext">
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Your timesheets</h3>
          <p style={{ margin: 0 }}>This week is <strong>{STATUS[sheet?.status ?? "DRAFT"]}</strong>. <Link href="/timesheet">Open your timesheet</Link>.{" "}
            {lastSheet?.status !== "SUBMITTED" && lastSheet?.status !== "APPROVED" && lastE(lwE) ? <>Last week is <strong>{STATUS[lastSheet?.status ?? "DRAFT"]}</strong>, so <Link href="/timesheet?w=-1">submit it</Link>.</> : null}</p>
        </div>
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Where your time went this month</h3>
          {byProject.length ? (
            <div className="list">{byProject.map((p) => (
              <div className="item" key={p.projectId}><div>{pname.get(p.projectId)?.name ?? "Project"}<div className="meta">{pname.get(p.projectId)?.client.name}</div></div><span className="num">{f(p._sum.minutes ?? 0)} h <span className="note">· {pct((p._sum.minutes ?? 0) / projTotal)}</span></span></div>
            ))}</div>
          ) : <p className="empty" style={{ margin: 0 }}>No time logged this month yet.</p>}
        </div>
      </div>
    </section>
  );
}
const lastE = (e: number) => e > 0;
