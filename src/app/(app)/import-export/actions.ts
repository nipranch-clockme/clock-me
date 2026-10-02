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

async function checkTime(me: Me, text: string) {
  const settings = await getSettings();
  const { keys, rows } = csvObjects(text);
  const need = ["date", "email", "project", "phase", "hours"];
  const missingCols = need.filter((k) => !keys.includes(k));
  if (missingCols.length) return { error: `The first row must name these columns: ${need.join(", ")}. Missing: ${missingCols.join(", ")}.` };
  if (rows.length > MAX_ROWS) return { error: `That file has ${rows.length} rows. Import at most ${MAX_ROWS} at a time.` };
  const [users, projects, tags, fields] = await Promise.all([
    db.user.findMany({ where: visibleUsersWhere(me), select: { id: true, email: true, name: true } }),
    db.project.findMany({ include: { client: true, phases: true } }),
    db.tag.findMany(),
    db.customField.findMany(),
  ]);
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));
  const userIds = [...new Set(rows.map((r) => byEmail.get(r.email.toLowerCase())?.id).filter(Boolean))] as string[];
  const closed = userIds.length ? await db.timesheet.findMany({ where: { userId: { in: userIds }, status: { in: ["SUBMITTED", "APPROVED"] } }, select: { userId: true, weekStart: true } }) : [];
  const closedSet = new Set(closed.map((c) => `${c.userId}|${toStr(c.weekStart)}`));
  const out: { row: PreviewRow; data?: Prisma.TimeEntryCreateManyInput }[] = rows.map((r, i) => {
    const u = byEmail.get(r.email.toLowerCase());
    const matches = projects.filter((p) => p.name.toLowerCase() === r.project.toLowerCase() && (!r.client || p.client.name.toLowerCase() === r.client.toLowerCase()));
    const p = matches[0];
    const phase = p?.phases.find((x) => x.name.toLowerCase() === r.phase.toLowerCase());
    const tagId = r.tag ? tagByName.get(r.tag.toLowerCase()) : undefined;
    const minutes = parseDuration(r.hours);
    const [hh, mm] = (r.start || "09:00").split(":").map(Number);
    const custom = Object.fromEntries(fields.map((f) => [f.id, r[f.name.toLowerCase()] ?? ""]));
    const missingCustom = fields.filter((f) => f.required && !custom[f.id]).map((f) => f.name);
    const optionBad = fields.find((f) => f.type === "select" && custom[f.id] && !f.options.includes(custom[f.id]));
    const error =
      !isDateStr(r.date) ? "Date must look like 2026-03-31"
      : !u ? (r.email ? "Unknown person, or not someone you manage" : "No email")
      : !p ? "Unknown project"
      : matches.length > 1 ? "Two clients have a project with this name; add a Client column"
      : !phase ? `Phase must be one of: ${p.phases.map((x) => x.name).join(", ")}`
      : r.tag && !tagId ? "Unknown tag"
      : settings.requireTag && !tagId ? "Tag is required"
      : settings.requireDescription && !r.description ? "Description is required"
      : missingCustom.length ? `${missingCustom.join(", ")} required`
      : optionBad ? `${optionBad.name} must be one of: ${optionBad.options.join(", ")}`
      : !(minutes > 0) || minutes > 1440 ? "Hours must be like 1.5 or 1:30"
      : settings.lockBeforeStr && r.date <= settings.lockBeforeStr ? "Date is locked"
      : closedSet.has(`${u.id}|${monday(r.date)}`) ? "That week is already submitted or approved"
      : "";
    return {
      row: { line: i + 2, cells: [r.date, u?.name ?? r.email, p ? `${p.name} (${p.client.name})` : r.project, phase?.name ?? r.phase, r.hours], error },
      data: error ? undefined : { userId: u!.id, projectId: p!.id, phaseId: phase!.id, tagId: tagId ?? null, description: r.description ?? "", custom, date: toDate(r.date), startMin: (hh || 9) * 60 + (mm || 0), minutes },
    };
  });
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
  const out = rows.map((r, i) => {
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
      row: { line: i + 2, cells: [r.client, r.project, phases.join(", "), budget ? String(budget) : "", restricted ? "Restricted" : "Everyone"], error },
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
    let imported = 0;
    for (let i = 0; i < data.length; i += 1000) imported += (await db.timeEntry.createMany({ data: data.slice(i, i + 1000) })).count;
    await logAction(me.id, `Imported ${imported} time entries from CSV`);
    revalidatePath("/timesheet");
    return { kind, headers: res.headers, rows, imported };
  }
  const res = await checkProjects(me, text);
  if ("error" in res) return { kind, headers: [], rows: [], error: res.error };
  const rows = res.out.map((o) => o.row);
  if (!commit) return { kind, headers: res.headers, rows };
  const pal = ["s1", "s2", "s3"];
  let imported = 0;
  for (const { data: d } of res.out) {
    if (!d) continue;
    let clientId = d.clientId;
    if (!clientId) {
      const existing = await db.client.findFirst({ where: { name: { equals: d.client, mode: "insensitive" } } });
      clientId = existing?.id ?? (await db.client.create({ data: { name: d.client, color: pal[(await db.client.count()) % 3] } })).id;
    }
    const mgr = new Set(d.mgrIds);
    if (me.role !== "ADMIN") mgr.add(me.id);
    const restrictedToMe = d.restricted && !d.userIds.length && !d.locIds.length;
    await db.project.create({
      data: {
        name: d.name, clientId, budgetHours: d.budget || null, access: d.restricted ? "RESTRICTED" : "PUBLIC",
        phases: { create: d.phases.map((name, sort) => ({ name, sort })) },
        managers: { create: [...mgr].map((userId) => ({ userId })) },
        users: { create: (restrictedToMe ? [me.id] : d.userIds).map((userId) => ({ userId })) },
        locations: { create: d.locIds.map((locationId) => ({ locationId })) },
      },
    });
    imported++;
  }
  await logAction(me.id, `Imported ${imported} projects from CSV`);
  revalidatePath("/projects");
  return { kind, headers: res.headers, rows, imported };
}
