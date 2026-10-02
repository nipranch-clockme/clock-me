// Brings the database structure up to date. Runs on every deploy (see "build" in package.json).
// Uses DIRECT_URL if set; otherwise turns Neon's pooled address into the direct one by dropping "-pooler" from the host.
import { execFileSync } from "node:child_process";

// On your own computer the settings live in .env; on Vercel they're already in the environment.
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  try { process.loadEnvFile(".env"); } catch { /* no .env file */ }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("\nDATABASE_URL is not set. In Vercel, add it under Settings > Environment Variables (copy it from Neon), then redeploy.\n");
  process.exit(1);
}

let direct = process.env.DIRECT_URL;
if (!direct) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace("-pooler.", ".");
    u.searchParams.delete("pgbouncer");
    direct = u.toString();
  } catch {
    direct = url;
  }
}

execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: direct } });
