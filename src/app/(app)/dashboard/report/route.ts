import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { toCsv } from "@/lib/report";
import { MONTH_ABBR } from "@/lib/monthGrid";
import { ALL_OFFICES, monthlyReport, reportLines, reportYears } from "@/lib/monthlyReport";

// The Dashboard's monthly report as a CSV that opens in Excel. Location managers get their own office; admins any office or all offices.
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return new Response("Sign in first", { status: 401 });
  if (me.role !== "LOCATION" && me.role !== "ADMIN" && me.role !== "HUMAN_RESOURCE") return new Response("Only Location managers, Admins and Human Resource can download this report", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const company = me.role === "ADMIN" || me.role === "HUMAN_RESOURCE";
  const officeId = company ? sp.get("office") ?? "" : me.locationId;
  const all = company && officeId === ALL_OFFICES;
  const office = all ? { id: ALL_OFFICES, name: "All offices" } : await db.location.findUnique({ where: { id: officeId }, select: { id: true, name: true } });
  if (!office) return new Response("No such office", { status: 404 });
  const locationId = all ? null : office.id;
  const years = await reportYears(locationId);
  const year = years.includes(Number(sp.get("year"))) ? Number(sp.get("year")) : years[0];
  const r = await monthlyReport(locationId, year);
  const rows: unknown[][] = [[`${office.name} ${year}`, ...MONTH_ABBR, "Year"]];
  let group = "summary";
  for (const l of reportLines(r, me.role !== "HUMAN_RESOURCE")) {
    if (l.group !== group) { rows.push([]); rows.push(["Hours by tag", ...MONTH_ABBR, "Year"]); group = l.group; }
    rows.push([l.label, ...l.cells.map((c) => c ?? ""), l.year ?? ""]);
  }
  const slug = office.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "office";
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="the-time-sink-monthly-report-${slug}-${year}.csv"` },
  });
}
