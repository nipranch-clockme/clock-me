import Link from "next/link";
import { db } from "@/lib/db";
import { endOfMonth, today, workdays } from "@/lib/dates";
import { contractFor, contractOf, loadContractMonths } from "@/lib/clients";
import { teamLabelOf } from "@/lib/clientTeams";
import { MONTH_ABBR, gridYear, yearMonths } from "@/lib/monthGrid";
import MonthGrid, { type GridRow } from "@/components/MonthGrid";
import { Dot, Pill } from "@/components/ui";
import { saveContractMonths } from "./contract-actions";

/** Where a client's contract stands, from the month the table works Per day and Per week out of (this month, or the year's last or first month when the year isn't the current one). */
function statusOf(hours: number[], ref: number) {
  if (hours[ref] > 0) return { tone: "ok", text: "Active" };
  const before = hours.slice(0, ref).some((h) => h > 0), after = hours.findIndex((h, i) => i > ref && h > 0);
  if (before) return { tone: "locked", text: "Ended" };
  if (after >= 0) return { tone: "info", text: `Starts ${MONTH_ABBR[after]}` };
  return null;
}

/** Contracted hours for every client, month by month, in a table. Admins edit the boxes; location managers see them. */
export default async function ContractsView({ admin, yearParam }: { admin: boolean; yearParam?: string }) {
  const year = gridYear(yearParam), months = yearMonths(year);
  const cur = today().slice(0, 7), curYear = +cur.slice(0, 4);
  const now = year === curYear ? +cur.slice(5) - 1 : null;
  const ref = now ?? (year < curYear ? 11 : 0);
  const [clients, cm, tags] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, include: { team: { include: { location: true } } } }),
    loadContractMonths(),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const rows: GridRow[] = clients.map((c) => {
    const values = months.map((m) => contractFor(c, m, cm) ?? 0), st = statusOf(values, ref);
    return {
      id: c.id, name: c.name, usual: contractOf(c) ?? 0, values, editable: admin, workTypes: c.workTypeIds.filter((id) => tags.some((t) => t.id === id)),
      lead: <>
        <td className="cl"><Dot color={c.color} /><Link href={`/clients/${c.id}`}>{c.name}</Link>{c.team && <div className="note">{teamLabelOf(c.team)}</div>}</td>
        <td data-l="Status">{st ? <Pill tone={st.tone}>{st.text}</Pill> : <span className="note">No contract</span>}</td>
      </>,
    };
  });
  const refMonth = months[ref];
  return (
    <section className="panel full">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Monthly contracts, {year}</h3>
        <span className="note">{rows.length} client{rows.length === 1 ? "" : "s"}</span>
      </div>
      {!rows.length ? <p className="empty">No clients yet. Admins add them with the Add client button.</p> : (
        <MonthGrid key={year} action={saveContractMonths} kind="contracts" year={year} months={months} leadCols={2} noun="client" searchLabel="Search clients"
          heads={<><th scope="col">Client</th><th scope="col">Status</th></>} rows={rows} now={now} refMonth={ref} refDays={workdays(refMonth + "-01", endOfMonth(refMonth))} tags={tags} />
      )}
      <p className="note" style={{ margin: "10px 0 0" }}>
        Each box is the hours contracted for that month. {admin ? "Type a new figure and press Save changes. " : "Admins change these figures. "}
        A month the same as the client&apos;s usual monthly hours follows them; a blue box has its own figure. Type 0 for a month with no contract, and a smaller figure for a contract that ends part-way through a month.
        The Clients page works out utilisation, hours left and pace from the figure for each month. Per day and per week come from {MONTH_ABBR[ref]} {year}&apos;s hours over its {workdays(refMonth + "-01", endOfMonth(refMonth))} working days (Monday to Friday).
        {admin ? " Work type lists the kinds of work done for the client (your tags), for the record." : ""}
      </p>
    </section>
  );
}

