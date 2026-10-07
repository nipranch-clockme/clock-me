import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { DEMO_DOMAIN, isDemoEmail } from "./demoDomain";
import { addDays, dow, monday, today, toDate } from "./dates";

/**
 * Demo data: sample people, projects and a year of time, for trying the app out before real use.
 * Everything is easy to find again: demo people have an email at DEMO_DOMAIN and an employee ID that starts with DEMO-,
 * and the demo projects are listed in one record (kept in AppSecret under MANIFEST). "Remove" deletes exactly those.
 * Only existing offices, teams, clients and tags are used; nothing of those is created or changed.
 */
export { DEMO_DOMAIN, isDemoEmail };
const MANIFEST = "demo-data";
export const DEMO_PEOPLE = 30;
const BATCH = 4; // people per step, so one step stays well inside a server time limit

type Manifest = { projectIds: string[]; nextPerson: number; start: string; end: string; people: number; entries: number; done: boolean };

const readManifest = async (): Promise<Manifest | null> => {
  const row = await db.appSecret.findUnique({ where: { key: MANIFEST } });
  if (!row) return null;
  try { return JSON.parse(row.value) as Manifest; } catch { return null; }
};
const writeManifest = (m: Manifest) =>
  db.appSecret.upsert({ where: { key: MANIFEST }, update: { value: JSON.stringify(m) }, create: { key: MANIFEST, value: JSON.stringify(m) } });

export type DemoStatus = { state: "none" | "partial" | "ready"; people: number; projects: number; entries: number; done: number };

export async function demoStatus(): Promise<DemoStatus> {
  const m = await readManifest();
  const users = await db.user.findMany({ where: { email: { endsWith: "@" + DEMO_DOMAIN, mode: "insensitive" } }, select: { id: true } });
  if (!m && !users.length) return { state: "none", people: 0, projects: 0, entries: 0, done: 0 };
  const entries = await db.timeEntry.count({ where: { userId: { in: users.map((u) => u.id) } } });
  const state = m?.done ? "ready" : "partial";
  return { state, people: users.length, projects: m?.projectIds.length ?? 0, entries, done: m?.nextPerson ?? 0 };
}

// ---- repeatable randomness ---------------------------------------------------------------------
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed: string) => { let a = hash(seed) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const FIRST = ["Aarav", "Maya", "Liam", "Sofia", "Noah", "Priyanka", "Ethan", "Chloe", "Omar", "Hana", "Lucas", "Anika", "Mateo", "Zara", "Daniel", "Isha", "Felix", "Leila", "Jonas", "Tara", "Rohan", "Nadia", "Oscar", "Meera", "Hugo", "Amara", "Kabir", "Elise", "Samir", "Yuki"];
const LAST = ["Sharma", "Okafor", "Lindqvist", "Moreau", "Patel", "Haddad", "Novak", "Fernandes", "Kowalski", "Tanaka", "Silva", "Bergmann", "Rahman", "Costa", "Ivanova", "Mehta", "Walsh", "Nakamura", "Diaz", "Joshi", "Larsen", "Bianchi", "Kaur", "Evans", "Petrov", "Khan", "Romano", "Singh", "Dubois", "Ito"];
const TITLES = ["Designer", "Developer", "Engineer", "Analyst", "Coordinator", "Consultant", "QA tester", "Drafter"];
const PROJECT_NAMES = ["Mobile app refresh", "Customer portal", "Data migration", "Brand guidelines", "Annual report", "Warehouse layout", "Site survey", "Compliance audit", "Training modules", "Analytics dashboard", "Packaging redesign", "Campaign microsite", "Capacity planning", "Onboarding flow", "Tender response", "Safety review", "Equipment upgrade", "Quarterly review", "Booking system", "Signage package", "Process mapping", "Pilot rollout"];
const NOTES = ["Client review", "Drawings", "Revisions", "Model updates", "Coordination", "Handoff", "Team standup", "Planning", "Quality checks", "Site notes", "Documentation", "Design iterations", "Feedback round", "Estimates", "Status report", "Research"];
const TARGETS = [40, 40, 40, 40, 40, 40, 40, 36, 32, 20];

/** The window of time that gets filled: from the Monday about a year ago up to yesterday. */
const window = () => {
  const t = today();
  const first = addDays(t, -364);
  return { start: addDays(first, -dow(first)), end: addDays(t, -1) };
};

// ---- step 1: people and projects ----------------------------------------------------------------
export async function startDemo(): Promise<{ ok: true; people: number; projects: number } | { ok: false; error: string }> {
  if ((await readManifest()) || (await db.user.count({ where: { email: { endsWith: "@" + DEMO_DOMAIN, mode: "insensitive" } } }))) {
    return { ok: false, error: "Demo data is already added. Remove it first to start again." };
  }
  const [locations, clients, tags, templates, settings] = await Promise.all([
    db.location.findMany({ orderBy: { name: "asc" }, include: { teams: { orderBy: { name: "asc" } } } }),
    db.client.findMany({ orderBy: { name: "asc" } }),
    db.tag.findMany(),
    db.phaseTemplate.findMany({ orderBy: { name: "asc" } }),
    db.settings.findUnique({ where: { id: 1 } }),
  ]);
  if (!locations.length) return { ok: false, error: "There are no offices yet. Add an office first." };
  if (!clients.length) return { ok: false, error: "There are no clients yet. Add at least one client first." };
  if (!tags.length && settings?.requireTag !== false) return { ok: false, error: "There are no tags yet. Add at least one tag in Settings first." };

  const w = window();
  const hashPw = await bcrypt.hash(randomBytes(24).toString("hex"), 10); // nobody knows it: demo people cannot sign in
  const rnd = rng("people");
  const usedEmails = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase()));
  const people: Prisma.UserCreateManyInput[] = [];
  const nextTeam = new Map<string, number>();
  for (let i = 0; i < DEMO_PEOPLE; i++) {
    const loc = locations[i % locations.length]; // spread across every office
    const k = nextTeam.get(loc.id) ?? 0; nextTeam.set(loc.id, k + 1);
    const team = loc.teams.length ? loc.teams[k % loc.teams.length] : null; // and across that office's own teams
    const first = FIRST[i % FIRST.length], last = LAST[(i * 7 + 3) % LAST.length];
    let email = `${first}.${last}@${DEMO_DOMAIN}`.toLowerCase();
    for (let n = 2; usedEmails.has(email); n++) email = `${first}.${last}${n}@${DEMO_DOMAIN}`.toLowerCase();
    usedEmails.add(email);
    const joined = addDays(w.start, -(60 + Math.floor(rnd() * 1300)));
    people.push({
      email, name: `${first} ${last}`, title: TITLES[Math.floor(rnd() * TITLES.length)], role: "MEMBER", passwordHash: hashPw,
      locationId: loc.id, teamId: team?.id ?? null, weeklyTarget: TARGETS[Math.floor(rnd() * TARGETS.length)],
      employeeId: `DEMO-${String(i + 1).padStart(3, "0")}`, joiningDate: toDate(joined),
    });
  }

  // Projects on the clients that already exist, a few each. Phase lists come from the company's own templates.
  const target = Math.max(6, Math.min(18, clients.length * 3));
  const existing = new Set((await db.project.findMany({ select: { clientId: true, name: true } })).map((p) => p.clientId + "|" + p.name));
  const withPhases = templates.filter((t) => t.phases.length > 1);
  const phaseSets = (withPhases.length ? withPhases : templates).map((t) => t.phases);
  const prnd = rng("projects");
  const projectData: Prisma.ProjectCreateInput[] = [];
  let tries = 0;
  while (projectData.length < target && tries++ < 500) {
    const client = clients[projectData.length % clients.length];
    const name = PROJECT_NAMES[Math.floor(prnd() * PROJECT_NAMES.length)];
    if (existing.has(client.id + "|" + name)) continue;
    existing.add(client.id + "|" + name);
    const phases = phaseSets.length ? phaseSets[Math.floor(prnd() * phaseSets.length)] : ["Phase 1", "Phase 2", "Phase 3"];
    projectData.push({ name, client: { connect: { id: client.id } }, access: "PUBLIC", phases: { create: phases.map((n, sort) => ({ name: n, sort })) } });
  }
  if (!projectData.length) return { ok: false, error: "Couldn't think of new project names for your clients. Try again after renaming a project." };

  const projectIds = await db.$transaction(async (tx) => {
    await tx.user.createMany({ data: people });
    const ids: string[] = [];
    for (const data of projectData) ids.push((await tx.project.create({ data, select: { id: true } })).id);
    await tx.appSecret.create({ data: { key: MANIFEST, value: JSON.stringify({ projectIds: ids, nextPerson: 0, start: w.start, end: w.end, people: people.length, entries: 0, done: false } satisfies Manifest) } });
    return ids;
  }, { timeout: 30000 });
  return { ok: true, people: people.length, projects: projectIds.length };
}

// ---- step 2: time, a few people at a time -------------------------------------------------------
export async function addDemoTime(): Promise<{ ok: true; done: number; total: number; finished: boolean } | { ok: false; error: string }> {
  const m = await readManifest();
  if (!m) return { ok: false, error: "Start the demo data first." };
  if (m.done) return { ok: true, done: m.people, total: m.people, finished: true };
  const people = await db.user.findMany({ where: { email: { endsWith: "@" + DEMO_DOMAIN, mode: "insensitive" } }, orderBy: { employeeId: "asc" } });
  const batch = people.slice(m.nextPerson, m.nextPerson + BATCH);
  const [tags, projects, clients] = await Promise.all([
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.project.findMany({ where: { id: { in: m.projectIds } }, include: { phases: { orderBy: { sort: "asc" } } } }),
    db.client.findMany({ select: { id: true, type: true, monthlyHours: true } }),
  ]);
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  if (!projects.length) return { ok: false, error: "The demo projects are missing. Remove the demo data and add it again." };
  const clientOf = new Map(clients.map((c) => [c.id, c]));
  const byClient = new Map<string, typeof projects>();
  for (const p of projects) byClient.set(p.clientId, [...(byClient.get(p.clientId) ?? []), p]);
  const activeClients = [...byClient.keys()];

  // A few company-wide days off each year, the same for everyone.
  const hrnd = rng("holidays");
  const holidays = new Set<string>();
  for (let i = 0; i < 9; i++) holidays.add(addDays(m.start, Math.floor(hrnd() * 360)));

  // How the company's hours spread over the clients each month. A client with contracted hours gets roughly that many
  // (a little under or over); the rest goes to clients with no commitment, so contracts aren't wildly overrun.
  const totalPerWeek = people.reduce((a, p) => a + p.weeklyTarget, 0) || 1;
  const weights = (month: string) => {
    const r = rng("w" + month);
    const monthlyAll = totalPerWeek * 4.33 * 0.92;
    const want = new Map<string, number>();
    let fixed = 0;
    for (const id of activeClients) {
      const c = clientOf.get(id)!;
      if (c.type === "FIXED" && c.monthlyHours) { const h = c.monthlyHours * (0.55 + r() * 0.55); want.set(id, h / monthlyAll); fixed += h / monthlyAll; }
    }
    const floating = activeClients.filter((id) => !want.has(id));
    const scale = floating.length && fixed > 0.85 ? 0.85 / fixed : 1;
    const out: [string, number][] = [];
    for (const id of activeClients) out.push([id, want.has(id) ? want.get(id)! * scale : 0]);
    const left = 1 - [...want.values()].reduce((a, b) => a + b * scale, 0);
    for (const id of floating) out.find((o) => o[0] === id)![1] = Math.max(0, left) / floating.length;
    const sum = out.reduce((a, o) => a + o[1], 0) || 1;
    return out.map(([id, v]) => [id, v / sum] as [string, number]);
  };
  const weightCache = new Map<string, [string, number][]>();
  const clientFor = (month: string, r: number) => {
    if (!weightCache.has(month)) weightCache.set(month, weights(month));
    let x = r;
    for (const [id, v] of weightCache.get(month)!) { x -= v; if (x < 0) return id; }
    return activeClients[0];
  };

  const thisMon = monday(today());
  const entries: Prisma.TimeEntryCreateManyInput[] = [];
  const sheets: Prisma.TimesheetCreateManyInput[] = [];
  for (const u of batch) {
    const r = rng("person" + u.employeeId);
    // a few stretches of leave, and now and then a sick day
    const leave = new Set<string>();
    for (let b = 0; b < 2 + Math.floor(r() * 2); b++) { const s = addDays(m.start, Math.floor(r() * 340)); for (let d = 0; d < 3 + Math.floor(r() * 5); d++) leave.add(addDays(s, d)); }
    const perDay = u.weeklyTarget / 5;
    for (let d = m.start; d <= m.end; d = addDays(d, 1)) {
      if (dow(d) > 4 || holidays.has(d) || leave.has(d) || r() < 0.035) continue;
      if (u.joiningDate && d < u.joiningDate.toISOString().slice(0, 10)) continue;
      let left = Math.max(60, Math.round((perDay * (0.82 + r() * 0.34) * 60) / 15) * 15);
      const n = 1 + Math.floor(r() * 3);
      let t = 8 * 60 + 30 + Math.floor(r() * 4) * 15;
      for (let i = 0; i < n && left > 0; i++) {
        const cl = byClient.get(clientFor(d.slice(0, 7), r()))!;
        const p = cl[Math.floor(r() * cl.length)];
        const minutes = i === n - 1 ? left : Math.max(30, Math.round((left * (0.3 + r() * 0.4)) / 15) * 15);
        const phase = p.phases[Math.floor(r() * p.phases.length)];
        // one tag on most entries and two on about one in four (when there are two or more tags)
        const picked = tags.length ? [tags[Math.floor(r() * tags.length)].id] : [];
        if (tags.length > 1 && r() < 0.25) picked.push(tags[Math.floor(r() * tags.length)].id);
        entries.push({
          userId: u.id, projectId: p.id, phaseId: phase?.id ?? null, tagIds: [...new Set(picked)].sort(),
          date: toDate(d), startMin: t, minutes: Math.min(minutes, left), description: settings?.requireDescription === false && r() < 0.2 ? "" : NOTES[Math.floor(r() * NOTES.length)],
        });
        t += minutes + (i === 0 ? 45 : 15);
        left -= minutes;
      }
    }
    // every week that has ended is approved; the current week stays open
    for (let wk = m.start; wk < thisMon; wk = addDays(wk, 7)) sheets.push({ userId: u.id, weekStart: toDate(wk), status: "APPROVED" });
  }

  const finished = m.nextPerson + batch.length >= people.length;
  await db.$transaction(async (tx) => {
    const ids = batch.map((u) => u.id);
    // running a step twice gives the same result: these people's demo time is cleared first
    await tx.timeEntry.deleteMany({ where: { userId: { in: ids } } });
    await tx.timesheet.deleteMany({ where: { userId: { in: ids } } });
    for (let i = 0; i < entries.length; i += 2000) await tx.timeEntry.createMany({ data: entries.slice(i, i + 2000) });
    await tx.timesheet.createMany({ data: sheets, skipDuplicates: true });
    await tx.appSecret.update({ where: { key: MANIFEST }, data: { value: JSON.stringify({ ...m, nextPerson: m.nextPerson + batch.length, entries: m.entries + entries.length, done: finished } satisfies Manifest) } });
  }, { timeout: 60000, maxWait: 15000 });

  if (finished) {
    // Budgets follow from the hours logged, so the bars on the Projects page show a mix of early, on track and over budget.
    const sums = await db.timeEntry.groupBy({ by: ["projectId"], where: { projectId: { in: m.projectIds } }, _sum: { minutes: true } });
    const br = rng("budgets");
    for (const s of sums) {
      const use = 0.5 + br() * 0.6;
      await db.project.update({ where: { id: s.projectId }, data: { budgetHours: Math.max(100, Math.round((((s._sum.minutes ?? 0) / 60) / use) / 50) * 50) } });
    }
  }
  return { ok: true, done: Math.min(people.length, m.nextPerson + batch.length), total: people.length, finished };
}

// ---- removing it all ----------------------------------------------------------------------------
export async function removeDemo(): Promise<{ people: number; projects: number; entries: number }> {
  const m = await readManifest();
  const users = await db.user.findMany({ where: { email: { endsWith: "@" + DEMO_DOMAIN, mode: "insensitive" } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const projectIds = m?.projectIds ?? [];
  // people first (their time, timesheets and project links go with them), then any time others logged on demo projects, then the projects
  const entries = await db.timeEntry.count({ where: { OR: [{ userId: { in: userIds } }, { projectId: { in: projectIds } }] } });
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  if (projectIds.length) {
    await db.timeEntry.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
  }
  await db.appSecret.deleteMany({ where: { key: MANIFEST } });
  return { people: userIds.length, projects: projectIds.length, entries };
}
