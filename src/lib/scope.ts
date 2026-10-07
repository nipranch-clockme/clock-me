import type { Prisma, Role } from "@prisma/client";
import type { Me } from "./auth";

/** Whose entries this person may see: own (member), own team (team/project manager), own office (location manager), everyone (admin). */
export function visibleUsersWhere(me: Me): Prisma.UserWhereInput {
  switch (me.role) {
    case "ADMIN": return {};
    case "LOCATION": return { locationId: me.locationId };
    case "LEADER": return me.teamId ? { teamId: me.teamId } : { id: me.id };
    default: return { id: me.id };
  }
}

/** Whose timesheets this person approves. A Team/Project Manager approves their own team, themselves included. Location managers and admins
 *  can approve anyone in their office or company (never their own), but it's the managers' job first: see escalatedSheetsWhere. */
export function approverUsersWhere(me: Me): Prisma.UserWhereInput | null {
  switch (me.role) {
    case "ADMIN": return { id: { not: me.id } };
    case "LOCATION": return { locationId: me.locationId, id: { not: me.id } };
    case "LEADER": return me.teamId ? { teamId: me.teamId } : null;
    default: return null;
  }
}

/** Why this person can't manage someone in that office with that role, or null when they can. Admins manage everyone.
 *  Location managers manage their own office, but not admins or location managers. */
export function manageError(me: Me, locationId: string, role: Role): string | null {
  if (me.role === "ADMIN") return null;
  if (me.role !== "LOCATION") return "You don't have permission to do that.";
  if (locationId !== me.locationId) return "You can only manage people in your own office.";
  if (role === "ADMIN" || role === "LOCATION") return "Only admins can make someone an admin or location manager.";
  return null;
}
/** Who may change someone's employee ID, joining date, expected hours and (besides the person) profile picture:
 *  the same people who edit them on the People page. */
export const canManagePerson = (me: Me, p: { locationId: string; role: Role }) => !manageError(me, p.locationId, p.role);

/** Why this person can't add or remove someone's time off, or null when they can. Everyone manages their own. A Team/Project
 *  Manager manages their team, a location manager their office (never admins or location managers, as with people), an admin everyone. */
export function timeOffError(me: Me, p: { id: string; locationId: string; teamId: string | null; role: Role }): string | null {
  if (p.id === me.id || me.role === "ADMIN") return null;
  const NO = "You don't have permission to change that person's time off.";
  if (me.role === "MEMBER") return NO;
  if (p.role === "ADMIN" || p.role === "LOCATION") return "Only admins can change an admin's or location manager's time off.";
  if (me.role === "LOCATION") return p.locationId === me.locationId ? null : "You can only change time off for people in your own office.";
  return me.teamId && p.teamId === me.teamId ? null : NO;
}
export const canManageTimeOff = (me: Me, p: Parameters<typeof timeOffError>[1]) => !timeOffError(me, p);

/** Why this person can't change an office's public holidays, or null when they can: admins any office, location managers their own. */
export function holidayError(me: Me, locationId: string): string | null {
  if (me.role === "ADMIN" || (me.role === "LOCATION" && locationId === me.locationId)) return null;
  return me.role === "LOCATION" ? "You can only change the holidays of your own office." : "Only admins and the office's location manager can change its public holidays.";
}
export const canManageHolidays = (me: Me, locationId: string) => !holidayError(me, locationId);

export const scopeLabel = (me: Me) =>
  me.role === "ADMIN" ? "Whole company"
  : me.role === "LOCATION" ? `${me.location.name} office`
  : me.role === "MEMBER" ? "Your own time"
  : me.team ? `${me.team.name} team, ${me.location.name}` : "Your own time";

/** Projects this person may see on the Projects page and in exports, archived ones included: public ones, ones shared
 *  with them, their team or their office, and ones they manage. Admins see all. */
export function visibleProjectsWhere(me: Me): Prisma.ProjectWhereInput {
  if (me.role === "ADMIN") return {};
  return {
    OR: [
      { access: "PUBLIC" },
      { users: { some: { userId: me.id } } },
      { managers: { some: { userId: me.id } } },
      { locations: { some: { locationId: me.locationId } } },
      ...(me.teamId ? [{ teams: { some: { teamId: me.teamId } } }] : []),
    ],
  };
}

/** Projects a team member has been added to, which is all their Projects page lists: restricted projects shared with
 *  them, their team or their office, or managed by them. Open-to-everyone projects aren't listed there, though they can
 *  still log time on them. Archived projects are left out. */
export function addedProjectsWhere(me: Me): Prisma.ProjectWhereInput {
  return {
    archived: false,
    access: "RESTRICTED",
    OR: [
      { users: { some: { userId: me.id } } },
      { managers: { some: { userId: me.id } } },
      { locations: { some: { locationId: me.locationId } } },
      ...(me.teamId ? [{ teams: { some: { teamId: me.teamId } } }] : []),
    ],
  };
}

/** Projects this person can log time on: the visible ones that aren't archived. */
export function trackableProjectsWhere(me: Me): Prisma.ProjectWhereInput {
  return { AND: [visibleProjectsWhere(me), { archived: false }] };
}

export const canCreateProject = (me: Me) => me.role !== "MEMBER";
export const canEditProject = (me: Me, managerIds: string[]) => me.role === "ADMIN" || (me.role !== "MEMBER" && managerIds.includes(me.id));

/** Days a submitted week may wait for its Team/Project Manager before location managers and admins are asked to step in. */
export const ESCALATE_DAYS = 3;

/** Submitted weeks that location managers and admins really need to handle: the person's team has no Team/Project Manager who can approve
 *  (managers' and admins' own weeks, people without a team), or the week has waited longer than ESCALATE_DAYS. */
export function escalatedSheetsWhere(now = new Date()): Prisma.TimesheetWhereInput {
  const cutoff = new Date(now.getTime() - ESCALATE_DAYS * 86400000);
  return {
    OR: [
      { user: { teamId: null } },
      { user: { team: { users: { none: { role: "LEADER", active: true, passwordHash: { not: null } } } } } },
      { updatedAt: { lt: cutoff } },
    ],
  };
}
