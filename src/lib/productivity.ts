import { addDays, endOfMonth, today, workdays, workdaysSoFar } from "./dates";
import { trackingStarts } from "./startDates";

// Targets are spread over Monday to Friday and only count complete days (up to yesterday), so hours and targets cover
// the same days. Used for productivity on the Dashboard and for contract pace on the Clients tab.

/** The last complete day up to b: b itself, or yesterday if b hasn't passed yet. */
export function completeEnd(b: string) {
  const y = addDays(today(), -1);
  return b < y ? b : y;
}

/** Returns each person's target minutes between two dates: their weekly target spread over Monday to Friday, up to
 *  yesterday, from the day they started (see trackingStarts). Productivity is hours logged divided by this. */
export async function targetMinutes(users: { id: string; createdAt: Date }[]) {
  const starts = await trackingStarts(users);
  return (u: { id: string; weeklyTarget: number }, from: string, to: string) => {
    const st = starts.get(u.id) ?? from;
    return (u.weeklyTarget / 5) * workdaysSoFar(st > from ? st : from, to) * 60;
  };
}

/** How much of a month's working days (Mon to Fri) are over, up to yesterday: 0 before its first one ends, 1 once it's over. */
export function monthDone(ym: string) {
  const a = ym + "-01", b = endOfMonth(ym), all = workdays(a, b);
  return all ? workdaysSoFar(a, b) / all : 1;
}
