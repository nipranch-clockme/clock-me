import { db } from "./db";
import type { Me } from "./auth";
import { getSettings } from "./settings";
import { trackableProjectsWhere, visibleProjectsWhere } from "./scope";
import type { EntryOptions } from "@/components/entryTypes";

/** What an entry form offers for `me`. When someone else fills it in for them (`viewer`), only projects the viewer can see too are listed, so a manager never learns of projects they have no access to. */
export async function entryOptions(me: Me, viewer: Me = me): Promise<EntryOptions> {
  const settings = await getSettings();
  const [projects, tags, fields] = await Promise.all([
    db.project.findMany({ where: viewer.id === me.id ? trackableProjectsWhere(me) : { AND: [trackableProjectsWhere(me), visibleProjectsWhere(viewer)] }, include: { client: true, phases: { where: { sort: { lt: 999 } }, orderBy: { sort: "asc" } } }, orderBy: [{ client: { name: "asc" } }, { name: "asc" }] }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.customField.findMany({ orderBy: { sort: "asc" } }),
  ]);
  return {
    projects: projects.map((p) => ({ id: p.id, name: p.name, client: p.client.name, phases: p.phases.map((x) => ({ id: x.id, name: x.name })) })),
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
    fields: fields.map((f) => ({ id: f.id, name: f.name, type: f.type, options: f.options, required: f.required })),
    requireTag: settings.requireTag,
    requireDescription: settings.requireDescription,
    timeFormat: settings.timeFormat,
  };
}
