import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { scopeLabel } from "@/lib/scope";
import ImportPanel from "./ImportPanel";
import Link from "next/link";

export default async function ImportExportPage() {
  const me = await requireTab("import-export");
  const extra = (await db.customField.findMany({ orderBy: { sort: "asc" } })).map((f) => f.name);
  const timeTemplate = [["Date", "Email", "Client", "Project", "Phase", "Tag", "Description", "Start", "Hours", ...extra], ["2026-09-28", "priya@example.com", "Bluebird Health", "Brand refresh", "Submission 1", "CAD", "Floor plan drawings", "09:00", "1.5", ...extra.map(() => "")]];
  const projTemplate = [["Client", "Project", "Phases", "Budget hours", "Access", "People", "Offices", "Managers"], ["Bluebird Health", "Annual report", "Submission 1;Submission 2;Submission 3", "120", "Everyone", "", "", ""], ["Internal", "Office move", "Ongoing", "", "Restricted", "", "PNQ", ""]];
  return (
    <div className="grid g2">
      <section className="panel full">
        <h3>Export</h3>
        <p className="note" style={{ margin: "0 0 10px" }}>Exports include {scopeLabel(me).toLowerCase() === "whole company" ? "the whole company" : scopeLabel(me)}. For time with filters (client, project, tag and more), use Export CSV on the <Link href="/reports">Reports</Link> page.</p>
        <div className="row">
          <a className="btn" href="/reports/export?range=thisyear">Time entries, this year</a>
          <a className="btn" href="/reports/export?range=all">Time entries, all time</a>
          <a className="btn" href="/import-export/export/projects">Projects</a>
          {(me.role === "ADMIN" || me.role === "LOCATION") && <a className="btn" href="/import-export/export/people">People</a>}
        </div>
      </section>
      <ImportPanel kind="time" title="Import time entries" template={timeTemplate}
        help="Each row is one entry. Required columns: Date, Email, Project, Phase, Hours. Optional: Client (when two clients share a project name), Tag, Description, Start, and any custom field by name." />
      <ImportPanel kind="projects" title="Import projects" template={projTemplate}
        help={`Required columns: Client, Project. Optional: Phases (separate with ;), Budget hours, Access (Everyone or Restricted), People (emails), Offices, Managers (emails). ${me.role === "ADMIN" ? "New clients are created as needed, with no commitment. Set fixed monthly hours for them on the Projects page." : "Clients must already exist; only admins add clients."}`} />
    </div>
  );
}
