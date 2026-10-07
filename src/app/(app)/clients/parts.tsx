import { pct } from "@/lib/format";
import { CLIENT_PERIODS, change, type ClientPeriod } from "@/lib/clients";
import { longDate } from "@/lib/dates";
import AutoForm from "@/components/AutoForm";
import { Ifld, Pill } from "@/components/ui";

/** The dates a period covers and how the numbers are worked out (shown under the page title). */
export function periodNote(per: ClientPeriod, contract = true) {
  const n = per.months.length;
  const months = n > 1 ? `the monthly hours times the ${n} months in this period${per.current ? ", with this month counted in full" : ""}` : per.current ? "one full month of the monthly hours, even though the month isn't over" : "one month of the monthly hours";
  return `${longDate(per.from)} to ${longDate(per.to)}. Hours count time logged by everyone in the company on the client's projects, archived ones included.${contract ? ` Contracted hours are ${months}. Utilisation is hours logged divided by contracted hours.` : ""}`;
}

/** Period picker for the Clients tab. */
export function PeriodPicker({ per, id }: { per: ClientPeriod; id: string; contract?: boolean }) {
  return (
    <AutoForm className="phd-a" key={per.key}>
      <Ifld id={id} label="Period" name="range" defaultValue={per.key}>{CLIENT_PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Ifld>
    </AutoForm>
  );
}

/** How much of a contract is used. Past 100% the bar shows the contract part and the part over it in red. */
export function ContractMeter({ use }: { use: number }) {
  const over = use > 1;
  return <>
    <div className={over ? "meter split" : "meter"} role="img" aria-label={`${pct(use)} of contracted hours used`}>
      {over ? <><i style={{ width: `${100 / use}%` }} /><i className="over" style={{ width: `${100 - 100 / use}%` }} /></> : <i style={{ width: `${use * 100}%` }} />}
    </div>
    <div className="note">{pct(use)} {over && <Pill tone="bad">Over contract</Pill>}</div>
  </>;
}

/** Hours compared with the previous period, e.g. "Up 12% on the same days last month (35.50 h)". */
export function ChangeText({ now, before, per, f }: { now: number; before: number; per: ClientPeriod; f: (m: number) => string }) {
  const c = change(now, before, per.prevLabel);
  return (
    <span className="note">
      {c.dir === "up" && <span className="t-ok" aria-hidden="true">▲ </span>}
      {c.dir === "down" && <span className="t-warn" aria-hidden="true">▼ </span>}
      {c.text}{before ? ` (${f(before)} h)` : ""}
    </span>
  );
}

/** Hours per item with each one's share of the total. */
export function ShareTable({ head, rows, total, f, empty }: { head: string; rows: { key: string; label: React.ReactNode; m: number }[]; total: number; f: (m: number) => string; empty: string }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="tablebox"><table>
      <thead><tr><th>{head}</th><th className="num">Hours</th><th style={{ width: "35%" }}>Share of hours</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.label}</td><td className="num">{f(r.m)}</td>
            <td><div className="meter"><i style={{ width: `${total ? (r.m / total) * 100 : 0}%` }} /></div><div className="note">{total ? ((r.m / total) * 100).toFixed(1) : 0}%</div></td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
