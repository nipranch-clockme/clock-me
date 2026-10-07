import { addDays, dow, toDate } from "./dates";

// Expected hours, in one place. A person's expected hours over a stretch of days are their weekly hours spread over
// Monday to Friday, less the public holidays of their office and the time off they have booked. Every number that
// divides by expected hours (Dashboard, profiles, "Your numbers", approvals, reminders) comes from here, so they agree.
//
// This file does only arithmetic on plain data (no database), so it can be checked on its own. timeoff.ts loads the data.

export type HolidayRow = { locationId: string; date: string; name: string; fraction: number };
export type LeaveRow = { id: string; userId: string; from: string; to: string; fraction: number; label: string; source: string };

/** What takes part of a day off one person's expected hours. */
export type DayOff = {
  holiday?: { name: string; fraction: number };
  leave?: { id: string; label: string; fraction: number; source: string };
};

type Who = { id: string; locationId: string };
type Opts = {
  /** Count the whole stretch, including today and days still to come. Without it only complete days count (up to yesterday). */
  whole?: boolean;
};

export type Breakdown = {
  /** Monday to Friday days in the stretch, from the day the person started. */
  weekdays: number;
  /** Public holidays that fall on those days. */
  holidays: { date: string; name: string; fraction: number }[];
  /** Days of public holiday and of time off that were taken out (a half day is 0.5). */
  holidayDays: number;
  leaveDays: number;
  /** What is left: weekdays less holidayDays and leaveDays. */
  days: number;
};

export type Expected = {
  /** Expected minutes for a person from `from` to `to`. */
  (u: Who & { weeklyTarget: number }, from: string, to: string, o?: Opts): number;
  /** The same stretch in working days (can be fractional: a half day off leaves 0.5). */
  days(u: Who, from: string, to: string, o?: Opts): number;
  /** The days in the stretch that count, in order (a day with only half off still counts). */
  dates(u: Who, from: string, to: string, o?: Opts): string[];
  /** What is taken off on one day, or null on a normal working day (and on weekends). */
  off(u: Who, date: string): DayOff | null;
  breakdown(u: Who, from: string, to: string, o?: Opts): Breakdown;
  /** The first day each person counts (see trackingStarts). */
  starts: Map<string, string>;
};

const dayNum = (s: string) => Math.floor(toDate(s).getTime() / 864e5);

/** Monday to Friday days in [a, b] (0 when b is before a). The same count as dates.ts workdays, without walking every day. */
export function weekdaysBetween(a: string, b: string) {
  if (b < a) return 0;
  const n = dayNum(b) - dayNum(a) + 1;
  let c = Math.floor(n / 7) * 5;
  const first = (dayNum(a) + 3) % 7; // 1970-01-01 was a Thursday; Monday = 0
  for (let i = 0; i < n % 7; i++) if ((first + i) % 7 < 5) c++;
  return c;
}

/** `fraction` for the days off a row can take: anything from a sliver to a whole day, kept to quarters so sums stay exact. */
export const cleanFraction = (v: number) => (v >= 1 ? 1 : v > 0 ? Math.max(0.25, Math.round(v * 4) / 4) : 0);

export function buildExpected(i: {
  starts: Map<string, string>;
  holidays: HolidayRow[];
  leave: LeaveRow[];
  /** Today's date in the company's time zone. */
  today: string;
  /** Leave is only looked at inside this window, which keeps very long rows cheap. Holidays are always all used. */
  window?: { from: string; to: string };
}): Expected {
  const yesterday = addDays(i.today, -1);

  const holByLoc = new Map<string, Map<string, HolidayRow>>();
  for (const h of i.holidays) {
    if (dow(h.date) >= 5) continue; // a holiday on a weekend takes nothing off
    let m = holByLoc.get(h.locationId);
    if (!m) holByLoc.set(h.locationId, (m = new Map()));
    const cur = m.get(h.date);
    if (!cur || h.fraction > cur.fraction) m.set(h.date, h);
  }
  const leaveByUser = new Map<string, LeaveRow[]>();
  for (const l of i.leave) {
    const a = leaveByUser.get(l.userId);
    if (a) a.push(l); else leaveByUser.set(l.userId, [l]);
  }

  // Per person, built the first time they are asked about: each day with something off, and how much of it.
  type Cut = { date: string; holiday: number; leave: number; hol?: HolidayRow; lv?: LeaveRow };
  const cutsOf = new Map<string, Cut[]>();
  const cuts = (u: Who): Cut[] => {
    let c = cutsOf.get(u.id);
    if (c) return c;
    const byDate = new Map<string, Cut>();
    const at = (date: string) => { let x = byDate.get(date); if (!x) byDate.set(date, (x = { date, holiday: 0, leave: 0 })); return x; };
    for (const h of holByLoc.get(u.locationId)?.values() ?? []) { const x = at(h.date); x.holiday = h.fraction; x.hol = h; }
    for (const l of leaveByUser.get(u.id) ?? []) {
      const a = i.window && l.from < i.window.from ? i.window.from : l.from;
      const b = i.window && l.to > i.window.to ? i.window.to : l.to;
      for (let d = a; d <= b; d = addDays(d, 1)) {
        if (dow(d) >= 5) continue;
        const x = at(d);
        if (l.fraction > x.leave) { x.leave = l.fraction; x.lv = l; } // two rows on one day count once: the larger
      }
    }
    c = [...byDate.values()].sort((p, q) => (p.date < q.date ? -1 : 1));
    cutsOf.set(u.id, c);
    return c;
  };
  // What a day really loses: a holiday and time off on the same day can't take more than the day.
  const lost = (x: Cut) => Math.min(1, x.holiday + x.leave);

  const span = (u: Who, from: string, to: string, o?: Opts): [string, string] => {
    const st = i.starts.get(u.id);
    const a = st && st > from ? st : from;
    const b = o?.whole || to <= yesterday ? to : yesterday;
    return [a, b];
  };
  const daysOf = (u: Who, from: string, to: string, o?: Opts) => {
    const [a, b] = span(u, from, to, o);
    if (b < a) return 0;
    let n = weekdaysBetween(a, b);
    for (const x of cuts(u)) if (x.date >= a && x.date <= b) n -= lost(x);
    return Math.max(0, n);
  };

  const ex = ((u: Who & { weeklyTarget: number }, from: string, to: string, o?: Opts) => (u.weeklyTarget / 5) * daysOf(u, from, to, o) * 60) as Expected;
  ex.days = daysOf;
  ex.starts = i.starts;
  ex.dates = (u, from, to, o) => {
    const [a, b] = span(u, from, to, o);
    const gone = new Map(cuts(u).map((x) => [x.date, lost(x)]));
    const out: string[] = [];
    for (let d = a; d <= b; d = addDays(d, 1)) if (dow(d) < 5 && (gone.get(d) ?? 0) < 1) out.push(d);
    return out;
  };
  ex.off = (u, date) => {
    if (dow(date) >= 5) return null;
    const x = cuts(u).find((c) => c.date === date);
    if (!x) return null;
    return {
      ...(x.hol ? { holiday: { name: x.hol.name, fraction: x.hol.fraction } } : {}),
      ...(x.lv ? { leave: { id: x.lv.id, label: x.lv.label, fraction: x.lv.fraction, source: x.lv.source } } : {}),
    };
  };
  ex.breakdown = (u, from, to, o) => {
    const [a, b] = span(u, from, to, o);
    const weekdays = b < a ? 0 : weekdaysBetween(a, b);
    const holidays: Breakdown["holidays"] = [];
    let holidayDays = 0, leaveDays = 0;
    if (b >= a) {
      for (const x of cuts(u)) {
        if (x.date < a || x.date > b) continue;
        holidayDays += x.holiday;
        leaveDays += lost(x) - x.holiday;
        if (x.hol) holidays.push({ date: x.date, name: x.hol.name, fraction: x.hol.fraction });
      }
    }
    return { weekdays, holidays, holidayDays, leaveDays, days: Math.max(0, weekdays - holidayDays - leaveDays) };
  };
  return ex;
}
