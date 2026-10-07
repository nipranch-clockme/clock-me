import Link from "next/link";
import { db } from "@/lib/db";
import type { Me } from "@/lib/auth";
import { addDays, addMonths, daysBetween, endOfMonth, monday, shortDate, today, toDate, toStr } from "@/lib/dates";
import { fmtHours, pct, type TimeFormat } from "@/lib/format";
import { loadExpected } from "@/lib/timeoff";

const STATUS: Record<string, string> = { DRAFT: "not submitted yet", SUBMITTED: "waiting for approval", APPROVED: "approved", REJECTED: "sent back to you" };

/** One person's own numbers: how much of their expected hours they logged last week and last month, how this month compares with last month,
 *  and whether they are on pace. Hours over expected hours is the same utilisation figure the manager Dashboard and profiles use. */
export default async function MyStats({ me, timeFormat }: { me: Me; timeFormat: TimeFormat }) {
  const f = (m: number) => fmtHours(m, timeFormat);
  const t = today(), y = addDays(t, -1);
  const target = me.weeklyTarget;
  const ex = await loadExpected([me]); // expected hours: weekly hours over Monday to Friday, less the office's public holidays and my time off
  const expected = (a: string, b: string) => ex(me, a, b);

  const thisWs = monday(t), lastWs = addDays(thisWs, -7), lastWe = addDays(thisWs, -1);
  const thisYm = t.slice(0, 7), lastYm = addMonths(thisYm, -1);
  const thisMs = thisYm + "-01", lastMs = lastYm + "-01", lastMe = endOfMonth(lastYm);
  const weeks = Array.from({ length: 9 }, (_, i) => addDays(thisWs, (i - 8) * 7)); // eight full weeks and this one
  const from = [lastMs, weeks[0]].sort()[0];

  const [byDate, sheet, lastSheet] = await Promise.all([
    db.timeEntry.groupBy({ by: ["date"], where: { userId: me.id, date: { gte: toDate(from), lte: toDate(t) } }, _sum: { minutes: true } }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: me.id, weekStart: toDate(thisWs) } }, select: { status: true } }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: me.id, weekStart: toDate(lastWs) } }, select: { status: true } }),
  ]);
  const days = new Map(byDate.map((r) => [toStr(r.date), r._sum.minutes ?? 0]));
  const logged = (a: string, b: string) => { let s = 0; for (const [d, m] of days) if (d >= a && d <= b) s += m; return s; };

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
  const monthE = ex(me, thisMs, endOfMonth(thisYm), { whole: true });
  const leftDays = ex.days(me, t, endOfMonth(thisYm), { whole: true }); // working days still to come, holidays and booked time off not counted
  const perDay = behind && leftDays ? Math.max(0, monthE - paceM) / leftDays : 0;

  const bars = weeks.map((ws) => ({ ws, m: logged(ws, addDays(ws, 6)), e: ex(me, ws, addDays(ws, 6), { whole: true }) }));
  const top = Math.max(target * 60, ...bars.map((b) => b.m), 1);

  if (!target) {
    return <section className="panel full"><h3>Your numbers</h3><p className="empty">Your expected hours per week are 0, so there is nothing to compare your time with. Ask your manager if that should change.</p></section>;
  }
  return (
    <section className="panel full" aria-label="Your numbers">
      <div className="ch"><h3>Your numbers</h3><span className="cd">Hours logged divided by your {f(target * 60)} expected hours a week, counting complete working days, less public holidays and your time off</span></div>
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
            <div className="mybar" key={b.ws} title={`${shortDate(b.ws)}: ${f(b.m)} h of ${f(b.e)} h expected`}>
              <em>{b.m ? f(b.m) : ""}</em>
              <i className={(b.m >= b.e ? "ok" : "") + (i === bars.length - 1 ? " wip" : "")} style={{ height: `${(b.m / top) * 100}%` }} />
              <span>{shortDate(b.ws)}</span>
            </div>
          ))}
        </div></div>
        <p className="note" style={{ margin: "2px 0 0" }}>Hours per week. Green: reached that week's expected hours (a week with a public holiday or time off expects less than the dashed line). Blue: below it. Striped: this week so far.</p>
      </div>

      <p className="mynext">
        <b>Your timesheet:</b> this week is <strong>{STATUS[sheet?.status ?? "DRAFT"]}</strong>. <Link href="/timesheet">Open your timesheet</Link>.{" "}
        {lastSheet?.status !== "SUBMITTED" && lastSheet?.status !== "APPROVED" && lastE(lwE || lwM) ? <>Last week is <strong>{STATUS[lastSheet?.status ?? "DRAFT"]}</strong>, so <Link href="/timesheet?w=-1">submit it</Link>.</> : null}
      </p>
    </section>
  );
}
const lastE = (e: number) => e > 0;
