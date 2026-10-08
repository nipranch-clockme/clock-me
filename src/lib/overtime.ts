// Overtime (OT) for one person's week, shown while a timesheet is reviewed. OT is the time logged above the week's expected
// hours (expected.ts: the weekly target less public holidays and time off). Entries are counted in the order they were worked
// (date, then start time), so the OT is whatever came after the expected hours were used up. Plain arithmetic, no database.

export type OtEntry = { id: string; date: string; startMin: number; minutes: number };
export type Overtime = {
  /** Minutes logged in the week. */
  logged: number;
  /** Minutes above the week's expected hours (0 when nothing is above, or when the person has no weekly target). */
  ot: number;
  /** For each entry that is (partly) overtime: how many of its minutes are. */
  byEntry: Map<string, number>;
};

export function weekOvertime(entries: OtEntry[], expectedMinutes: number, hasTarget = true): Overtime {
  const byEntry = new Map<string, number>();
  const logged = entries.reduce((s, e) => s + e.minutes, 0);
  if (!hasTarget) return { logged, ot: 0, byEntry };
  const cap = Math.max(0, Math.round(expectedMinutes));
  let running = 0;
  const inOrder = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin || (a.id < b.id ? -1 : 1)));
  for (const e of inOrder) {
    const before = running;
    running += e.minutes;
    const over = running - Math.max(cap, before);
    if (over > 0) byEntry.set(e.id, Math.min(e.minutes, over));
  }
  return { logged, ot: Math.max(0, logged - cap), byEntry };
}
