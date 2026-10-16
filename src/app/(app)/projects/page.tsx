import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addedProjectsWhere, canCreateProject, canEditProject, clientColorFor, hidesClients, visibleProjectsWhere } from "@/lib/scope";
import { canTab, roleName } from "@/lib/roles";
import { Ifld, PageHead, Pill } from "@/components/ui";
import ProjectsClient, { SelectAllProjects } from "./ProjectsClient";
import ClientForm, { EditClient } from "./ClientForm";
import PageSize from "./PageSize";
import { clientTypeName, contractOf, perMonth } from "@/lib/clients";
import { dateWithYear, localDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Suspense } from "react";

// The sort buttons above the list, and the direction each starts in. Pressing the button that is already in use flips it.
const SORTS = { client: "Client", name: "Name", added: "Date added", budget: "Budget" } as const;
type SortKey = keyof typeof SORTS;
const KEYS = Object.keys(SORTS) as SortKey[];
const FIRST_DIR: Record<SortKey, "asc" | "desc"> = { client: "asc", name: "asc", added: "desc", budget: "desc" };
// How many projects a page shows. The drop-down above the list picks one of these.
const PAGE_SIZES = [50, 200, 500];

// The database order for each sort. Archived projects always come last, and a project with no budget comes after the ones with one.
function orderFor(k: SortKey, d: "asc" | "desc"): Prisma.ProjectOrderByWithRelationInput[] {
  const archived: Prisma.ProjectOrderByWithRelationInput = { archived: "asc" };
  if (k === "name") return [archived, { name: d }];
  if (k === "added") return [archived, { createdAt: d }, { name: "asc" }];
  if (k === "budget") return [archived, { budgetHours: { sort: d, nulls: "last" } }, { name: "asc" }];
  return [archived, { client: { name: d } }, { name: "asc" }];
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ client?: string; active?: string; access?: string; q?: string; sort?: string; dir?: string; pp?: string; page?: string }> }) {
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
  const key = KEYS.find((k) => k === sp.sort) ?? "client";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : sp.dir === "asc" ? "asc" : FIRST_DIR[key];
  const size = PAGE_SIZES.find((n) => String(n) === sp.pp) ?? PAGE_SIZES[0];
  // The whole filtered list is counted, but only the page on screen is loaded, sorted by the database.
  const listWhere: Prisma.ProjectWhereInput = { ...where, ...(creator && sp.client ? { clientId: sp.client } : {}), ...activeWhere, ...accessWhere, ...nameWhere };
  const total = await db.project.count({ where: listWhere });
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(Number(sp.page)) || 1), pages);
  const [projects, clients, templates, locations, teams, users] = await Promise.all([
    db.project.findMany({
      where: listWhere,
      include: { client: true, phases: { orderBy: { sort: "asc" } }, managers: { include: { user: true } }, locations: { include: { location: true } }, teams: { include: { team: { include: { location: true } } } }, users: { include: { user: true } } },
      orderBy: orderFor(key, dir),
      skip: (current - 1) * size,
      take: size,
    }),
    creator ? db.client.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { projects: true } }, contacts: { orderBy: { sort: "asc" } } } }) : [],
    creator ? db.phaseTemplate.findMany({ orderBy: { name: "asc" } }) : [],
    creator ? db.location.findMany({ orderBy: { name: "asc" } }) : [],
    creator ? db.team.findMany({ include: { location: true }, orderBy: [{ name: "asc" }] }) : [],
    creator ? db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }) : [],
  ]);
  // Time logged on the projects on this page only.
  const usage = await db.timeEntry.groupBy({ by: ["projectId"], where: { projectId: { in: projects.map((p) => p.id) } }, _sum: { minutes: true } });
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
  const editableIds = new Set(editable.map((e) => e.id));
  // The links keep the filters, the sort and the page size when the reader moves between pages or sorts again.
  const listParams = Object.fromEntries(Object.entries({ client: sp.client, active: sp.active, access: sp.access, q: sp.q, sort: key, dir, pp: String(size) }).filter((e): e is [string, string] => !!e[1]));
  const sortHref = (k: SortKey) => {
    const next = k === key ? (dir === "asc" ? "desc" : "asc") : FIRST_DIR[k];
    return `/projects?${new URLSearchParams({ ...listParams, sort: k, dir: next })}`;
  };
  const pageHref = (n: number) => `/projects?${new URLSearchParams({ ...listParams, page: String(n) })}`;
  const from = total ? (current - 1) * size + 1 : 0, to = Math.min(current * size, total);

  return (
    <>
      <PageHead
        title="Projects"
        sub={creator ? "Projects, phases and who can log time on them." : "Projects you've been added to. Projects open to everyone aren't listed, but you can still log time on them."}
        actions={<Suspense><ProjectsClient creator={creator} form={formData} editable={editable} admin={me.role === "ADMIN"} /></Suspense>}
      />
    <div className="grid g2">
      <section className="panel full">
        {creator && !clients.length && <p className="alert info">{me.role === "ADMIN" ? "Add a client below before creating a project." : "An Admin needs to add a client before projects can be created."}</p>}
        {/* One tidy toolbar: the name search first, then the three drop-downs, then Apply. */}
        {creator && (
          <form className="ptools" method="get" role="search" aria-label="Filter projects">
            <label className="ptools-find">
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <span className="sr-only">Find by name</span>
              <input type="search" name="q" placeholder="Find a project by name" defaultValue={needle} />
            </label>
            <Ifld id="pf-active" label="Status" name="active" defaultValue={active}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></Ifld>
            <Ifld id="pf-client" label="Client" name="client" defaultValue={sp.client ?? ""}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Ifld>
            <Ifld id="pf-access" label="Access" name="access" defaultValue={creator && sp.access ? sp.access : "all"}><option value="all">All</option><option value="everyone">Everyone</option><option value="restricted">Restricted</option></Ifld>
            <button className="btn">Apply filter</button>
          </form>
        )}
        {/* The empty message sits outside the table so it doesn't scroll sideways with it on phones. */}
        {!projects.length ? <p className="empty">{!creator ? "You haven't been added to any projects yet." : sp.client ? "No projects for this client." : "No projects yet."}</p> : (
          <>
          {/* Above the list: Select all and the sort on the left; how many show, which ones, and the page arrows on the right. */}
          <div className="pbar">
            <div className="pbar-l">
              {creator && <SelectAllProjects />}
              <nav className="psort" aria-label="Sort projects">
                <span className="pf-label">Sort by</span>
                <span className="seg">
                  {KEYS.map((k) => (
                    <Link key={k} href={sortHref(k)} scroll={false} aria-current={k === key ? "true" : undefined}>
                      {SORTS[k]}{k === key && <><span aria-hidden="true"> {dir === "asc" ? "↑" : "↓"}</span><span className="sr-only"> ({dir === "asc" ? "ascending" : "descending"})</span></>}
                    </Link>
                  ))}
                </span>
              </nav>
            </div>
            <div className="psize-row">
              <PageSize value={size} options={PAGE_SIZES} params={listParams} />
              <span className="note">{from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")}</span>
            </div>
          </div>
          {pages > 1 && (
            <nav className="ppager" aria-label="Pages of projects">
              {current > 1 ? <Link href={pageHref(current - 1)} scroll={false} className="btn sm">‹ Previous</Link> : <span className="btn sm" aria-disabled="true">‹ Previous</span>}
              <span className="note">Page {current} of {pages}</span>
              {current < pages ? <Link href={pageHref(current + 1)} scroll={false} className="btn sm">Next ›</Link> : <span className="btn sm" aria-disabled="true">Next ›</span>}
            </nav>
          )}
          <div className="tablebox">
            <table className="ptable ctable">
              <thead><tr><th>Project</th><th>Who can see it</th><th>Managers</th><th>Phases</th><th>Budget</th><th>Date added</th><th className="act" /></tr></thead>
              <tbody>
                {projects.map((p) => {
                  const u = used[p.id] ?? 0, pc = p.budgetHours ? u / p.budgetHours : 0;
                  const phases = p.phases.filter((x) => x.sort < 999).map((x) => x.name).join(", "), managers = p.managers.map((m) => m.user.name).join(", ");
                  const who = p.access === "PUBLIC" ? "Everyone" : `Restricted: ${accessText(p)}`;
                  return (
                    <tr key={p.id}>
                      {/* one line: the tick box, the project, then its client beside it (the box is kept as a gap where there is none) */}
                      <td className="pone">{creator && <span className="pkick">{editableIds.has(p.id) && <input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.name}`} />}</span>}<span className="dot" style={{ background: `var(--${clientColorFor(me, p.client.color)})` }} /><span className="prname">{p.name}</span>{!hidesClients(me) && <span className="prclient">{p.client.name}</span>} {p.archived && <Pill tone="locked">Archived</Pill>}</td>
                      <td data-l="Who can see it" className="pone clip" title={who}>{p.access === "PUBLIC" ? <Pill tone="locked">Everyone</Pill> : <><Pill tone="locked">Restricted</Pill> <span className="note">{accessText(p)}</span></>}</td>
                      <td className="note pone clip" data-l="Managers" title={managers}>{managers || "–"}</td>
                      <td className="note pone clip" data-l="Phases" title={phases}>{phases}</td>
                      <td data-l="Budget" className="pone">{p.budgetHours ? <span className="pbud"><span className="meter"><i className={pc > 1 ? "over" : pc > 0.85 ? "hi" : ""} style={{ width: `${Math.min(100, pc * 100)}%` }} /></span><span className="note">{Math.round(u)} of {p.budgetHours} h</span></span> : <span className="note">No budget</span>}</td>
                      <td data-l="Date added" className="note pone">{dateWithYear(localDate(p.createdAt))}</td>
                      <td className="act">{editableIds.has(p.id) && <Link className="btn sm" scroll={false} href={`/projects?${new URLSearchParams({ ...(sp.client ? { client: sp.client } : {}), edit: p.id })}`}>Edit</Link>}</td>
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
