import { db } from "./db";

/** One list for the same set of tags, whatever order they were picked in (reports group on this list). */
export const sortTagIds = (ids: Iterable<string>) => [...new Set(ids)].sort();

/** The tags a form sent (tick boxes named tagIds): only ones that exist, once each, in the fixed order. */
export async function readTagIds(form: FormData, name = "tagIds"): Promise<string[]> {
  const sent = form.getAll(name).map(String).filter(Boolean);
  if (!sent.length) return [];
  const found = await db.tag.findMany({ where: { id: { in: sent } }, select: { id: true } });
  return sortTagIds(found.map((t) => t.id));
}

/** Of these ids, the ones that still have a tag, once each, in the fixed order. */
export async function existingTagIds(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const found = await db.tag.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return sortTagIds(found.map((t) => t.id));
}

/** Tag names for display, alphabetical. An id that no longer has a tag is left out. */
export function tagNamesOf(ids: string[], names: Map<string, string>): string[] {
  return ids.map((id) => names.get(id)).filter((n): n is string => !!n).sort((a, b) => a.localeCompare(b));
}

export const tagText = (ids: string[], names: Map<string, string>) => tagNamesOf(ids, names).join(", ");
