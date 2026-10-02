import type { Prisma } from "@prisma/client";
import type { Me } from "./auth";

/** Whose entries this person may see: own (member), own team (leader, PM), own office (location manager), everyone (admin). */
export function visibleUsersWhere(me: Me): Prisma.UserWhereInput {
  switch (me.role) {
    case "ADMIN": return {};
    case "LOCATION": return { locationId: me.locationId };
    case "LEADER":
    case "PM": return me.teamId ? { teamId: me.teamId } : { id: me.id };
    default: return { id: me.id };
  }
}

/** Whose timesheets this person approves. Never their own. */
export function approverUsersWhere(me: Me): Prisma.UserWhereInput | null {
  switch (me.role) {
    case "ADMIN": return { id: { not: me.id } };
    case "LOCATION": return { locationId: me.locationId, id: { not: me.id } };
    case "LEADER": return me.teamId ? { teamId: me.teamId, id: { not: me.id } } : null;
    default: return null;
  }
}

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

/** Projects this person can log time on: the visible ones that aren't archived. */
export function trackableProjectsWhere(me: Me): Prisma.ProjectWhereInput {
  return { AND: [visibleProjectsWhere(me), { archived: false }] };
}

export const canCreateProject = (me: Me) => me.role !== "MEMBER";
export const canEditProject = (me: Me, managerIds: string[]) => me.role === "ADMIN" || (me.role !== "MEMBER" && managerIds.includes(me.id));
