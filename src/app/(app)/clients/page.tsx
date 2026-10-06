import Link from "next/link";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtHours, pct } from "@/lib/format";
import { completeEnd } from "@/lib/productivity";
import { PACE, clientPeriod, clientTypeName, contractOf, minutesByClient, paceOf, perMonth } from "@/lib/clients";
import { Pill } from "@/components/ui";
import { ChangeText, ContractMeter, PeriodPicker } from "./parts";

// Client dashboard for location managers and admins. Contracts are company-wide, so every number here counts everyone's
// time on the client, whoever is looking.
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  await requireTab("clients");
  const settings = await getSettings(); // also sets the company time zone, which decides the period's dates
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  const per = clientPeriod(sp.range);
  const thisMonth = per.key === "thismonth";
  const [clients, now, before, soFar] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" } }),
    minutesByClient(per.from, per.to),
    minutesByClient(per.prevFrom, per.prevTo),
    thisMonth ? minutesByClient(per.from, completeEnd(per.to)) : new Map<string, number>(),
  ]);
  // Fixed clients first, the most used contract at the top; then the others by hours.
  const rows = clients.map((c) => {
    const monthly = contractOf(c), m = now.get(c.id) ?? 0, contract = monthly ? monthly * per.months.length * 60 : 0;
    return { c, monthly, m, contract, use: contract ? m / contract : 0, before: before.get(c.id) ?? 0, pace: monthly && thisMonth ? paceOf(monthly, soFar.get(c.id) ?? 0) : null };
  }).sort((x, y) => (x.monthly ? 0 : 1) - (y.monthly ? 0 : 1) || (x.monthly ? y.use - x.use : y.m - x.m) || x.c.name.localeCompare(y.c.name));
  const fixed = rows.filter((r) => r.monthly);
  const total = rows.reduce((a, r) => a + r.m, 0);
  const avgUse = fixed.length ? fixed.reduce((a, r) => a + r.use, 0) / fixed.length : 0;

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}><PeriodPicker per={per} id="cl-range" /></section>
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
          {!rows.length ? <p className="empty">No clients yet. Admins add them on the Projects page.</p> : (
            <div className="tablebox"><table className="clients">
              <thead><tr><th>Client</th><th>Type</th><th className="num">Hours logged</th><th className="num">Contracted</th><th>Utilisation</th><th className="num">Hours left</th>{thisMonth && <th>Pace this month</th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.c.id}>
                    <td><span className="dot" style={{ background: `var(--${r.c.color})` }} /><Link href={`/clients/${r.c.id}?range=${per.key}`}>{r.c.name}</Link></td>
                    <td>{clientTypeName(r.monthly ? "FIXED" : "FLOATING")}{r.monthly && <div className="note">{perMonth(r.monthly)}</div>}</td>
                    <td className="num">{f(r.m)}</td>
                    {r.monthly ? <>
                      <td className="num">{f(r.contract)}</td>
                      <td><ContractMeter use={r.use} /></td>
                      <td className="num">{r.m <= r.contract ? f(r.contract - r.m) : <span className="t-bad">{f(r.m - r.contract)} over</span>}</td>
                      {thisMonth && <td>{r.pace ? <><Pill tone={PACE[r.pace.state][0]}>{PACE[r.pace.state][1]}</Pill><div className="note">{f(r.pace.soFar)} logged by yesterday, {f(r.pace.expected)} expected</div></> : <span className="note">Too early to tell</span>}</td>}
                    </> : <td colSpan={thisMonth ? 4 : 3}><ChangeText now={r.m} before={r.before} per={per} f={f} /></td>}
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {thisMonth && fixed.length > 0 && <p className="note" style={{ margin: "10px 0 0" }}>Pace compares hours logged up to yesterday with the monthly hours spread over this month&apos;s working days (Monday to Friday) so far. Within 10% either way is on pace.</p>}
        </section>
      </div>
    </>
  );
}
