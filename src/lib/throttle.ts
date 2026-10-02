import { headers } from "next/headers";
import { db } from "./db";

const WINDOW_MS = 15 * 60_000;

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Counts this attempt against each key and says whether it's allowed (no key over its limit in the last 15 minutes).
 * The attempt is saved before counting, so requests sent at the same moment can't all slip in under the limit.
 * Returns the saved rows' ids so a successful attempt can be taken back with releaseAttempts.
 */
export async function takeAttempt(limits: [key: string, max: number][]) {
  const rows = await db.authAttempt.createManyAndReturn({ data: limits.map(([key]) => ({ key })), select: { id: true } });
  const since = new Date(Date.now() - WINDOW_MS);
  let allowed = true;
  for (const [key, max] of limits) if ((await db.authAttempt.count({ where: { key, at: { gt: since } } })) > max) allowed = false;
  // Keep the table small: forget anything older than a day.
  await db.authAttempt.deleteMany({ where: { at: { lt: new Date(Date.now() - 24 * 3600_000) } } });
  return { allowed, ids: rows.map((r) => r.id) };
}

/** Takes back attempts that turned out fine, so they don't count toward the limit. */
export async function releaseAttempts(ids: string[]) {
  if (ids.length) await db.authAttempt.deleteMany({ where: { id: { in: ids } } });
}

export async function clearAttempts(key: string) {
  await db.authAttempt.deleteMany({ where: { key } });
}
