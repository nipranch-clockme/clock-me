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
};

export type ImportResult = {
  kind: ImportKind;
  headers: string[];
  rows: PreviewRow[]; // all rows up to PREVIEW_ROWS
  total: number; // rows in the file
  summary: ImportSummary;
  adds: string[]; // what the import will also create, like new clients or teams
  columnNotes: string[]; // columns we don't use or don't recognise
  imported?: number;
  done?: string[]; // what an import actually did
  links?: InviteLink[]; // invite links for the people just added
  error?: string;
} | null;

export const PREVIEW_ROWS = 1000;

export function summarise(rows: PreviewRow[]): ImportSummary {
  const reasons = new Map<string, number>();
  let ok = 0, withNotes = 0;
  for (const r of rows) {
    if (r.error) reasons.set(r.error, (reasons.get(r.error) ?? 0) + 1);
    else { ok++; if (r.notes.length) withNotes++; }
  }
  return { ok, withNotes, bad: rows.length - ok, reasons: [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, count]) => ({ text, count })) };
}

/** Columns the file has that this import doesn't use. `known` are columns we deliberately ignore (with the reason), `used` are the ones we read. */
export function columnNotes(keys: string[], used: string[], ignored: Record<string, string>, extraKnown: string[] = []): string[] {
  const known = new Set([...used, ...Object.keys(ignored), ...extraKnown]);
  const label = (k: string) => k.replace(/\b\w/g, (c) => c.toUpperCase());
  const skipped = keys.filter((k) => k && ignored[k] !== undefined);
  const unknown = keys.filter((k) => k && !known.has(k));
  const out: string[] = [];
  const byWhy = new Map<string, string[]>();
  for (const k of skipped) byWhy.set(ignored[k], [...(byWhy.get(ignored[k]) ?? []), label(k)]);
  for (const [why, cols] of byWhy) out.push(`Not used (${why}): ${cols.join(", ")}`);
  if (unknown.length) out.push(`Not recognised, so skipped: ${unknown.map(label).join(", ")}`);
  return out;
}
