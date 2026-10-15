import Link from "next/link";
import { db } from "@/lib/db";
import { endOfMonth, today, workdays } from "@/lib/dates";
import { clockedByMonth, contractFor, contractOf, hoursOf, loadContractMonths } from "@/lib/clients";
import { teamLabelOf } from "@/lib/clientTeams";
import { CLIENT_STATUS, DRAWING_STANDARDS, statusRank } from "@/lib/clientStatus";
import { MONTH_ABBR, gridYear, yearMonths } from "@/lib/monthGrid";
import MonthGrid, { type GridRow } from "@/components/MonthGrid";
import { Dot } from "@/components/ui";
import { saveContractMonths } from "./contract-actions";

/** Contracted hours for every client, month by month, in a table. Admins edit the boxes, or a client's Edit dialog; location managers see them. Months before this one are past: their boxes are locked. */
export default async function ContractsView({ admin, yearParam }: { admin: boolean; yearParam?: string }) {
  const year = gridYear(yearParam), months = yearMonths(year);
  const cur = today().slice(0, 7), curYear = +cur.slice(0, 4);
  const now = year === curYear ? +cur.slice(5) - 1 : null;
  const ref = now ?? (year < curYear ? 11 : 0);
  const past = year < curYear ? 12 : (now ?? 0);
  const [clients, cm, tags, places] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, include: { team: { include: { location: true } } } }),
    loadContractMonths(),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const clockedMap = await clockedByMonth(clients.map((c) => c.id), months);
  // Contracted first, then Project-based, then Lost; alphabetical within each.
  const ordered = [...clients].sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name));
  const rows: GridRow[] = ordered.map((c) => ({
    id: c.id, name: c.name, usual: contractOf(c) ?? 0, values: months.map((m) => contractFor(c, m, cm) ?? 0), editable: admin,
    clocked: months.map((m) => hoursOf(clockedMap.get(`${c.id}|${m}`) ?? 0)),
    workTypes: c.workTypeIds.filter((id) => tags.some((t) => t.id === id)),
    place: c.team?.location?.id ?? null, status: c.status, drawing: c.drawingStandard ?? "",
    lead: <td className="cl"><Dot color={c.color} /><Link className={c.status === "LOST" ? "t-bad" : undefined} href={`/clients/${c.id}`}>{c.name}</Link>{c.team && <div className="note">{teamLabelOf(c.team)}</div>}</td>,
  }));
  const refMonth = months[ref];
  const refDays = workdays(refMonth + "-01", endOfMonth(refMonth));
  return (
    <>
      <section className="panel full">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Monthly contracts, {year}</h3>
          <span className="note">{rows.length} client{rows.length === 1 ? "" : "s"}</span>
        </div>
        {!rows.length ? <p className="empty">No clients yet. Admins add them with the Add client button.</p> : (
          <MonthGrid key={year} action={saveContractMonths} kind="contracts" year={year} months={months} leadCols={1} noun="client" searchLabel="Search clients"
            heads={<th scope="col">Client</th>} rows={rows} now={now} past={past} refMonth={ref} refDays={refDays} tags={tags}
            places={places} statuses={CLIENT_STATUS} drawings={DRAWING_STANDARDS} />
        )}
      </section>
      <section className="panel full notes" aria-labelledby="notes-title">
        <h3 id="notes-title">Notes</h3>
        <ul className="notes-list">
          <li>Each box is the hours contracted for that month. {admin ? "Type a new figure and press Save changes." : "Admins change these figures."}</li>
          <li>A month the same as the client&apos;s usual monthly hours follows them. A blue box has its own figure, and a dashed box follows the usual hours.</li>
          <li>Type 0 for a month with no contract, and a smaller figure for a contract that ends part-way through a month.</li>
          {admin && <li>Edit, at the right of a client, changes its hours, status, standard and work type together, and saves them in one go.</li>}
          <li>Show clocked hours above the table adds, under each box, the hours logged for that client that month, so it can be compared with the contract.</li>
          {admin && past > 0 && <li>Past months are locked. Change past months asks you to confirm twice before a past figure can change.</li>}
          <li>The Clients page works out utilisation, hours left and pace from the figure for each month. Per day comes from {MONTH_ABBR[ref]} {year}&apos;s hours over its {refDays} working days (Monday to Friday).</li>
          {admin && <li>Work type lists the kinds of work done for the client (your tags). Status and drawing standard are for the record.</li>}
        </ul>
      </section>
    </>
  );
}
