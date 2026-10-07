import type { Role } from "@prisma/client";
import { db } from "./db";
import type { Me } from "./auth";
import { manageError } from "./scope";
import { roleName } from "./roles";
import { csvObjects } from "./csv";
import { isDateStr, today, toDate } from "./dates";
import { EMAIL_RE, clean, nameKey, parseDateFlexible, parseRole, pick, projectRefs, splitList, weeklyFromCapacity } from "./importParse";
import { columnNotes, type PreviewRow } from "./importTypes";
import { INVITE_HOURS, newLinkToken } from "./tokens";
import { appUrl } from "./email";

export const MAX_PEOPLE = 2000;

const USED = ["name", "email", "role", "group", "team", "office", "location", "title", "job title", "employee id", "joining date", "expected hours per week",
  "daily work capacity", "working days", "projects managed", "groups managed"];
const IGNORED: Record<string, string> = {
  "billable rate": "this app has no billing", "cost rate": "this app has no billing",
  "employees managed": "a Team/Project Manager looks after their whole team", "assigned team manager": "approvals go to the team's Team/Project Manager",
  "week start": "weeks always start on Monday", "status": "everyone starts as an invite",
};

export type PersonDraft = {
  name: string; email: string; title: string; role: Role; locationId: string; teamKey: string | null; weeklyTarget?: number;
  employeeId: string | null; joiningDate: Date | null; projectIds: string[];
};
export type NewTeam = { name: string; locationId: string };

/** Reads a People file (the Users template, or our own People export) and says what would happen to each row. Nothing is saved here. */
export async function checkPeople(me: Me, text: string, officeId: string) {
  if (me.role !== "ADMIN" && me.role !== "LOCATION") return { error: "Only admins and location managers can import people." };
  const { keys, rows } = csvObjects(text);
  const missing = ["name", "email"].filter((k) => !keys.includes(k));
  if (missing.length) return { error: `The first row must name these columns: Name, Email. Missing: ${missing.map((m) => m[0].toUpperCase() + m.slice(1)).join(", ")}.` };
  if (!rows.length) return { error: "That file has no people in it, only the first row." };
  if (rows.length > MAX_PEOPLE) return { error: `That file has ${rows.length} rows. Import at most ${MAX_PEOPLE} at a time.` };

  const [locations, teams, users, projects] = await Promise.all([
    db.location.findMany(), db.team.findMany(),
    db.user.findMany({ select: { email: true, employeeId: true } }),
    db.project.findMany({ include: { client: true, managers: { select: { userId: true } } } }),
  ]);
  const hasOfficeColumn = keys.includes("office") || keys.includes("location");
  const defaultLoc = locations.find((l) => l.id === (me.role === "LOCATION" ? me.locationId : officeId));
  if (!defaultLoc && !hasOfficeColumn) return { error: "Choose which office these people join." };
  const emails = new Map(users.map((u) => [u.email.toLowerCase(), true]));
  const empIds = new Set(users.map((u) => u.employeeId?.toLowerCase()).filter(Boolean) as string[]);
  const seenEmail = new Map<string, number>(), seenEmp = new Map<string, number>();
  const newTeams = new Map<string, NewTeam>();

  const out = rows.map(({ line, v: r }) => {
    const notes: string[] = [];
    const name = clean(pick(r, "name")), email = pick(r, "email").toLowerCase();
    const officeName = pick(r, "office", "location");
    const loc = officeName ? locations.find((l) => nameKey(l.name) === nameKey(officeName)) : defaultLoc;
    const roleP = parseRole(r["role"]);
    const groups = splitList(pick(r, "team", "group")).map(clean).filter(Boolean);
    const managedGroups = splitList(r["groups managed"]).map(clean).filter(Boolean);
    const teamName = groups[0] ?? (roleP.role === "LEADER" ? managedGroups[0] : undefined);
    if (groups.length > 1) notes.push(`Several groups given; only ${groups[0]} is used`);
    else if (!groups.length && roleP.role === "LEADER" && managedGroups.length > 1) notes.push(`Manages ${managedGroups.length} groups; only ${managedGroups[0]} is used as their team`);
    const team = loc && teamName ? teams.find((t) => t.locationId === loc.id && nameKey(t.name) === nameKey(teamName)) : undefined;

    const emp = pick(r, "employee id").replace(/\s+/g, " ");
    const joinText = pick(r, "joining date");
    const joined = joinText ? parseDateFlexible(joinText) : null;
    const target = pick(r, "expected hours per week");
    let weekly: number | null | undefined;
    if (target) weekly = /^\d+(\.\d+)?$/.test(target) ? parseFloat(target) : null;
    else weekly = weeklyFromCapacity(r["daily work capacity"], r["working days"]);

    const firstEmail = email ? seenEmail.get(email) : undefined;
    const firstEmp = emp ? seenEmp.get(emp.toLowerCase()) : undefined;
    const error =
      !name ? "No name"
      : name.length > 100 ? "Name can be up to 100 characters"
      : !email ? "No email"
      : !EMAIL_RE.test(email) ? "That isn't a valid email address"
      : roleP.unknown.length ? `Unknown role: ${roleP.unknown.join(", ")}. Use Admin, Location Manager, Team Manager, Project Manager, or leave it blank`
      : !loc ? (officeName ? `Unknown office: ${officeName}` : "Choose an office")
      : manageError(me, loc.id, roleP.role) ?? (
        roleP.role === "LEADER" && !teamName ? "Team/Project Managers need a team: add their Group"
        : teamName && teamName.length > 60 ? "Team name is too long"
        : emails.has(email) ? "Already has an account"
        : firstEmail ? `Same email as row ${firstEmail}`
        : emp.length > 32 ? "Employee ID can be up to 32 characters"
        : emp && empIds.has(emp.toLowerCase()) ? "Someone else already has that employee ID"
        : firstEmp ? `Same employee ID as row ${firstEmp}`
        : joinText && !joined ? "Joining date should look like 2021-03-12 or 03/12/2021"
        : joined && joined > today() ? "Joining date can't be in the future"
        : joined && joined < "1950-01-01" ? "Check the joining date. It's before 1950"
        : weekly === null ? "Check Expected hours per week, Daily Work Capacity and Working Days"
        : weekly !== undefined && (weekly < 0 || weekly > 80) ? "Expected hours per week should be between 0 and 80"
        : "") ?? "";

    if (email && !error) seenEmail.set(email, line);
    if (emp && !error) seenEmp.set(emp.toLowerCase(), line);

    // Projects Managed: only people who can manage can be added as a manager, and only on projects this person may change.
    const projectIds: string[] = [];
    const managed = splitList(r["projects managed"]);
    if (managed.length && roleP.role === "MEMBER") notes.push("Projects Managed ignored: Team Members can't manage projects");
    else if (managed.length) {
      for (const entry of managed) {
        let hit: typeof projects = [];
        for (const c of projectRefs(entry)) {
          hit = projects.filter((p) => nameKey(p.name) === nameKey(c.name) && (!c.client || nameKey(p.client.name) === nameKey(c.client)));
          if (hit.length) break;
        }
        if (!hit.length) notes.push(`Project "${entry}" doesn't exist yet. Add them as a manager on the project later`);
        else if (hit.length > 1) notes.push(`"${entry}" matches projects of several clients. Write it as Project:Client`);
        else if (me.role !== "ADMIN" && !hit[0].managers.some((m) => m.userId === me.id)) notes.push(`You can't make someone a manager of ${hit[0].name}`);
        else projectIds.push(hit[0].id);
      }
    }

    let teamKey: string | null = null;
    if (!error && loc && teamName) {
      if (team) teamKey = team.id;
      else { teamKey = `new:${loc.id}:${nameKey(teamName)}`; if (!newTeams.has(teamKey)) newTeams.set(teamKey, { name: teamName, locationId: loc.id }); }
    }
    const row: PreviewRow = {
      line, error, notes,
      cells: [name, email, roleName(roleP.role), loc?.name ?? officeName, teamName ?? "", weekly === undefined || weekly === null ? (target ? target : "") : String(weekly)],
    };
    const data: PersonDraft | undefined = error ? undefined : {
      name, email, title: clean(pick(r, "title", "job title")).slice(0, 100), role: roleP.role, locationId: loc!.id, teamKey, weeklyTarget: weekly ?? undefined,
      employeeId: emp || null, joiningDate: joined && isDateStr(joined) ? toDate(joined) : null, projectIds,
    };
    return { row, data };
  });

  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? "";
  const adds = [...newTeams.values()].length
    ? [`New teams: ${[...newTeams.values()].map((t) => `${t.name} (${locName(t.locationId)})`).join(", ")}`]
    : [];
  return {
    headers: ["Name", "Email", "Role", "Office", "Team", "Hours a week"],
    columnNotes: columnNotes(keys, USED, IGNORED), adds, out, newTeams,
  };
}

/** Saves the checked people together (or none, if anything fails), each with an invite link that works for a week. */
export async function savePeople(drafts: PersonDraft[], newTeams: Map<string, NewTeam>) {
  const links: { name: string; email: string; link: string }[] = [];
  await db.$transaction(async (tx) => {
    const teamIds = new Map<string, string>();
    const used = new Set(drafts.map((d) => d.teamKey).filter(Boolean) as string[]);
    for (const [key, t] of newTeams) {
      if (!used.has(key)) continue;
      const existing = await tx.team.findFirst({ where: { locationId: t.locationId, name: { equals: t.name, mode: "insensitive" } } });
      teamIds.set(key, existing?.id ?? (await tx.team.create({ data: { name: t.name, locationId: t.locationId } })).id);
    }
    for (const d of drafts) {
      const { token, expires } = newLinkToken(INVITE_HOURS);
      await tx.user.create({
        data: {
          name: d.name, email: d.email, title: d.title, role: d.role, locationId: d.locationId,
          teamId: d.teamKey ? (teamIds.get(d.teamKey) ?? d.teamKey) : null,
          ...(d.weeklyTarget !== undefined ? { weeklyTarget: d.weeklyTarget } : {}),
          employeeId: d.employeeId, joiningDate: d.joiningDate,
          inviteToken: token, inviteExpires: expires,
          ...(d.projectIds.length ? { managing: { create: d.projectIds.map((projectId) => ({ projectId })) } } : {}),
        },
      });
      links.push({ name: d.name, email: d.email, link: `${appUrl()}/invite/${token}` });
    }
  }, { maxWait: 10_000, timeout: 120_000 });
  return links;
}
