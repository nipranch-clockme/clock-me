import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { addMonths, endOfMonth, toDate, today } from "@/lib/dates";
import { fmtHours, pct } from "@/lib/format";
import { completeEnd } from "@/lib/productivity";
import { PACE, change, clientPeriod, clientTypeName, contractOf, minutesByClient, paceOf, perMonth } from "@/lib/clients";
import TrendChart from "@/components/TrendChart";
import { Dot, PageHead, Pill } from "@/components/ui";
import { clientTeamOptions, teamLabelOf } from "@/lib/clientTeams";
import { EditClient } from "../../projects/ClientForm";
import { ContractMeter, PeriodPicker, ShareTable, periodNote } from "../parts";

// One client: totals for the period, hours by month against the contract, and hours by project, phase and person.
// Every total counts the whole company. Location managers only see their own office's people listed by name.
export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireTab("clients");
  const settings = await getSettings(); // also sets the company time zone, which decides the period's dates
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  const client = await db.client.findUnique({ where: { id }, include: { team: { include: { location: true } }, contacts: { orderBy: { sort: "asc" } } } });
  if (!client) notFound();
  const per = clientPeriod(sp.range);
  const monthly = contractOf(client);
  const thisMonth = per.key === "thismonth";
  const inPeriod: Prisma.TimeEntryWhereInput = { project: { clientId: id }, date: { gte: toDate(per.from), lte: toDate(per.to) } };
  const firstMonth = addMonths(today().slice(0, 7), -12);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(firstMonth, i));

  const [projects, byProject, byPhase, byUser, byMonth, before, soFar] = await Promise.all([
    db.project.findMany({ where: { clientId: id }, select: { id: true, name: true, archived: true } }),
    db.timeEntry.groupBy({ by: ["projectId"], where: inPeriod, _sum: { minutes: true } }),
    db.timeEntry.groupBy({ by: ["phaseId"], where: inPeriod, _sum: { minutes: true } }),
    db.timeEntry.groupBy({ by: ["userId"], where: inPeriod, _sum: { minutes: true } }),
    db.$queryRaw<{ m: string; minutes: bigint }[]>(Prisma.sql`
      SELECT to_char(e.date, 'YYYY-MM') AS m, SUM(e.minutes)::bigint AS minutes FROM "TimeEntry" e JOIN "Project" p ON p.id = e."projectId"
      WHERE p."clientId" = ${id} AND e.date >= ${toDate(firstMonth + "-01")} AND e.date <= ${toDate(endOfMonth(months[11]))}
      GROUP BY 1`),
    minutesByClient(per.prevFrom, per.prevTo, id),
    monthly && thisMonth ? minutesByClient(per.from, completeEnd(per.to), id) : new Map<string, number>(),
  ]);
  const total = byProject.reduce((a, r) => a + (r._sum.minutes ?? 0), 0);
  const contract = monthly ? monthly * per.months.length * 60 : 0, use = contract ? total / contract : 0;
  const pace = monthly && thisMonth ? paceOf(monthly, soFar.get(id) ?? 0) : null;
  const prev = before.get(id) ?? 0, ch = change(total, prev, per.prevLabel);

  const P = new Map(projects.map((p) => [p.id, p]));
  const projectRows = byProject.map((r) => { const p = P.get(r.projectId); return { key: r.projectId, m: r._sum.minutes ?? 0, label: <>{p?.name ?? "Unknown"} {p?.archived && <Pill tone="locked">Archived</Pill>}</> }; }).sort((a, b) => b.m - a.m);
  // Phases belong to projects, so phases with the same name are added together (as in Reports).
  const phases = await db.phase.findMany({ where: { id: { in: byPhase.map((r) => r.phaseId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const PH = new Map(phases.map((x) => [x.id, x.name]));
  const phaseSums = new Map<string, number>();
  for (const r of byPhase) { const n = (r.phaseId && PH.get(r.phaseId)) || "No phase"; phaseSums.set(n, (phaseSums.get(n) ?? 0) + (r._sum.minutes ?? 0)); }
  const phaseRows = [...phaseSums].map(([n, m]) => ({ key: n, label: n, m })).sort((a, b) => b.m - a.m);
  const users = await db.user.findMany({ where: { id: { in: byUser.map((r) => r.userId) } }, select: { id: true, name: true, active: true, locationId: true, location: { select: { name: true } }, team: { select: { name: true } } } });
  const U = new Map(users.map((u) => [u.id, u]));
  const ownOffice = me.role === "ADMIN" ? null : me.locationId;
  const listed = byUser.filter((r) => !ownOffice || U.get(r.userId)?.locationId === ownOffice);
  const others = byUser.filter((r) => !listed.includes(r));
  const personRows = listed.map((r) => { const u = U.get(r.userId); return { key: r.userId, m: r._sum.minutes ?? 0, label: <>{u?.name ?? "Unknown"} {u && !u.active && <Pill tone="locked">Inactive</Pill>}<div className="note">{u ? `${u.location.name} · ${u.team?.name ?? "No team"}` : ""}</div></> }; }).sort((a, b) => b.m - a.m);
  if (others.length) personRows.push({ key: "others", m: others.reduce((a, r) => a + (r._sum.minutes ?? 0), 0), label: <span className="note">People in other offices ({others.length})</span> });
  const mm = new Map(byMonth.map((r) => [r.m, Number(r.minutes)]));
  const series = [{ id: client.id, name: "Hours", color: client.color, v: months.map((m) => (mm.get(m) ?? 0) / 60) }];

  return (
    <>
      <p className="back"><Link href={`/clients?range=${per.key}`} className="linkbtn">‹ Back to Clients</Link></p>
      <PageHead title={<><Dot color={client.color} />{client.name}</>}
        actions={<><PeriodPicker per={per} id="cd-range" />{me.role === "ADMIN" && <EditClient teams={await clientTeamOptions()} client={{ id: client.id, name: client.name, type: client.type, monthlyHours: client.monthlyHours, teamId: client.teamId, contacts: client.contacts.map((x) => ({ name: x.name, email: x.email, phone: x.phone })) }} />}</>}
        sub={`${monthly ? `${clientTypeName("FIXED")}, ${perMonth(monthly)}` : clientTypeName("FLOATING")}. ${periodNote(per, !!monthly)}`} />
      <div className="grid g2">
        <section className="panel full">
          {monthly ? <>
            <div className="stats spread">
              <div className="stat"><b>{f(total)}</b><span>hours logged</span></div>
              <div className="stat"><b>{f(contract)}</b><span>contracted hours</span></div>
              <div className="stat"><b>{pct(use)}</b><span>utilisation</span></div>
              <div className="stat">{total <= contract ? <><b>{f(contract - total)}</b><span>hours left</span></> : <><b className="t-bad">{f(total - contract)}</b><span>hours over contract</span></>}</div>
            </div>
            <div style={{ marginTop: 14 }}><ContractMeter use={use} /></div>
            {thisMonth && <p className="note" style={{ margin: "8px 0 0" }}>{pace ? <><Pill tone={PACE[pace.state][0]}>{PACE[pace.state][1]}</Pill> {f(pace.soFar)} hours logged by yesterday, against {f(pace.expected)} expected from the monthly hours spread over this month&apos;s working days so far.</> : "Too early to tell the pace: no working day of this month is over yet."}</p>}
          </> : (
            <div className="stats spread">
              <div className="stat"><b>{f(total)}</b><span>hours logged</span></div>
              <div className="stat"><b>{f(prev)}</b><span>hours in {per.prevLabel}</span></div>
              <div className="stat"><b>{ch.short}</b><span>change</span></div>
              <div className="stat"><b>{byUser.length}</b><span>{byUser.length === 1 ? "person" : "people"} with time</span></div>
            </div>
          )}
        </section>
        <section className="panel full">
          <h3>Team and contacts</h3>
          <div className="cols2">
            <div><div className="note">Team</div><div>{client.team ? teamLabelOf(client.team) : <span className="note">No team assigned</span>}</div></div>
            <div><div className="note">Points of contact</div>
              {client.contacts.length ? client.contacts.map((c) => <div key={c.id} style={{ marginBottom: 6 }}><b>{c.name}</b>{c.email && <> <a href={`mailto:${c.email}`}>{c.email}</a></>}{c.phone && <> <span className="note">{c.phone}</span></>}</div>) : <span className="note">No contacts added</span>}
            </div>
          </div>
        </section>
        <section className="panel full">
          <h3>Hours by month, last 12 full months</h3>
          <TrendChart months={months} series={series} unit="hours" fmt={(v) => `${f(v * 60)} h`} label={`Hours on ${client.name} by month`} level={monthly ? { value: monthly, label: "Contract", title: `Contract: ${perMonth(monthly)}` } : undefined} />
          <div className="legend">
            <span><i style={{ background: `var(--${client.color})` }} />Hours logged</span>
            {monthly && <span><i className="dash" />Contract, {perMonth(monthly)}</span>}
          </div>
        </section>
        <section className="panel"><h3>Hours by project</h3><ShareTable head="Project" rows={projectRows} total={total} f={f} empty="No time in this period." /></section>
        <section className="panel"><h3>Hours by phase</h3><ShareTable head="Phase" rows={phaseRows} total={total} f={f} empty="No time in this period." /></section>
        <section className="panel full">
          <h3>Hours by person</h3>
          {ownOffice && <p className="note" style={{ margin: "0 0 8px" }}>Only people in the {me.location.name} office are listed by name. Hours from other offices are added up in one line, and every total on this page counts the whole company.</p>}
          <ShareTable head="Person" rows={personRows} total={total} f={f} empty="No time in this period." />
        </section>
      </div>
    </>
  );
}
