import Link from "next/link";
import TableFilter from "@/components/TableFilter";
import { db } from "@/lib/db";
import { completeEnd } from "@/lib/productivity";
import { PACE, clientTypeName, contractFor, contractMinutes, contractText, loadContractMonths, minutesByClient, paceOf, type ClientPeriod } from "@/lib/clients";
import { Pill } from "@/components/ui";
import { teamLabelOf } from "@/lib/clientTeams";
import { ChangeText, ContractMeter } from "../clients/parts";

/** The Client overview tab: each client's hours and, for fixed clients, utilisation, hours left and this month's pace. Contracts and hours are
 *  company-wide, so every number counts everyone's time on the client, whoever is looking. */
export default async function ClientOverview({ per, f }: { per: ClientPeriod; f: (m: number) => string }) {
  const thisMonth = per.key === "thismonth";
  const [clients, now, before, soFar, cm] = await Promise.all([
    db.client.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, include: { team: { include: { location: true } } } }),
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

  return (
    <section className="panel full">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Clients</h3>
        <span className="note">{rows.length} client{rows.length === 1 ? "" : "s"}. Click a client for its details.</span>
      </div>
      {!rows.length ? <p className="empty">No clients yet. Admins add them with the Add client button on the Clients page.</p> : (
        <><TableFilter label="Search clients" placeholder="Search clients…" /><div className="tablebox"><table className="clients cltable ctable">
          <thead><tr><th>Client</th><th>Type</th><th className="num">Hours logged</th><th className="num">Contracted</th><th>Utilisation</th><th className="num">Hours left</th>{thisMonth && <th>Pace this month</th>}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.c.id}>
                <td><span className="dot" style={{ background: `var(--${r.c.color})` }} /><Link href={`/clients/${r.c.id}?range=${per.key}`}>{r.c.name}</Link>{r.c.team && <div className="note">{teamLabelOf(r.c.team)}</div>}</td>
                <td data-l="Type" className="nw">{clientTypeName(r.monthly ? "FIXED" : "FLOATING")}</td>
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
  );
}
