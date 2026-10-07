import { dow, DAYS, shortDate } from "@/lib/dates";
import type { DayMark } from "@/lib/dayMark";

/** The days of the shown week that have a public holiday or time off, in words. On a phone this is the only place the full
 *  text can be read (a badge's hover text does not show on touch). Shows nothing for a week with none. */
export default function DayOffList({ dates, marks }: { dates: string[]; marks: (DayMark | null)[] }) {
  const list = dates.flatMap((d, i) => (marks[i] ? [{ d, m: marks[i]! }] : []));
  if (!list.length) return null;
  return (
    <ul className="note dayoffs" aria-label="Days off this week">
      {list.map(({ d, m }) => <li key={d}><span className={"dmark " + m.kind}>{m.short}</span>{DAYS[dow(d)]} {shortDate(d)}: {m.long}</li>)}
    </ul>
  );
}
