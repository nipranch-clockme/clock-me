"use server";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTab, type Me } from "@/lib/auth";
import { manageError } from "@/lib/scope";
import { logAction } from "@/lib/settings";
import { roleName } from "@/lib/roles";
import { sendEmail, appUrl } from "@/lib/email";
import { issueLinkToken, INVITE_HOURS, RESET_HOURS } from "@/lib/tokens";
import { DUP_EMPLOYEE_ID, isDupEmployeeId, profileChanges, readProfileFields } from "@/lib/profile";

export type PeopleResult = { ok: boolean; error?: string; link?: string; message?: string } | null;
const ROLE_VALUES: Role[] = ["MEMBER", "LEADER", "PM", "LOCATION", "ADMIN"];

/** Location managers manage their own office and can't hand out admin or location manager roles. */
const checkScope = (me: Me, locationId: string, role: Role) => manageError(me, locationId, role);

/** `personId` is who's being edited (none for an invite), so their own employee ID doesn't count as taken. */
async function readPerson(form: FormData, personId?: string) {
  const role = String(form.get("role")) as Role;
  const locationId = String(form.get("locationId") ?? "");
  const teamId = String(form.get("teamId") ?? "") || null;
  if (!ROLE_VALUES.includes(role)) return { error: "Choose a role." };
  if (!(await db.location.findUnique({ where: { id: locationId } }))) return { error: "Choose an office." };
  if (teamId && !(await db.team.findFirst({ where: { id: teamId, locationId } }))) return { error: "That team isn't in the chosen office." };
  if ((role === "LEADER" || role === "PM") && !teamId) return { error: "Team leaders and project managers need a team." };
  const f = await readProfileFields(form, personId);
  if ("error" in f) return { error: f.error };
  return { data: { role, locationId, teamId, ...f.data, title: String(form.get("title") ?? "").trim() } };
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
  let created;
  try {
    created = await db.user.create({ data: { name, email, ...p.data } });
  } catch (e) {
    if (isDupEmployeeId(e)) return { ok: false, error: DUP_EMPLOYEE_ID };
    throw e;
  }
  const link = `${appUrl()}/invite/${await issueLinkToken(created.id, INVITE_HOURS)}`;
  const r = await sendEmail(email, "You're invited to Clock me", `Hi ${name.split(" ")[0]},\n\n${me.name} invited you to Clock me, where you'll log your time.\nSet your password here within 7 days: ${link}`);
  await logAction(me.id, `Invited ${name} (${email}) as ${roleName(p.data.role)}`, created.id);
  revalidatePath("/people");
  return { ok: true, link, message: r.sent ? `Invite emailed to ${email}. The link works for 7 days.` : `Email isn't switched on yet, so send ${name} this link yourself. It works for 7 days:` };
}

export async function updatePerson(_: PeopleResult, form: FormData): Promise<PeopleResult> {
  const me = await requireTab("people");
  const id = String(form.get("id"));
  const person = await db.user.findUnique({ where: { id } });
  if (!person) return { ok: false, error: "Person not found." };
  const scopeErr0 = checkScope(me, person.locationId, person.role);
  if (scopeErr0) return { ok: false, error: scopeErr0 };
  const p = await readPerson(form, id);
  if ("error" in p) return { ok: false, error: p.error };
  const scopeErr = checkScope(me, p.data.locationId, p.data.role);
  if (scopeErr) return { ok: false, error: scopeErr };
  const active = form.get("active") === "on";
  if (id === me.id && (!active || p.data.role !== me.role)) return { ok: false, error: "You can't change your own role or deactivate yourself. Ask another admin." };
  const name = String(form.get("name") ?? "").trim() || person.name;
  // A role, office or status change cancels any open invite or reset link (a new one can be made),
  // and deactivating someone signs them out everywhere.
  const sensitive = person.role !== p.data.role || person.locationId !== p.data.locationId || person.active !== active;
  try {
    await db.user.update({
      where: { id },
      data: { ...p.data, name, active, ...(sensitive ? { inviteToken: null, inviteExpires: null } : {}), ...(person.active && !active ? { sessionVersion: { increment: 1 } } : {}) },
    });
  } catch (e) {
    if (isDupEmployeeId(e)) return { ok: false, error: DUP_EMPLOYEE_ID };
    throw e;
  }
  const changes = [
    person.role !== p.data.role && `role to ${roleName(p.data.role)}`,
    ...profileChanges(person, p.data),
    person.locationId !== p.data.locationId && "office",
    person.teamId !== p.data.teamId && "team",
    person.active !== active && (active ? "reactivated" : "deactivated"),
  ].filter(Boolean);
  await logAction(me.id, `Updated ${name}${changes.length ? `: ${changes.join(", ")}` : ""}`, id);
  revalidatePath("/people");
  revalidatePath(`/profile/${id}`);
  return { ok: true };
}

export async function resetLink(_: PeopleResult, form: FormData): Promise<PeopleResult> {
  const me = await requireTab("people");
  const person = await db.user.findUnique({ where: { id: String(form.get("id")) } });
  if (!person) return { ok: false, error: "Person not found." };
  const scopeErr = checkScope(me, person.locationId, person.role);
  if (scopeErr) return { ok: false, error: scopeErr };
  if (!person.active) return { ok: false, error: "Reactivate this person first." };
  // Always a fresh link: any older one stops working.
  const hours = person.passwordHash ? RESET_HOURS : INVITE_HOURS;
  const link = `${appUrl()}/invite/${await issueLinkToken(person.id, hours)}`;
  const r = await sendEmail(person.email, person.passwordHash ? "Reset your Clock me password" : "You're invited to Clock me", `Set your password here within ${person.passwordHash ? "3 days" : "7 days"}: ${link}`);
  await logAction(me.id, `${person.passwordHash ? "Made a password reset link for" : "Made a new invite link for"} ${person.name}`, person.id);
  revalidatePath("/people");
  return { ok: true, link, message: r.sent ? `Link emailed to ${person.email}. It works for ${person.passwordHash ? "3 days" : "7 days"}.` : `Email isn't switched on yet, so send them this link. It works for ${person.passwordHash ? "3 days" : "7 days"}, and any older link has stopped working:` };
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
