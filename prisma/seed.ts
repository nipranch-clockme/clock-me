/**
 * Seeds the database.
 *   npm run db:seed                      -> settings, tags, templates and one admin (ADMIN_EMAIL / ADMIN_PASSWORD)
 *   (On a live site you don't need this: the first visit opens a setup page that creates the admin.)
 *   SAMPLE_DATA=1 npm run db:seed        -> also a sample company with two offices and 21 months of time
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureDefaults } from "../src/lib/defaults";

const db = new PrismaClient();
const toDate = (s: string) => new Date(s + "T00:00:00Z");
const addDays = (s: string, n: number) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (s: string) => (toDate(s).getUTCDay() + 6) % 7;
const todayStr = new Date().toISOString().slice(0, 10);

async function main() {
  await ensureDefaults(db);

  const hq = await db.location.upsert({ where: { name: process.env.ADMIN_OFFICE || "New York" }, update: {}, create: { name: process.env.ADMIN_OFFICE || "New York" } });
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "password123";
  await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: process.env.ADMIN_NAME || "Admin", title: "Administrator", role: "ADMIN", weeklyTarget: 0, locationId: hq.id, passwordHash: await bcrypt.hash(adminPassword, 10) },
  });
  console.log(`Admin login: ${adminEmail}`);

  if (process.env.SAMPLE_DATA !== "1") return;
  console.log("Adding sample company...");
  const london = await db.location.upsert({ where: { name: "London" }, update: {}, create: { name: "London" } });
  const loc: Record<string, string> = { l1: hq.id, l2: london.id };
  const teamIds: Record<string, string> = {};
  for (const [name, l] of [["Design", "l1"], ["Design", "l2"], ["Engineering", "l1"], ["Engineering", "l2"], ["Operations", "l1"], ["Operations", "l2"]]) {
    const t = await db.team.upsert({ where: { name_locationId: { name, locationId: loc[l] } }, update: {}, create: { name, locationId: loc[l] } });
    teamIds[name + "|" + l] = t.id;
  }
  const pw = await bcrypt.hash("password123", 10);
  const people: [string, string, string, string, string, Role][] = [
    ["priya", "Priya Raman", "Product designer", "Design", "l1", "MEMBER"],
    ["tom", "Tom Becker", "Visual designer", "Design", "l2", "MEMBER"],
    ["lina", "Lina Park", "UX researcher", "Design", "l1", "MEMBER"],
    ["marcus", "Marcus Lee", "Developer", "Engineering", "l1", "MEMBER"],
    ["elena", "Elena Costa", "Developer", "Engineering", "l2", "MEMBER"],
    ["jonas", "Jonas Weber", "Developer", "Engineering", "l2", "MEMBER"],
    ["mei", "Mei Tanaka", "QA engineer", "Engineering", "l1", "MEMBER"],
    ["daniel", "Daniel Okafor", "Design lead", "Design", "l1", "LEADER"],
    ["aisha", "Aisha Khan", "Engineering lead", "Engineering", "l2", "LEADER"],
    ["rosa", "Rosa Alvarez", "Project manager", "Engineering", "l1", "PM"],
    ["oliver", "Oliver Grant", "Office manager", "Operations", "l2", "LOCATION"],
  ];
  const users: Record<string, { id: string; team: string }> = {};
  for (const [key, name, title, team, l, role] of people) {
    const u = await db.user.upsert({
      where: { email: `${key}@example.com` },
      update: {},
      create: { email: `${key}@example.com`, name, title, role, locationId: loc[l], teamId: teamIds[team + "|" + l], passwordHash: pw },
    });
    users[key] = { id: u.id, team };
  }
  await db.location.update({ where: { id: london.id }, data: { managerId: users.oliver.id } });

  const clientDefs: [string, string][] = [["Northwind Logistics", "s1"], ["Bluebird Health", "s2"], ["Harbor & Co", "s3"], ["Internal", "s4"]];
  const clients: Record<string, string> = {};
  for (const [name, color] of clientDefs) clients[name] = (await db.client.upsert({ where: { name }, update: {}, create: { name, color } })).id;
  const product = ["Discovery", "Design", "Build", "Launch", "Support"];
  const projDefs: { name: string; client: string; budget: number | null; phases: string[]; managers: string[]; restricted?: { teams: string[]; users: string[] } }[] = [
    { name: "Driver app redesign", client: "Northwind Logistics", budget: 7000, phases: product, managers: ["rosa"] },
    { name: "Route dashboard", client: "Northwind Logistics", budget: 4000, phases: product, managers: ["aisha"] },
    { name: "Patient portal", client: "Bluebird Health", budget: 6600, phases: product, managers: ["rosa"], restricted: { teams: ["Design|l1", "Engineering|l1", "Engineering|l2"], users: ["daniel", "aisha"] } },
    { name: "Brand refresh", client: "Bluebird Health", budget: 3200, phases: ["Research", "Concept", "Refinement", "Delivery"], managers: ["daniel"], restricted: { teams: [], users: ["priya", "tom", "daniel"] } },
    { name: "Website rebuild", client: "Harbor & Co", budget: 6500, phases: ["Discovery", "Wireframes", "Visual design", "Development", "Launch"], managers: ["rosa"] },
    { name: "Admin and meetings", client: "Internal", budget: null, phases: ["Ongoing"], managers: [] },
    { name: "Training", client: "Internal", budget: null, phases: ["Ongoing"], managers: [] },
  ];
  const projects: { id: string; name: string; phaseIds: string[] }[] = [];
  for (const p of projDefs) {
    const existing = await db.project.findUnique({ where: { clientId_name: { clientId: clients[p.client], name: p.name } }, include: { phases: true } });
    if (existing) { projects.push({ id: existing.id, name: p.name, phaseIds: existing.phases.map((x) => x.id) }); continue; }
    const created = await db.project.create({
      data: {
        name: p.name, clientId: clients[p.client], budgetHours: p.budget, access: p.restricted ? "RESTRICTED" : "PUBLIC",
        phases: { create: p.phases.map((name, sort) => ({ name, sort })) },
        managers: { create: p.managers.map((k) => ({ userId: users[k].id })) },
        teams: { create: (p.restricted?.teams ?? []).map((k) => ({ teamId: teamIds[k] })) },
        users: { create: (p.restricted?.users ?? []).map((k) => ({ userId: users[k].id })) },
      },
      include: { phases: true },
    });
    projects.push({ id: created.id, name: p.name, phaseIds: created.phases.map((x) => x.id) });
  }
  if (await db.timeEntry.count()) { console.log("Time entries already exist, skipping."); return; }

  const tags = Object.fromEntries((await db.tag.findMany()).map((t) => [t.name, t.id]));
  const byName = Object.fromEntries(projects.map((p) => [p.name, p]));
  const mix: Record<string, string[]> = {
    Design: ["Driver app redesign", "Patient portal", "Brand refresh", "Website rebuild", "Admin and meetings"],
    Engineering: ["Driver app redesign", "Route dashboard", "Patient portal", "Website rebuild", "Admin and meetings", "Training"],
    Operations: ["Admin and meetings", "Training"],
  };
  const tagMix: Record<string, string[]> = { Design: ["Design", "Research", "Meetings"], Engineering: ["Development", "QA", "Meetings"], Operations: ["Admin", "Meetings", "Courses"] };
  const notes = ["Client review", "Sprint work", "Bug fixes", "Workshop", "Prototype", "Handoff", "Team standup", "Planning"];
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const rows: import("@prisma/client").Prisma.TimeEntryCreateManyInput[] = [];
  const thisMon = addDays(todayStr, -dow(todayStr));
  for (const key of Object.keys(users)) {
    const u = users[key];
    const pool = mix[u.team].filter((n) => !(n === "Brand refresh" && !["priya", "tom", "daniel"].includes(key)));
    for (let d = "2025-01-06"; d < todayStr; d = addDays(d, 1)) {
      if (dow(d) > 4 || rnd() < 0.045) continue;
      let t = 8 * 60 + 30 + Math.floor(rnd() * 4) * 15;
      let left = (7 + Math.round(rnd() * 4) / 2) * 60;
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n && left > 0; i++) {
        const p = byName[pick(pool)];
        const minutes = i === n - 1 ? left : Math.max(30, Math.round((left * (0.3 + rnd() * 0.4)) / 15) * 15);
        rows.push({ userId: u.id, projectId: p.id, phaseId: pick(p.phaseIds), tagId: tags[pick(tagMix[u.team])], date: toDate(d), startMin: t, minutes, description: rnd() < 0.95 ? pick(notes) : "" });
        t += minutes + (i === 0 ? 45 : 15);
        left -= minutes;
      }
    }
    for (let w = "2025-01-06"; w < thisMon; w = addDays(w, 7)) {
      const last = w === addDays(thisMon, -7);
      const status = last && ["tom", "lina", "elena", "mei"].includes(key) ? "SUBMITTED" : last && key === "jonas" ? "DRAFT" : "APPROVED";
      await db.timesheet.upsert({ where: { userId_weekStart: { userId: u.id, weekStart: toDate(w) } }, update: {}, create: { userId: u.id, weekStart: toDate(w), status } });
    }
  }
  for (let i = 0; i < rows.length; i += 2000) await db.timeEntry.createMany({ data: rows.slice(i, i + 2000) });
  await db.settings.update({ where: { id: 1 }, data: { lockBefore: toDate(addDays(thisMon, -15)) } });
  console.log(`Added ${rows.length} time entries. Sample logins use password "password123", e.g. priya@example.com, daniel@example.com, oliver@example.com.`);
}

main().finally(() => db.$disconnect());
