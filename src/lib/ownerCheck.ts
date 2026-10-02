import { createHash, timingSafeEqual } from "crypto";

/**
 * The first-run setup page asks for the database connection string to prove the visitor is the person who deployed
 * the site (only they can see it in Neon or Vercel). Returns null when the database has no password (local development).
 */
export function databasePassword(): string | null {
  try {
    const p = new URL(process.env.DATABASE_URL ?? "").password;
    return p ? decodeURIComponent(p) : null;
  } catch {
    return null;
  }
}

/** True when `pasted` (a full connection string, or just its password) matches this site's database password. */
export function matchesDatabasePassword(pasted: string): boolean {
  const expected = databasePassword();
  if (!expected) return true;
  let given = pasted.trim();
  try {
    const p = new URL(given).password;
    if (p) given = decodeURIComponent(p);
  } catch { /* not a URL: treat it as the password itself */ }
  const a = createHash("sha256").update(given).digest(), b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
