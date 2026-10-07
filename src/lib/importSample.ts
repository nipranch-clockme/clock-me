import { csvObjects } from "./csv";
import { nameKey } from "./importParse";
import { TEMPLATES, type ImportKind } from "./importTemplates";

/** What makes a row "the same row" as one in the template: the person, the project and client, or the person's time on a project. */
const keyOf = (kind: ImportKind, r: Record<string, string>) =>
  kind === "people" ? r["email"]?.toLowerCase()
  : kind === "projects" ? `${nameKey(r["client"] ?? "")}|${nameKey(r["project"] ?? "")}`
  : `${r["email"]?.toLowerCase()}|${nameKey(r["project"] ?? "")}|${nameKey(r["description"] ?? "")}`;

/**
 * How many rows of a file are the template's own example rows. The templates have to stay exactly as supplied, so a file that still has
 * them in is easy to import by mistake (and the example people include admins), and the person checking is asked to confirm.
 */
export function sampleRows(kind: ImportKind, text: string): number {
  const sample = new Set(csvObjects(TEMPLATES[kind].csv).rows.map((r) => keyOf(kind, r.v)).filter(Boolean));
  const mine = csvObjects(text, 20000);
  if (mine.error) return 0;
  return mine.rows.filter((r) => sample.has(keyOf(kind, r.v))).length;
}
