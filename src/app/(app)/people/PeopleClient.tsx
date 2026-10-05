"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { invitePerson, resetLink, updatePerson, type PeopleResult } from "./actions";

type Person = { id: string; name: string; email: string; title: string; role: Role; locationId: string; locationName: string; teamId: string | null; teamName: string; weeklyTarget: number; employeeId: string; joiningDate: string; active: boolean; pending: boolean };
type Opt = { id: string; name: string };
type Props = { meId: string; admin: boolean; people: Person[]; locations: Opt[]; teams: (Opt & { locationId: string })[]; roles: { value: Role; label: string }[]; defaultLocation: string; today: string };
const roleLabel = (roles: Props["roles"], r: Role) => roles.find((x) => x.value === r)?.label ?? { ADMIN: "Admin", LOCATION: "Location manager" }[r as string] ?? r;

export default function PeopleClient(props: Props) {
  const { people, roles } = props;
  const [editing, setEditing] = useState<Person | null>(null);
  const [inviting, setInviting] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const open = editing || inviting;
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  const shown = people.filter((p) => !q || `${p.name} ${p.email} ${p.employeeId} ${p.title} ${p.teamName} ${p.locationName}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="panel full">
      <div className="row between" style={{ marginBottom: 10 }}>
        <div><h3 style={{ margin: 0 }}>People</h3><p className="note" style={{ margin: "2px 0 0" }}>{people.filter((p) => p.active).length} active{props.admin ? "" : `, ${props.locations[0]?.name} office`}</p></div>
        <div className="row" style={{ flex: "0 1 auto" }}>
          <div><label htmlFor="pp-q" className="sr-only">Search people</label><input id="pp-q" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button type="button" className="btn primary" onClick={() => setInviting(true)}>Invite person</button>
        </div>
      </div>
      <div className="tablebox"><table>
        <thead><tr><th>Name</th><th>Employee ID</th><th>Role</th><th>Office and team</th><th className="num">Expected hours per week</th><th /></tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
              <td><Link className="plink" href={`/profile/${p.id}`}>{p.name}</Link> {p.pending && <span className="pill p-submitted">Invite pending</span>} {!p.active && <span className="pill p-locked">Inactive</span>}<div className="note">{p.email}{p.title ? ` · ${p.title}` : ""}</div></td>
              <td>{p.employeeId || <span className="note">Not set</span>}</td>
              <td>{roleLabel(roles, p.role)}</td>
              <td>{p.locationName}<div className="note">{p.teamName || "No team"}</div></td>
              <td className="num">{p.weeklyTarget} h</td>
              <td>{(props.admin || (p.role !== "ADMIN" && p.role !== "LOCATION")) && <button type="button" className="btn sm" onClick={() => setEditing(p)}>Edit</button>}</td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={6} className="empty">Nobody matches.</td></tr>}
        </tbody>
      </table></div>
      <dialog ref={ref} onClose={() => { setEditing(null); setInviting(false); }} aria-labelledby="pp-title">
        {open && <PersonForm key={editing?.id ?? "new"} {...props} person={editing} onDone={() => ref.current?.close()} />}
      </dialog>
    </section>
  );
}

function PersonForm({ person, locations, teams, roles, defaultLocation, meId, today, onDone }: Props & { person: Person | null; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<PeopleResult, FormData>(person ? updatePerson : invitePerson, null);
  const [resetState, resetAction, resetPending] = useActionState<PeopleResult, FormData>(resetLink, null);
  const [loc, setLoc] = useState(person?.locationId ?? defaultLocation);
  const self = person?.id === meId;
  useEffect(() => { if (state?.ok && person) { onDone(); router.refresh(); } if (state?.ok && !person) router.refresh(); }, [state, person, onDone, router]);
  const link = state?.link ?? resetState?.link;
  const roleOpts = person && !roles.some((r) => r.value === person.role) ? [...roles, { value: person.role, label: roleLabel(roles, person.role) }] : roles;

  if (!person && state?.ok) {
    return (
      <div className="panel">
        <h2 id="pp-title">Invite created</h2>
        <p>{state.message}</p>
        {link && <LinkBox link={link} />}
        <div className="row" style={{ marginTop: 14 }}><button type="button" className="btn primary" onClick={onDone}>Done</button></div>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 id="pp-title">{person ? `Edit ${person.name}` : "Invite person"}</h2>
        <button type="button" className="btn sm" onClick={onDone}>Close</button>
      </div>
      <form onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => action(fd)); }}>
        <input type="hidden" name="id" value={person?.id ?? ""} />
        <div className="row">
          <div><label htmlFor="pf-name">Name<span className="req"> *</span></label><input id="pf-name" name="name" defaultValue={person?.name} /></div>
          {person ? <div><label>Email</label><input value={person.email} disabled /></div> : <div><label htmlFor="pf-email">Email<span className="req"> *</span></label><input id="pf-email" name="email" type="email" /></div>}
          <div><label htmlFor="pf-emp">Employee ID</label><input id="pf-emp" name="employeeId" maxLength={32} defaultValue={person?.employeeId} placeholder="e.g. CM-0042" /></div>
          <div><label htmlFor="pf-title">Job title</label><input id="pf-title" name="title" defaultValue={person?.title} /></div>
          <div>
            <label htmlFor="pf-role">Role</label>
            <select id="pf-role" name="role" defaultValue={person?.role ?? "MEMBER"} disabled={self}>{roleOpts.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
            {self && <input type="hidden" name="role" value={person!.role} />}
          </div>
          <div><label htmlFor="pf-loc">Office</label><select id="pf-loc" name="locationId" value={loc} onChange={(e) => setLoc(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div>
            <label htmlFor="pf-team">Team</label>
            <select id="pf-team" name="teamId" key={loc} defaultValue={teams.some((t) => t.id === person?.teamId && t.locationId === loc) ? person!.teamId! : ""}>
              <option value="">No team</option>
              {teams.filter((t) => t.locationId === loc).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><label htmlFor="pf-join">Joining date</label><input id="pf-join" name="joiningDate" type="date" min="1950-01-01" max={today} defaultValue={person?.joiningDate} /></div>
          <div><label htmlFor="pf-target">Expected hours per week</label><input id="pf-target" name="weeklyTarget" type="number" min="0" max="80" step="0.5" defaultValue={person?.weeklyTarget ?? 40} /></div>
        </div>
        <p className="note">Set expected hours to 0 to leave someone out of productivity on the dashboard. The joining date shows years of experience on their profile.</p>
        {person && <label className="check"><input type="checkbox" name="active" defaultChecked={person.active} disabled={self} /> Active (inactive people can&apos;t sign in)</label>}
        {person && self && <input type="hidden" name="active" value="on" />}
        {state?.error && <p className="err-text" role="alert">{state.error}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={pending}>{pending ? "Saving…" : person ? "Save changes" : "Create invite"}</button>
        </div>
      </form>
      {person && (
        <form action={resetAction} style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <input type="hidden" name="id" value={person.id} />
          <p className="note" style={{ margin: "0 0 8px" }}>{person.pending ? "They haven't set a password yet." : "Forgot their password?"}</p>
          {resetState?.ok ? <><p style={{ margin: "0 0 6px" }}>{resetState.message}</p>{link && <LinkBox link={link} />}</> : <button className="btn sm" disabled={resetPending}>{person.pending ? "Get invite link" : "Create password reset link"}</button>}
          {resetState?.error && <p className="err-text" role="alert">{resetState.error}</p>}
        </form>
      )}
    </div>
  );
}

function LinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="row">
      <div style={{ flex: "3 1 300px" }}><label htmlFor="pf-link" className="sr-only">Invite link</label><input id="pf-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></div>
      <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}
