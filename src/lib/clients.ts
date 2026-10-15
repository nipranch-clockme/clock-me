import { Prisma, type ClientType } from "@prisma/client";
import { db } from "./db";
import { addDays, addMonths, daysBetween, endOfMonth, toDate, toStr, today } from "./dates";
import { monthDone } from "./productivity";

export const CLIENT_TYPES: [ClientType, string][] = [["FLOATING", "No commitment"], ["FIXED", "Fixed monthly hours"]];
export const clientTypeName = (t: ClientType) => CLIENT_TYPES.find((x) => x[0] === t)?.[1] ?? t;

/** A client's contracted hours per month, or null when it has no commitment. */
export const contractOf = (c: { type: ClientType; monthlyHours: number | null }) => (c.type === "FIXED" && c.monthlyHours && c.monthlyHours > 0 ? c.monthlyHours : null);
/** Contracted hours for months that differ from the client's usual ones: client id, then "YYYY-MM", then hours (0 = none that month). */
export type ContractMonths = Map<string, Map<string, number>>;
export async function loadContractMonths(clientId?: string): Promise<ContractMonths> {
  const out: ContractMonths = new Map();
  for (const r of await db.clientMonth.findMany({ where: clientId ? { clientId } : {} })) {
    let m = out.get(r.clientId);
    if (!m) out.set(r.clientId, (m = new Map()));
    m.set(toStr(r.month).slice(0, 7), r.hours);
  }
  return out;
}
/** A client's contracted hours in one month, or null when it has no commitment that month: the month's own figure from the monthly table,
 *  else the client's usual monthly hours. Everything that divides by a contract (utilisation, hours left, pace) uses this. */
export const contractFor = (c: { id: string; type: ClientType; monthlyHours: number | null }, ym: string, cm: ContractMonths) => {
  const own = cm.get(c.id)?.get(ym);
  return own !== undefined ? (own > 0 ? own : null) : contractOf(c);
};
/** Contracted minutes over these months. */
export const contractMinutes = (c: Parameters<typeof contractFor>[0], months: string[], cm: ContractMonths) => months.reduce((a, m) => a + (contractFor(c, m, cm) ?? 0) * 60, 0);
/** How a contract reads over a stretch of months: "108 h a month" when every month is the same, otherwise "varies by month". Null with no contract at all. */
export function contractText(c: Parameters<typeof contractFor>[0], months: string[], cm: ContractMonths) {
  const hs = months.map((m) => contractFor(c, m, cm));
  if (!hs.some((h) => h)) return null;
  return hs.every((h) => h === hs[0]) ? perMonth(hs[0]!) : "varies by month";
}
export const perMonth = (h: number) => `${h.toLocaleString("en-US", { maximumFractionDigits: 2 })} h a month`;

export const CLIENT_PERIODS: [string, string][] = [["thismonth", "This month"], ["lastmonth", "Last month"], ["thisquarter", "This quarter"], ["lastquarter", "Last quarter"], ["thisyear", "This year"], ["last12", "Last 12 months"]];
const PREV: Record<string, string> = { thismonth: "the same days last month", lastmonth: "the month before", thisquarter: "the same days last quarter", lastquarter: "the quarter before", thisyear: "the same days last year", last12: "the 12 months before" };

export type ClientPeriod = { key: string; from: string; to: string; months: string[]; current: boolean; prevFrom: string; prevTo: string; prevLabel: string };

/**
 * Dates for a Clients tab period. A period that's still running ends today, and every month it has reached counts as a
 * whole month of contract (so "This month" is one full month of contracted hours). The previous period covers the same
 * number of days, so part of a month is compared with the same days of the month before.
 */
export function clientPeriod(range?: string): ClientPeriod {
  const key = CLIENT_PERIODS.some((p) => p[0] === range) ? range! : "thismonth";
  const t = today(), ym = t.slice(0, 7), y = t.slice(0, 4);
  const qStart = `${y}-${String(Math.floor((+ym.slice(5) - 1) / 3) * 3 + 1).padStart(2, "0")}`;
  // first month, length of the whole period in months, still running
  const [first, len, current]: [string, number, boolean] =
    key === "lastmonth" ? [addMonths(ym, -1), 1, false]
    : key === "thisquarter" ? [qStart, 3, true]
    : key === "lastquarter" ? [addMonths(qStart, -3), 3, false]
    : key === "thisyear" ? [`${y}-01`, 12, true]
    : key === "last12" ? [addMonths(ym, -12), 12, false]
    : [ym, 1, true];
  const months: string[] = [];
  for (let m = first; months.length < len && (!current || m <= ym); m = addMonths(m, 1)) months.push(m);
  const from = first + "-01", to = current ? t : endOfMonth(months[months.length - 1]);
  const prevFrom = addMonths(first, -len) + "-01", prevEnd = endOfMonth(addMonths(first, -1));
  const prevTo = current && addDays(prevFrom, daysBetween(from, to)) < prevEnd ? addDays(prevFrom, daysBetween(from, to)) : prevEnd;
  return { key, from, to, months, current, prevFrom, prevTo, prevLabel: PREV[key] };
}

/** Minutes logged on each client's projects between two dates, by everyone in the company, archived projects included. */
export async function minutesByClient(from: string, to: string, clientId?: string): Promise<Map<string, number>> {
  if (to < from) return new Map();
  const rows = await db.$queryRaw<{ clientId: string; minutes: bigint }[]>(Prisma.sql`
    SELECT p."clientId", SUM(e.minutes)::bigint AS minutes FROM "TimeEntry" e JOIN "Project" p ON p.id = e."projectId"
    WHERE e.date >= ${toDate(from)} AND e.date <= ${toDate(to)} ${clientId ? Prisma.sql`AND p."clientId" = ${clientId}` : Prisma.empty}
    GROUP BY 1`);
  return new Map(rows.map((r) => [r.clientId, Number(r.minutes)]));
}

/** Minutes logged on each client's projects in each month, by everyone in the company. Keyed "clientId|YYYY-MM". */
export async function clockedByMonth(clientIds: string[], months: string[]): Promise<Map<string, number>> {
  if (!clientIds.length || !months.length) return new Map();
  const rows = await db.$queryRaw<{ clientId: string; m: string; minutes: bigint }[]>(Prisma.sql`
    SELECT p."clientId", to_char(e.date, 'YYYY-MM') AS m, SUM(e.minutes)::bigint AS minutes FROM "TimeEntry" e JOIN "Project" p ON p.id = e."projectId"
    WHERE p."clientId" IN (${Prisma.join(clientIds)}) AND e.date >= ${toDate(months[0] + "-01")} AND e.date <= ${toDate(endOfMonth(months[months.length - 1]))}
    GROUP BY 1, 2`);
  return new Map(rows.map((r) => [`${r.clientId}|${r.m}`, Number(r.minutes)]));
}

/** This month's hours on a fixed client against its contract spread over the month's working days so far (Mon to Fri,
 *  up to yesterday). Within 10% either way is on pace. Null before the month's first working day is over. */
export function paceOf(monthlyHours: number, minutesSoFar: number) {
  const done = monthDone(today().slice(0, 7));
  if (!done) return null;
  const expected = monthlyHours * 60 * done, r = minutesSoFar / expected;
  return { expected, soFar: minutesSoFar, state: r > 1.1 ? "ahead" : r < 0.9 ? "behind" : "on" } as const;
}
export const PACE = { on: ["ok", "On pace"], ahead: ["warn", "Ahead of pace"], behind: ["info", "Behind pace"] } as const;

/** Hours compared with the previous period: a short figure ("+12%") and words ("Up 12% on the month before"). */
export function change(now: number, before: number, prevLabel: string): { dir: "up" | "down" | "same" | "none"; short: string; text: string } {
  if (!before) return { dir: "none", short: "–", text: now ? `No time in ${prevLabel}` : `No time in this period or ${prevLabel}` };
  const d = now / before - 1, n = Math.round(Math.abs(d) * 100);
  if (!n) return { dir: "same", short: "0%", text: `Same as ${prevLabel}` };
  return { dir: d > 0 ? "up" : "down", short: `${d > 0 ? "+" : "−"}${n}%`, text: `${d > 0 ? "Up" : "Down"} ${n}% on ${prevLabel}` };
}
