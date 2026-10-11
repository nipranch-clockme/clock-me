import TableFilter from "@/components/TableFilter";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtHours, pct } from "@/lib/format";
import { completeEnd } from "@/lib/productivity";
import { PACE, clientPeriod, clientTypeName, contractFor, contractMinutes, contractText, loadContractMonths, minutesByClient, paceOf } from "@/lib/clients";
import { PageHead, Pill } from "@/components/ui";
import { AddClientButton } from "../projects/ClientForm";
import { clientTeamOptions } from "@/lib/clientTeams";
import { teamLabelOf } from "@/lib/clientTeams";
import { ChangeText, ContractMeter, PeriodPicker, periodNote } from "./parts";
import ContractsView from "./ContractsView";
import YearPicker from "@/components/YearPicker";
import { gridYear } from "@/lib/monthGrid";

// Client dashboard for location managers and admins. Contracts are company-wide, so every number here counts everyone's
// time on the client, whoever is looking.
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ range?: string; view?: string; year?: string }> }) {
  const sp = await searchParams;
  const me = await requireTab("clients");
  const settings = await getSettings(); // also sets the company time zone, which decides the period's dates
  const admin = me.role === "ADMIN";
  const [teamOpts, tagOpts] = admin ? await Promise.all([clientTeamOptions(), db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })]) : [[], []];
  const contracts = sp.view === "contracts";
  const views = (
    <nav className="seg vt" aria-label="Clients view">
      <Link href="/clients" aria-current={contracts ? undefined : "page"}>Overview</Link>
      <Link href="/clients?view=contracts" aria-current={contracts ? "page" : undefined}>Monthly contracts</Link>
    </nav>
  );
  if (contracts) {
    return (
      <>
        <PageHead title="Clients" beside={views} actions={<><YearPicker year={gridYear(sp.year)} view="contracts" />{admin && <AddClientButton teams={teamOpts} tags={tagOpts} />}</>}
          sub="Contracted hours for each client, month by month. Contracts that change from month to month, or end part-way through one, are worked out month by month." />
        <div className="grid"><ContractsView admin={admin} yearParam={sp.year} /></div>
      </>
    );
  }
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  const per = clientPeriod(sp.range);
  const thisMonth = per.key === "thismonth";
  const [clients, now, before, soFar, cm] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, include: { team: { include: { location: true } } } }),
    minutesByClient(per.from, per.to),
    minutesByClient(per.prevFrom, per.prevTo),
    thisMonth ? minutesByClient(per.from, completeEnd(per.to)) : new Map<string, number>(),
    loadContractMonths(),
  ]);
  // Fixed clients first, the most used contract at the top; then the others by hours. Each month of the period counts that month's own
  // contracted hours (see the Monthly contracts view), so a contract that changed or ended part-way is worked out month by month.
  const rows = clients.map((c) => {
    const contract = contractMinutes(c, per.months, cm), monthly = contract > 0 ? contractText(c, per.months, cm) : null, m = now.get(c.id) ?? 0;
    const nowMonthly = thisMonth ? contractFor(c, per.months[0], cm) : null;
    return { c, monthly, m, contract, use: contract ? m / contract : 0, before: before.get(c.id) ?? 0, pace: nowMonthly ? paceOf(nowMonthly, soFar.get(c.id) ?? 0) : null };
  }).sort((x, y) => (x.monthly ? 0 : 1) - (y.monthly ? 0 : 1) || (x.monthly ? y.use - x.use : y.m - x.m) || x.c.name.localeCompare(y.c.name));
  const fixed = rows.filter((r) => r.monthly);
  const total = rows.reduce((a, r) => a + r.m, 0);
  const avgUse = fixed.length ? fixed.reduce((a, r) => a + r.use, 0) / fixed.length : 0;

  return (
    <>
      <PageHead title="Clients" beside={views} actions={<><PeriodPicker per={per} id="cl-range" />{admin && <AddClientButton teams={teamOpts} tags={tagOpts} />}</>} sub={periodNote(per)} />
      <div className="grid">
        <section className="panel full">
          <div className="stats spread five">
            <div className="stat"><b>{f(total)}</b><span>total hours on clients</span></div>
            <div className="stat"><b>{fixed.length}</b><span>fixed-hours clients</span></div>
            <div className="stat"><b>{fixed.length ? pct(avgUse) : "–"}</b><span>average contract utilisation</span></div>
            <div className="stat"><b>{fixed.filter((r) => r.use > 1).length}</b><span>clients over contract</span></div>
            <div className="stat"><b>{fixed.filter((r) => r.use < 0.5).length}</b><span>clients under 50% of contract</span></div>
          </div>
        </section>
        <section className="panel full">
          <div className="row between" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Clients</h3>
            <span className="note">{rows.length} client{rows.length === 1 ? "" : "s"}. Click a client for its details.</span>
          </div>
          {!rows.length ? <p className="empty">No clients yet. Admins add them with the Add client button.</p> : (
            <><TableFilter label="Search clients" placeholder="Search clients…" /><div className="tablebox"><table className="clients cltable ctable">
              <thead><tr><th>Client</th><th>Type</th><th className="num">Hours logged</th><th className="num">Contracted</th><th>Utilisation</th><th className="num">Hours left</th>{thisMonth && <th>Pace this month</th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.c.id}>
                    <td><span className="dot" style={{ background: `var(--${r.c.color})` }} /><Link href={`/clients/${r.c.id}?range=${per.key}`}>{r.c.name}</Link>{r.c.team && <div className="note">{teamLabelOf(r.c.team)}</div>}</td>
                    <td data-l="Type" className="nw">{clientTypeName(r.monthly ? "FIXED" : "FLOATING")}{r.monthly && <div className="note">{r.monthly}</div>}</td>
                    <td className="num" data-l="Hours logged">{f(r.m)}</td>
                    {r.monthly ? <>
                      <td className="num" data-l="Contracted">{f(r.contract)}</td>
                      <td className="uc" data-l="Utilisation"><ContractMeter use={r.use} /></td>
                      <td className="num" data-l="Hours left">{r.m <= r.contract ? f(r.contract - r.m) : <span className="t-bad">{f(r.m - r.contract)} over</span>}</td>
                      {thisMonth && <td className="pc" data-l="Pace this month">{r.pace ? <><Pill tone={PACE[r.pace.state][0]}>{PACE[r.pace.state][1]}</Pill><div className="note">{f(r.pace.soFar)} logged by yesterday, {f(r.pace.expected)} expected</div></> : <span className="note">Too early to tell</span>}</td>}
                    </> : <td colSpan={thisMonth ? 4 : 3} data-l="Change"><ChangeText now={r.m} before={r.before} per={per} f={f} /></td>}
                  </tr>
                ))}
              </tbody>
            </table></div></>
          )}
          {thisMonth && fixed.length > 0 && <p className="note" style={{ margin: "10px 0 0" }}>Pace compares hours logged up to yesterday with the monthly hours spread over this month&apos;s working days (Monday to Friday) so far. Within 10% either way is on pace.</p>}
        </section>
      </div>
    </>
  );
}
