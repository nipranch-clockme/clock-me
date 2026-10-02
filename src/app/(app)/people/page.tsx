import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { ROLES } from "@/lib/roles";
import PeopleClient from "./PeopleClient";
import { OfficeForm, TeamForm } from "./SmallForms";

export default async function PeoplePage() {
  const me = await requireTab("people");
  const admin = me.role === "ADMIN";
  const [people, locations, teams] = await Promise.all([
    db.user.findMany({ where: admin ? {} : { locationId: me.locationId }, include: { team: true, location: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.location.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: { where: { active: true } } } } } }),
    db.team.findMany({ where: admin ? {} : { locationId: me.locationId }, orderBy: { name: "asc" }, include: { location: true, _count: { select: { users: { where: { active: true } } } } } }),
  ]);
  const myLocations = admin ? locations : locations.filter((l) => l.id === me.locationId);
  return (
    <div className="grid g2">
      <PeopleClient
        meId={me.id}
        admin={admin}
        people={people.map((u) => ({ id: u.id, name: u.name, email: u.email, title: u.title, role: u.role, locationId: u.locationId, locationName: u.location.name, teamId: u.teamId, teamName: u.team?.name ?? "", weeklyTarget: u.weeklyTarget, active: u.active, pending: !u.passwordHash }))}
        locations={myLocations.map((l) => ({ id: l.id, name: l.name }))}
        teams={teams.map((t) => ({ id: t.id, name: t.name, locationId: t.locationId }))}
        roles={(admin ? ROLES : ROLES.filter(([r]) => r !== "ADMIN" && r !== "LOCATION")).map(([v, l]) => ({ value: v, label: l }))}
        defaultLocation={me.locationId}
      />
      <section className="panel">
        <h3>Offices</h3>
        <div className="list">{myLocations.map((l) => <div className="item" key={l.id}><div>{l.name}</div><span className="note">{l._count.users} people</span></div>)}</div>
        {admin && <OfficeForm />}
      </section>
      <section className="panel">
        <h3>Teams</h3>
        <div className="list">{teams.map((t) => <div className="item" key={t.id}><div>{t.name}<div className="meta">{t.location.name}</div></div><span className="note">{t._count.users} people</span></div>)}</div>
        <TeamForm locations={myLocations.map((l) => ({ id: l.id, name: l.name }))} admin={admin} />
      </section>
    </div>
  );
}
