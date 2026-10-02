import { cache } from "react";
import { db } from "./db";
import { setCompanyTimeZone, toStr } from "./dates";

export const getSettings = cache(async () => {
  const s = (await db.settings.findUnique({ where: { id: 1 } })) ?? (await db.settings.create({ data: { id: 1 } }));
  setCompanyTimeZone(s.timeZone);
  return { ...s, lockBeforeStr: s.lockBefore ? toStr(s.lockBefore) : null, timeFormat: (s.timeFormat === "hhmm" ? "hhmm" : "decimal") as "decimal" | "hhmm" };
});
export type AppSettings = Awaited<ReturnType<typeof getSettings>>;

/** Adds a line to the change log. Pass the person the action was about, so their managers can see it. */
export async function logAction(userId: string, action: string, targetUserId?: string | null) {
  await db.auditLog.create({ data: { userId, action, targetUserId: targetUserId ?? null } });
}
