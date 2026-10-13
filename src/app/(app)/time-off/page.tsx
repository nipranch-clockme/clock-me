import Link from "next/link";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { canManageHolidays, canManageTimeOff, scopeLabel, timeOffApproveError, timeOffError, visibleUsersWhere } from "@/lib/scope";
import { dow, DAYS, longDate, shortDate, today, toDate, toStr } from "@/lib/dates";
import { weekdaysBetween } from "@/lib/expected";
import { PageHead, Pill, Ifld } from "@/components/ui";
import AutoForm from "@/components/AutoForm";
import TableFilter from "@/components/TableFilter";
import { AddTimeOff, HolidayForm, RemoveButton } from "./TimeOffForms";
import { removeHoliday, removeTimeOff } from "./actions";

const SHOW: [string, string][] = [["upcoming", "Upcoming"], ["thisyear", "This year"], ["lastyear", "Last year"]];
const span = (a: string, b: string) => (a === b ? longDate(a) : `${DAYS[dow(a)]} ${shortDate(a)} to ${DAYS[dow(b)]} ${shortDate(b)}`);
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** Who approves a request from this person, in the words the dialog uses. */
const APPROVER: Record<string, string> = { MEMBER: "your Location manager or an Admin", LEADER: "your Location manager or an Admin", LOCATION: "an Admin", ADMIN: "another Admin" };

export default async function TimeOffPage({ searchParams }: { searchParams: Promise<{ view?: string; show?: string; office?: string; year?: string }> }) {
  const sp = await searchParams;
  const me = await requireTab("time-off");
  const settings = await getSettings(); // sets the company time zone, which decides "today"
  const view = sp.view === "holidays" ? "holidays" : "time";
  const t = today();
  const toggle = (
    <div className="seg vt" role="group" aria-label="Time off view">
      {([["time", "Time off"], ["holidays", "Public holidays"]] as const).map(([k, l]) => (
        <Link key={k} href={k === "time" ? "/time-off" : "/time-off?view=holidays"} aria-pressed={view === k} replace>{l}</Link>
      ))}
    </div>
  );
  return (
    <>
      <PageHead title="Time off" beside={toggle} sub={view === "time"
        ? `${scopeLabel(me)}. Approved time off is taken out of expected hours, so productivity stays fair. Time can still be logged on those days.`
        : "Public holidays are set for each office and taken out of everyone's expected hours in that office. Only Admins can add or change them. Time can still be logged on those days."} />
      {view === "time" ? <TimeOffList me={me} show={sp.show} today={t} lock={settings.lockBeforeStr} /> : <Holidays me={me} office={sp.office} year={sp.year} today={t} lock={settings.lockBeforeStr} />}
    </>
  );
}

type Me = Awaited<ReturnType<typeof requireTab>>;

async function TimeOffList({ me, show: showParam, today: t, lock }: { me: Me; show?: string; today: string; lock: string | null }) {
  const show = SHOW.some((s) => s[0] === showParam) ? showParam! : "upcoming";
  const y = +t.slice(0, 4);
  const when = show === "upcoming" ? { endDate: { gte: toDate(t) } }
    : { startDate: { lte: toDate(`${show === "lastyear" ? y - 1 : y}-12-31`) }, endDate: { gte: toDate(`${show === "lastyear" ? y - 1 : y}-01-01`) } };
  const [rows, people] = await Promise.all([
    db.timeOff.findMany({
      where: { user: visibleUsersWhere(me), ...when },
      include: { user: { select: { id: true, name: true, role: true, teamId: true, locationId: true, team: { select: { name: true } }, location: { select: { name: true } } } }, createdBy: { select: { name: true } }, decidedBy: { select: { name: true } } },
      orderBy: [{ startDate: show === "lastyear" ? "desc" : "asc" }, { createdAt: "asc" }],
      take: 600,
    }),
    db.user.findMany({ where: { AND: [visibleUsersWhere(me), { active: true }] }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, teamId: true, locationId: true, team: { select: { name: true } }, location: { select: { name: true } } } }),
  ]);
  const options = people.filter((p) => !timeOffError(me, p)).map((p) => ({ value: p.id, label: p.id === me.id ? `${p.name} (you)` : p.name, group: p.team?.name ?? p.location.name }));
  const many = people.length > 1;
  return (
    <section className="panel full">
      <div className="row between" style={{ marginBottom: 10 }}>
        <AutoForm className="phd-a" key={show}>
          <Ifld id="to-show" label="Show" name="show" defaultValue={show}>{SHOW.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Ifld>
        </AutoForm>
        <div className="row" style={{ flex: "0 1 auto" }}>
          {many && rows.length > 0 && <TableFilter label="Search time off" placeholder="Search people…" />}
          <AddTimeOff people={options} meId={me.id} today={t} others={options.length > 1} approver={APPROVER[me.role] ?? "an Admin"} />
        </div>
      </div>
      <div className="tablebox"><table className="ctable">
        <thead><tr>{many && <th>Person</th>}<th>Dates</th><th className="num">Working days</th><th>Type</th><th>Status</th><th>Note</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const a = toStr(r.startDate), b = toStr(r.endDate);
            const days = weekdaysBetween(a, b) * r.fraction;
            const own = r.userId === me.id;
            const locked = !!lock && a <= lock;
            const pendingMine = own && r.status === "PENDING";
            const canDecide = r.status === "PENDING" && !own && !timeOffApproveError(me, r.user);
            const manage = canManageTimeOff(me, r.user);
            const status = r.status === "PENDING" ? <Pill tone="warn">Waiting for approval</Pill>
              : r.status === "DECLINED" ? <><Pill tone="bad">Declined</Pill>{r.decisionNote && <div className="note">{r.decisionNote}</div>}</>
              : r.decidedById && r.decidedById !== r.createdById ? <span className="note">Approved by {r.decidedBy?.name ?? "someone"}</span>
              : <span className="note">–</span>;
            return (
              <tr key={r.id}>
                {many && <td><Link className="plink" href={`/profile/${r.user.id}`}>{r.user.name}</Link><div className="note">{r.user.team?.name ?? r.user.location.name}</div></td>}
                <td data-l="Dates">{span(a, b)}{a <= t && b >= t && r.status === "APPROVED" && <> <Pill tone="info">Now</Pill></>}{a < t && r.status !== "DECLINED" && <div className="note">Past</div>}</td>
                <td className="num" data-l="Working days">{num(days)}{r.fraction < 1 && <div className="note">half days</div>}</td>
                <td data-l="Type">{r.label}{r.source !== "manual" && <> <Pill tone="locked">{r.source === "keka" ? "Keka" : "Imported"}</Pill></>}</td>
                <td data-l="Status">{status}</td>
                <td data-l="Note">{r.note || <span className="note">–</span>}{r.createdBy && r.createdBy.name !== r.user.name && <div className="note">Added by {r.createdBy.name}</div>}</td>
                <td className="act">
                  {pendingMine && <RemoveButton id={r.id} action={removeTimeOff} label="Withdraw" what={`your request for ${span(a, b)}`} />}
                  {canDecide && <Link className="btn sm" href="/approvals">Review</Link>}
                  {!pendingMine && !canDecide && r.status !== "PENDING" && manage && r.source === "manual" && !locked && <RemoveButton id={r.id} action={removeTimeOff} what={`${r.label} on ${span(a, b)}${many ? ` for ${r.user.name}` : ""}`} />}
                  {!pendingMine && locked && r.source === "manual" && <span className="note">Locked</span>}
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={many ? 7 : 6} className="empty">{show === "upcoming" ? "No upcoming time off." : "No time off in that year."}</td></tr>}
        </tbody>
      </table></div>
      {rows.length === 600 && <p className="note" style={{ margin: "8px 0 0" }}>Showing the first 600. Pick a shorter period to see the rest.</p>}
    </section>
  );
}

async function Holidays({ me, office: officeParam, year: yearParam, today: t, lock }: { me: Me; office?: string; year?: string; today: string; lock: string | null }) {
  const admin = me.role === "ADMIN";
  const edit = canManageHolidays(me);
  // Everyone sees every office's holidays; the office picker narrows the list to the holidays an office takes.
  const offices = await db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const office = offices.find((o) => o.id === officeParam) ?? null;
  const y0 = +t.slice(0, 4);
  const year = Math.min(2100, Math.max(2000, parseInt(yearParam ?? "") || y0));
  const years = [...new Set([y0 - 1, y0, y0 + 1, year])].sort();
  const inYear = { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) };
  const [rows, counts] = await Promise.all([
    db.holiday.findMany({ where: { date: inYear }, include: { location: { select: { id: true, name: true } } }, orderBy: [{ date: "asc" }, { name: "asc" }] }),
    db.holiday.groupBy({ by: ["locationId"], where: { date: inYear }, _count: true }),
  ]);
  // A holiday that is the same name, date and length in several offices is one line, with its offices in a column.
  const groups = new Map<string, { date: string; name: string; fraction: number; ids: string[]; offices: string[]; officeIds: string[] }>();
  for (const h of rows) {
    const d = toStr(h.date), key = `${d}|${h.name}|${h.fraction}`;
    const g = groups.get(key) ?? { date: d, name: h.name, fraction: h.fraction, ids: [], offices: [], officeIds: [] };
    g.ids.push(h.id); g.offices.push(h.location.name); g.officeIds.push(h.locationId);
    groups.set(key, g);
  }
  const list = [...groups.values()].filter((g) => !office || g.officeIds.includes(office.id));
  const officesOf = (g: { offices: string[] }) => (g.offices.length === offices.length && offices.length > 1 ? "All offices" : [...g.offices].sort((a, b) => a.localeCompare(b)).join(", "));
  const n = new Map(counts.map((c) => [c.locationId, c._count]));
  const empty = admin ? offices.filter((o) => !n.get(o.id)) : [];
  return (
    <section className="panel full">
      <div className="row between" style={{ marginBottom: 10 }}>
        <AutoForm className="phd-a" key={(office?.id ?? "all") + year}>
          <input type="hidden" name="view" value="holidays" />
          <Ifld id="ho-sel" label="Office" name="office" defaultValue={office?.id ?? ""}>
            <option value="">All offices</option>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name} ({n.get(o.id) ?? 0})</option>)}
          </Ifld>
          <Ifld id="ho-year" label="Year" name="year" defaultValue={String(year)}>{years.map((v) => <option key={v}>{v}</option>)}</Ifld>
        </AutoForm>
      </div>
      {empty.length > 0 && <p className="alert warn">{empty.length === 1 ? `${empty[0].name} has` : `${empty.map((o) => o.name).join(", ")} have`} no public holidays in {year} yet, so nothing is taken off for {empty.length === 1 ? "that office" : "those offices"}.</p>}
      {/* The form sits above the list, so adding one doesn't mean scrolling past every holiday. */}
      {edit
        ? <HolidayForm offices={offices} today={t < `${year}-01-01` || t > `${year}-12-31` ? `${year}-01-01` : t} />
        : <p className="note" style={{ margin: "0 0 12px" }}>Only Admins can add or change public holidays.</p>}
      <div className="tablebox"><table className="ctable">
        <thead><tr><th>Date</th><th>Holiday</th><th>Offices</th>{edit && <th />}</tr></thead>
        <tbody>
          {list.map((g) => {
            const locked = !!lock && g.date <= lock, weekend = dow(g.date) >= 5, where = officesOf(g);
            return (
              <tr key={`${g.date}|${g.name}|${g.fraction}`}>
                <td data-l="Date">{longDate(g.date)}</td>
                <td data-l="Holiday">{g.name}{g.fraction < 1 && <> <Pill tone="info">Half day</Pill></>}{weekend && <div className="note">On a weekend, so nothing is taken off.</div>}</td>
                <td data-l="Offices">{where}</td>
                {edit && <td className="act">{!locked ? <RemoveButton id={g.ids.join(",")} action={removeHoliday} what={`${g.name} (${longDate(g.date)}) from ${where}`} /> : <span className="note">Locked</span>}</td>}
              </tr>
            );
          })}
          {!list.length && <tr><td colSpan={edit ? 4 : 3} className="empty">{office ? `No public holidays for ${office.name} in ${year}.` : `No public holidays in ${year} yet.`}</td></tr>}
        </tbody>
      </table></div>
    </section>
  );
}
