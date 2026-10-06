import { Prisma } from "@prisma/client";
import { db } from "./db";
import { addDays, addMonths, endOfMonth, rangeDates, today, toDate, workdaysSoFar } from "./dates";

// Productivity on the Dashboard and utilisation on profiles are the same number: hours logged divided by expected
// (target) hours. Both pages work it out here so they always agree.

export const PERIODS: [string, string][] = [["thisweek", "This week"], ["lastweek", "Last week"], ["thismonth", "This month"], ["lastmonth", "Last month"], ["thisquarter", "This quarter"], ["thisyear", "This year"], ["lastyear", "Last year"]];
export const periodOf = (v: string | undefined) => (PERIODS.some((p) => p[0] === v) ? v! : "thismonth");

/** The days a period's numbers cover: its first day to its last complete day (yesterday at the latest), so hours and
 *  expected hours cover the same days. The end is before the start when no day of the period is over yet. */
export function periodDays(range: string): [string, string] {
  const [a, b] = rangeDates(range);
  const yesterday = addDays(today(), -1);
  return [a, b < yesterday ? b : yesterday];
}

/** Expected minutes from `from` to `to`: the weekly hours spread over Monday to Friday, up to yesterday, from the day
 *  the person started (see trackingStarts). */
export const expectedMinutes = (weeklyTarget: number, start: string, from: string, to: string) =>
  (weeklyTarget / 5) * workdaysSoFar(start > from ? start : from, to) * 60;

/** Hours logged divided by expected hours, or 0 when nothing was expected. */
export const utilisation = (minutes: number, expected: number) => (expected ? minutes / expected : 0);

/** The last 12 full months, oldest first, as YYYY-MM. */
export function last12Months() {
  const first = addMonths(today().slice(0, 7), -12);
  return Array.from({ length: 12 }, (_, i) => addMonths(first, i));
}

/** Minutes each person logged in each of these months, keyed "userId|YYYY-MM". */
export async function monthlyMinutes(ids: string[], months: string[]) {
  const rows = ids.length
    ? await db.$queryRaw<{ userId: string; m: string; minutes: bigint }[]>(Prisma.sql`
        SELECT "userId", to_char(date, 'YYYY-MM') AS m, SUM(minutes)::bigint AS minutes FROM "TimeEntry"
        WHERE "userId" IN (${Prisma.join(ids)}) AND date >= ${toDate(months[0] + "-01")} AND date <= ${toDate(endOfMonth(months[months.length - 1]))}
        GROUP BY 1, 2`)
    : [];
  return new Map(rows.map((r) => [`${r.userId}|${r.m}`, Number(r.minutes)]));
}

/** Each month's figure for a group of people (an office, or one person): everyone's hours over everyone's expected
 *  hours, or null when nothing was expected that month. */
export function monthlyUtilisation(users: { id: string; weeklyTarget: number }[], months: string[], starts: Map<string, string>, minutes: Map<string, number>) {
  return months.map((m) => {
    const tg = users.reduce((s, u) => s + expectedMinutes(u.weeklyTarget, starts.get(u.id)!, m + "-01", endOfMonth(m)), 0);
    return tg ? users.reduce((s, u) => s + (minutes.get(`${u.id}|${m}`) ?? 0), 0) / tg : null;
  });
}
