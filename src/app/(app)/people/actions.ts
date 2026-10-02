"use server";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTab, type Me } from "@/lib/auth";
import { logAction } from "@/lib/settings";
import { roleName } from "@/lib/roles";
import { sendEmail, appUrl } from "@/lib/email";

export type PeopleResult = { ok: boolean; error?: string; link?: string; message?: string } | null;
const ROLE_VALUES: Role[] = ["MEMBER", "LEADER", "PM", "LOCATION", "ADMIN"];
const newToken = () => randomBytes(24).toString("base64url");

/** Location managers manage their own office and can't hand out admin or location manager roles. */
function checkScope(me: Me, locationId: string, role: Role): string | null {
  if (me.role === "ADMIN") return null;
  if (locationId !== me.locationId) return "You can only manage people in your own office.";
  if (role === "ADMIN" || role === "LOCATION") return "Only admins can make someone an admin or location manager.";
  return null;
}

async function readPerson(form: FormData) {
  const role = String(form.get("role")) as Role;
  const locationId = String(form.get("locationId") ?? "");
  const teamId = String(form.get("teamId") ?? "") || null;
  const target = parseFloat(String(form.get("weeklyTarget") ?? "40"));
  if (!ROLE_VALUES.includes(role)) return { error: "Choose a role." };
  if (!(await db.location.findUnique({ where: { id: locationId } }))) return { error: "Choose an office." };
  if (teamId && !(await db.team.findFirst({ where: { id: teamId, locationId } }))) return { error: "That team isn't in the chosen office." };
  if ((role === "LEADER" || role === "PM") && !teamId) return { error: "Team leaders and project managers need a team." };
  if (isNaN(target) || target < 0 || target > 80) return { error: "Weekly target should be between 0 and 80 hours." };
  return { data: { role, locationId, teamId, weeklyTarget: target, title: String(form.get("title") ?? "").trim() } };
}

export async function invitePerson(_: PeopleResult, form: FormData): Promise<PeopleResult> {
  const me = await requireTab("people");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!name) return { ok: false, error: "Add their name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  const p = await readPerson(form);
  if ("error" in p) return { ok: false, error: p.error };
  const scopeErr = checkScope(me, p.data.locationId, p.data.role);
  if (scopeErr) return { ok: false, error: scopeErr };
  if (await db.user.findUnique({ where: { email } })) return { ok: false, error: "Someone with that email already has an account." };
  const token = newToken();
  await db.user.create({ data: { name, email, ...p.data, inviteToken: token } });
  const link = `${appUrl()}/invite/${token}`;
  const r = await sendEmail(email, "You're invited to Clock me", `Hi ${name.split(" ")[0]},\n\n${me.name} invited you to Clock me, where you'll log your time.\nSet your password here: ${link}`);
  await logAction(me.id, `Invited ${name} (${email}) as ${roleName(p.data.role)}`);
  revalidatePath("/people");
  return { ok: true, link, message: r.sent ? `Invite emailed to ${email}.` : `Email isn't switched on yet, so send ${name} this link yourself:` };
}

export async function updatePerson(_: PeopleResult, form: FormData): Promise<PeopleResult> {
  const me = await requireTab("people");
  const id = String(form.get("id"));
  const person = await db.user.findUnique({ where: { id } });
  if (!person) return { ok: false, error: "Person not found." };
  const p = await readPerson(form);
  if ("error" in p) return { ok: false, error: p.error };
  const scopeErr = checkScope(me, person.locationId, person.role) ?? checkScope(me, p.data.locationId, p.data.role);
  if (scopeErr) return { ok: false, error: scopeErr };
  const active = form.get("active") === "on";
  if (id === me.id && (!active || p.data.role !== me.role)) return { ok: false, error: "You can't change your own role or deactivate yourself. Ask another admin." };
  const name = String(form.get("name") ?? "").trim() || person.name;
  await db.user.update({ where: { id }, data: { ...p.data, name, active } });
  const changes = [
    person.role !== p.data.role && `role to ${roleName(p.data.role)}`,
    person.weeklyTarget !== p.data.weeklyTarget && `weekly target to ${p.data.weeklyTarget} h`,
    person.locationId !== p.data.locationId && "office",
    person.teamId !== p.data.teamId && "team",
    person.active !== active && (active ? "reactivated" : "deactivated"),
  ].filter(Boolean);
  await logAction(me.id, `Updated ${name}${changes.length ? `: ${changes.join(", ")}` : ""}`);
  revalidatePath("/people");
  return { ok: true };
}

export async function resetLink(_: PeopleResult, form: FormData): Promise<PeopleResult> {
  const me = await requireTab("people");
  const person = await db.user.findUnique({ where: { id: String(form.get("id")) } });
  if (!person) return { ok: false, error: "Person not found." };
  const scopeErr = checkScope(me, person.locationId, person.role);
  if (scopeErr) return { ok: false, error: scopeErr };
  const token = person.inviteToken ?? newToken();
  if (!person.inviteToken) await db.user.update({ where: { id: person.id }, data: { inviteToken: token } });
  const link = `${appUrl()}/invite/${token}`;
  const r = await sendEmail(person.email, person.passwordHash ? "Reset your Clock me password" : "You're invited to Clock me", `Set your password here: ${link}`);
  await logAction(me.id, `${person.passwordHash ? "Sent a password reset link to" : "Re-sent the invite to"} ${person.name}`);
  revalidatePath("/people");
  return { ok: true, link, message: r.sent ? `Link emailed to ${person.email}.` : "Email isn't switched on yet, so send them this link:" };
}

export async function addOffice(_: PeopleResult, form: FormData): Promise<PeopleResult> {
  const me = await requireTab("people");
  if (me.role !== "ADMIN") return { ok: false, error: "Only admins can add offices." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name the office." };
  if (await db.location.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) return { ok: false, error: "That office already exists." };
  await db.location.create({ data: { name } });
  await logAction(me.id, `Added office ${name}`);
  revalidatePath("/people");
  return { ok: true };
}

export async function addTeam(_: PeopleResult, form: FormData): Promise<PeopleResult> {
  const me = await requireTab("people");
  const name = String(form.get("name") ?? "").trim();
  const locationId = me.role === "ADMIN" ? String(form.get("locationId") ?? "") : me.locationId;
  if (!name) return { ok: false, error: "Name the team." };
  const loc = await db.location.findUnique({ where: { id: locationId } });
  if (!loc) return { ok: false, error: "Choose an office." };
  if (await db.team.findFirst({ where: { locationId, name: { equals: name, mode: "insensitive" } } })) return { ok: false, error: `${loc.name} already has a ${name} team.` };
  await db.team.create({ data: { name, locationId } });
  await logAction(me.id, `Added team ${name} in ${loc.name}`);
  revalidatePath("/people");
  return { ok: true };
}
