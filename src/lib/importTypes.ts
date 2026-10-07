import type { ImportKind } from "./importTemplates";

export type { ImportKind };

/** One row of a file as the person sees it while checking: what we understood, why it can't be imported, and gentler heads-ups. */
export type PreviewRow = { line: number; cells: string[]; error: string; notes: string[] };

export type InviteLink = { name: string; email: string; link: string };

export type ImportSummary = {
  ok: number; // rows that will be imported
  withNotes: number; // of those, rows that carry a heads-up
  bad: number; // rows that will be skipped
  reasons: { text: string; count: number }[]; // why rows will be skipped, most common first
  moreReasons: number; // skipped rows whose reason isn't in the list above
};

export type ImportResult = {
  kind: ImportKind;
  headers: string[];
  rows: PreviewRow[]; // the first PREVIEW_ROWS rows, then every later row that has a problem or a heads-up (up to PREVIEW_ROWS more)
  total: number; // rows in the file
  summary: ImportSummary;
  adds: string[]; // what the import will also create, like new clients or teams
  columnNotes: string[]; // columns we don't use or don't recognise
  sample?: number; // rows that are the template's own example rows, which someone probably meant to replace
  imported?: number;
  done?: string[]; // what an import actually did
  links?: InviteLink[]; // invite links for the people just added
  error?: string;
} | null;

export const PREVIEW_ROWS = 1000;
export const TOP_REASONS = 8;
/** The most text one check takes (as UTF-8 bytes). The server accepts 4 MB in a request, so this leaves room for the rest of the form. */
export const MAX_IMPORT_BYTES = 3_500_000;

export function summarise(rows: PreviewRow[]): ImportSummary {
  const reasons = new Map<string, number>();
  let ok = 0, withNotes = 0;
  for (const r of rows) {
    if (r.error) reasons.set(r.error, (reasons.get(r.error) ?? 0) + 1);
    else { ok++; if (r.notes.length) withNotes++; }
  }
  const sorted = [...reasons].sort((a, b) => b[1] - a[1]);
  return {
    ok, withNotes, bad: rows.length - ok,
    reasons: sorted.slice(0, TOP_REASONS).map(([text, count]) => ({ text, count })),
    moreReasons: sorted.slice(TOP_REASONS).reduce((n, [, c]) => n + c, 0),
  };
}

/**
 * Columns the file has that this import doesn't use. `known` are columns we deliberately ignore (with the reason), `used` are the ones we read.
 * With `rows`, a column is only mentioned when at least one row has something in it.
 */
export function columnNotes(keys: string[], used: string[], ignored: Record<string, string>, extraKnown: string[] = [], rows?: Record<string, string>[]): string[] {
  const known = new Set([...used, ...Object.keys(ignored), ...extraKnown]);
  const label = (k: string) => k.replace(/\b\w/g, (c) => c.toUpperCase());
  const filled = (k: string) => !rows || rows.some((r) => r[k]?.trim());
  const skipped = keys.filter((k) => k && Object.hasOwn(ignored, k) && filled(k));
  const unknown = keys.filter((k) => k && !known.has(k) && !Object.hasOwn(ignored, k) && filled(k));
  const out: string[] = [];
  const byWhy = new Map<string, string[]>();
  for (const k of skipped) byWhy.set(ignored[k], [...(byWhy.get(ignored[k]) ?? []), label(k)]);
  for (const [why, cols] of byWhy) out.push(`${cols.join(", ")} ${cols.length > 1 ? "are" : "is"} not used: ${why}`);
  if (unknown.length) out.push(`Not recognised, so skipped: ${unknown.map(label).join(", ")}`);
  return out;
}
