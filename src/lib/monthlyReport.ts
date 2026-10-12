import { NOT_A_RESOURCE } from "./roles";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { endOfMonth, toDate, today } from "./dates";
import { contractFor, loadContractMonths } from "./clients";
import { monthDone } from "./productivity";
import { loadExpected } from "./timeoff";
import { expectsHoursWhere } from "./scope";
import { loadOtTagIds } from "./overtime";

// The office's monthly report on the Dashboard, laid out like the sheet location managers kept before: inventory, hours logged,
// headcount, utilisation and contract fulfilment for each month of a year, then the hours by tag. The page and its CSV both use this.
//
// - People are the office's active people who are expected to work (admins are not a resource), the same as the Inventory vs actual chart.
// - Inventory is their expected hours (see expected.ts), so holidays and time off are already out. The current month counts up to yesterday.
// - Contracted hours are those of the clients looked after by a team in this office: a fixed client's monthly contract (the current
//   month's scaled to the share of its working days that are over, so it compares with the hours logged so far), and for a client with
//   no commitment that month, the hours clocked for it. Only the fulfilment percentage is shown, not these hours.
// - Hours by tag: an entry with several tags counts under each of them. OT only marks overtime, so it is not a kind of work: an entry
//   is counted under its other tags (or "No tag"), and the OT row shows how much of the total was overtime.
// - All offices (admins only, `locationId` null) is the same report for every office added together. A client counts only when a team
//   looks after it, so the offices add up to the total.

/** The office id that means every office together. */
export const ALL_OFFICES = "all";

export type MonthlyReport = {
  year: number;
  months: string[]; // "YYYY-MM", Jan to Dec
  /** Months that have started (later ones are shown empty). */
  open: boolean[];
  inventory: number[]; // minutes
  actual: number[];
  people: number[];
  contracted: number[];
  tags: { name: string; v: number[] }[];
  ot: number[] | null; // null when there is no OT tag
};

export async function reportYears(locationId: string | null) {
  const first = await db.timeEntry.findFirst({ where: locationId ? { user: { locationId } } : {}, orderBy: { date: "asc" }, select: { date: true } });
  const now = +today().slice(0, 4);
  const from = Math.max(now - 5, first ? first.date.getUTCFullYear() : now);
  return Array.from({ length: now - from + 1 }, (_, i) => now - i);
}

export async function monthlyReport(locationId: string | null, year: number): Promise<MonthlyReport> {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const now = today().slice(0, 7);
  const open = months.map((m) => m <= now);
  const users = await db.user.findMany({ where: { AND: [{ ...(locationId ? { locationId } : {}), active: true, passwordHash: { not: null }, role: { notIn: NOT_A_RESOURCE } }, expectsHoursWhere] } });
  const ids = users.map((u) => u.id);
  const ex = await loadExpected(users, { from: `${year}-01-01`, to: `${year}-12-31` });

  const inventory = months.map(() => 0), people = months.map(() => 0);
  months.forEach((m, i) => {
    if (!open[i]) return;
    for (const u of users) {
      const mins = ex(u, m + "-01", endOfMonth(m));
      inventory[i] += mins;
      // Someone counts in a month once they have started (see trackingStarts), whatever time off they had.
      if ((ex.starts.get(u.id) ?? "") <= endOfMonth(m)) people[i]++;
    }
  });

  const grouped = ids.length
    ? await db.$queryRaw<{ m: string; tagIds: string[]; minutes: bigint }[]>(Prisma.sql`
        SELECT to_char(date, 'YYYY-MM') AS m, "tagIds", SUM(minutes)::bigint AS minutes FROM "TimeEntry"
        WHERE "userId" IN (${Prisma.join(ids)}) AND date >= ${toDate(months[0] + "-01")} AND date <= ${toDate(endOfMonth(months[11]))}
        GROUP BY 1, 2`)
    : [];
  const [otIds, tagRows] = await Promise.all([loadOtTagIds(), db.tag.findMany({ select: { id: true, name: true } })]);
  const tagName = new Map(tagRows.map((t) => [t.id, t.name]));
  const actual = months.map(() => 0);
  const ot = otIds.length ? months.map(() => 0) : null;
  const byTag = new Map<string, number[]>();
  const add = (name: string, i: number, v: number) => { let a = byTag.get(name); if (!a) byTag.set(name, (a = months.map(() => 0))); a[i] += v; };
  for (const g of grouped) {
    const i = months.indexOf(g.m), mins = Number(g.minutes);
    if (i < 0) continue;
    actual[i] += mins;
    if (ot && g.tagIds.some((t) => otIds.includes(t))) ot[i] += mins;
    const work = [...new Set(g.tagIds.filter((t) => !otIds.includes(t)).map((t) => tagName.get(t)).filter((n): n is string => !!n))];
    if (!work.length) add("No tag", i, mins);
    for (const n of work) add(n, i, mins);
  }
  const total = (v: number[]) => v.reduce((a, b) => a + b, 0);
  const tags = [...byTag.entries()].map(([name, v]) => ({ name, v }))
    .sort((a, b) => Number(a.name === "No tag") - Number(b.name === "No tag") || total(b.v) - total(a.v) || a.name.localeCompare(b.name));

  const [clients, cm] = await Promise.all([
    db.client.findMany({ where: locationId ? { team: { locationId } } : { teamId: { not: null } }, select: { id: true, type: true, monthlyHours: true } }),
    loadContractMonths(),
  ]);
  // Hours clocked for each of these clients, by anyone, month by month (for the clients with no commitment).
  const clocked = clients.length
    ? await db.$queryRaw<{ clientId: string; m: string; minutes: bigint }[]>(Prisma.sql`
        SELECT p."clientId", to_char(e.date, 'YYYY-MM') AS m, SUM(e.minutes)::bigint AS minutes FROM "TimeEntry" e JOIN "Project" p ON p.id = e."projectId"
        WHERE p."clientId" IN (${Prisma.join(clients.map((c) => c.id))}) AND e.date >= ${toDate(months[0] + "-01")} AND e.date <= ${toDate(endOfMonth(months[11]))}
        GROUP BY 1, 2`)
    : [];
  const clockedOf = new Map(clocked.map((r) => [`${r.clientId}|${r.m}`, Number(r.minutes)]));
  const contracted = months.map((m, i) => {
    if (!open[i]) return 0;
    let total = 0;
    for (const c of clients) {
      const h = contractFor(c, m, cm);
      total += h ? h * 60 * (m === now ? monthDone(m) : 1) : clockedOf.get(`${c.id}|${m}`) ?? 0;
    }
    return total;
  });

  return { year, months, open, inventory, actual, people, contracted, tags, ot };
}

/** The year column: totals for hours, the average headcount over the months that have started, and percentages from the totals. */
export function yearOf(r: MonthlyReport) {
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  const n = r.open.filter(Boolean).length;
  const inventory = sum(r.inventory), actual = sum(r.actual), contracted = sum(r.contracted);
  return {
    inventory, actual, contracted,
    people: n ? sum(r.people) / n : 0,
    utilisation: inventory ? actual / inventory : null,
    fulfilment: contracted ? actual / contracted : null,
  };
}

export const ratio = (a: number, b: number) => (b ? a / b : null);
/** Hours with up to two decimals, as in the old sheet: 3042.5, 11.75. */
export const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
export const pct2 = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(2)}%`);

export type ReportLine = { label: string; cells: (number | string | null)[]; year: number | string | null; kind: "hours" | "count" | "pct"; group: "summary" | "tags" };

/** The report as lines of a table, the same on screen and in the CSV. Months that have not started are null. Without `contracts` (Human
 *  Resource), the contract fulfilment line is left out. */
export function reportLines(r: MonthlyReport, contracts = true): ReportLine[] {
  const y = yearOf(r);
  const hrs = (v: number[]) => v.map((x, i) => (r.open[i] ? hoursOf(x) : null));
  const lines: ReportLine[] = [
    { label: "Inventory available", cells: hrs(r.inventory), year: hoursOf(y.inventory), kind: "hours", group: "summary" },
    { label: "Actual total logged", cells: hrs(r.actual), year: hoursOf(y.actual), kind: "hours", group: "summary" },
    { label: "Total active employees", cells: r.people.map((x, i) => (r.open[i] ? x : null)), year: Math.round(y.people * 10) / 10, kind: "count", group: "summary" },
    { label: "Inventory utilisation", cells: r.months.map((_, i) => (r.open[i] ? pct2(ratio(r.actual[i], r.inventory[i])) : null)), year: pct2(y.utilisation), kind: "pct", group: "summary" },
    ...(contracts ? [{ label: "Contract fulfilment", cells: r.months.map((_, i) => (r.open[i] ? pct2(ratio(r.actual[i], r.contracted[i])) : null)), year: pct2(y.fulfilment), kind: "pct" as const, group: "summary" as const }] : []),
  ];
  for (const t of r.tags) lines.push({ label: t.name, cells: hrs(t.v), year: hoursOf(t.v.reduce((a, b) => a + b, 0)), kind: "hours", group: "tags" });
  if (r.ot) lines.push({ label: "OT (overtime)", cells: hrs(r.ot), year: hoursOf(r.ot.reduce((a, b) => a + b, 0)), kind: "hours", group: "tags" });
  return lines;
}
