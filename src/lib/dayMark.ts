import type { DayOff } from "./expected";

/** How a day with something off reads on the Timesheet and Calendar: a short badge, the full text for hover and
 *  the list under the grid, and which tint to use ("hol" a public holiday, "pto" time off; a holiday wins). */
export type DayMark = { kind: "hol" | "pto"; short: string; long: string };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function dayMark(o: DayOff | null | undefined): DayMark | null {
  if (!o || (!o.holiday && !o.leave)) return null;
  const parts: string[] = [];
  if (o.holiday) parts.push(`${o.holiday.name}, public holiday${o.holiday.fraction < 1 ? " (half day)" : ""}`);
  if (o.leave) parts.push(`${o.leave.label}${o.leave.fraction < 1 ? ", half day" : ""}`);
  return {
    kind: o.holiday ? "hol" : "pto",
    short: o.holiday ? (o.holiday.fraction < 1 ? "Half holiday" : "Holiday") : clip((o.leave!.fraction < 1 ? "Half " : "") + o.leave!.label, 12),
    long: parts.join("; "),
  };
}
