import AutoForm from "@/components/AutoForm";
import { Ifld } from "@/components/ui";
import { MONTH_ABBR } from "@/lib/monthGrid";
import { ALL_OFFICES, reportLines, type MonthlyReport } from "@/lib/monthlyReport";
import { today } from "@/lib/dates";

const num = (v: number | string | null) => (v === null ? "–" : typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v);

/** The office's monthly report on the Dashboard (see monthlyReport.ts), with a year picker, an office picker for admins and a CSV download. */
export default function MonthlyReportTable({ report, office, offices, years, keep, contracts = true }: {
  report: MonthlyReport;
  office: { id: string; name: string };
  /** Offices to choose from (admins). */
  offices?: { id: string; name: string }[];
  years: number[];
  /** The page's other settings, kept when the year or office changes. */
  keep: Record<string, string>;
  /** Whether the contract fulfilment line and its explanation are shown. */
  contracts?: boolean;
}) {
  const lines = reportLines(report, contracts);
  const now = today().slice(0, 7);
  const q = new URLSearchParams({ year: String(report.year), office: office.id });
  const head = (title: string) => (
    <tr className="rsec"><th scope="colgroup">{title}</th>{report.months.map((m, i) => <th key={m} className={`num${m === now ? " now" : ""}`} scope="col">{MONTH_ABBR[i]}</th>)}<th className="num" scope="col">Year</th></tr>
  );
  const body = (group: "summary" | "tags") => lines.filter((l) => l.group === group).map((l) => (
    <tr key={l.label} className={l.kind === "pct" ? "pctrow" : undefined}>
      <td>{l.label}</td>
      {l.cells.map((c, i) => <td key={i} className={`num${report.months[i] === now ? " cur" : ""}${c === null ? " past" : ""}`}>{num(c)}</td>)}
      <td className="num tot">{num(l.year)}</td>
    </tr>
  ));
  const tagRows = lines.some((l) => l.group === "tags");
  return (
    <section className="panel full" id="monthly-report">
      <div className="row between mreport-head" style={{ flexWrap: "wrap", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Monthly report, {office.name}, {report.year}</h3>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <AutoForm className="phd-a" key={`${report.year}-${office.id}`}>
            {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            {offices && <Ifld id="mr-office" label="Office" name="roffice" defaultValue={office.id}>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Ifld>}
            <Ifld id="mr-year" label="Year" name="ryear" defaultValue={String(report.year)}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Ifld>
          </AutoForm>
          <a className="btn" href={`/dashboard/report?${q}`} download>Download CSV</a>
        </div>
      </div>
      <div className="tablebox"><table className="mgrid mreport">
        <thead>{head("")}</thead>
        <tbody>{body("summary")}</tbody>
        {tagRows && <><tbody>{head("Hours by tag")}</tbody><tbody>{body("tags")}</tbody></>}
      </table></div>
      <p className="note mreport-note">
        Inventory is each person&apos;s expected hours for the month (less public holidays and time off), added up; Admins are not counted.
        Utilisation is hours logged divided by inventory{contracts && <>, and fulfilment is hours logged divided by the contract hours of the clients looked after
        by teams in {office.id === ALL_OFFICES ? "any office" : "this office"} (for a client with no fixed hours, the hours clocked for it)</>}. The current month counts up to yesterday{contracts && <>, and fixed
        contracts are scaled to its working days so far</>}. The year column adds
        up the months (employees are the monthly average). Under hours by tag, an entry with several tags counts under each of them. OT only marks
        overtime, so its hours are also in the rows above it.
      </p>
    </section>
  );
}
