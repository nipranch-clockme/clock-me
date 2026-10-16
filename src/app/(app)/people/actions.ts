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
const ROLE_VALUES: Role[] = ["MEMBER", "LEADER", "LOCATION", "GUEST", "ADMIN"];

/** Location managers manage their own office and can't hand out the Admin or Location manager roles. */
const checkScope = (me: Me, locationId: string, role: Role) => manageError(me, locationId, role);

/** `personId` is who's being edited (none for an invite), so their own employee ID doesn't count as taken. */
async function readPerson(form: FormData, personId?: string) {
  const role = String(form.get("role")) as Role;
  const locationId = String(form.get("locationId") ?? "");
  const teamId = String(form.get("teamId") ?? "") || null;
  if (!ROLE_VALUES.includes(role)) return { error: "Choose a role." };
  if (!(await db.location.findUnique({ where: { id: locationId } }))) return { error: "Choose an office." };
  if (teamId && !(await db.team.findFirst({ where: { id: teamId, locationId } }))) return { error: "That team isn't in the chosen office." };
  if (role === "LEADER" && !teamId) return { error: "Team/Project Managers need a team." };
  const f = await readProfileFields(form, personId);
  if ("error" in f) return { error: f.error };
  // A Guest is a contractor with no expected hours, whatever the form says.
  return { data: { role, locationId, teamId, ...f.data, weeklyTarget: role === "GUEST" ? 0 : f.data.weeklyTarget, title: String(form.get("title") ?? "").trim() } };
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
  const r = await sendEmail(email, "You're invited to The Time Sink", `Hi ${name.split(" ")[0]},\n\n${me.name} invited you to The Time Sink, where you'll log your time.\nSet your password here within 7 days: ${link}`);
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
  // Archiving has its own action (setArchived), so this form never changes whether someone is active.
  if (id === me.id && p.data.role !== me.role) return { ok: false, error: "You can't change your own role. Ask another Admin." };
  const name = String(form.get("name") ?? "").trim() || person.name;
  // A role or office change cancels any open invite or reset link (a new one can be made).
  const sensitive = person.role !== p.data.role || person.locationId !== p.data.locationId;
  try {
    await db.user.update({
      where: { id },
      data: { ...p.data, name, ...(sensitive ? { inviteToken: null, inviteExpires: null } : {}) },
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
  ].filter(Boolean);
  await logAction(me.id, `Updated ${name}${changes.length ? `: ${changes.join(", ")}` : ""}`, id);
  revalidatePath("/people");
  revalidatePath(`/profile/${id}`);
  return { ok: true };
}

/** Archives someone or restores them. Nothing is deleted: their time, reports and history stay as they are. */
export async function setArchived(_: PeopleResult, form: FormData): Promise<PeopleResult> {
  const me = await requireTab("people");
  const id = String(form.get("id"));
  const archive = form.get("archive") === "1";
  const person = await db.user.findUnique({ where: { id } });
  if (!person) return { ok: false, error: "Person not found." };
  const scopeErr = checkScope(me, person.locationId, person.role);
  if (scopeErr) return { ok: false, error: scopeErr };
  if (id === me.id) return { ok: false, error: "You can't archive yourself. Ask another Admin." };
  if (person.active === !archive) return { ok: true }; // already in the state asked for
  if (archive && person.role === "ADMIN" && (await db.user.count({ where: { role: "ADMIN", active: true } })) <= 1) return { ok: false, error: "Keep at least one active Admin." };
  // Archiving signs them out everywhere and cancels any open invite or reset link.
  await db.user.update({
    where: { id },
    data: archive ? { active: false, inviteToken: null, inviteExpires: null, sessionVersion: { increment: 1 } } : { active: true },
  });
  await logAction(me.id, `${archive ? "Archived" : "Restored"} ${person.name}`, id);
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
  if (!person.active) return { ok: false, error: "Restore this person first." };
  // Always a fresh link: any older one stops working.
  const hours = person.passwordHash ? RESET_HOURS : INVITE_HOURS;
  const link = `${appUrl()}/invite/${await issueLinkToken(person.id, hours)}`;
  const r = await sendEmail(person.email, person.passwordHash ? "Reset your password for The Time Sink" : "You're invited to The Time Sink", `Set your password here within ${person.passwordHash ? "3 days" : "7 days"}: ${link}`);
  await logAction(me.id, `${person.passwordHash ? "Made a password reset link for" : "Made a new invite link for"} ${person.name}`, person.id);
  revalidatePath("/people");
  return { ok: true, link, message: r.sent ? `Link emailed to ${person.email}. It works for ${person.passwordHash ? "3 days" : "7 days"}.` : `Email isn't switched on yet, so send them this link. It works for ${person.passwordHash ? "3 days" : "7 days"}, and any older link has stopped working:` };
}

export async function addOffice(_: PeopleResult, form: FormData): Promise<PeopleResult> {
  const me = await requireTab("people");
  if (me.role !== "ADMIN") return { ok: false, error: "Only Admins can add offices." };
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

/** Renames an office. The name is kept in one place, so it changes everywhere at once (people, teams, reports, filters). */
export async function renameOffice(id: string, newName: string): Promise<PeopleResult> {
  const me = await requireTab("people");
  if (me.role !== "ADMIN") return { ok: false, error: "Only Admins can rename offices." };
  const name = String(newName ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Name the office." };
  if (name.length > 80) return { ok: false, error: "An office name can be up to 80 characters." };
  const loc = await db.location.findUnique({ where: { id } });
  if (!loc) return { ok: false, error: "That office no longer exists." };
  if (await db.location.findFirst({ where: { id: { not: id }, name: { equals: name, mode: "insensitive" } } })) return { ok: false, error: "Another office already has that name." };
  if (loc.name === name) return { ok: true };
  await db.location.update({ where: { id }, data: { name } });
  await logAction(me.id, `Renamed office ${loc.name} to ${name}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Deletes an office that nobody belongs to (archived people count, since their history stays with the office).
 * Its teams, public holidays and project access go with it; clients looked after by one of its teams are left without a team.
 */
export async function deleteOffice(id: string): Promise<PeopleResult> {
  const me = await requireTab("people");
  if (me.role !== "ADMIN") return { ok: false, error: "Only Admins can delete offices." };
  const loc = await db.location.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!loc) return { ok: false, error: "That office no longer exists." };
  if ((await db.location.count()) <= 1) return { ok: false, error: "This is the only office, so it can't be deleted." };
  const n = loc._count.users;
  if (n) return { ok: false, error: `${loc.name} still has ${n === 1 ? "1 person" : `${n} people`} (archived people included). Move them to another office on this page first.` };
  await db.$transaction([
    db.team.deleteMany({ where: { locationId: id } }),
    db.location.delete({ where: { id } }),
  ]);
  await logAction(me.id, `Deleted office ${loc.name}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Admins rename any team, Location managers the teams in their own office. The name changes everywhere at once. */
async function teamInReach(id: string) {
  const me = await requireTab("people");
  const team = await db.team.findUnique({ where: { id }, include: { location: true, _count: { select: { users: true, clients: true } } } });
  if (!team) return { me, error: "That team no longer exists." } as const;
  if (me.role !== "ADMIN" && !(me.role === "LOCATION" && me.locationId === team.locationId)) return { me, error: "Only Admins, or the Location manager of its office, can change a team." } as const;
  return { me, team } as const;
}

export async function renameTeam(id: string, newName: string): Promise<PeopleResult> {
  const r = await teamInReach(id);
  if ("error" in r) return { ok: false, error: r.error };
  const { me, team } = r;
  const name = String(newName ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Name the team." };
  if (name.length > 80) return { ok: false, error: "A team name can be up to 80 characters." };
  if (await db.team.findFirst({ where: { id: { not: id }, locationId: team.locationId, name: { equals: name, mode: "insensitive" } } })) return { ok: false, error: `${team.location.name} already has a ${name} team.` };
  if (team.name === name) return { ok: true };
  await db.team.update({ where: { id }, data: { name } });
  await logAction(me.id, `Renamed team ${team.name} in ${team.location.name} to ${name}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Deletes a team nobody is assigned to (archived people included). Clients it looked after are left without a team. */
export async function deleteTeam(id: string): Promise<PeopleResult> {
  const r = await teamInReach(id);
  if ("error" in r) return { ok: false, error: r.error };
  const { me, team } = r;
  const n = team._count.users;
  if (n) return { ok: false, error: `${team.name} still has ${n === 1 ? "1 person" : `${n} people`} assigned (archived people included). Move them to another team first.` };
  await db.team.delete({ where: { id } });
  await logAction(me.id, `Deleted team ${team.name} in ${team.location.name}`);
  revalidatePath("/", "layout");
  return { ok: true };
}
