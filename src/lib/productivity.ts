import { addDays, endOfMonth, today, workdays, workdaysSoFar } from "./dates";
import { loadExpected } from "./timeoff";

// Targets are spread over Monday to Friday, less public holidays and time off, and only count complete days (up to
// yesterday), so hours and targets cover the same days. Used for productivity on the Dashboard; the contract pace on the
// Clients tab is company-wide and stays plain Monday to Friday (monthDone).

/** The last complete day up to b: b itself, or yesterday if b hasn't passed yet. */
export function completeEnd(b: string) {
  const y = addDays(today(), -1);
  return b < y ? b : y;
}

/** Returns each person's target minutes between two dates: their weekly target spread over Monday to Friday, less their
 *  office's public holidays and their time off, up to yesterday, from the day they started (see trackingStarts and
 *  expected.ts). Productivity is hours logged divided by this. */
export async function targetMinutes(users: { id: string; locationId: string; createdAt: Date }[]) {
  const ex = await loadExpected(users);
  return (u: { id: string; locationId: string; weeklyTarget: number }, from: string, to: string) => ex(u, from, to);
}

/** How much of a month's working days (Mon to Fri) are over, up to yesterday: 0 before its first one ends, 1 once it's over. */
export function monthDone(ym: string) {
  const a = ym + "-01", b = endOfMonth(ym), all = workdays(a, b);
  return all ? workdaysSoFar(a, b) / all : 1;
}
