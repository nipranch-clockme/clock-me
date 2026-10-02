import { db } from "./db";
import { localDate, toStr } from "./dates";

/**
 * The first day each person counts toward targets and missing-time checks: the day their account was made,
 * or the date of their earliest entry if older time was imported. Days before that aren't held against them.
 */
export async function trackingStarts(users: { id: string; createdAt: Date }[]) {
  const firsts = users.length
    ? await db.timeEntry.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) } }, _min: { date: true } })
    : [];
  const first = new Map(firsts.map((f) => [f.userId, f._min.date ? toStr(f._min.date) : null]));
  return new Map(users.map((u) => {
    const joined = localDate(u.createdAt), f = first.get(u.id);
    return [u.id, f && f < joined ? f : joined];
  }));
}
