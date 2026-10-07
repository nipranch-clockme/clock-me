import { db } from "./db";
import type { Me } from "./auth";
import { EXTRA_CELLS, csvObjects } from "./csv";
import { CLIENT_COLORS, EMAIL_RE, clean, hasColumn, nameKey, parseAccess, parseBudget, pick, splitList } from "./importParse";
import { columnNotes, type PreviewRow } from "./importTypes";

export const MAX_PROJECTS = 2000;
/** Projects with no client in the file are filed under this client (admins create it the first time). */
export const NO_CLIENT = "Internal";
export const MAX_PHASES = 40;
export const MAX_TAG_LENGTH = 40;
export const DEFAULT_PHASES = ["Submission 1", "Submission 2", "Submission 3", "Submission 4", "Submission 5"];

const USED = ["project", "client", "tasks", "phases", "task", "phase", "tags", "tag", "budget hours", "budget", "access", "people", "offices", "managers"];
const IGNORED: Record<string, string> = { teams: "set teams on the project itself", archived: "projects start active" };

export type ProjectDraft = {
  clientName: string; clientId?: string; name: string; budget: number | null; phases: string[]; restricted: boolean;
  userIds: string[]; locIds: string[]; mgrIds: string[];
};

/** Reads a Clients and Projects file (the Projects template, or our own Projects export) and says what would happen to each row. Nothing is saved here. */
export async function checkProjects(me: Me, text: string) {
  const { keys, rows, total, error: unreadable } = csvObjects(text, MAX_PROJECTS);
  if (unreadable) return { error: unreadable };
  if (!keys.includes("project")) return { error: "The first row must name a Project column (and usually a Client column too)." };
  if (!total) return { error: "That file has no projects in it, only the first row." };
  if (total > MAX_PROJECTS) return { error: `That file has ${total.toLocaleString("en-US")} rows. Import at most ${MAX_PROJECTS.toLocaleString("en-US")} projects at a time.` };
  const [clients, projects, users, locations, tags] = await Promise.all([
    db.client.findMany(), db.project.findMany({ include: { client: true } }),
    db.user.findMany({ select: { id: true, email: true, role: true } }), db.location.findMany(), db.tag.findMany(),
  ]);
  const seen = new Map<string, number>(); // projects in this file that will import, and the row they came from
  const newClients = new Map<string, string>(), newTags = new Map<string, string>();
  const hasClientColumn = hasColumn(keys, "client");

  const out = rows.map(({ line, extra, v: r }) => {
    const notes: string[] = [];
    const projectName = clean(pick(r, "project"));
    const given = clean(pick(r, "client"));
    const clientName = given || NO_CLIENT;
    if (!given && projectName) notes.push(`No client given: filed under ${NO_CLIENT}`);
    const client = clients.find((c) => nameKey(c.name) === nameKey(clientName));
    const key = `${nameKey(clientName)}|${nameKey(projectName)}`;
    const dup = projects.some((p) => nameKey(p.client.name) === nameKey(clientName) && nameKey(p.name) === nameKey(projectName));
    const first = seen.get(key);
    const budget = parseBudget(pick(r, "budget hours", "budget"));
    const access = parseAccess(r["access"]);
    const phases = splitList(pick(r, "tasks", "phases", "task", "phase")).map(clean).filter(Boolean);
    const usedPhases = phases.length ? phases : DEFAULT_PHASES;
    if (!phases.length && projectName) notes.push("No tasks given: the usual five Submission phases are added");
    const restricted = access === "RESTRICTED";
    const people = splitList(r["people"]).map((x) => x.toLowerCase());
    const offices = splitList(r["offices"]).map((x) => x.toLowerCase());
    const managers = splitList(r["managers"]).map((x) => x.toLowerCase());
    const userIds = people.map((e) => users.find((u) => u.email.toLowerCase() === e)?.id);
    const locIds = offices.map((o) => locations.find((l) => nameKey(l.name) === o)?.id);
    const mgrIds = managers.map((e) => users.find((u) => u.email.toLowerCase() === e && u.role !== "MEMBER")?.id);
    const wanted = splitList(pick(r, "tags", "tag")).map(clean).filter(Boolean);
    const missingTags = wanted.filter((t) => !tags.some((x) => nameKey(x.name) === nameKey(t)));
    const error =
      extra ? EXTRA_CELLS
      : !projectName ? "No project name"
      : projectName.length > 120 ? "Project name is too long"
      : clientName.length > 120 ? "Client name is too long"
      : dup ? "Already exists"
      : first ? `Same project as row ${first}`
      : !client && me.role !== "ADMIN" ? (given ? "Unknown client (only admins add clients)" : `No client given, and there is no ${NO_CLIENT} client yet (only admins add clients)`)
      : budget !== null && isNaN(budget) ? "Budget must be a number of hours (up to 100000)"
      : access === null ? "Access must be Everyone or Restricted"
      : usedPhases.length > MAX_PHASES ? `A project can have up to ${MAX_PHASES} tasks`
      : usedPhases.some((p) => p.length > 80) ? "A task name is too long"
      : wanted.some((t) => t.length > MAX_TAG_LENGTH) ? `A tag name is too long (up to ${MAX_TAG_LENGTH} characters)`
      : managers.some((e) => !EMAIL_RE.test(e)) ? "Managers must be email addresses"
      : userIds.includes(undefined) ? "Unknown email in People"
      : locIds.includes(undefined) ? "Unknown office"
      : mgrIds.includes(undefined) ? "Managers must be existing people who aren't team members"
      : restricted && !userIds.length && !locIds.length && me.role === "ADMIN" ? "Restricted projects need People or Offices"
      : "";
    if (!error) {
      seen.set(key, line);
      if (!client && !newClients.has(nameKey(clientName))) newClients.set(nameKey(clientName), clientName);
      if (missingTags.length && me.role === "ADMIN") for (const t of missingTags) { if (!newTags.has(nameKey(t))) newTags.set(nameKey(t), t); }
      else if (missingTags.length) notes.push(`Tag ${missingTags.join(", ")} doesn't exist; only admins add tags`);
    }
    const row: PreviewRow = { line, error, notes, cells: [clientName, projectName, usedPhases.join(", "), budget ? String(budget) : "", restricted ? "Restricted" : "Everyone"] };
    const data: ProjectDraft | undefined = error ? undefined : {
      clientName, clientId: client?.id, name: projectName, budget, phases: usedPhases, restricted,
      userIds: userIds as string[], locIds: locIds as string[], mgrIds: mgrIds as string[],
    };
    return { row, data };
  });

  const adds = [
    ...(newClients.size ? [`New clients (no commitment until you set one): ${[...newClients.values()].join(", ")}`] : []),
    ...(newTags.size ? [`New tags: ${[...newTags.values()].join(", ")}`] : []),
  ];
  return {
    headers: ["Client", "Project", "Phases", "Budget h", "Access"],
    columnNotes: [
      ...(hasClientColumn ? [] : [`No Client column: every project is filed under ${NO_CLIENT}`]),
      ...columnNotes(keys, USED, IGNORED, [], rows.map((r) => r.v)),
    ],
    adds, out, newTags: [...newTags.values()], newClients: [...newClients.values()],
  };
}

/** Saves the checked projects together (or none, if anything fails), creating the clients and tags they need. */
export async function saveProjects(me: Me, drafts: ProjectDraft[], newTags: string[]) {
  return db.$transaction(async (tx) => {
    for (const name of newTags) {
      if (me.role !== "ADMIN") throw new Error("Only admins add tags");
      if (!(await tx.tag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } }))) await tx.tag.create({ data: { name } });
    }
    let n = 0;
    for (const d of drafts) {
      let clientId = d.clientId;
      if (!clientId) {
        const existing = await tx.client.findFirst({ where: { name: { equals: d.clientName, mode: "insensitive" } } });
        if (!existing && me.role !== "ADMIN") throw new Error("Only admins add clients");
        clientId = existing?.id ?? (await tx.client.create({ data: { name: d.clientName, color: CLIENT_COLORS[(await tx.client.count()) % CLIENT_COLORS.length] } })).id;
      }
      const mgr = new Set(d.mgrIds);
      if (me.role !== "ADMIN") mgr.add(me.id);
      const restrictedToMe = d.restricted && !d.userIds.length && !d.locIds.length;
      await tx.project.create({
        data: {
          name: d.name, clientId, budgetHours: d.budget || null, access: d.restricted ? "RESTRICTED" : "PUBLIC",
          phases: { create: d.phases.map((name, sort) => ({ name, sort })) },
          managers: { create: [...mgr].map((userId) => ({ userId })) },
          users: { create: (restrictedToMe ? [me.id] : d.userIds).map((userId) => ({ userId })) },
          locations: { create: d.locIds.map((locationId) => ({ locationId })) },
        },
      });
      n++;
    }
    return n;
  }, { maxWait: 10_000, timeout: 120_000 });
}
