export type TimeFormat = "decimal" | "hhmm";

export function fmtHours(minutes: number, format: TimeFormat) {
  if (format === "hhmm") {
    const m = Math.round(minutes);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  }
  return (minutes / 60).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/** Accepts "1.5", "1:30", "1h 30m", "90m". Returns minutes, or NaN. */
export function parseDuration(v: string): number {
  v = String(v ?? "").trim();
  if (!v) return NaN;
  let m = v.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = v.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/i);
  if (m && (m[1] || m[2])) return Math.round((+(m[1] || 0)) * 60 + +(m[2] || 0));
  const n = Number(v);
  return isNaN(n) ? NaN : Math.round(n * 60);
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
