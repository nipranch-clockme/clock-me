import type { Role } from "@prisma/client";

export const ROLES: [Role, string][] = [
  ["MEMBER", "Team member"],
  ["LEADER", "Team/Project Manager"],
  ["LOCATION", "Location manager"],
  ["ADMIN", "Admin"],
];
export const roleName = (r: Role) => ROLES.find((x) => x[0] === r)?.[1] ?? r;

type Cell = "y" | "n" | string;
export const PERMISSIONS: [string, Record<Role, Cell>][] = [
  ["Add own time in timesheet and calendar", { MEMBER: "y", LEADER: "y", LOCATION: "y", ADMIN: "y" }],
  ["See own reports", { MEMBER: "y", LEADER: "y", LOCATION: "y", ADMIN: "y" }],
  ["See other people's entries, reports, profiles and dashboard", { MEMBER: "n", LEADER: "Own team", LOCATION: "Own office", ADMIN: "y" }],
  ["Approve or send back timesheets", { MEMBER: "n", LEADER: "Own team, own included", LOCATION: "Own office, if really needed", ADMIN: "Everyone, if really needed" }],
  ["Create projects (blank or from a phase template)", { MEMBER: "n", LEADER: "y", LOCATION: "y", ADMIN: "y" }],
  ["Edit projects and who can see them", { MEMBER: "n", LEADER: "Ones they manage", LOCATION: "Ones they manage", ADMIN: "All" }],
  ["Create clients, tags and phase templates", { MEMBER: "n", LEADER: "n", LOCATION: "n", ADMIN: "y" }],
  ["Set a client's type and contracted hours per month", { MEMBER: "n", LEADER: "n", LOCATION: "n", ADMIN: "y" }],
  ["See the client dashboard (hours and contract use for every client)", { MEMBER: "n", LEADER: "n", LOCATION: "Yes, people in own office only", ADMIN: "y" }],
  ["Import and export CSV", { MEMBER: "Export own", LEADER: "Export team", LOCATION: "Own office", ADMIN: "y" }],
  ["Invite people, set expected hours, employee IDs and joining dates", { MEMBER: "n", LEADER: "n", LOCATION: "Own office", ADMIN: "y" }],
  ["Change profile pictures", { MEMBER: "Own", LEADER: "Own", LOCATION: "Own office", ADMIN: "y" }],
  ["Lock timesheets, required and custom fields, reminders", { MEMBER: "n", LEADER: "n", LOCATION: "n", ADMIN: "y" }],
];

export type Tab = "dashboard" | "clients" | "timesheet" | "calendar" | "approvals" | "reports" | "projects" | "people" | "import-export" | "settings";
export const TABS: [Tab, string, Role[] | "all"][] = [
  ["dashboard", "Dashboard", "all"],
  ["clients", "Clients", ["LOCATION", "ADMIN"]],
  ["timesheet", "Timesheet", "all"],
  ["calendar", "Calendar", "all"],
  ["approvals", "Approvals", ["LEADER", "LOCATION", "ADMIN"]],
  ["reports", "Reports", "all"],
  ["projects", "Projects", "all"],
  ["people", "People", ["LOCATION", "ADMIN"]],
  ["import-export", "Import & export", ["LEADER", "LOCATION", "ADMIN"]],
  ["settings", "Settings", ["ADMIN"]],
];
export const canTab = (tab: Tab, role: Role) => {
  const t = TABS.find((x) => x[0] === tab);
  return !!t && (t[2] === "all" || t[2].includes(role));
};
