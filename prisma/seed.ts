/**
 * Seeds the database.
 *   npm run db:seed                      -> settings, tags, templates and one admin (ADMIN_EMAIL / ADMIN_PASSWORD)
 *   (On a live site you don't need this: the first visit opens a setup page that creates the admin.)
 *   SAMPLE_DATA=1 npm run db:seed        -> also a sample company with five offices, named teams and 21 months of time
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

  const sample = process.env.SAMPLE_DATA === "1";
  const hqName = sample ? "AMD" : process.env.ADMIN_OFFICE || "New York";
  const hq = await db.location.upsert({ where: { name: hqName }, update: {}, create: { name: hqName } });
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "password123";
  await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: process.env.ADMIN_NAME || (sample ? "Sam Rivera" : "Admin"), title: sample ? "Operations admin" : "Administrator", role: "ADMIN", weeklyTarget: sample ? 40 : 0, locationId: hq.id, passwordHash: await bcrypt.hash(adminPassword, 10) },
  });
  console.log(`Admin login: ${adminEmail}`);

  if (!sample) return;
  console.log("Adding sample company...");
  // Five offices. AMD is the head office. Each has its own location manager.
  const officeNames: Record<string, string> = { l1: "AMD", l2: "PNQ", l3: "KLH", l4: "NAG", l5: "SSE" };
  const loc: Record<string, string> = { l1: hq.id };
  for (const [k, name] of Object.entries(officeNames)) if (k !== "l1") loc[k] = (await db.location.upsert({ where: { name }, update: {}, create: { name } })).id;

  // Teams per office, some named after superheroes. The department decides which projects and tags the people mostly use.
  const DEPT: Record<string, string> = { Hulk: "Design", Flash: "Design", "Black Panther": "Design", Batman: "Engineering", Ironman: "Engineering", Spiderman: "Engineering", Superman: "Engineering", Operations: "Operations" };
  const teamDefs: [string, string][] = [["Hulk", "l1"], ["Batman", "l1"], ["Operations", "l1"], ["Ironman", "l2"], ["Spiderman", "l2"], ["Operations", "l2"], ["Flash", "l3"], ["Operations", "l3"], ["Superman", "l4"], ["Operations", "l4"], ["Black Panther", "l5"], ["Operations", "l5"]];
  const teamIds: Record<string, string> = {};
  for (const [name, l] of teamDefs) {
    const t = await db.team.upsert({ where: { name_locationId: { name, locationId: loc[l] } }, update: {}, create: { name, locationId: loc[l] } });
    teamIds[name + "|" + l] = t.id;
  }
  const pw = await bcrypt.hash("password123", 10);
  // [key, name, title, team, office, role, joined]. Employee IDs follow joining order (the admin, Sam, is CM-0001).
  const people: [string, string, string, string, string, Role, string][] = [
    ["priya", "Priya Raman", "Product designer", "Hulk", "l1", "MEMBER", "2022-01-10"],
    ["tom", "Tom Becker", "Visual designer", "Flash", "l3", "MEMBER", "2022-08-29"],
    ["lina", "Lina Park", "UX researcher", "Hulk", "l1", "MEMBER", "2024-04-08"],
    ["marcus", "Marcus Lee", "Developer", "Batman", "l1", "MEMBER", "2023-05-15"],
    ["elena", "Elena Costa", "Developer", "Ironman", "l2", "MEMBER", "2023-11-06"],
    ["jonas", "Jonas Weber", "Developer", "Black Panther", "l5", "MEMBER", "2021-03-12"],
    ["mei", "Mei Tanaka", "QA engineer", "Superman", "l4", "MEMBER", "2024-10-21"],
    ["arjun", "Arjun Mehta", "Developer", "Batman", "l1", "MEMBER", "2024-11-18"],
    ["grace", "Grace Holloway", "QA engineer", "Spiderman", "l2", "MEMBER", "2024-12-09"],
    ["sofia", "Sofia Rossi", "Product designer", "Flash", "l3", "LEADER", "2024-11-25"],
    ["kenji", "Kenji Sato", "Developer", "Superman", "l4", "LEADER", "2024-12-02"],
    ["leo", "Leo Martins", "Visual designer", "Black Panther", "l5", "LEADER", "2024-12-16"],
    ["daniel", "Daniel Okafor", "Design lead", "Hulk", "l1", "LEADER", "2019-09-02"],
    ["aisha", "Aisha Khan", "Engineering lead", "Ironman", "l2", "LEADER", "2021-02-01"],
    ["rosa", "Rosa Alvarez", "Team/Project manager", "Batman", "l1", "LEADER", "2020-06-22"],
    ["oliver", "Oliver Grant", "Office manager", "Operations", "l2", "LOCATION", "2019-04-15"],
    ["ravi", "Ravi Desai", "Office manager", "Operations", "l3", "LOCATION", "2024-10-28"],
    ["neha", "Neha Kulkarni", "Office manager", "Operations", "l4", "LOCATION", "2024-11-04"],
    ["fatima", "Fatima Noor", "Office manager", "Operations", "l5", "LOCATION", "2024-11-11"],
  ];
  const eidOrder = ["admin", ...[...people].sort((x, y) => x[6].localeCompare(y[6])).map((x) => x[0])].filter((k) => k !== "admin");
  // Sam (the admin) joined first, so everyone else is numbered after Sam in joining order.
  const eid = (key: string) => `CM-${String(eidOrder.indexOf(key) + 2).padStart(4, "0")}`;
  await db.user.updateMany({ where: { email: adminEmail, employeeId: null }, data: { employeeId: "CM-0001", joiningDate: toDate("2018-11-05"), teamId: teamIds["Operations|l1"] } });
  const users: Record<string, { id: string; team: string; loc: string }> = {};
  for (const [key, name, title, team, l, role, joined] of people) {
    const u = await db.user.upsert({
      where: { email: `${key}@example.com` },
      update: {},
      create: { email: `${key}@example.com`, name, title, role, locationId: loc[l], teamId: teamIds[team + "|" + l], passwordHash: pw, employeeId: eid(key), joiningDate: toDate(joined) },
    });
    users[key] = { id: u.id, team, loc: l };
  }
  for (const [l, key] of [["l2", "oliver"], ["l3", "ravi"], ["l4", "neha"], ["l5", "fatima"]]) await db.location.update({ where: { id: loc[l] }, data: { managerId: users[key].id } });

  // Two clients with a fixed number of hours each month, two with no commitment. Each has a team and contacts.
  const clientDefs: { name: string; color: string; monthly: number | null; team: string; contacts: [string, string, string][] }[] = [
    { name: "Northwind Logistics", color: "s1", monthly: 300, team: "Batman|l1", contacts: [["Meera Joshi", "meera.joshi@northwind.example", "+91 98765 43210"], ["Anil Kapoor", "anil.kapoor@northwind.example", ""]] },
    { name: "Bluebird Health", color: "s2", monthly: 200, team: "Hulk|l1", contacts: [["Dr. Kavita Rao", "kavita.rao@bluebird.example", "+91 98200 11122"]] },
    { name: "Harbor & Co", color: "s3", monthly: null, team: "Ironman|l2", contacts: [["Vikram Shah", "vikram@harborco.example", ""], ["Pooja Nair", "pooja@harborco.example", "+91 99887 76655"]] },
    { name: "Internal", color: "s4", monthly: null, team: "", contacts: [] },
  ];
  const clients: Record<string, string> = {};
  for (const c of clientDefs) {
    const row = await db.client.upsert({
      where: { name: c.name }, update: {},
      create: { name: c.name, color: c.color, type: c.monthly ? "FIXED" : "FLOATING", monthlyHours: c.monthly, teamId: c.team ? teamIds[c.team] : null, contacts: { create: c.contacts.map(([name, email, phone], sort) => ({ name, email, phone, sort })) } },
    });
    clients[c.name] = row.id;
  }
  // Every client project goes through five submissions; internal work has the one phase "Ongoing".
  const subs = ["Submission 1", "Submission 2", "Submission 3", "Submission 4", "Submission 5"];
  const projDefs: { name: string; client: string; use: number; phases: string[]; managers: string[]; restricted?: { teams: string[]; users: string[] } }[] = [
    { name: "Driver app redesign", client: "Northwind Logistics", use: 0.74, phases: subs, managers: ["rosa"] },
    { name: "Route dashboard", client: "Northwind Logistics", use: 0.61, phases: subs, managers: ["aisha"] },
    { name: "Patient portal", client: "Bluebird Health", use: 0.88, phases: subs, managers: ["rosa"], restricted: { teams: ["Hulk|l1", "Batman|l1", "Ironman|l2"], users: ["daniel", "aisha"] } },
    { name: "Brand refresh", client: "Bluebird Health", use: 0.67, phases: subs, managers: ["daniel"], restricted: { teams: [], users: ["priya", "tom", "daniel"] } },
    { name: "Website rebuild", client: "Harbor & Co", use: 0.93, phases: subs, managers: ["rosa"] },
    { name: "Admin and meetings", client: "Internal", use: 0, phases: ["Ongoing"], managers: [] },
    { name: "Training", client: "Internal", use: 0, phases: ["Ongoing"], managers: [] },
  ];
  const projects: { id: string; name: string; use: number; phaseIds: string[] }[] = [];
  for (const p of projDefs) {
    const existing = await db.project.findUnique({ where: { clientId_name: { clientId: clients[p.client], name: p.name } }, include: { phases: true } });
    if (existing) { projects.push({ id: existing.id, name: p.name, use: p.use, phaseIds: existing.phases.map((x) => x.id) }); continue; }
    const created = await db.project.create({
      data: {
        name: p.name, clientId: clients[p.client], access: p.restricted ? "RESTRICTED" : "PUBLIC",
        phases: { create: p.phases.map((name, sort) => ({ name, sort })) },
        managers: { create: p.managers.map((k) => ({ userId: users[k].id })) },
        teams: { create: (p.restricted?.teams ?? []).map((k) => ({ teamId: teamIds[k] })) },
        users: { create: (p.restricted?.users ?? []).map((k) => ({ userId: users[k].id })) },
      },
      include: { phases: true },
    });
    projects.push({ id: created.id, name: p.name, use: p.use, phaseIds: created.phases.map((x) => x.id) });
  }
  if (await db.timeEntry.count()) { console.log("Time entries already exist, skipping."); return; }

  const tags = Object.fromEntries((await db.tag.findMany()).map((t) => [t.name, t.id]));
  const byName = Object.fromEntries(projects.map((p) => [p.name, p]));
  const mix: Record<string, string[]> = {
    Design: ["Driver app redesign", "Patient portal", "Brand refresh", "Website rebuild", "Admin and meetings"],
    Engineering: ["Driver app redesign", "Route dashboard", "Patient portal", "Website rebuild", "Admin and meetings", "Training"],
    Operations: ["Admin and meetings", "Training"],
  };
  // Designers mostly draw in CAD and Revit, engineers mostly do ENG.
  const tagMix: Record<string, [string, number][]> = {
    Design: [["CAD", 0.45], ["ENG", 0.1], ["Revit", 0.45]], Engineering: [["CAD", 0.3], ["ENG", 0.55], ["Revit", 0.15]], Operations: [["CAD", 0.35], ["ENG", 0.35], ["Revit", 0.3]],
  };
  // Offices differ a little: KLH and NAG log a bit less, PNQ a bit more (extra: hours a day, off: share of workdays with no time).
  const OFF: Record<string, { extra: number; off: number }> = { l1: { extra: 0, off: 0.045 }, l2: { extra: 0.25, off: 0.03 }, l3: { extra: -0.5, off: 0.07 }, l4: { extra: -0.25, off: 0.055 }, l5: { extra: 0, off: 0.04 } };
  const notes = ["Client review", "Drawings", "Revisions", "Model updates", "Coordination", "Handoff", "Team standup", "Planning"];
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const pickW = (a: [string, number][]) => { let r = rnd(); for (const [v, w] of a) { r -= w; if (r < 0) return v; } return a[a.length - 1][0]; };
  const rows: import("@prisma/client").Prisma.TimeEntryCreateManyInput[] = [];
  const thisMon = addDays(todayStr, -dow(todayStr));
  const start = (() => { const d = toDate(todayStr); d.setUTCMonth(d.getUTCMonth() - 21); const s2 = d.toISOString().slice(0, 10); return addDays(s2, -dow(s2)); })(); // the Monday about 21 months ago
  const minutesPerProject: Record<string, number> = {};
  const lastWeekSubmitted = ["tom", "lina", "elena", "mei", "grace", "arjun"];
  for (const key of [...people.map((x) => x[0])]) {
    const u = users[key], dept = DEPT[u.team], o = OFF[u.loc];
    const pool = mix[dept].filter((n) => !(n === "Brand refresh" && !["priya", "tom", "daniel"].includes(key)) && !(n === "Patient portal" && !["daniel", "aisha"].includes(key) && !["Hulk|l1", "Batman|l1", "Ironman|l2"].includes(u.team + "|" + u.loc)));
    for (let d = start; d < todayStr; d = addDays(d, 1)) {
      if (dow(d) > 4 || rnd() < o.off) continue;
      let t = 8 * 60 + 30 + Math.floor(rnd() * 4) * 15;
      let left = Math.max(4, 7 + o.extra + Math.round(rnd() * 4) / 2) * 60;
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n && left > 0; i++) {
        const p = byName[pick(pool)];
        const minutes = i === n - 1 ? left : Math.max(30, Math.round((left * (0.3 + rnd() * 0.4)) / 15) * 15);
        const entryTags = [tags[pickW(tagMix[dept])]];
        if (rnd() < 0.2) entryTags.push(tags[pickW(tagMix[dept])]); // some work carries two tags
        rows.push({ userId: u.id, projectId: p.id, phaseId: pick(p.phaseIds), tagIds: [...new Set(entryTags)].sort(), date: toDate(d), startMin: t, minutes, description: rnd() < 0.95 ? pick(notes) : "" });
        minutesPerProject[p.id] = (minutesPerProject[p.id] || 0) + minutes;
        t += minutes + (i === 0 ? 45 : 15);
        left -= minutes;
      }
    }
    for (let w = start; w < thisMon; w = addDays(w, 7)) {
      const last = w === addDays(thisMon, -7);
      const status = last && lastWeekSubmitted.includes(key) ? "SUBMITTED" : last && key === "jonas" ? "DRAFT" : "APPROVED";
      await db.timesheet.upsert({ where: { userId_weekStart: { userId: u.id, weekStart: toDate(w) } }, update: {}, create: { userId: u.id, weekStart: toDate(w), status } });
    }
  }
  for (let i = 0; i < rows.length; i += 2000) await db.timeEntry.createMany({ data: rows.slice(i, i + 2000) });
  // Budgets follow from the hours logged: the share of the budget used so far is what each project is meant to show.
  for (const p of projects) if (p.use > 0) await db.project.update({ where: { id: p.id }, data: { budgetHours: Math.round(((minutesPerProject[p.id] || 0) / 60 / p.use) / 50) * 50 } });
  await db.settings.update({ where: { id: 1 }, data: { lockBefore: toDate(addDays(thisMon, -15)) } });
  console.log(`Added ${rows.length} time entries. Sample logins use password "password123", e.g. priya@example.com, daniel@example.com, oliver@example.com.`);
}

main().finally(() => db.$disconnect());
