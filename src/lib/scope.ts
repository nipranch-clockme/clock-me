import type { Prisma, Role } from "@prisma/client";
import type { Me } from "./auth";

/** Guests don't see which client a project belongs to: they see the project name only. */
export const hidesClients = (me: Me) => me.role === "GUEST";
/** The client's colour, or a neutral one for a Guest, so colours don't give the client away either. */
export const clientColorFor = (me: Me, color: string) => (hidesClients(me) ? "s4" : color);

/** People who have hours expected of them: usual weekly hours above 0, or at least one month above 0 in the monthly hours table. Admins and
 *  are not a resource, so the screens that work out utilisation add `role: { notIn: NOT_A_RESOURCE }` as well. */
export const expectsHoursWhere: Prisma.UserWhereInput = { OR: [{ weeklyTarget: { gt: 0 } }, { monthlyHours: { some: { weeklyHours: { gt: 0 } } } }] };
/** People who count on the Dashboard and in Approvals: they have set up their account, or they already have time (imported history counts before they are invited). */
export const countsAsStartedWhere: Prisma.UserWhereInput = { OR: [{ passwordHash: { not: null } }, { entries: { some: {} } }] };

/** Whose entries this person may see: own (member), own team (team/project manager), own office (location manager), everyone (admin).
 *  sees only their own entries; the Dashboard's utilisation uses utilisationUsersWhere instead. */
export function visibleUsersWhere(me: Me): Prisma.UserWhereInput {
  switch (me.role) {
    case "ADMIN": return {};
    case "LOCATION": return { locationId: me.locationId };
    case "LEADER": return me.teamId ? { teamId: me.teamId } : { id: me.id };
    default: return { id: me.id };
  }
}

/** Whose utilisation this person sees on the Dashboard: the same as visibleUsersWhere, except that Admins see everyone's (hours and
 *  target only, no entries or clients). */
export function utilisationUsersWhere(me: Me): Prisma.UserWhereInput {
  return visibleUsersWhere(me);
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
  if (role === "ADMIN" || role === "LOCATION" || role === "GUEST") return "Only Admins can make someone an Admin, Location manager or Guest.";
  return null;
}
/** Who may change someone's employee ID, joining date, expected hours and (besides the person) profile picture:
 *  the same people who edit them on the People page. */
export const canManagePerson = (me: Me, p: { locationId: string; role: Role }) => !manageError(me, p.locationId, p.role);

/** Why this person can't add or remove someone's time off, or null when they can. Everyone manages their own (by asking for it, see
 *  time-off/actions.ts). A location manager adds it for their office (never admins or location managers, as with people), an admin for
 *  anyone. Team/Project Managers can't add or remove anyone else's. */
export function timeOffError(me: Me, p: { id: string; locationId: string; role: Role }): string | null {
  if (p.id === me.id || me.role === "ADMIN") return null;
  if (me.role !== "LOCATION") return "Only Location managers and Admins can add or change someone else's time off.";
  if (p.locationId !== me.locationId) return "You can only change time off for people in your own office.";
  if (p.role === "ADMIN" || p.role === "LOCATION") return "Only Admins can change an Admin's or Location manager's time off.";
  return null;
}
export const canManageTimeOff = (me: Me, p: Parameters<typeof timeOffError>[1]) => !timeOffError(me, p);

/** Who may approve a request for time off from this person, or null when they may not. An admin approves anyone's but their own; a
 *  location manager approves the members and team managers of their office. Nobody approves their own request. */
export function timeOffApproveError(me: Me, p: { id: string; locationId: string; role: Role }): string | null {
  if (p.id === me.id) return "You can't approve your own time off. Another Admin or Location manager does that.";
  if (me.role === "ADMIN") return null;
  if (me.role !== "LOCATION") return "Only Location managers and Admins approve time off.";
  if (p.locationId !== me.locationId) return "You can only approve time off for people in your own office.";
  if (p.role === "ADMIN" || p.role === "LOCATION") return "Only Admins approve time off for an Admin or a Location manager.";
  return null;
}
/** The pending time off requests this person may approve (none for other roles). */
export function timeOffApproverWhere(me: Me): Prisma.TimeOffWhereInput | null {
  if (me.role === "ADMIN") return { status: "PENDING", userId: { not: me.id } };
  if (me.role === "LOCATION") return { status: "PENDING", userId: { not: me.id }, user: { locationId: me.locationId, role: { in: ["MEMBER", "LEADER"] } } };
  return null;
}

/** Why this person can't add or change someone's time entries, or null when they can. Everyone changes their own. Location managers
 *  can for their own office (never admins or other location managers, as with people), admins for everyone. */
export function timeEditError(me: Me, p: { id: string; locationId: string; role: Role }): string | null {
  if (p.id === me.id || me.role === "ADMIN") return null;
  if (me.role !== "LOCATION") return "Only Location managers and Admins can add or change someone else's time.";
  if (p.locationId !== me.locationId) return "You can only change time for people in your own office.";
  if (p.role === "ADMIN" || p.role === "LOCATION") return "Only Admins can change an Admin's or Location manager's time.";
  return null;
}
export const canEditTimeFor = (me: Me, p: Parameters<typeof timeEditError>[1]) => !timeEditError(me, p);

/** Why this person can't add or remove public holidays, or null when they can. Only admins do, for any office. Everyone can see them. */
export function holidayError(me: Me): string | null {
  return me.role === "ADMIN" ? null : "Only Admins can add or change public holidays.";
}
export const canManageHolidays = (me: Me) => !holidayError(me);

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
      ...(me.role === "GUEST" ? [] : [{ locations: { some: { locationId: me.locationId } } }]),
      ...(me.teamId && me.role !== "GUEST" ? [{ teams: { some: { teamId: me.teamId } } }] : []),
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
      ...(me.role === "GUEST" ? [] : [{ locations: { some: { locationId: me.locationId } } }]),
      ...(me.teamId && me.role !== "GUEST" ? [{ teams: { some: { teamId: me.teamId } } }] : []),
    ],
  };
}

/** Projects this person can log time on: the visible ones that aren't archived. */
export function trackableProjectsWhere(me: Me): Prisma.ProjectWhereInput {
  return { AND: [visibleProjectsWhere(me), { archived: false }] };
}

/** Projects time can be logged on for this person. When someone does it on their behalf, the signed-in manager must see the project too:
 *  a manager never gets to log time on, or change time on, a project they could not see. */
export function loggableProjectsWhere(me: Me, person: Me): Prisma.ProjectWhereInput {
  return { AND: [trackableProjectsWhere(person), ...(me.id === person.id ? [] : [visibleProjectsWhere(me)])] };
}

export const canCreateProject = (me: Me) => me.role !== "MEMBER" && me.role !== "GUEST";
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
