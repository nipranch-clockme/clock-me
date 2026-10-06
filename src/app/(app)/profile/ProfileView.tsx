import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Me } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { canManagePerson } from "@/lib/scope";
import { roleName } from "@/lib/roles";
import { addDays, longDate, monday, today, toDate, toStr, weekLabel, workdayDates } from "@/lib/dates";
import { fmtHours, pct } from "@/lib/format";
import { trackingStarts } from "@/lib/startDates";
import { PERIODS, periodOf, periodDays, expectedMinutes, utilisation, last12Months, monthlyMinutes, monthlyUtilisation } from "@/lib/utilisation";
import { dayMonthYear, joinedText } from "@/lib/profile";
import AutoForm from "@/components/AutoForm";
import TrendChart from "@/components/TrendChart";
import Avatar from "@/components/Avatar";
import { Pill, statusTone } from "@/components/ui";
import { DetailsForm, PhotoForm } from "./ProfileForms";

type Person = Prisma.UserGetPayload<{ include: { team: true; location: true } }>;
type ShareRow = { key: string; label: string; sub?: string; m: number };
const SHEET: Record<string, string> = { DRAFT: "Not submitted", SUBMITTED: "Waiting for approval", APPROVED: "Approved", REJECTED: "Sent back" };

/** A person's profile: who they are, then their utilisation (worked out exactly like Dashboard productivity). */
export default async function ProfileView({ me, person, range: rangeParam }: { me: Me; person: Person; range?: string }) {
  const settings = await getSettings();
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  const self = person.id === me.id;
  const manage = canManagePerson(me, person);
  const range = periodOf(rangeParam);
  const [a, b] = periodDays(range);
  const t = today();
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(monday(t), -7 * i)); // this week first
  const months = last12Months();
  const inPeriod = { userId: person.id, date: { gte: toDate(a), lte: toDate(b) } };
  const none = Promise.resolve([]);
  const [starts, perDay, perProject, perPhase, mm, sheets, recent] = await Promise.all([
    trackingStarts([person]),
    b >= a ? db.timeEntry.groupBy({ by: ["date"], where: inPeriod, _sum: { minutes: true } }) : none,
    b >= a ? db.timeEntry.groupBy({ by: ["projectId"], where: inPeriod, _sum: { minutes: true } }) : none,
    b >= a ? db.timeEntry.groupBy({ by: ["phaseId"], where: inPeriod, _sum: { minutes: true } }) : none,
    monthlyMinutes([person.id], months),
    db.timesheet.findMany({ where: { userId: person.id, weekStart: { gte: toDate(weeks[5]), lte: toDate(weeks[0]) } }, select: { weekStart: true, status: true } }),
    db.timeEntry.groupBy({ by: ["date"], where: { userId: person.id, date: { gte: toDate(weeks[5]), lte: toDate(addDays(weeks[0], 6)) } }, _sum: { minutes: true } }),
  ]);
  const [projects, phases] = await Promise.all([
    perProject.length ? db.project.findMany({ where: { id: { in: perProject.map((r) => r.projectId) } }, select: { id: true, name: true, client: { select: { name: true } } } }) : [],
    perPhase.some((r) => r.phaseId) ? db.phase.findMany({ where: { id: { in: perPhase.flatMap((r) => (r.phaseId ? [r.phaseId] : [])) } }, select: { id: true, name: true } }) : [],
  ]);

  // The summary: the same days, hours and expected hours as the Dashboard for this person.
  const start = starts.get(person.id)!;
  const byDay = new Map(perDay.map((r) => [toStr(r.date), r._sum.minutes ?? 0]));
  const m = perDay.reduce((s, r) => s + (r._sum.minutes ?? 0), 0);
  const tg = expectedMinutes(person.weeklyTarget, start, a, b);
  const workdays = workdayDates(start > a ? start : a, b);
  const trend = monthlyUtilisation([person], months, starts, mm);

  const P = new Map(projects.map((p) => [p.id, p]));
  const projectRows: ShareRow[] = perProject.map((r) => ({ key: r.projectId, label: P.get(r.projectId)?.name ?? "Unknown project", sub: P.get(r.projectId)?.client.name, m: r._sum.minutes ?? 0 })).sort((x, y) => y.m - x.m);
  const PH = new Map(phases.map((p) => [p.id, p.name]));
  const byPhase = new Map<string, number>(); // phases with the same name on different projects count together, as in Reports
  for (const r of perPhase) { const n = (r.phaseId && PH.get(r.phaseId)) || "No phase"; byPhase.set(n, (byPhase.get(n) ?? 0) + (r._sum.minutes ?? 0)); }
  const phaseRows: ShareRow[] = [...byPhase].map(([k, v]) => ({ key: k, label: k, m: v })).sort((x, y) => y.m - x.m);
  const status = new Map(sheets.map((s) => [toStr(s.weekStart), s.status]));
  const weekMinutes = (ws: string) => recent.reduce((s, r) => { const d = toStr(r.date); return d >= ws && d <= addDays(ws, 6) ? s + (r._sum.minutes ?? 0) : s; }, 0);

  const shareTable = (head: string, rows: ShareRow[]) => {
    const max = Math.max(1, ...rows.map((r) => r.m));
    return (
      <div className="tablebox"><table>
        <thead><tr><th>{head}</th><th className="num">Hours</th><th style={{ width: "38%" }}>Share of hours</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}{r.sub && <div className="note">{r.sub}</div>}</td>
              <td className="num">{f(r.m)}</td>
              <td><div className="meter"><i style={{ width: `${(r.m / max) * 100}%` }} /></div><div className="note">{m ? ((r.m / m) * 100).toFixed(1) : 0}%</div></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={3} className="empty">No time in this period.</td></tr>}
        </tbody>
      </table></div>
    );
  };

  return (
    <div className="grid g2">
      <section className="panel full">
        <h3>{self ? "My profile" : "Profile"}</h3>
        <div className="phead profile-head">
          <Avatar person={person} size={96} alt={person.photoAt ? `Profile picture of ${person.name}` : ""} />
          <div className="pinfo profile-name">
            <h2>{person.name}</h2>
            {person.title && <p className="profile-title">{person.title}</p>}
            <p className="note" style={{ margin: 0 }} title={person.joiningDate ? `Joined ${dayMonthYear(toStr(person.joiningDate))}` : undefined}>{joinedText(person.joiningDate)}</p>
            {(!person.active || !person.passwordHash) && <div style={{ marginTop: 6 }}>{!person.active ? <Pill tone="locked">Inactive</Pill> : <Pill tone="submitted">Invite pending</Pill>}</div>}
          </div>
          {(self || manage) && (
            <div className="profile-actions">
              <PhotoForm id={person.id} hasPhoto={!!person.photoAt}>
                {manage && <DetailsForm person={{ id: person.id, name: person.name, employeeId: person.employeeId ?? "", joiningDate: person.joiningDate ? toStr(person.joiningDate) : "", weeklyTarget: person.weeklyTarget }} today={t} />}
              </PhotoForm>
            </div>
          )}
        </div>
        <dl className="pfacts">
          <div><dt>Employee ID</dt><dd>{person.employeeId ?? <span className="note">Not set</span>}</dd></div>
          <div><dt>Role</dt><dd>{roleName(person.role)}</dd></div>
          <div><dt>Team</dt><dd>{person.team?.name ?? "No team"}</dd></div>
          <div><dt>Office</dt><dd>{person.location.name}</dd></div>
          <div><dt>Email</dt><dd><a href={`mailto:${person.email}`}>{person.email}</a></dd></div>
          <div><dt>Expected hours per week</dt><dd>{person.weeklyTarget} h</dd></div>
        </dl>
      </section>

      <section className="panel full">
        <h3>Utilisation</h3>
        <AutoForm className="row" key={range}>
          <div style={{ flex: "0 1 220px" }}><label htmlFor="pr-range">Period</label><select id="pr-range" name="range" defaultValue={range}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div style={{ flex: "2 1 300px" }}><p className="note" style={{ margin: 0 }}>{b >= a ? `${longDate(a)} to ${longDate(b)}. ` : "No complete days in this period yet. "}Utilisation is hours logged divided by expected hours. Expected hours per week are spread over Monday to Friday, up to yesterday, from {self ? "your" : "their"} first day in The Time Sink.</p></div>
        </AutoForm>
        <div className="stats spread five" style={{ marginTop: 16 }}>
          <div className="stat"><b>{tg ? pct(utilisation(m, tg)) : "–"}</b><span>utilisation</span></div>
          <div className="stat"><b>{f(m)}</b><span>hours logged</span></div>
          <div className="stat"><b>{f(tg)}</b><span>expected hours</span></div>
          <div className="stat"><b>{workdays.length ? f(m / workdays.length) : "–"}</b><span>average hours per workday</span></div>
          <div className="stat"><b>{workdays.filter((d) => !byDay.get(d)).length}</b><span>workdays with no time</span></div>
        </div>
        {!person.weeklyTarget && <p className="note" style={{ margin: "12px 0 0" }}>Expected hours per week is 0, so there&apos;s no utilisation to show.</p>}
      </section>

      <section className="panel full">
        <h3>Utilisation by month, last 12 full months</h3>
        {trend.some((v) => v != null)
          ? <TrendChart months={months} series={[{ id: person.id, name: "Utilisation", color: "s1", v: trend }]} label={`Utilisation of ${person.name} by month`} />
          : <p className="empty">{person.weeklyTarget ? "No full months to show yet." : "Nothing to show while expected hours per week is 0."}</p>}
      </section>

      <section className="panel"><h3>Hours by project</h3>{shareTable("Project", projectRows)}</section>
      <section className="panel"><h3>Hours by phase</h3>{shareTable("Phase", phaseRows)}</section>

      <section className="panel full">
        <h3>Recent timesheets</h3>
        <div className="tablebox"><table>
          <thead><tr><th>Week</th><th className="num">Hours logged</th><th>Status</th></tr></thead>
          <tbody>
            {weeks.map((ws) => {
              const st = status.get(ws);
              return (
                <tr key={ws}>
                  <td>{weekLabel(ws)}{ws === weeks[0] && <span className="note"> · this week</span>}</td>
                  <td className="num">{f(weekMinutes(ws))}</td>
                  <td>{!st && addDays(ws, 6) < start ? <Pill tone="locked">Not started</Pill> : <Pill tone={statusTone(st ?? "DRAFT")}>{SHEET[st ?? "DRAFT"]}</Pill>}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
