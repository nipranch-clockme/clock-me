import { NOT_A_RESOURCE } from "@/lib/roles";
import Link from "next/link";
import { db } from "@/lib/db";
import { canManagePerson } from "@/lib/scope";
import { today } from "@/lib/dates";
import { gridYear, yearMonths } from "@/lib/monthGrid";
import type { Me } from "@/lib/auth";
import MonthGrid, { type GridRow } from "@/components/MonthGrid";
import { saveMonthlyHours } from "./hours-actions";

/** Expected hours per week for each person, month by month, in a table. Admins are not a resource, so they are not listed.
 *  Admins change anyone's boxes; location managers their own office's (not other location managers', nor their own). */
export default async function HoursView({ me, yearParam }: { me: Me; yearParam?: string }) {
  const year = gridYear(yearParam), months = yearMonths(year);
  const cur = today().slice(0, 7), now = year === +cur.slice(0, 4) ? +cur.slice(5) - 1 : null;
  const people = await db.user.findMany({
    where: { active: true, role: { notIn: NOT_A_RESOURCE }, ...(me.role === "ADMIN" ? {} : { locationId: me.locationId }) },
    include: { team: true, location: true, monthlyHours: { select: { month: true, weeklyHours: true } } },
    orderBy: [{ location: { name: "asc" } }, { name: "asc" }],
  });
  const multi = new Set(people.map((p) => p.locationId)).size > 1;
  const rows: GridRow[] = people.map((u) => {
    const own = new Map(u.monthlyHours.map((m) => [m.month.toISOString().slice(0, 7), m.weeklyHours]));
    return {
      id: u.id, name: u.name, usual: u.weeklyTarget, values: months.map((m) => own.get(m) ?? u.weeklyTarget), editable: canManagePerson(me, u),
      lead: <>
        <td className="cl"><Link href={`/profile/${u.id}`}>{u.name}</Link><div className="note">{[u.title, u.team?.name ?? "No team", multi ? u.location.name : ""].filter(Boolean).join(" · ")}</div></td>
        <td className="num" data-l="Usual a week">{u.weeklyTarget}</td>
      </>,
    };
  });
  return (
    <section className="panel full">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Monthly hours, {year}</h3>
        <span className="note">{rows.length} {rows.length === 1 ? "person" : "people"}</span>
      </div>
      {!rows.length ? <p className="empty">Nobody to show yet.</p> : (
        <MonthGrid key={year} action={saveMonthlyHours} kind="hours" year={year} months={months} leadCols={2} noun="person" searchLabel="Search people"
          heads={<><th scope="col">Person</th><th className="num" scope="col">Usual a week</th></>} rows={rows} now={now} refMonth={0} refDays={0} />
      )}
      <p className="note" style={{ margin: "10px 0 0" }}>
        Each box is the hours expected of the person per week in that month. A month the same as the person&apos;s usual weekly hours follows them (change the usual hours from Edit on the People tab); a blue box has its own figure.
        Type 0 for a month with nothing expected, such as a long leave or a sabbatical. Productivity on the Dashboard and in profiles uses the figure for each month, less public holidays and time off. Admins are not a resource, so they are not listed.
        {me.role === "LOCATION" ? " You can change people in your own office. Other location managers and your own hours are changed by an admin." : ""}
      </p>
    </section>
  );
}
