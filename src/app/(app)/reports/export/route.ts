import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { parseReportParams, reportWhere, toCsv } from "@/lib/report";
import { toStr } from "@/lib/dates";
import { clock } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return new Response("Sign in first", { status: 401 });
  await getSettings(); // sets the company time zone used for date ranges
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const p = parseReportParams(sp, me);
  const { where, from, to } = reportWhere(me, p);
  const [entries, fields] = await Promise.all([
    db.timeEntry.findMany({
      where, orderBy: [{ date: "asc" }, { startMin: "asc" }],
      include: { user: { include: { team: true, location: true } }, project: { include: { client: true } }, phase: true, tag: true },
    }),
    db.customField.findMany({ orderBy: { sort: "asc" } }),
  ]);
  const rows: unknown[][] = [["Date", "Person", "Email", "Office", "Team", "Client", "Project", "Phase", "Tag", "Description", ...fields.map((f) => f.name), "Start", "Hours"]];
  for (const e of entries) {
    const c = (e.custom ?? {}) as Record<string, string>;
    rows.push([toStr(e.date), e.user.name, e.user.email, e.user.location.name, e.user.team?.name ?? "", e.project.client.name, e.project.name, e.phase?.name ?? "", e.tag?.name ?? "", e.description, ...fields.map((f) => c[f.id] ?? ""), clock(e.startMin), (e.minutes / 60).toFixed(2)]);
  }
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="the-time-sink-time-${p.range === "all" ? "all-time" : `${from}-to-${to}`}.csv"` },
  });
}
