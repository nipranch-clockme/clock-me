// Dates are handled as "YYYY-MM-DD" strings in UTC so a day never shifts with time zones.
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const toDate = (s: string) => new Date(s + "T00:00:00Z");
export const toStr = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(s: string, n: number) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
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
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: companyTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** A real calendar date written as YYYY-MM-DD (2026-09-31 is rejected rather than rolling into October). */
export const isDateStr = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toDate(s).getTime()) && toStr(toDate(s)) === s;

export const shortDate = (s: string) => toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const longDate = (s: string) =>
  toDate(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const weekLabel = (ws: string) => `${shortDate(ws)} to ${shortDate(addDays(ws, 6))}`;

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
