import { PageHead } from "@/components/ui";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { scopeLabel } from "@/lib/scope";
import { emailConfigured } from "@/lib/email";
import { ICONS } from "@/components/icons";
import { TEMPLATES, type ImportKind } from "@/lib/importTemplates";
import ImportDesk, { type DeskInfo } from "./ImportDesk";
import Link from "next/link";

export const maxDuration = 60; // a big import takes a while

const NOT_USED = "Not used: this app has no billing.";
const KINDS: Record<ImportKind, { title: string; blurb: string; icon: string; info: DeskInfo }> = {
  people: {
    title: "People", icon: "people", blurb: "Add your team in one go, each with an invite link.",
    info: {
      noun: ["person", "people"], required: "Name and Email",
      columns: [
        ["Name", "Their name."], ["Email", "The email they sign in with. One account per email."],
        ["Role", "Admin, Team Manager or Project Manager. Blank means Team Member. If several are listed, the highest one counts."],
        ["Projects Managed", "Projects they manage, by name (write Project:Client when two clients share a name). Only projects that already exist are linked."],
        ["Groups Managed", "For a manager with no Group: the first group listed becomes their team."],
        ["Employees Managed", "Not used: a Team/Project Manager looks after their whole team.", true],
        ["Assigned team manager", "Not used: approvals go to the team's Team/Project Manager.", true],
        ["Group", "Their team in the office. A team that doesn't exist yet is created."],
        ["Billable Rate", NOT_USED, true], ["Cost Rate", NOT_USED, true],
        ["Week Start", "Not used: weeks always start on Monday.", true],
        ["Working Days", "How many days a week they work."],
        ["Daily Work Capacity", "Hours in a working day. Days times hours gives their expected hours per week (5 days x 8 hours = 40)."],
      ],
      extras: "Office, Team, Title, Employee ID, Joining date, Expected hours per week",
    },
  },
  projects: {
    title: "Clients and projects", icon: "projects", blurb: "Set up projects with their phases and tags.",
    info: {
      noun: ["project", "projects"], required: "Project (Client is usual)",
      columns: [
        ["Project", "The project's name."],
        ["Client", "The client it belongs to. Blank files it under Internal. Admins add clients that don't exist yet."],
        ["Tasks", "Become the project's phases. Blank gives the five Submission phases."],
        ["Tags", "Added to the tag list if they aren't there yet (admins only)."],
      ],
      extras: "Budget hours, Access (Everyone or Restricted), People (emails), Offices, Managers (emails). Phases works as another name for Tasks",
    },
  },
  time: {
    title: "Timesheet", icon: "sheet", blurb: "Bring in logged time from another tool or a spreadsheet.",
    info: {
      noun: ["time entry", "time entries"], required: "Project, Email, Start Date and Duration (h)",
      columns: [
        ["Project", "The project the time was spent on."],
        ["Client", "Needed only when two clients have a project with the same name."],
        ["Description", "What was done. Required unless Settings turn that off."],
        ["Task", "The project's phase. Required."],
        ["Email", "Whose time it is. Must be someone you manage."],
        ["Tags", "One tag per entry, so the first one listed is kept. Required unless Settings turn that off."],
        ["Billable", NOT_USED, true],
        ["Start Date", "The day, like 03/31/2026 (month first) or 2026-03-31."],
        ["Start Time", "Like 9:00 AM or 14:30. Blank means 09:00."],
        ["Duration (h)", "Like 8:00, 1:30 or 1.5."],
      ],
      extras: "any custom field you have set up, by its name. Date, Phase, Tag, Start and Hours also work as column names",
    },
  },
};

export default async function ImportExportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireTab("import-export");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const canPeople = me.role === "ADMIN" || me.role === "LOCATION";
  const kinds = (["people", "projects", "time"] as ImportKind[]).filter((k) => k !== "people" || canPeople);
  const kind = kinds.find((k) => k === one("import")) ?? kinds[0];
  const tab = one("tab") === "export" ? "export" : "import";
  const offices = me.role === "ADMIN" ? await db.location.findMany({ orderBy: { name: "asc" } }) : [me.location];
  const k = KINDS[kind];
  const t = TEMPLATES[kind];

  return (
    <>
      <PageHead title="Import & export" sub="Bring people, projects and time in from CSV files, or take them out."
        beside={<nav className="seg vt" aria-label="Import or export">
          <Link href="/import-export" aria-current={tab === "import" ? "page" : undefined}>Import</Link>
          <Link href="/import-export?tab=export" aria-current={tab === "export" ? "page" : undefined}>Export</Link>
        </nav>} />
      {tab === "import" ? (
        <>
          <nav className="ikinds" aria-label="What to import">
            {kinds.map((id) => (
              <Link key={id} href={`/import-export?import=${id}`} className="ikind" aria-current={id === kind ? "page" : undefined} scroll={false}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[KINDS[id].icon] }} />
                <span><b>{KINDS[id].title}</b><small>{KINDS[id].blurb}</small></span>
              </Link>
            ))}
          </nav>
          <section className="panel">
            <ImportDesk key={kind} kind={kind} info={k.info} templateHref={`/import-export/template/${kind}`} templateFile={t.file}
              offices={offices.map((o) => ({ id: o.id, name: o.name }))} defaultOffice={me.locationId} canCreate={me.role === "ADMIN"} emailOn={emailConfigured()}
              viewHref={kind === "people" ? "/people" : kind === "projects" ? "/projects" : "/reports"} />
          </section>
        </>
      ) : (
        <section className="panel">
          <h3>Export</h3>
          <p className="note" style={{ margin: "0 0 12px" }}>Files cover {scopeLabel(me).toLowerCase() === "whole company" ? "the whole company" : scopeLabel(me)}. For time with filters (client, project, tag and more), use Export on the <Link href="/reports">Reports</Link> page.</p>
          <ul className="iexports">
            <li><div><b>Time entries, this year</b><span>Every entry from 1 January, one row each.</span></div><a className="btn" href="/reports/export?range=thisyear" download>Download CSV</a></li>
            <li><div><b>Time entries, all time</b><span>Every entry there is, including time planned ahead.</span></div><a className="btn" href="/reports/export?range=all" download>Download CSV</a></li>
            <li><div><b>Projects</b><span>Clients, phases, budgets, access and managers. You can import this file again.</span></div><a className="btn" href="/import-export/export/projects" download>Download CSV</a></li>
            {canPeople && <li><div><b>People</b><span>Names, roles, offices, teams and expected hours. You can import this file again to add people.</span></div><a className="btn" href="/import-export/export/people" download>Download CSV</a></li>}
          </ul>
        </section>
      )}
    </>
  );
}
