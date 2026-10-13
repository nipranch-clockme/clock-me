/**
 * Sample data: a project moves through its phases in order across the window, and is on phase `current` by today.
 * Earlier phases were used earlier on, so only the current one takes new time (see laterPhaseInUse in entries.ts).
 * `phaseIndexOn` gives the index into the project's phases, in sort order, for a date like "2026-10-13".
 */
export function phaseIndexOn(date: string, start: string, today: string, current: number): number {
  if (current <= 0) return 0;
  const at = (d: string) => Date.parse(d + "T00:00:00Z");
  const span = at(today) - at(start);
  const share = span > 0 ? Math.min(1, Math.max(0, (at(date) - at(start)) / span)) : 1;
  return Math.min(current, Math.floor(share * (current + 1)));
}
