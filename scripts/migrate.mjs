// Brings the database structure up to date. Runs on every production deploy (see "build" in package.json).
// Uses DIRECT_URL if set; otherwise turns Neon's pooled address into the direct one by dropping "-pooler" from the host.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// Preview deploys (other branches and pull requests) share the live database, so only production deploys change it.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`Skipping database changes on a ${process.env.VERCEL_ENV} deploy.`);
  process.exit(0);
}

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

// Run Prisma's command line through Node itself, which works the same on Windows, macOS, Linux and Vercel.
const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: direct } });
