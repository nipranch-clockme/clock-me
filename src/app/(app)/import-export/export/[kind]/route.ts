import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canTab, roleName } from "@/lib/roles";
import { visibleProjectsWhere, visibleUsersWhere } from "@/lib/scope";
import { toCsv } from "@/lib/report";
import { today, toStr } from "@/lib/dates";
import { getSettings } from "@/lib/settings";

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const me = await currentUser();
  if (!me || !canTab("import-export", me.role)) return new Response("Not allowed", { status: 403 });
  const { kind } = await params;
  await getSettings(); // sets the company time zone used for the file name's date
  let rows: unknown[][];
  if (kind === "projects") {
    const projects = await db.project.findMany({
      where: visibleProjectsWhere(me),
      include: { client: true, phases: { orderBy: { sort: "asc" } }, managers: { include: { user: true } }, users: { include: { user: true } }, locations: { include: { location: true } }, teams: { include: { team: { include: { location: true } } } } },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    });
    rows = [["Client", "Project", "Phases", "Budget hours", "Access", "People", "Offices", "Teams", "Managers", "Archived"],
      ...projects.map((p) => [p.client.name, p.name, p.phases.filter((x) => x.sort < 999).map((x) => x.name).join(";"), p.budgetHours ?? "", p.access === "PUBLIC" ? "Everyone" : "Restricted",
        p.users.map((u) => u.user.email).join(";"), p.locations.map((l) => l.location.name).join(";"), p.teams.map((t) => `${t.team.name} (${t.team.location.name})`).join(";"), p.managers.map((m) => m.user.email).join(";"), p.archived ? "Yes" : "No"])];
  } else if (kind === "people" && (me.role === "ADMIN" || me.role === "LOCATION")) {
    const people = await db.user.findMany({ where: visibleUsersWhere(me), include: { team: true, location: true }, orderBy: { name: "asc" } });
    rows = [["Name", "Employee ID", "Email", "Title", "Role", "Office", "Team", "Joining date", "Expected hours per week", "Status"],
      ...people.map((u) => [u.name, u.employeeId ?? "", u.email, u.title, roleName(u.role), u.location.name, u.team?.name ?? "", u.joiningDate ? toStr(u.joiningDate) : "", u.weeklyTarget, !u.active ? "Inactive" : u.passwordHash ? "Active" : "Invite pending"])];
  } else return new Response("Not found", { status: 404 });
  return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="the-time-sink-${kind}-${today()}.csv"` } });
}
