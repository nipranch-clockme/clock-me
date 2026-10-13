// Dates are handled as "YYYY-MM-DD" strings in UTC so a day never shifts with time zones.
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const toDate = (s: string) => new Date(s + "T00:00:00Z");
const FIRST_MS = Date.parse("0000-01-01T00:00:00Z"), LAST_MS = Date.parse("9999-12-31T23:59:59.999Z");
/** A moment's UTC date as YYYY-MM-DD. A date outside the years 0000 to 9999 is held at the nearest end, never written as "+010000-01". */
export function toStr(d: Date) {
  const t = d.getTime();
  return (t < FIRST_MS ? new Date(FIRST_MS) : t > LAST_MS ? new Date(LAST_MS) : d).toISOString().slice(0, 10);
}

/** The date n days after s (before it when n is negative), held within the years 0000 to 9999 like toStr. */
export function addDays(s: string, n: number) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + Math.max(-4e6, Math.min(4e6, n))); // about 11,000 years either way, so the Date can't overflow
  return toStr(d);
}

export const dow = (s: string) => (toDate(s).getUTCDay() + 6) % 7; // Monday = 0
export const monday = (s: string) => addDays(s, -dow(s));

// "Today" is the company's date, not the server's (Vercel servers run on UTC). getSettings() sets the zone.
let companyTimeZone = "UTC";
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}
export function setCompanyTimeZone(tz: string) {
  companyTimeZone = isTimeZone(tz) ? tz : "UTC";
}
/** The company-local calendar date of a moment in time, as YYYY-MM-DD. */
export function localDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: companyTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
/** Minutes since midnight, company time, of a moment in time. */
export function localMinutes(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: companyTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: companyTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** A real calendar date written as YYYY-MM-DD (2026-09-31 is rejected rather than rolling into October). */
export const isDateStr = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toDate(s).getTime()) && toStr(toDate(s)) === s;

export const shortDate = (s: string) => toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const longDate = (s: string) =>
  toDate(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** "Nov 5, 2018" */
export const dateWithYear = (s: string) => toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** "Oct 12 to Oct 18, 2026", or "Dec 28, 2026 to Jan 3, 2027" when the week runs into the next year. */
export function weekLabel(ws: string) {
  const we = addDays(ws, 6);
  return `${ws.slice(0, 4) === we.slice(0, 4) ? shortDate(ws) : dateWithYear(ws)} to ${dateWithYear(we)}`;
}

export function endOfMonth(ym: string) {
  const d = toDate(ym + "-01");
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return toStr(d);
}

export function addMonths(ym: string, n: number) {
  const d = toDate(ym + "-01");
  d.setUTCMonth(d.getUTCMonth() + n);
  return toStr(d).slice(0, 7);
}

export const RANGES: [string, string][] = [
  ["thisweek", "This week"],
  ["lastweek", "Last week"],
  ["thismonth", "This month"],
  ["lastmonth", "Last month"],
  ["thisquarter", "This quarter"],
  ["thisyear", "This year"],
  ["lastyear", "Last year"],
  ["all", "All time"],
  ["custom", "Custom range"],
];

export function rangeDates(range: string, from?: string, to?: string): [string, string] {
  const t = today();
  const y = +t.slice(0, 4);
  const ym = t.slice(0, 7);
  const q = Math.floor((+ym.slice(5) - 1) / 3) * 3 + 1;
  const qStart = `${y}-${String(q).padStart(2, "0")}`;
  switch (range) {
    case "thisweek": return [monday(t), addDays(monday(t), 6)];
    case "lastweek": return [addDays(monday(t), -7), addDays(monday(t), -1)];
    case "lastmonth": { const m = addMonths(ym, -1); return [m + "-01", endOfMonth(m)]; }
    case "thisquarter": return [qStart + "-01", endOfMonth(addMonths(qStart, 2))];
    case "thisyear": return [`${y}-01-01`, `${y}-12-31`];
    case "lastyear": return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case "all": return ["2000-01-01", "9999-12-31"]; // includes time planned ahead
    case "custom": return [isDateStr(from) ? from : addDays(t, -30), isDateStr(to) ? to : t];
    default: return [ym + "-01", endOfMonth(ym)];
  }
}

/** Working days (Mon to Fri) in [a, b]. */
export function workdays(a: string, b: string) {
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (dow(d) < 5) n++;
  return n;
}

/** Working days (Mon to Fri) in [a, b], counting only days before today. */
export function workdaysSoFar(a: string, b: string) {
  return workdays(a, b < today() ? b : addDays(today(), -1));
}

/** Days from a to b (0 when they're the same day). */
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5);

/** Working days (Mon to Fri) in [a, b], counting only days before today. */
export function workdayDates(a: string, b: string) {
  const end = b < today() ? b : addDays(today(), -1);
  const out: string[] = [];
  for (let d = a; d <= end; d = addDays(d, 1)) if (dow(d) < 5) out.push(d);
  return out;
}
