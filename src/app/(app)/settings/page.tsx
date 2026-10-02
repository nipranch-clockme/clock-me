import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PERMISSIONS, ROLES } from "@/lib/roles";
import { GeneralForm, TagForm, TemplateForm, FieldForm, Confirm } from "./SettingsForms";
import { removeField, removeTag, removeTemplate, toggleFieldRequired } from "./actions";

export default async function SettingsPage() {
  await requireTab("settings");
  const [settings, tags, templates, fields, tagUse] = await Promise.all([
    getSettings(),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.phaseTemplate.findMany({ orderBy: { name: "asc" } }),
    db.customField.findMany({ orderBy: { sort: "asc" } }),
    db.timeEntry.groupBy({ by: ["tagId"], _count: true }),
  ]);
  const used = new Map(tagUse.map((t) => [t.tagId, t._count]));
  const mark = (v: string) => (v === "y" ? <span className="yes">✓</span> : v === "n" ? <span className="no">–</span> : <span className="part">{v}</span>);
  return (
    <div className="grid g2">
      <GeneralForm s={{ timeFormat: settings.timeFormat, requireTag: settings.requireTag, requireDescription: settings.requireDescription, lockBefore: settings.lockBeforeStr ?? "", dailyMinimum: settings.dailyMinimum, remindSubmit: settings.remindSubmit, remindSubmitDay: settings.remindSubmitDay, remindDaily: settings.remindDaily, remindApprovers: settings.remindApprovers }} emailOn={!!process.env.RESEND_API_KEY} />
      <section className="panel">
        <h3>Tags</h3>
        <p className="note" style={{ margin: "0 0 8px" }}>One list for the whole company. Removing a tag clears it from entries that used it.</p>
        <div className="list">{tags.map((t) => (
          <div className="item" key={t.id}><div>{t.name}<div className="meta">{used.get(t.id) ?? 0} entries</div></div>
            <Confirm action={removeTag} id={t.id} label="Remove" question={used.get(t.id) ? `Remove ${t.name}? ${used.get(t.id)} entries will lose this tag.` : `Remove ${t.name}?`} /></div>
        ))}</div>
        <TagForm />
      </section>
      <section className="panel">
        <h3>Phase templates</h3>
        <p className="note" style={{ margin: "0 0 8px" }}>Used when creating a project. Changing templates doesn&apos;t change existing projects.</p>
        <div className="list">{templates.map((t) => (
          <div className="item" key={t.id}><div>{t.name}<div className="meta">{t.phases.join(" → ")}</div></div><Confirm action={removeTemplate} id={t.id} label="Remove" question={`Remove the ${t.name} template?`} /></div>
        ))}</div>
        <TemplateForm />
      </section>
      <section className="panel">
        <h3>Custom fields</h3>
        <p className="note" style={{ margin: "0 0 8px" }}>Extra fields on every time entry. They show in the entry form, CSV import and exports.</p>
        <div className="list">{fields.map((f) => (
          <div className="item" key={f.id}>
            <div>{f.name} {f.required && <span className="pill p-submitted">Required</span>}<div className="meta">{f.type === "select" ? `Dropdown: ${f.options.join(", ")}` : "Text"}</div></div>
            <div className="row" style={{ flex: "0 0 auto" }}>
              <form action={toggleFieldRequired}><input type="hidden" name="id" value={f.id} /><button className="btn sm">{f.required ? "Make optional" : "Make required"}</button></form>
              <Confirm action={removeField} id={f.id} label="Remove" question={`Remove ${f.name}? Values already entered will no longer show.`} />
            </div>
          </div>
        ))}{!fields.length && <div className="empty">No custom fields.</div>}</div>
        <FieldForm />
      </section>
      <section className="panel full">
        <h3>What each role can do</h3>
        <div className="tablebox"><table className="matrix">
          <thead><tr><th>Permission</th>{ROLES.map(([r, l]) => <th key={r}>{l}</th>)}</tr></thead>
          <tbody>{PERMISSIONS.map(([label, cells]) => <tr key={label}><td>{label}</td>{ROLES.map(([r]) => <td key={r}>{mark(cells[r])}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="note" style={{ margin: "8px 0 0" }}>Set each person&apos;s role on the People page.</p>
      </section>
    </div>
  );
}
