import { cache } from "react";
import { db } from "./db";
import { addMonths, endOfMonth, today, toDate, toStr } from "./dates";
import { getSettings } from "./settings";
import { trackingStarts } from "./startDates";
import { buildExpected, type DayOff, type Expected, type HolidayRow, type LeaveRow } from "./expected";

export type { DayOff, Expected } from "./expected";

/** Every office's public holidays. The table is small, so it is read once per request and never cut by date. */
export const allHolidays = cache(async (): Promise<HolidayRow[]> =>
  (await db.holiday.findMany({ orderBy: { date: "asc" } })).map((h) => ({ locationId: h.locationId, date: toStr(h.date), name: h.name, fraction: h.fraction })));

/** The time off of these people that touches [from, to]. */
export async function leaveFor(userIds: string[], from: string, to: string): Promise<LeaveRow[]> {
  if (!userIds.length) return [];
  const rows = await db.timeOff.findMany({ where: { userId: { in: userIds }, startDate: { lte: toDate(to) }, endDate: { gte: toDate(from) } } });
  return rows.map((r) => ({ id: r.id, userId: r.userId, from: toStr(r.startDate), to: toStr(r.endDate), fraction: r.fraction, label: r.label, source: r.source }));
}

/** The days a loader covers when it is not told: two years back to a year ahead, which holds every period the app offers. */
export function defaultWindow() {
  const ym = today().slice(0, 7);
  return { from: addMonths(ym, -24) + "-01", to: endOfMonth(addMonths(ym, 13)) };
}

/**
 * Loads what is needed to work out expected hours for these people, once, and returns the function every page uses:
 * `ex(person, from, to)` gives minutes, `ex.days(...)` working days, `ex.dates(...)` the days that count, `ex.starts` their first day.
 * Time off outside `win` is ignored, so pass a window when asking about days far back or far ahead.
 */
export async function loadExpected(users: { id: string; locationId: string; createdAt: Date }[], win?: { from: string; to: string }): Promise<Expected> {
  await getSettings(); // sets the company time zone, which decides "today" and each person's first day
  const window = win ?? defaultWindow();
  const [starts, holidays, leave] = await Promise.all([trackingStarts(users), allHolidays(), leaveFor(users.map((u) => u.id), window.from, window.to)]);
  return buildExpected({ starts, holidays, leave, today: today(), window });
}

/** What is taken off each of these days for one person (a holiday in their office, or time off), for badges on the Timesheet and Calendar. */
export async function dayMarks(u: { id: string; locationId: string }, dates: string[]): Promise<(DayOff | null)[]> {
  if (!dates.length) return [];
  const [holidays, leave] = await Promise.all([allHolidays(), leaveFor([u.id], dates[0], dates[dates.length - 1])]);
  const ex = buildExpected({ starts: new Map(), holidays, leave, today: today(), window: { from: dates[0], to: dates[dates.length - 1] } });
  return dates.map((d) => ex.off(u, d));
}
