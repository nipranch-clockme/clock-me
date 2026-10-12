import type { Role } from "@prisma/client";

export const ROLES: [Role, string][] = [
  ["MEMBER", "Team member"],
  ["LEADER", "Team/Project Manager"],
  ["LOCATION", "Location manager"],
  ["HUMAN_RESOURCE", "Human Resource"],
  ["GUEST", "Guest"],
  ["ADMIN", "Admin"],
];
export const roleName = (r: Role) => ROLES.find((x) => x[0] === r)?.[1] ?? r;

/** Roles that are not a resource: no expected hours, not counted in inventory, utilisation or headcount. */
export const NOT_A_RESOURCE: Role[] = ["ADMIN", "HUMAN_RESOURCE", "GUEST"];
/** Roles that see the whole company's utilisation on the Dashboard (not clients, and not anyone's entries). */
export const SEES_COMPANY_UTILISATION: Role[] = ["ADMIN", "HUMAN_RESOURCE"];

type Cell = "y" | "n" | string;
export const PERMISSIONS: [string, Record<Role, Cell>][] = [
  ["Add own time in timesheet and calendar", { MEMBER: "y", GUEST: "y", LEADER: "y", LOCATION: "y", HUMAN_RESOURCE: "Own time, any project (admin time is the Admin tag)", ADMIN: "y" }],
  ["Add or change single entries on someone else's behalf from the Timesheet or Calendar (written to the change log)", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "Own office, not admins or location managers", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["See own reports", { MEMBER: "y", GUEST: "y", LEADER: "y", LOCATION: "y", HUMAN_RESOURCE: "y", ADMIN: "y" }],
  ["See other people's entries, reports, profiles and dashboard", { MEMBER: "n", GUEST: "n", LEADER: "Own team", LOCATION: "Own office", HUMAN_RESOURCE: "Team utilisation on the Dashboard only", ADMIN: "y" }],
  ["Approve or send back timesheets", { MEMBER: "n", GUEST: "n", LEADER: "Own team, own included", LOCATION: "Own office, if really needed", HUMAN_RESOURCE: "n", ADMIN: "Everyone, if really needed" }],
  ["Create projects (blank or from a phase template)", { MEMBER: "n", GUEST: "n", LEADER: "y", LOCATION: "y", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["Edit projects and who can see them", { MEMBER: "n", GUEST: "n", LEADER: "Ones they manage", LOCATION: "Ones they manage", HUMAN_RESOURCE: "n", ADMIN: "All" }],
  ["Create clients, tags and phase templates", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "n", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["Set a client's type, usual contracted hours, each month's own contracted hours (Clients > Monthly contracts) and work types", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "See only", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["See the client overview on the Dashboard (hours and contract use for every client)", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "Yes, people in own office only", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["Export time from Reports as CSV", { MEMBER: "Own time", GUEST: "Own time", LEADER: "Own team", LOCATION: "Own office", HUMAN_RESOURCE: "Own time", ADMIN: "y" }],
  ["Import and export on the Import & export tab (projects, timesheets, people)", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "n", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["Invite people, set expected hours, employee IDs and joining dates", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "Own office", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["Set a person's expected hours for each month (People > Monthly hours)", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "Own office, not admins or location managers", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["Change profile pictures", { MEMBER: "Own", GUEST: "Own", LEADER: "Own", LOCATION: "Own office", HUMAN_RESOURCE: "Own", ADMIN: "y" }],
  ["Ask for own time off (PTO, sick leave); it counts once approved", { MEMBER: "y", GUEST: "n", LEADER: "y", LOCATION: "y", HUMAN_RESOURCE: "y", ADMIN: "y" }],
  ["Approve or decline time off requests", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "Own office, members and team managers only", HUMAN_RESOURCE: "n", ADMIN: "Yes, everyone except their own" }],
  ["Add or remove someone else's time off (counts at once)", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "Own office, not admins or location managers", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["See every office's public holidays", { MEMBER: "y", GUEST: "y", LEADER: "y", LOCATION: "y", HUMAN_RESOURCE: "y", ADMIN: "y" }],
  ["Add, change or remove public holidays, for one or several offices", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "n", HUMAN_RESOURCE: "n", ADMIN: "y" }],
  ["Lock timesheets, required and custom fields, reminders", { MEMBER: "n", GUEST: "n", LEADER: "n", LOCATION: "n", HUMAN_RESOURCE: "n", ADMIN: "y" }],
];

export type Tab = "dashboard" | "clients" | "timesheet" | "calendar" | "time-off" | "approvals" | "reports" | "projects" | "people" | "import-export" | "settings";
export const TABS: [Tab, string, Role[] | "all"][] = [
  ["dashboard", "Dashboard", ["MEMBER", "LEADER", "LOCATION", "HUMAN_RESOURCE", "ADMIN"]],
  ["clients", "Clients", ["LOCATION", "ADMIN"]],
  ["timesheet", "Timesheet", "all"],
  ["calendar", "Calendar", "all"],
  ["time-off", "Time off", ["MEMBER", "LEADER", "LOCATION", "HUMAN_RESOURCE", "ADMIN"]],
  ["approvals", "Approvals", ["LEADER", "LOCATION", "ADMIN"]],
  ["reports", "Reports", "all"],
  ["projects", "Projects", "all"],
  ["people", "People", ["LOCATION", "ADMIN"]],
  ["import-export", "Import & export", ["ADMIN"]],
  ["settings", "Settings", ["ADMIN"]],
];
export const canTab = (tab: Tab, role: Role) => {
  const t = TABS.find((x) => x[0] === tab);
  return !!t && (t[2] === "all" || t[2].includes(role));
};
