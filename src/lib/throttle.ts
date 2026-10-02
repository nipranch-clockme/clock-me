import { headers } from "next/headers";
import { db } from "./db";

const WINDOW_MS = 15 * 60_000;

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** True when any key has reached its limit of recent attempts. */
export async function overLimit(limits: [key: string, max: number][]) {
  const since = new Date(Date.now() - WINDOW_MS);
  for (const [key, max] of limits) if ((await db.authAttempt.count({ where: { key, at: { gt: since } } })) >= max) return true;
  return false;
}

export async function recordAttempt(...keys: string[]) {
  await db.authAttempt.createMany({ data: keys.map((key) => ({ key })) });
  // Keep the table small: forget anything older than a day.
  await db.authAttempt.deleteMany({ where: { at: { lt: new Date(Date.now() - 24 * 3600_000) } } });
}

export async function clearAttempts(key: string) {
  await db.authAttempt.deleteMany({ where: { key } });
}
