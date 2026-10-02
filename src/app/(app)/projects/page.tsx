import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canCreateProject, canEditProject, trackableProjectsWhere } from "@/lib/scope";
import { canTab, roleName } from "@/lib/roles";
import { Pill } from "@/components/ui";
import ProjectsClient from "./ProjectsClient";
import ClientForm from "./ClientForm";
import Link from "next/link";
import { Suspense } from "react";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const creator = canCreateProject(me);
  const where = creator ? {} : trackableProjectsWhere(me);
  const [projects, clients, templates, locations, teams, users, usage] = await Promise.all([
    db.project.findMany({
      where: { ...where, ...(sp.client ? { clientId: sp.client } : {}) },
      include: { client: true, phases: { orderBy: { sort: "asc" } }, managers: { include: { user: true } }, locations: { include: { location: true } }, teams: { include: { team: { include: { location: true } } } }, users: { include: { user: true } } },
      orderBy: [{ archived: "asc" }, { client: { name: "asc" } }, { name: "asc" }],
    }),
    db.client.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { projects: true } } } }),
    db.phaseTemplate.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
    db.team.findMany({ include: { location: true }, orderBy: [{ name: "asc" }] }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    db.timeEntry.groupBy({ by: ["projectId"], _sum: { minutes: true } }),
  ]);
  const used = Object.fromEntries(usage.map((u) => [u.projectId, (u._sum.minutes ?? 0) / 60]));
  const accessText = (p: (typeof projects)[number]) => [...p.locations.map((l) => `${l.location.name} office`), ...p.teams.map((t) => `${t.team.name} team, ${t.team.location.name}`), ...p.users.map((u) => u.user.name)].join(", ");
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

  return (
    <div className="grid g2">
      <section className="panel full">
        <Suspense><ProjectsClient creator={creator} canImport={canTab("import-export", me.role)} form={formData} editable={editable} count={projects.length} admin={me.role === "ADMIN"} /></Suspense>
        <div className="row" style={{ margin: "4px 0 12px" }}>
          <div className="chips">
            <Link className="chip" href="/projects" aria-current={!sp.client ? "true" : undefined}>All clients</Link>
            {clients.map((c) => <Link key={c.id} className="chip" href={`/projects?client=${c.id}`} aria-current={sp.client === c.id ? "true" : undefined}>{c.name}</Link>)}
          </div>
        </div>
        <div className="tablebox">
          <table>
            <thead><tr><th>Project</th><th>Who can see it</th><th>Managers</th><th>Phases</th><th>Budget</th><th /></tr></thead>
            <tbody>
              {projects.map((p) => {
                const u = used[p.id] ?? 0, pc = p.budgetHours ? u / p.budgetHours : 0;
                return (
                  <tr key={p.id}>
                    <td><span className="dot" style={{ background: `var(--${p.client.color})` }} />{p.name} {p.archived && <Pill tone="locked">Archived</Pill>}<div className="note">{p.client.name}</div></td>
                    <td>{p.access === "PUBLIC" ? <Pill tone="ok">Everyone</Pill> : <><Pill tone="warn">Restricted</Pill><div className="note">{accessText(p)}</div></>}</td>
                    <td className="note">{p.managers.map((m) => m.user.name).join(", ") || "–"}</td>
                    <td className="note">{p.phases.filter((x) => x.sort < 999).map((x) => x.name).join(", ")}</td>
                    <td>{p.budgetHours ? <><div className="meter"><i className={pc > 1 ? "over" : pc > 0.85 ? "hi" : ""} style={{ width: `${Math.min(100, pc * 100)}%` }} /></div><div className="note">{Math.round(u)} of {p.budgetHours} h</div></> : <span className="note">No budget</span>}</td>
                    <td>{editable.some((e) => e.id === p.id) && <Link className="btn sm" scroll={false} href={`/projects?${new URLSearchParams({ ...(sp.client ? { client: sp.client } : {}), edit: p.id })}`}>Edit</Link>}</td>
                  </tr>
                );
              })}
              {!projects.length && <tr><td colSpan={6} className="empty">No projects yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h3>Clients</h3>
        <div className="list">{clients.map((c) => <div className="item" key={c.id}><div><span className="dot" style={{ background: `var(--${c.color})` }} />{c.name}</div><span className="note">{c._count.projects} project{c._count.projects === 1 ? "" : "s"}</span></div>)}</div>
        {me.role === "ADMIN" ? <ClientForm /> : <p className="note" style={{ margin: "10px 0 0" }}>Only admins can add clients.</p>}
      </section>
      <section className="panel">
        <h3>Phase templates</h3>
        <div className="list">{templates.map((t) => <div className="item" key={t.id}><div>{t.name}<div className="meta">{t.phases.join(" → ")}</div></div></div>)}</div>
        <p className="note" style={{ margin: "10px 0 0" }}>{creator ? "Pick a template when you create a project to fill in its phases." : ""}{me.role === "ADMIN" ? " Add or remove templates in Settings." : ""}</p>
      </section>
    </div>
  );
}
