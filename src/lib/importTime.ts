import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { Me } from "./auth";
import { getSettings } from "./settings";
import { visibleUsersWhere } from "./scope";
import { csvObjects } from "./csv";
import { monday, toDate, toStr } from "./dates";
import { CLIENT_COLORS, clean, hasColumn, nameKey, parseDateFlexible, parseDurationFlexible, parseTimeFlexible, pick, splitList } from "./importParse";
import { MAX_TAG_LENGTH, NO_CLIENT } from "./importProjects";
import { columnNotes, type PreviewRow } from "./importTypes";

export const MAX_TIME_ROWS = 20000;

const USED = ["date", "start date", "email", "project", "client", "phase", "task", "tag", "tags", "description", "start", "start time", "hours", "duration (h)", "duration"];
const IGNORED: Record<string, string> = { billable: "this app has no billing" };

const projectInclude = {
  client: true, phases: true,
  users: { select: { userId: true } }, managers: { select: { userId: true } },
  locations: { select: { locationId: true } }, teams: { select: { teamId: true } },
} satisfies Prisma.ProjectInclude;
type ImportProject = Omit<Prisma.ProjectGetPayload<{ include: typeof projectInclude }>, "client"> & { client: { id: string; name: string } };
type ImportUser = { id: string; email: string; name: string; role: string; locationId: string; teamId: string | null };

/** Same rule as trackableProjectsWhere in lib/scope.ts, checked in memory for the person the row is for. */
function canTrack(p: ImportProject, u: ImportUser) {
  if (p.archived) return false;
  return u.role === "ADMIN" || p.access === "PUBLIC" || p.users.some((x) => x.userId === u.id) || p.managers.some((x) => x.userId === u.id)
    || p.locations.some((x) => x.locationId === u.locationId) || (!!u.teamId && p.teams.some((x) => x.teamId === u.teamId));
}

const entryKey = (e: { userId: string; date: string; projectId: string; phaseId: string | null; tagId: string | null; startMin: number; minutes: number; description: string }) =>
  [e.userId, e.date, e.projectId, e.phaseId, e.tagId, e.startMin, e.minutes, e.description].join("|");

/** An entry ready to save. Anything the file asks to create (project, phase, tag) is named by a key until it exists. */
export type EntryDraft = {
  userId: string; date: string; startMin: number; minutes: number; description: string; custom: Record<string, string>;
  projectId?: string; projectKey?: string; phaseId?: string; phaseName: string; tagId?: string; tagKey?: string;
};
export type NewProject = { key: string; name: string; clientName: string; clientId?: string; phases: string[] };
export type TimePlan = { projects: Map<string, NewProject>; phases: Map<string, string[]>; tags: Map<string, string>; clients: Map<string, string> };

/**
 * Reads a Timesheet file (the Timesheet template, or our own Date / Hours style) and says what would happen to each row. Nothing is saved here.
 * With `create` (admins only) a project, client, phase or tag the file mentions but we don't have yet is added along with the time.
 */
export async function checkTime(me: Me, text: string, wantCreate: boolean) {
  const create = wantCreate && me.role === "ADMIN";
  const settings = await getSettings();
  const { keys, rows } = csvObjects(text);
  const need: [string, string[]][] = [["Date", ["date", "start date"]], ["Email", ["email"]], ["Project", ["project"]], ["Hours", ["hours", "duration (h)", "duration"]]];
  const missingCols = need.filter(([, names]) => !hasColumn(keys, ...names)).map(([n]) => n);
  if (missingCols.length) return { error: `The first row must name these columns: Project, Email, Start Date, Duration (h). Missing: ${missingCols.join(", ")}.` };
  if (!rows.length) return { error: "That file has no time entries in it, only the first row." };
  if (rows.length > MAX_TIME_ROWS) return { error: `That file has ${rows.length} rows. Import at most ${MAX_TIME_ROWS} at a time.` };
  const [users, projects, tags, fields, clients] = await Promise.all([
    db.user.findMany({ where: visibleUsersWhere(me), select: { id: true, email: true, name: true, role: true, locationId: true, teamId: true } }),
    db.project.findMany({ include: projectInclude }),
    db.tag.findMany(),
    db.customField.findMany(),
    db.client.findMany({ select: { id: true, name: true } }),
  ]);
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const tagByName = new Map(tags.map((t) => [nameKey(t.name), t.id]));
  const userIds = [...new Set(rows.map(({ v: r }) => byEmail.get(pick(r, "email").toLowerCase())?.id).filter(Boolean))] as string[];
  const closed = userIds.length ? await db.timesheet.findMany({ where: { userId: { in: userIds }, status: { in: ["SUBMITTED", "APPROVED"] } }, select: { userId: true, weekStart: true } }) : [];
  const closedSet = new Set(closed.map((c) => `${c.userId}|${toStr(c.weekStart)}`));
  const plan: TimePlan = { projects: new Map(), phases: new Map(), tags: new Map(), clients: new Map() };

  const out: { row: PreviewRow; data?: EntryDraft; key?: string }[] = rows.map(({ line, v: r }) => {
    const notes: string[] = [];
    const dateText = pick(r, "date", "start date");
    const date = parseDateFlexible(dateText);
    const emailText = pick(r, "email").toLowerCase();
    const u = byEmail.get(emailText);
    const projectName = clean(pick(r, "project")), clientGiven = clean(pick(r, "client"));
    const matches = projects.filter((p) => nameKey(p.name) === nameKey(projectName) && (!clientGiven || nameKey(p.client.name) === nameKey(clientGiven)));
    const p = matches.length === 1 ? matches[0] : undefined;
    const phaseName = clean(pick(r, "phase", "task"));
    const phases = p ? p.phases.filter((x) => x.sort < 999).sort((a, b) => a.sort - b.sort) : [];
    const phase = phases.find((x) => nameKey(x.name) === nameKey(phaseName));
    const wantedTags = splitList(pick(r, "tag", "tags")).map(clean).filter(Boolean);
    const tagName = wantedTags[0] ?? "";
    if (wantedTags.length > 1) notes.push(`Only the first tag (${tagName}) is kept`);
    const tagId = tagName ? tagByName.get(nameKey(tagName)) : undefined;
    const minutes = parseDurationFlexible(pick(r, "hours", "duration (h)", "duration"));
    const startText = pick(r, "start", "start time");
    const startMin = startText ? parseTimeFlexible(startText) : 9 * 60;
    const custom = Object.fromEntries(fields.map((f) => [f.id, r[f.name.toLowerCase()] ?? ""]));
    const missingCustom = fields.filter((f) => f.required && !custom[f.id]).map((f) => f.name);
    const optionBad = fields.find((f) => f.type === "select" && custom[f.id] && !f.options.includes(custom[f.id]));
    // A project we don't have yet can be created from the file (admins, with the option on); so can a missing phase or tag.
    const newProject = !p && !matches.length && create && !!projectName;
    const newClientName = newProject ? (clientGiven || NO_CLIENT) : "";
    const newPhase = (!!p || newProject) && !phase && create && !!phaseName;
    const newTag = !!tagName && !tagId && create;
    const error =
      !date ? "Date must look like 03/31/2026 or 2026-03-31"
      : !u ? (emailText ? "Unknown person, or not someone you manage" : "No email")
      : !projectName ? "No project"
      : !p && !newProject ? (matches.length > 1 ? "Two clients have a project with this name; add a Client column" : "Unknown project")
      : p?.archived ? "That project is archived"
      : p && !canTrack(p, u) ? "That person doesn't have access to this project"
      : newProject && (projectName.length > 120 || newClientName.length > 120) ? "Project and client names can be up to 120 characters"
      : !phaseName ? "Task (phase) is required"
      : newPhase && phaseName.length > 80 ? "A task (phase) name can be up to 80 characters"
      : !phase && !newPhase ? `Task (phase) must be one of: ${phases.map((x) => x.name).join(", ")}`
      : tagName && !tagId && !newTag ? `Unknown tag: ${tagName}`
      : newTag && tagName.length > MAX_TAG_LENGTH ? `A tag name can be up to ${MAX_TAG_LENGTH} characters`
      : settings.requireTag && !tagName ? "Tag is required"
      : settings.requireDescription && !pick(r, "description") ? "Description is required"
      : pick(r, "description").length > 3000 ? "Description can be up to 3000 characters"
      : missingCustom.length ? `${missingCustom.join(", ")} required`
      : optionBad ? `${optionBad.name} must be one of: ${optionBad.options.join(", ")}`
      : !(minutes > 0) || minutes > 1440 ? "Duration must be like 1.5 or 1:30"
      : startMin === null ? "Start must be a time like 09:30 or 9:30 AM"
      : settings.lockBeforeStr && date <= settings.lockBeforeStr ? "Date is locked"
      : closedSet.has(`${u.id}|${monday(date)}`) ? "That week is already submitted or approved"
      : "";
    const cells = [date ?? dateText, u?.name ?? emailText, p ? `${p.name} (${p.client.name})` : projectName ? `${projectName} (${clientGiven || (newProject ? NO_CLIENT : "?")})` : "", phase?.name ?? phaseName, pick(r, "hours", "duration (h)", "duration")];
    const row: PreviewRow = { line, cells, error, notes };
    if (error) return { row };

    // The row is good: record what it needs created.
    let projectKey: string | undefined;
    if (newProject) {
      const clientKey = nameKey(newClientName);
      projectKey = `${clientKey}|${nameKey(projectName)}`;
      const np = plan.projects.get(projectKey) ?? { key: projectKey, name: projectName, clientName: newClientName, clientId: clients.find((c) => nameKey(c.name) === clientKey)?.id, phases: [] };
      if (!np.phases.some((x) => nameKey(x) === nameKey(phaseName))) np.phases.push(phaseName);
      plan.projects.set(projectKey, np);
      if (!np.clientId) plan.clients.set(clientKey, newClientName);
    } else if (newPhase) {
      const list = plan.phases.get(p!.id) ?? [];
      if (!list.some((x) => nameKey(x) === nameKey(phaseName))) list.push(phaseName);
      plan.phases.set(p!.id, list);
    }
    if (newTag) plan.tags.set(nameKey(tagName), tagName);
    const description = pick(r, "description");
    const draft: EntryDraft = {
      userId: u!.id, date: date!, startMin: startMin!, minutes, description, custom,
      projectId: p?.id, projectKey, phaseId: phase?.id, phaseName: phase?.name ?? phaseName, tagId, tagKey: newTag ? nameKey(tagName) : undefined,
    };
    // Rows that exactly match saved time are left out later; one that needs something new can't match anything yet.
    const key = p && phase && (tagId || !tagName) ? entryKey({ userId: u!.id, date: date!, projectId: p.id, phaseId: phase.id, tagId: tagId ?? null, startMin: startMin!, minutes, description }) : undefined;
    return { row, data: draft, key };
  });

  // Rows that exactly match an entry already saved (same person, day, project, phase, tag, start, hours and description)
  // were most likely imported before, so they're left out rather than doubled.
  const ok = out.filter((o) => o.data && o.key);
  if (ok.length) {
    const dates = ok.map((o) => o.data!.date).sort();
    const existing = await db.timeEntry.findMany({
      where: { userId: { in: [...new Set(ok.map((o) => o.data!.userId))] }, date: { gte: toDate(dates[0]), lte: toDate(dates[dates.length - 1]) } },
      select: { userId: true, date: true, projectId: true, phaseId: true, tagId: true, startMin: true, minutes: true, description: true },
    });
    const have = new Set(existing.map((e) => entryKey({ ...e, date: toStr(e.date) })));
    for (const o of ok) if (have.has(o.key!)) { o.row.error = "Already imported"; o.data = undefined; }
  }
  // What gets created is only what the rows that will be imported need.
  const live = out.filter((o) => o.data).map((o) => o.data!);
  const usedProjects = new Set(live.map((d) => d.projectKey).filter(Boolean) as string[]);
  for (const k of [...plan.projects.keys()]) if (!usedProjects.has(k)) plan.projects.delete(k);
  const usedPhases = new Map<string, Set<string>>();
  for (const d of live) if (d.projectId) (usedPhases.get(d.projectId) ?? usedPhases.set(d.projectId, new Set()).get(d.projectId)!).add(nameKey(d.phaseName));
  for (const [id, names] of [...plan.phases]) {
    const keep = names.filter((n) => usedPhases.get(id)?.has(nameKey(n)));
    if (keep.length) plan.phases.set(id, keep); else plan.phases.delete(id);
  }
  const usedTags = new Set(live.map((d) => d.tagKey).filter(Boolean) as string[]);
  for (const k of [...plan.tags.keys()]) if (!usedTags.has(k)) plan.tags.delete(k);
  const usedClients = new Set([...plan.projects.values()].map((np) => nameKey(np.clientName)));
  for (const k of [...plan.clients.keys()]) if (!usedClients.has(k)) plan.clients.delete(k);

  const phaseCount = [...plan.phases.values()].reduce((n, l) => n + l.length, 0) + [...plan.projects.values()].reduce((n, np) => n + np.phases.length, 0);
  const list = (items: string[]) => (items.length > 6 ? `${items.slice(0, 6).join(", ")} and ${items.length - 6} more` : items.join(", "));
  const adds = [
    ...(plan.clients.size ? [`New clients: ${list([...plan.clients.values()])}`] : []),
    ...(plan.projects.size ? [`New projects: ${list([...plan.projects.values()].map((np) => np.name))}`] : []),
    ...(phaseCount ? [`${phaseCount} new phase${phaseCount === 1 ? "" : "s"} (from the Task column)`] : []),
    ...(plan.tags.size ? [`New tags: ${list([...plan.tags.values()])}`] : []),
  ];
  return {
    headers: ["Date", "Person", "Project", "Phase", "Hours"],
    columnNotes: columnNotes(keys, USED, IGNORED, fields.map((f) => f.name.toLowerCase())),
    adds, out, plan, create,
  };
}

/** Saves the checked time together (or none, if anything fails), first creating any clients, projects, phases and tags the file asked for. */
export async function saveTime(drafts: EntryDraft[], plan: TimePlan) {
  return db.$transaction(async (tx) => {
    const clientIds = new Map<string, string>();
    const projectIds = new Map<string, string>();
    const phaseIds = new Map<string, string>(); // `${projectId}|${phase name key}`
    const tagIds = new Map<string, string>();
    for (const [key, name] of plan.tags) {
      const existing = await tx.tag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
      tagIds.set(key, existing?.id ?? (await tx.tag.create({ data: { name } })).id);
    }
    for (const np of plan.projects.values()) {
      let clientId = np.clientId ?? clientIds.get(nameKey(np.clientName));
      if (!clientId) {
        const existing = await tx.client.findFirst({ where: { name: { equals: np.clientName, mode: "insensitive" } } });
        clientId = existing?.id ?? (await tx.client.create({ data: { name: np.clientName, color: CLIENT_COLORS[(await tx.client.count()) % CLIENT_COLORS.length] } })).id;
        clientIds.set(nameKey(np.clientName), clientId);
      }
      const made = await tx.project.create({
        data: { name: np.name, clientId, access: "PUBLIC", phases: { create: np.phases.map((name, sort) => ({ name, sort })) } },
        include: { phases: true },
      });
      projectIds.set(np.key, made.id);
      for (const ph of made.phases) phaseIds.set(`${made.id}|${nameKey(ph.name)}`, ph.id);
    }
    for (const [projectId, names] of plan.phases) {
      const top = await tx.phase.aggregate({ where: { projectId, sort: { lt: 999 } }, _max: { sort: true } });
      let sort = (top._max.sort ?? -1) + 1;
      for (const name of names) {
        const made = await tx.phase.create({ data: { projectId, name, sort: sort++ } });
        phaseIds.set(`${projectId}|${nameKey(name)}`, made.id);
      }
    }
    const data: Prisma.TimeEntryCreateManyInput[] = drafts.map((d) => {
      const projectId = d.projectId ?? projectIds.get(d.projectKey!)!;
      return {
        userId: d.userId, projectId, phaseId: d.phaseId ?? phaseIds.get(`${projectId}|${nameKey(d.phaseName)}`)!, tagId: d.tagId ?? (d.tagKey ? tagIds.get(d.tagKey) : undefined) ?? null,
        description: d.description, custom: d.custom, date: toDate(d.date), startMin: d.startMin, minutes: d.minutes,
      };
    });
    let n = 0;
    for (let i = 0; i < data.length; i += 1000) n += (await tx.timeEntry.createMany({ data: data.slice(i, i + 1000) })).count;
    return n;
  }, { maxWait: 10_000, timeout: 120_000 });
}
