import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addedProjectsWhere, canCreateProject, canEditProject, clientColorFor, hidesClients, visibleProjectsWhere } from "@/lib/scope";
import { canTab, roleName } from "@/lib/roles";
import { PageHead, Pill } from "@/components/ui";
import ProjectsClient, { SelectAllProjects } from "./ProjectsClient";
import ClientForm, { EditClient } from "./ClientForm";
import { clientTypeName, contractOf, perMonth } from "@/lib/clients";
import { dateWithYear, localDate } from "@/lib/dates";
import Link from "next/link";
import { Suspense } from "react";

// The sort buttons above the list, and the direction each starts in. Pressing the button that is already in use flips it.
const SORTS = { client: "Client", name: "Name", added: "Date added", budget: "Budget" } as const;
type SortKey = keyof typeof SORTS;
const KEYS = Object.keys(SORTS) as SortKey[];
const FIRST_DIR: Record<SortKey, "asc" | "desc"> = { client: "asc", name: "asc", added: "desc", budget: "desc" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ client?: string; active?: string; access?: string; q?: string; sort?: string; dir?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const creator = canCreateProject(me);
  // Restricted projects only show to the people, teams and offices they are shared with (and their managers).
  // Team members see just the projects they've been added to, without the clients and phase templates lists.
  const where = creator ? visibleProjectsWhere(me) : addedProjectsWhere(me);
  // The filter bar (managers and admins): Active is the default, and the name search is case-insensitive.
  const active = creator && sp.active === "archived" ? "archived" : creator && sp.active === "all" ? "all" : "active";
  const activeWhere = active === "all" ? {} : { archived: active === "archived" };
  const accessWhere = creator && sp.access === "everyone" ? { access: "PUBLIC" as const } : creator && sp.access === "restricted" ? { access: "RESTRICTED" as const } : {};
  const needle = creator ? sp.q?.trim() ?? "" : "";
  const nameWhere = needle ? { name: { contains: needle, mode: "insensitive" as const } } : {};
  const [projects, clients, templates, locations, teams, users, usage] = await Promise.all([
    db.project.findMany({
      where: { ...where, ...(creator && sp.client ? { clientId: sp.client } : {}), ...activeWhere, ...accessWhere, ...nameWhere },
      include: { client: true, phases: { orderBy: { sort: "asc" } }, managers: { include: { user: true } }, locations: { include: { location: true } }, teams: { include: { team: { include: { location: true } } } }, users: { include: { user: true } } },
      orderBy: [{ archived: "asc" }, { client: { name: "asc" } }, { name: "asc" }],
    }),
    creator ? db.client.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { projects: true } }, contacts: { orderBy: { sort: "asc" } } } }) : [],
    creator ? db.phaseTemplate.findMany({ orderBy: { name: "asc" } }) : [],
    creator ? db.location.findMany({ orderBy: { name: "asc" } }) : [],
    creator ? db.team.findMany({ include: { location: true }, orderBy: [{ name: "asc" }] }) : [],
    creator ? db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }) : [],
    db.timeEntry.groupBy({ by: ["projectId"], _sum: { minutes: true } }),
  ]);
  const teamOpts = teams.map((t) => ({ id: t.id, label: `${t.name} team, ${t.location.name}` }));
  const used = Object.fromEntries(usage.map((u) => [u.projectId, (u._sum.minutes ?? 0) / 60]));
  // Client types and contracted hours show to the people who have the Clients tab; admins can change them.
  const contracts = canTab("clients", me.role);
  // Teams keep their usual label ("Hulk team, AMD"), so the list items are separated with semicolons.
  const accessText = (p: (typeof projects)[number]) => [...p.locations.map((l) => `${l.location.name} office`), ...p.teams.map((t) => `${t.team.name} team, ${t.team.location.name}`), ...p.users.map((u) => u.user.name)].join("; ");
  const formData = {
    clients: clients.map((c) => ({ id: c.id, name: c.name })),
    templates: templates.map((t) => ({ id: t.id, name: t.name, phases: t.phases })),
    locations: locations.map((l) => ({ id: l.id, name: l.name })),
    teams: teams.map((t) => ({ id: t.id, name: `${t.name} team, ${t.location.name}` })),
    users: users.map((u) => ({ id: u.id, name: u.name })),
    managers: users.filter((u) => u.role !== "MEMBER").map((u) => ({ id: u.id, name: u.name, role: roleName(u.role) })),
    meId: me.id,
  };
  const editable = projects.filter((p) => canEditProject(me, p.managers.map((m) => m.userId))).map((p) => ({
    id: p.id, name: p.name, clientId: p.clientId, phases: p.phases.filter((x) => x.sort < 999).map((x) => x.name), budget: p.budgetHours, access: p.access, archived: p.archived,
    locs: p.locations.map((x) => x.locationId), teams: p.teams.map((x) => x.teamId), users: p.users.map((x) => x.userId), managers: p.managers.map((x) => x.userId),
  }));

  // The list is sorted here, over every project, so each sort covers the whole list. Archived projects always come last,
  // and a project without a budget comes after the ones with one.
  type Row = (typeof projects)[number];
  const key = KEYS.find((k) => k === sp.sort) ?? "client";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : sp.dir === "asc" ? "asc" : FIRST_DIR[key];
  const by: Record<SortKey, (a: Row, b: Row) => number> = {
    client: (a, b) => a.client.name.localeCompare(b.client.name),
    name: (a, b) => a.name.localeCompare(b.name),
    added: (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    budget: (a, b) => (a.budgetHours ?? 0) - (b.budgetHours ?? 0),
  };
  const mul = dir === "asc" ? 1 : -1;
  const sorted = [...projects].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    if (key === "budget" && (a.budgetHours == null) !== (b.budgetHours == null)) return a.budgetHours == null ? 1 : -1;
    return mul * by[key](a, b) || a.name.localeCompare(b.name);
  });
  const sortHref = (k: SortKey) => {
    const next = k === key ? (dir === "asc" ? "desc" : "asc") : FIRST_DIR[k];
    const params = { client: sp.client, active: sp.active, access: sp.access, q: sp.q, sort: k, dir: next };
    return `/projects?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]))}`;
  };

  return (
    <>
      <PageHead title="Projects" sub="Projects, phases and who can log time on them." />
    <div className="grid g2">
      <section className="panel full">
        <Suspense><ProjectsClient creator={creator} canImport={canTab("import-export", me.role)} form={formData} editable={editable} count={projects.length} admin={me.role === "ADMIN"} /></Suspense>
        {creator && (
          <form className="pfilter" method="get" role="search" aria-label="Filter projects">
            <span className="pf-label">Filter</span>
            <label>Active<select name="active" defaultValue={active}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></label>
            <label>Client<select name="client" defaultValue={sp.client ?? ""}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Access<select name="access" defaultValue={creator && sp.access ? sp.access : "all"}><option value="all">All</option><option value="everyone">Everyone</option><option value="restricted">Restricted</option></select></label>
            <label className="pf-find"><span className="sr-only">Find by name</span><input type="search" name="q" placeholder="Find by name" defaultValue={needle} /></label>
            <button className="btn primary">Apply filter</button>
          </form>
        )}
        {/* The empty message sits outside the table so it doesn't scroll sideways with it on phones. */}
        {!projects.length ? <p className="empty">{!creator ? "You haven't been added to any projects yet." : sp.client ? "No projects for this client." : "No projects yet."}</p> : (
          <>
          <nav className="psort" aria-label="Sort projects">
            <span className="pf-label">Sort</span>
            {KEYS.map((k) => (
              <Link key={k} href={sortHref(k)} scroll={false} className={`btn sm${k === key ? " primary" : ""}`} aria-current={k === key ? "true" : undefined}>
                {SORTS[k]}{k === key && <><span aria-hidden="true"> {dir === "asc" ? "↑" : "↓"}</span><span className="sr-only"> ({dir === "asc" ? "ascending" : "descending"})</span></>}
              </Link>
            ))}
          </nav>
          {creator && <div className="pselect"><SelectAllProjects /></div>}
          <div className="tablebox">
            <table className="ptable ctable">
              <thead><tr><th>Project</th><th>Who can see it</th><th>Managers</th><th>Phases</th><th>Budget</th><th>Date added</th><th /></tr></thead>
              <tbody>
                {sorted.map((p) => {
                  const u = used[p.id] ?? 0, pc = p.budgetHours ? u / p.budgetHours : 0;
                  const phases = p.phases.filter((x) => x.sort < 999).map((x) => x.name).join(", "), managers = p.managers.map((m) => m.user.name).join(", ");
                  const who = p.access === "PUBLIC" ? "Everyone" : `Restricted: ${accessText(p)}`;
                  return (
                    <tr key={p.id}>
                      {/* one line: the tick box, the project, then its client beside it (the box is kept as a gap where there is none) */}
                      <td className="pone">{creator && <span className="pkick">{editable.some((e) => e.id === p.id) && <input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.name}`} />}</span>}<span className="dot" style={{ background: `var(--${clientColorFor(me, p.client.color)})` }} /><span className="prname">{p.name}</span>{!hidesClients(me) && <span className="prclient">{p.client.name}</span>} {p.archived && <Pill tone="locked">Archived</Pill>}</td>
                      <td data-l="Who can see it" className="pone clip" title={who}>{p.access === "PUBLIC" ? <Pill tone="locked">Everyone</Pill> : <><Pill tone="locked">Restricted</Pill> <span className="note">{accessText(p)}</span></>}</td>
                      <td className="note pone clip" data-l="Managers" title={managers}>{managers || "–"}</td>
                      <td className="note pone clip" data-l="Phases" title={phases}>{phases}</td>
                      <td data-l="Budget" className="pone">{p.budgetHours ? <span className="pbud"><span className="meter"><i className={pc > 1 ? "over" : pc > 0.85 ? "hi" : ""} style={{ width: `${Math.min(100, pc * 100)}%` }} /></span><span className="note">{Math.round(u)} of {p.budgetHours} h</span></span> : <span className="note">No budget</span>}</td>
                      <td data-l="Date added" className="note pone">{dateWithYear(localDate(p.createdAt))}</td>
                      <td className="act">{editable.some((e) => e.id === p.id) && <Link className="btn sm" scroll={false} href={`/projects?${new URLSearchParams({ ...(sp.client ? { client: sp.client } : {}), edit: p.id })}`}>Edit</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
      {creator && <>
        <section className="panel">
          <h3>Phase templates</h3>
          <div className="list">{templates.map((t) => <div className="item" key={t.id}><div>{t.name}<div className="meta">{t.phases.join(" → ")}</div></div></div>)}</div>
          <p className="note" style={{ margin: "10px 0 0" }}>Pick a template when you create a project to fill in its phases.{me.role === "ADMIN" ? " Add or remove templates in Settings." : ""}</p>
        </section>
      </>}
    </div>
    </>
  );
}
