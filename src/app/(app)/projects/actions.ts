"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/settings";
import { canCreateProject, canEditProject } from "@/lib/scope";
import { perMonth } from "@/lib/clients";
import type { ClientType } from "@prisma/client";

export type FormResult = { ok: boolean; error?: string } | null;
const list = (form: FormData, k: string) => form.getAll(k).map(String).filter(Boolean);

export async function saveProject(_: FormResult, form: FormData): Promise<FormResult> {
  const me = await requireUser();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const clientId = String(form.get("clientId") ?? "");
  const phases = String(form.get("phases") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const budget = parseFloat(String(form.get("budget") ?? ""));
  const access = form.get("access") === "RESTRICTED" ? "RESTRICTED" : "PUBLIC";
  const locs = list(form, "loc"), teams = list(form, "team"), users = list(form, "user");
  const managers = new Set(list(form, "manager"));
  if (!name) return { ok: false, error: "Give the project a name." };
  if (!(await db.client.findUnique({ where: { id: clientId } }))) return { ok: false, error: "Choose a client." };
  if (!phases.length) return { ok: false, error: "Add at least one phase." };
  if (new Set(phases.map((p) => p.toLowerCase())).size !== phases.length) return { ok: false, error: "Each phase name must be different." };
  if (access === "RESTRICTED" && !locs.length && !teams.length && !users.length) return { ok: false, error: "Pick at least one office, team or person, or make it visible to everyone." };
  if (me.role !== "ADMIN") managers.add(me.id);
  const dup = await db.project.findFirst({ where: { clientId, name: { equals: name, mode: "insensitive" }, NOT: id ? { id } : undefined } });
  if (dup) return { ok: false, error: "This client already has a project with that name." };

  const accessData = {
    locations: { create: locs.map((locationId) => ({ locationId })) },
    teams: { create: teams.map((teamId) => ({ teamId })) },
    users: { create: users.map((userId) => ({ userId })) },
    managers: { create: [...managers].map((userId) => ({ userId })) },
  };
  if (id) {
    const p = await db.project.findUnique({ where: { id }, include: { managers: true, phases: true } });
    if (!p || !canEditProject(me, p.managers.map((m) => m.userId))) return { ok: false, error: "You can only edit projects you manage." };
    await db.$transaction(async (tx) => {
      await tx.projectLocationAccess.deleteMany({ where: { projectId: id } });
      await tx.projectTeamAccess.deleteMany({ where: { projectId: id } });
      await tx.projectUserAccess.deleteMany({ where: { projectId: id } });
      await tx.projectManager.deleteMany({ where: { projectId: id } });
      // Keep existing phases (and the time logged against them); add new ones; remove unused ones that were taken out.
      for (const [i, ph] of phases.entries()) {
        const ex = p.phases.find((x) => x.name.toLowerCase() === ph.toLowerCase());
        if (ex) await tx.phase.update({ where: { id: ex.id }, data: { name: ph, sort: i } });
        else await tx.phase.create({ data: { projectId: id, name: ph, sort: i } });
      }
      for (const ex of p.phases) {
        if (phases.some((ph) => ph.toLowerCase() === ex.name.toLowerCase())) continue;
        const used = await tx.timeEntry.count({ where: { phaseId: ex.id } });
        if (used) await tx.phase.update({ where: { id: ex.id }, data: { sort: 999 } });
        else await tx.phase.delete({ where: { id: ex.id } });
      }
      await tx.project.update({
        where: { id },
        data: { name, clientId, budgetHours: isNaN(budget) || budget <= 0 ? null : budget, access, archived: form.get("archived") === "on", ...accessData },
      });
    });
    await logAction(me.id, `Updated project ${name}${p.access !== access ? ` and made it ${access === "RESTRICTED" ? "restricted" : "visible to everyone"}` : ""}`);
  } else {
    if (!canCreateProject(me)) return { ok: false, error: "Team members can't create projects." };
    await db.project.create({
      data: { name, clientId, budgetHours: isNaN(budget) || budget <= 0 ? null : budget, access, phases: { create: phases.map((n, sort) => ({ name: n, sort })) }, ...accessData },
    });
    await logAction(me.id, `Created project ${name}`);
  }
  revalidatePath("/projects");
  return { ok: true };
}

/** A client's type and contracted hours from a form. Hours only apply to fixed clients and must be above 0. */
function readContract(form: FormData): { type: ClientType; monthlyHours: number | null } | { error: string } {
  const type = form.get("type") === "FIXED" ? "FIXED" : "FLOATING";
  if (type === "FLOATING") return { type, monthlyHours: null };
  const raw = String(form.get("monthlyHours") ?? "").trim(), h = Number(raw);
  if (!raw || !Number.isFinite(h) || h <= 0) return { error: "Enter the contracted hours per month, more than 0." };
  if (h > 100000) return { error: "Contracted hours per month must be 100,000 or less." };
  return { type, monthlyHours: h };
}
const contractText = (c: { type: ClientType; monthlyHours: number | null }) => (c.type === "FIXED" && c.monthlyHours ? `fixed monthly hours, ${perMonth(c.monthlyHours)}` : "no commitment");

export async function addClient(_: FormResult, form: FormData): Promise<FormResult> {
  const me = await requireUser();
  if (me.role !== "ADMIN") return { ok: false, error: "Only admins can add clients." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name the client." };
  const contract = readContract(form);
  if ("error" in contract) return { ok: false, error: contract.error };
  if (await db.client.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) return { ok: false, error: "That client already exists." };
  const n = await db.client.count();
  await db.client.create({ data: { name, color: ["s1", "s2", "s3"][n % 3], ...contract } });
  await logAction(me.id, `Added client ${name} (${contractText(contract)})`);
  revalidatePath("/projects");
  revalidatePath("/clients", "layout");
  return { ok: true };
}

export async function updateClient(_: FormResult, form: FormData): Promise<FormResult> {
  const me = await requireUser();
  if (me.role !== "ADMIN") return { ok: false, error: "Only admins can change clients." };
  const client = await db.client.findUnique({ where: { id: String(form.get("id") ?? "") } });
  if (!client) return { ok: false, error: "That client no longer exists." };
  const contract = readContract(form);
  if ("error" in contract) return { ok: false, error: contract.error };
  await db.client.update({ where: { id: client.id }, data: contract });
  if (contractText(client) !== contractText(contract)) await logAction(me.id, `Changed client ${client.name} to ${contractText(contract)}`);
  revalidatePath("/projects");
  revalidatePath("/clients", "layout");
  return { ok: true };
}
