// Neon gives two addresses for the same database: a "pooled" one (host contains "-pooler") for the running app,
// and a direct one for changing the database structure. People only paste one, so derive what's needed from it.

/** Address for the running app: pooled connections need Prisma's PgBouncer mode. */
export function runtimeUrl(url: string | undefined) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("-pooler.") || u.searchParams.has("pgbouncer")) return url;
    u.searchParams.set("pgbouncer", "true");
    return u.toString();
  } catch {
    return url;
  }
}
