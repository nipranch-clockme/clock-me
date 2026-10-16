import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { addDays, monday, toDate, toStr } from "./dates";
import { sortTagIds } from "./tags";
import { CLIENT_COLORS } from "./importParse";
import type { HistoryEntry, HistoryPlan } from "./historyParse";

/**
 * Settings > Import history: loads time from another tool (a Clockify detailed report), in steps the page sends one by one.
 * 1. startHistory adds the offices' missing teams, the people, clients, projects, phases and tags (anything that already
 *    exists, matched by email or name, is used as it is and never changed).
 * 2. addHistoryEntries saves the time a chunk at a time.
 * 3. finishHistory marks every week of the imported people, from their first imported week to the last one in the file, Approved.
 * What was added is listed in one record (AppSecret MANIFEST), so "Remove imported history" takes away exactly that.
 * New people get no password: they can't sign in until an admin sends them an invite.
 */
const MANIFEST = "history-import";
export const HISTORY_CHUNK = 2500; // entries per step, so one step stays well inside a server time limit

type Manifest = {
  fileKey: string; startedAt: string; from: string; to: string; total: number; chunksDone: number; entries: number; done: boolean;
  users: string[]; projects: string[]; phases: string[][]; tags: string[]; // ids by the plan's indexes
  created: { users: string[]; teams: string[]; clients: string[]; projects: string[]; phases: string[]; tags: string[]; sheets: number };
};
export type HistoryStatus = {
  state: "none" | "partial" | "ready"; fileKey: string; from: string; to: string; total: number; chunksDone: number; entries: number;
  people: number; newPeople: number; projects: number; newProjects: number; newClients: number; sheets: number;
};

const read = async (): Promise<Manifest | null> => {
  const row = await db.appSecret.findUnique({ where: { key: MANIFEST } });
  if (!row) return null;
  try { return JSON.parse(row.value) as Manifest; } catch { return null; }
};
const save = (tx: Prisma.TransactionClient | typeof db, m: Manifest) =>
  tx.appSecret.upsert({ where: { key: MANIFEST }, update: { value: JSON.stringify(m) }, create: { key: MANIFEST, value: JSON.stringify(m) } });

export async function historyStatus(): Promise<HistoryStatus> {
  const m = await read();
  if (!m) return { state: "none", fileKey: "", from: "", to: "", total: 0, chunksDone: 0, entries: 0, people: 0, newPeople: 0, projects: 0, newProjects: 0, newClients: 0, sheets: 0 };
  return {
    state: m.done ? "ready" : "partial", fileKey: m.fileKey, from: m.from, to: m.to, total: m.total, chunksDone: m.chunksDone, entries: m.entries,
    people: m.users.length, newPeople: m.created.users.length, projects: m.projects.length, newProjects: m.created.projects.length,
    newClients: m.created.clients.length, sheets: m.created.sheets,
  };
}

const k = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
export type HistorySetup = Omit<HistoryPlan, "entries" | "skipped"> & { officeIds: Record<string, string> };

/** Step 1: everything but the time. `officeIds` says which of our offices each office code in the file is. */
export async function startHistory(p: HistorySetup): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await read()) return { ok: false, error: "History is already being imported. Continue it, or remove it first." };
  const locations = await db.location.findMany({ include: { teams: true } });
  const locById = new Map(locations.map((l) => [l.id, l]));
  for (const code of p.offices) if (!locById.has(p.officeIds[code])) return { ok: false, error: `Choose which office "${code}" is.` };
  if (!p.people.length || !p.projects.length) return { ok: false, error: "The file has no people or projects." };

  const manifest = await db.$transaction(async (tx) => {
    const created: Manifest["created"] = { users: [], teams: [], clients: [], projects: [], phases: [], tags: [], sheets: 0 };

    // Teams, matched by name within their office.
    const teamId = new Map<string, string>();
    for (const l of locations) for (const t of l.teams) teamId.set(l.id + "|" + k(t.name), t.id);
    for (const t of p.teams) {
      const locationId = p.officeIds[t.office], key = locationId + "|" + k(t.name);
      if (teamId.has(key)) continue;
      const made = await tx.team.create({ data: { name: t.name.trim(), locationId } });
      teamId.set(key, made.id); created.teams.push(made.id);
    }

    // People, matched by email. Someone already here keeps their role, office and team.
    const emails = p.people.map((x) => x.email);
    const existing = await tx.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { id: true, email: true } });
    const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u.id]));
    const newPeople = p.people.filter((x) => !byEmail.has(x.email));
    if (newPeople.length) {
      const made = await tx.user.createManyAndReturn({
        data: newPeople.map((x) => {
          const locationId = p.officeIds[x.office];
          return {
            email: x.email, name: x.name.slice(0, 120), role: x.role, locationId, passwordHash: null,
            teamId: x.team ? teamId.get(locationId + "|" + k(x.team)) ?? null : null,
            weeklyTarget: x.role === "GUEST" || x.role === "ADMIN" ? 0 : 40,
          };
        }),
        select: { id: true, email: true },
      });
      for (const u of made) { byEmail.set(u.email.toLowerCase(), u.id); created.users.push(u.id); }
    }
    const users = p.people.map((x) => byEmail.get(x.email)!);

    // Tags and clients, matched by name ignoring capitals.
    const allTags = await tx.tag.findMany();
    const tagByName = new Map(allTags.map((t) => [k(t.name), t.id]));
    const tags: string[] = [];
    for (const name of p.tags) {
      let id = tagByName.get(k(name));
      if (!id) { id = (await tx.tag.create({ data: { name: name.trim().slice(0, 40) } })).id; tagByName.set(k(name), id); created.tags.push(id); }
      tags.push(id);
    }
    const allClients = await tx.client.findMany({ select: { id: true, name: true } });
    const clientByName = new Map(allClients.map((c) => [k(c.name), c.id]));
    let colors = allClients.length;
    const clients: string[] = [];
    for (const name of p.clients) {
      let id = clientByName.get(k(name));
      if (!id) { id = (await tx.client.create({ data: { name: name.trim(), color: CLIENT_COLORS[colors++ % CLIENT_COLORS.length] } })).id; clientByName.set(k(name), id); created.clients.push(id); }
      clients.push(id);
    }

    // Projects, matched by client and name. New ones are open to everyone, like projects the Timesheet import makes.
    const usedClients = [...new Set(clients)];
    const allProjects = await tx.project.findMany({ where: { clientId: { in: usedClients } }, select: { id: true, clientId: true, name: true } });
    const projByKey = new Map(allProjects.map((x) => [x.clientId + "|" + k(x.name), x.id]));
    const toMake = new Map<string, Prisma.ProjectCreateManyInput>();
    for (const x of p.projects) {
      const key = clients[x.client] + "|" + k(x.name);
      if (!projByKey.has(key) && !toMake.has(key)) toMake.set(key, { name: x.name.slice(0, 200), clientId: clients[x.client], access: "PUBLIC" });
    }
    if (toMake.size) {
      const made = await tx.project.createManyAndReturn({ data: [...toMake.values()], select: { id: true, clientId: true, name: true } });
      for (const x of made) { projByKey.set(x.clientId + "|" + k(x.name), x.id); created.projects.push(x.id); }
    }
    const projects = p.projects.map((x) => projByKey.get(clients[x.client] + "|" + k(x.name))!);

    // Phases, matched by name within the project; missing ones go after the project's last phase.
    const allPhases = await tx.phase.findMany({ where: { projectId: { in: [...new Set(projects)] } }, select: { id: true, projectId: true, name: true, sort: true } });
    const phaseByKey = new Map(allPhases.map((x) => [x.projectId + "|" + k(x.name), x.id]));
    const nextSort = new Map<string, number>();
    for (const x of allPhases) if (x.sort < 999) nextSort.set(x.projectId, Math.max(nextSort.get(x.projectId) ?? 0, x.sort + 1));
    const phaseRows: Prisma.PhaseCreateManyInput[] = [];
    const queued = new Set<string>();
    p.projects.forEach((x, i) => {
      for (const name of x.phases) {
        const key = projects[i] + "|" + k(name);
        if (phaseByKey.has(key) || queued.has(key)) continue;
        queued.add(key);
        const sort = nextSort.get(projects[i]) ?? 0;
        nextSort.set(projects[i], sort + 1);
        phaseRows.push({ projectId: projects[i], name: name.trim().slice(0, 80), sort });
      }
    });
    for (let i = 0; i < phaseRows.length; i += 5000) {
      const made = await tx.phase.createManyAndReturn({ data: phaseRows.slice(i, i + 5000), select: { id: true, projectId: true, name: true } });
      for (const x of made) { phaseByKey.set(x.projectId + "|" + k(x.name), x.id); created.phases.push(x.id); }
    }
    const phases = p.projects.map((x, i) => x.phases.map((name) => phaseByKey.get(projects[i] + "|" + k(name))!));

    const m: Manifest = {
      fileKey: p.fileKey, startedAt: new Date().toISOString(), from: p.from, to: p.to, total: 0, chunksDone: 0, entries: 0, done: false,
      users, projects, phases, tags, created,
    };
    await save(tx, m);
    return m;
  }, { timeout: 55_000, maxWait: 10_000 });
  return manifest ? { ok: true } : { ok: false, error: "Couldn't start." };
}

/** Step 2: one chunk of time. `chunk` must be the next one, so a chunk sent twice (after a dropped connection) is saved once. */
export async function addHistoryEntries(fileKey: string, chunk: number, total: number, rows: HistoryEntry[]): Promise<{ ok: true; entries: number } | { ok: false; error: string }> {
  const m = await read();
  if (!m || m.done) return { ok: false, error: "There is no import in progress." };
  if (m.fileKey !== fileKey) return { ok: false, error: "This isn't the file the import was started with." };
  if (chunk < m.chunksDone) return { ok: true, entries: m.entries };
  if (chunk > m.chunksDone) return { ok: false, error: "A step was missed. Choose the file again to continue." };
  const data: Prisma.TimeEntryCreateManyInput[] = [];
  for (const [u, pj, ph, desc, tg, date, start, mins] of rows) {
    const userId = m.users[u], projectId = m.projects[pj], phaseId = m.phases[pj]?.[ph];
    if (!userId || !projectId || !phaseId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(mins > 0) || start < 0 || start + mins > 24 * 60) {
      return { ok: false, error: "The file changed since the import started. Remove the imported history and start again." };
    }
    data.push({
      userId, projectId, phaseId, tagIds: sortTagIds(tg.map((t) => m.tags[t]).filter(Boolean)),
      description: String(desc).slice(0, 500), date: toDate(date), startMin: start, minutes: mins,
    });
  }
  await db.$transaction(async (tx) => {
    for (let i = 0; i < data.length; i += 1000) await tx.timeEntry.createMany({ data: data.slice(i, i + 1000) });
    await save(tx, { ...m, total, chunksDone: chunk + 1, entries: m.entries + data.length });
  }, { timeout: 55_000, maxWait: 10_000 });
  return { ok: true, entries: m.entries + data.length };
}

/** Step 3: every week from each imported person's first imported week to the file's last week becomes Approved. Weeks that already have a timesheet are left as they are. */
export async function finishHistory(fileKey: string): Promise<{ ok: true; sheets: number } | { ok: false; error: string }> {
  const m = await read();
  if (!m || m.fileKey !== fileKey) return { ok: false, error: "There is no import in progress for this file." };
  if (m.done) return { ok: true, sheets: m.created.sheets };
  const users = [...new Set(m.users)];
  const firsts = await db.timeEntry.groupBy({ by: ["userId"], where: { userId: { in: users }, projectId: { in: m.projects }, date: { gte: toDate(m.from), lte: toDate(m.to) } }, _min: { date: true } });
  const last = monday(m.to);
  const sheets: Prisma.TimesheetCreateManyInput[] = [];
  for (const f of firsts) {
    if (!f._min.date) continue;
    for (let wk = monday(toStr(f._min.date)); wk <= last; wk = addDays(wk, 7)) sheets.push({ userId: f.userId, weekStart: toDate(wk), status: "APPROVED" });
  }
  const sheetIds: string[] = [];
  await db.$transaction(async (tx) => {
    for (let i = 0; i < sheets.length; i += 2000) sheetIds.push(...(await tx.timesheet.createManyAndReturn({ data: sheets.slice(i, i + 2000), skipDuplicates: true, select: { id: true } })).map((s) => s.id));
    await tx.appSecret.upsert({ where: { key: MANIFEST + "-sheets" }, update: { value: JSON.stringify(sheetIds) }, create: { key: MANIFEST + "-sheets", value: JSON.stringify(sheetIds) } });
    await save(tx, { ...m, done: true, created: { ...m.created, sheets: sheetIds.length } });
  }, { timeout: 55_000, maxWait: 10_000 });
  return { ok: true, sheets: sheetIds.length };
}

/**
 * Takes away what the import added: the time it saved, the weeks it approved, and the people, projects, phases, clients,
 * teams and tags it created. Anything that was already here stays, along with time people logged themselves.
 */
export async function removeHistory(): Promise<{ people: number; projects: number; entries: number }> {
  const m = await read();
  if (!m) return { people: 0, projects: 0, entries: 0 };
  const sheetRow = await db.appSecret.findUnique({ where: { key: MANIFEST + "-sheets" } });
  const sheetIds: string[] = sheetRow ? JSON.parse(sheetRow.value) : [];
  // The import's own entries: on its projects, by its people, saved since it started.
  const mine = { userId: { in: [...new Set(m.users)] }, projectId: { in: [...new Set(m.projects)] }, createdAt: { gte: new Date(m.startedAt) } } satisfies Prisma.TimeEntryWhereInput;
  const c = m.created;
  const entries = (await db.timeEntry.deleteMany({ where: mine })).count;
  for (let i = 0; i < sheetIds.length; i += 5000) await db.timesheet.deleteMany({ where: { id: { in: sheetIds.slice(i, i + 5000) }, status: "APPROVED" } });
  // Anything still on what it created was added by hand since; that goes with it, as Demo data does.
  if (c.projects.length) await db.timeEntry.deleteMany({ where: { projectId: { in: c.projects } } });
  if (c.users.length) await db.user.deleteMany({ where: { id: { in: c.users } } });
  if (c.phases.length) await db.phase.deleteMany({ where: { id: { in: c.phases } } });
  if (c.projects.length) await db.project.deleteMany({ where: { id: { in: c.projects } } });
  if (c.clients.length) await db.client.deleteMany({ where: { id: { in: c.clients }, projects: { none: {} } } });
  if (c.teams.length) await db.team.deleteMany({ where: { id: { in: c.teams }, users: { none: {} } } });
  if (c.tags.length) {
    for (const id of c.tags) await db.$executeRaw`UPDATE "TimeEntry" SET "tagIds" = array_remove("tagIds", ${id}) WHERE ${id} = ANY("tagIds")`;
    await db.tag.deleteMany({ where: { id: { in: c.tags } } });
  }
  await db.appSecret.deleteMany({ where: { key: { in: [MANIFEST, MANIFEST + "-sheets"] } } });
  return { people: c.users.length, projects: c.projects.length, entries };
}
