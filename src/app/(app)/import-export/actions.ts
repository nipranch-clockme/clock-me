"use server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTab, type Me } from "@/lib/auth";
import { getSettings, logAction } from "@/lib/settings";
import { visibleUsersWhere } from "@/lib/scope";
import { csvObjects } from "@/lib/csv";
import { isDateStr, monday, toDate, toStr } from "@/lib/dates";
import { parseDuration } from "@/lib/format";

export type PreviewRow = { line: number; cells: string[]; error: string };
export type ImportResult = { kind: "time" | "projects"; headers: string[]; rows: PreviewRow[]; imported?: number; error?: string } | null;
const MAX_ROWS = 20000;

type ImportUser = { id: string; email: string; name: string; role: string; locationId: string; teamId: string | null };
type ImportProject = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;
const projectInclude = {
  client: true, phases: true,
  users: { select: { userId: true } }, managers: { select: { userId: true } },
  locations: { select: { locationId: true } }, teams: { select: { teamId: true } },
} satisfies Prisma.ProjectInclude;

/** Same rule as trackableProjectsWhere in lib/scope.ts, checked in memory for the person the row is for. */
function canTrack(p: ImportProject, u: ImportUser) {
  if (p.archived) return false;
  return u.role === "ADMIN" || p.access === "PUBLIC" || p.users.some((x) => x.userId === u.id) || p.managers.some((x) => x.userId === u.id)
    || p.locations.some((x) => x.locationId === u.locationId) || (!!u.teamId && p.teams.some((x) => x.teamId === u.teamId));
}

const START = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const entryKey = (e: { userId: string; date: string; projectId: string; phaseId: string | null; tagId: string | null; startMin: number; minutes: number; description: string }) =>
  [e.userId, e.date, e.projectId, e.phaseId, e.tagId, e.startMin, e.minutes, e.description].join("|");

async function checkTime(me: Me, text: string) {
  const settings = await getSettings();
  const { keys, rows } = csvObjects(text);
  const need = ["date", "email", "project", "phase", "hours"];
  const missingCols = need.filter((k) => !keys.includes(k));
  if (missingCols.length) return { error: `The first row must name these columns: ${need.join(", ")}. Missing: ${missingCols.join(", ")}.` };
  if (rows.length > MAX_ROWS) return { error: `That file has ${rows.length} rows. Import at most ${MAX_ROWS} at a time.` };
  const [users, projects, tags, fields] = await Promise.all([
    db.user.findMany({ where: visibleUsersWhere(me), select: { id: true, email: true, name: true, role: true, locationId: true, teamId: true } }),
    db.project.findMany({ include: projectInclude }),
    db.tag.findMany(),
    db.customField.findMany(),
  ]);
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));
  const userIds = [...new Set(rows.map(({ v: r }) => byEmail.get(r.email.toLowerCase())?.id).filter(Boolean))] as string[];
  const closed = userIds.length ? await db.timesheet.findMany({ where: { userId: { in: userIds }, status: { in: ["SUBMITTED", "APPROVED"] } }, select: { userId: true, weekStart: true } }) : [];
  const closedSet = new Set(closed.map((c) => `${c.userId}|${toStr(c.weekStart)}`));
  const out: { row: PreviewRow; data?: Prisma.TimeEntryCreateManyInput; key?: string }[] = rows.map(({ line, v: r }) => {
    const u = byEmail.get(r.email.toLowerCase());
    const matches = projects.filter((p) => p.name.toLowerCase() === r.project.toLowerCase() && (!r.client || p.client.name.toLowerCase() === r.client.toLowerCase()));
    const p = matches[0];
    const phases = p ? p.phases.filter((x) => x.sort < 999).sort((a, b) => a.sort - b.sort) : [];
    const phase = phases.find((x) => x.name.toLowerCase() === r.phase.toLowerCase());
    const tagId = r.tag ? tagByName.get(r.tag.toLowerCase()) : undefined;
    const minutes = parseDuration(r.hours);
    const start = (r.start ?? "").match(START);
    const custom = Object.fromEntries(fields.map((f) => [f.id, r[f.name.toLowerCase()] ?? ""]));
    const missingCustom = fields.filter((f) => f.required && !custom[f.id]).map((f) => f.name);
    const optionBad = fields.find((f) => f.type === "select" && custom[f.id] && !f.options.includes(custom[f.id]));
    const error =
      !isDateStr(r.date) ? "Date must look like 2026-03-31"
      : !u ? (r.email ? "Unknown person, or not someone you manage" : "No email")
      : !p ? "Unknown project"
      : matches.length > 1 ? "Two clients have a project with this name; add a Client column"
      : p.archived ? "That project is archived"
      : !canTrack(p, u) ? "That person doesn't have access to this project"
      : !phase ? `Phase must be one of: ${phases.map((x) => x.name).join(", ")}`
      : r.tag && !tagId ? "Unknown tag"
      : settings.requireTag && !tagId ? "Tag is required"
      : settings.requireDescription && !r.description ? "Description is required"
      : missingCustom.length ? `${missingCustom.join(", ")} required`
      : optionBad ? `${optionBad.name} must be one of: ${optionBad.options.join(", ")}`
      : !(minutes > 0) || minutes > 1440 ? "Hours must be like 1.5 or 1:30"
      : r.start && !start ? "Start must be a time like 09:30"
      : settings.lockBeforeStr && r.date <= settings.lockBeforeStr ? "Date is locked"
      : closedSet.has(`${u.id}|${monday(r.date)}`) ? "That week is already submitted or approved"
      : "";
    const cells = [r.date, u?.name ?? r.email, p ? `${p.name} (${p.client.name})` : r.project, phase?.name ?? r.phase, r.hours];
    if (error) return { row: { line, cells, error } };
    const startMin = start ? Number(start[1]) * 60 + Number(start[2]) : 9 * 60;
    const description = r.description ?? "";
    return {
      row: { line, cells, error },
      data: { userId: u!.id, projectId: p!.id, phaseId: phase!.id, tagId: tagId ?? null, description, custom, date: toDate(r.date), startMin, minutes },
      key: entryKey({ userId: u!.id, date: r.date, projectId: p!.id, phaseId: phase!.id, tagId: tagId ?? null, startMin, minutes, description }),
    };
  });

  // Rows that exactly match an entry already saved (same person, day, project, phase, tag, start, hours and description)
  // were most likely imported before, so they're left out rather than doubled.
  const ok = out.filter((o) => o.data);
  if (ok.length) {
    const dates = ok.map((o) => toStr(o.data!.date as Date)).sort();
    const existing = await db.timeEntry.findMany({
      where: { userId: { in: [...new Set(ok.map((o) => o.data!.userId))] }, date: { gte: toDate(dates[0]), lte: toDate(dates[dates.length - 1]) } },
      select: { userId: true, date: true, projectId: true, phaseId: true, tagId: true, startMin: true, minutes: true, description: true },
    });
    const have = new Set(existing.map((e) => entryKey({ ...e, date: toStr(e.date) })));
    for (const o of ok) if (have.has(o.key!)) { o.row.error = "Already imported"; o.data = undefined; }
  }
  return { headers: ["Date", "Person", "Project", "Phase", "Hours"], out };
}

async function checkProjects(me: Me, text: string) {
  const { keys, rows } = csvObjects(text);
  const need = ["client", "project"];
  const missingCols = need.filter((k) => !keys.includes(k));
  if (missingCols.length) return { error: `The first row must name at least these columns: client, project. Missing: ${missingCols.join(", ")}.` };
  if (rows.length > 2000) return { error: "Import at most 2,000 projects at a time." };
  const [clients, projects, users, locations] = await Promise.all([
    db.client.findMany(), db.project.findMany({ include: { client: true } }),
    db.user.findMany({ select: { id: true, email: true, role: true } }), db.location.findMany(),
  ]);
  const seen = new Set<string>();
  const out = rows.map(({ line, v: r }) => {
    const client = clients.find((c) => c.name.toLowerCase() === r.client.toLowerCase());
    const key = `${r.client.toLowerCase()}|${r.project.toLowerCase()}`;
    const dup = projects.some((p) => p.client.name.toLowerCase() === r.client.toLowerCase() && p.name.toLowerCase() === r.project.toLowerCase()) || seen.has(key);
    seen.add(key);
    const budget = r["budget hours"] ? Number(r["budget hours"]) : null;
    const phases = (r.phases || "Discovery;Design;Build;Launch;Support").split(";").map((x) => x.trim()).filter(Boolean);
    const restricted = /^(restricted|private)$/i.test(r.access ?? "");
    const people = (r.people ?? "").split(";").map((x) => x.trim().toLowerCase()).filter(Boolean);
    const offices = (r.offices ?? "").split(";").map((x) => x.trim().toLowerCase()).filter(Boolean);
    const managers = (r.managers ?? "").split(";").map((x) => x.trim().toLowerCase()).filter(Boolean);
    const userIds = people.map((e) => users.find((u) => u.email.toLowerCase() === e)?.id);
    const locIds = offices.map((o) => locations.find((l) => l.name.toLowerCase() === o)?.id);
    const mgrIds = managers.map((e) => users.find((u) => u.email.toLowerCase() === e && u.role !== "MEMBER")?.id);
    const error =
      !r.client ? "No client" : !r.project ? "No project name"
      : dup ? "Already exists"
      : !client && me.role !== "ADMIN" ? "Unknown client (only admins add clients)"
      : budget !== null && (isNaN(budget) || budget < 0) ? "Budget must be a number of hours"
      : userIds.includes(undefined) ? "Unknown email in People"
      : locIds.includes(undefined) ? "Unknown office"
      : mgrIds.includes(undefined) ? "Managers must be existing people who aren't team members"
      : restricted && !userIds.length && !locIds.length && me.role === "ADMIN" ? "Restricted projects need People or Offices"
      : "";
    return {
      row: { line, cells: [r.client, r.project, phases.join(", "), budget ? String(budget) : "", restricted ? "Restricted" : "Everyone"], error },
      data: error ? undefined : { client: r.client, clientId: client?.id, name: r.project, budget, phases, restricted, userIds: userIds as string[], locIds: locIds as string[], mgrIds: mgrIds as string[] },
    };
  });
  return { headers: ["Client", "Project", "Phases", "Budget h", "Access"], out };
}

export async function previewImport(_: ImportResult, form: FormData): Promise<ImportResult> {
  const me = await requireTab("import-export");
  const kind = form.get("kind") === "projects" ? "projects" : "time";
  let text = String(form.get("text") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size) text = await file.text();
  if (!text.trim()) return { kind, headers: [], rows: [], error: "Choose a CSV file or paste CSV text first." };
  const commit = form.get("commit") === "1";
  if (kind === "time") {
    const res = await checkTime(me, text);
    if ("error" in res) return { kind, headers: [], rows: [], error: res.error };
    const rows = res.out.map((o) => o.row);
    if (!commit) return { kind, headers: res.headers, rows };
    const data = res.out.map((o) => o.data).filter((d): d is Prisma.TimeEntryCreateManyInput => !!d);
    // All rows are saved together, or none are if something fails part way.
    const chunks = [];
    for (let i = 0; i < data.length; i += 1000) chunks.push(db.timeEntry.createMany({ data: data.slice(i, i + 1000) }));
    const imported = (await db.$transaction(chunks)).reduce((n, r) => n + r.count, 0);
    await logAction(me.id, `Imported ${imported} time entries from CSV`);
    revalidatePath("/timesheet");
    return { kind, headers: res.headers, rows, imported };
  }
  const res = await checkProjects(me, text);
  if ("error" in res) return { kind, headers: [], rows: [], error: res.error };
  const rows = res.out.map((o) => o.row);
  if (!commit) return { kind, headers: res.headers, rows };
  const pal = ["s1", "s2", "s3"];
  // All projects are saved together, or none are if something fails part way.
  const imported = await db.$transaction(async (tx) => {
    let n = 0;
    for (const { data: d } of res.out) {
      if (!d) continue;
      let clientId = d.clientId;
      if (!clientId) {
        const existing = await tx.client.findFirst({ where: { name: { equals: d.client, mode: "insensitive" } } });
        clientId = existing?.id ?? (await tx.client.create({ data: { name: d.client, color: pal[(await tx.client.count()) % 3] } })).id;
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
  await logAction(me.id, `Imported ${imported} projects from CSV`);
  revalidatePath("/projects");
  return { kind, headers: res.headers, rows, imported };
}
