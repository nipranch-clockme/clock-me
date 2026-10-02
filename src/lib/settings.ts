import { cache } from "react";
import { db } from "./db";
import { toStr } from "./dates";

export const getSettings = cache(async () => {
  const s = (await db.settings.findUnique({ where: { id: 1 } })) ?? (await db.settings.create({ data: { id: 1 } }));
  return { ...s, lockBeforeStr: s.lockBefore ? toStr(s.lockBefore) : null, timeFormat: (s.timeFormat === "hhmm" ? "hhmm" : "decimal") as "decimal" | "hhmm" };
});
export type AppSettings = Awaited<ReturnType<typeof getSettings>>;

export async function logAction(userId: string, action: string) {
  await db.auditLog.create({ data: { userId, action } });
}
