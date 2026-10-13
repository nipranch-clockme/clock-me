export type TimeFormat = "decimal" | "hhmm";

export function fmtHours(minutes: number, format: TimeFormat) {
  if (format === "hhmm") {
    const m = Math.round(minutes);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  }
  return (minutes / 60).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/** The longest description a time entry or a running timer may have. Kept here (not in entries.ts) so forms in the browser can use it. */
export const DESCRIPTION_MAX = 500;

/** Accepts "1.5", ".5", "1:30", "1h 30m", "1.5h", "90m". Minutes after a colon or after hours must be under 60. Returns minutes, or NaN. */
export function parseDuration(v: string): number {
  v = String(v ?? "").trim();
  if (!v) return NaN;
  let m = v.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN;
  m = v.match(/^(?:(\d+(?:\.\d*)?|\.\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
  if (m && (m[1] || m[2])) return m[1] && m[2] && +m[2] >= 60 ? NaN : Math.round(+(m[1] || 0) * 60 + +(m[2] || 0));
  // Plain decimal hours only: no signs, exponents, hex or binary.
  m = v.match(/^(\d+(?:\.\d*)?|\.\d+)$/);
  return m ? Math.round(+m[1] * 60) : NaN;
}

/** True when a duration is written as hours and minutes (1:75, 2h 90m) with 60 or more minutes. */
export const hasOverlongMinutes = (v: string) => {
  const m = String(v ?? "").trim().match(/^\d+:(\d+)$|^(?:\d+(?:\.\d*)?|\.\d+)\s*h\s*(\d+)\s*m$/i);
  return !!m && +(m[1] ?? m[2]) >= 60;
};

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** A round gap between chart gridlines that gives at most five of them up to max. */
export const niceStep = (max: number) => [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000].find((s) => max / s <= 5) ?? 100000;
