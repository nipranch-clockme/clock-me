export type CsvRow = { line: number; cells: string[] };

/** A header wider than this isn't one of our templates, and reading every row against it would only waste the server's time. */
export const MAX_COLUMNS = 200;
export const EXTRA_CELLS = "This row has more values than the header has columns. Put quotes around any text that contains commas";

/**
 * Parses CSV text (commas, quoted fields, doubled quotes, CRLF or LF). Blank lines are skipped.
 * A quote only starts a quoted field at the beginning of a field, so a stray quote inside text stays as typed.
 * Each row keeps the line number it starts on in the file, counting line breaks inside quoted fields.
 * `unclosed` is the line where a quote was opened and never closed (everything after it was read as one cell).
 */
export function parseCsv(text: string): { rows: CsvRow[]; unclosed?: number } {
  const rows: CsvRow[] = [];
  let row: string[] = [], cell = "", q = false, line = 1, rowLine = 1, quoteLine = 1;
  const s = text.replace(/^﻿/, "");
  const endRow = () => {
    row.push(cell); cell = "";
    if (row.some((x) => x.trim())) rows.push({ line: rowLine, cells: row.map((x) => x.trim()) });
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else {
        if (c === "\n" || (c === "\r" && s[i + 1] !== "\n")) line++;
        cell += c;
      }
    } else if (c === '"' && !cell.trim()) { cell = ""; q = true; quoteLine = line; }
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      endRow();
      rowLine = ++line;
    } else cell += c;
  }
  endRow();
  return { rows, unclosed: q ? quoteLine : undefined };
}

/** Undoes the apostrophe our CSV exports put in front of =, +, - and @ so spreadsheets don't treat text as a formula. */
const unguard = (v: string) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v);

export type CsvObjects = { keys: string[]; total: number; rows: { line: number; extra: boolean; v: Record<string, string> }[]; error?: string };

/**
 * Turns rows into objects keyed by lower-cased header names, with each row's line number in the file.
 * Only the first `maxRows + 1` rows are turned into objects (`total` still counts them all), so a huge file costs little before the caller refuses it.
 * `error` is set when the file can't be read at all: an Excel file, the wrong separator, a quote that is never closed, too many columns.
 * `extra` marks a row with values beyond the last header column (usually an unquoted comma).
 */
export function csvObjects(text: string, maxRows = Infinity): CsvObjects {
  const fail = (error: string): CsvObjects => ({ keys: [], total: 0, rows: [], error });
  if (text.startsWith("PK\u0003\u0004")) return fail("This looks like an Excel file. In Excel choose Save As, then CSV UTF-8, and add that file instead.");
  const { rows: all, unclosed } = parseCsv(text);
  const [head = { line: 1, cells: [] }, ...rows] = all;
  if (unclosed) return fail(`The quote that opens on line ${unclosed} is never closed, so the rest of the file can't be read. Close it, or take it out.`);
  if (head.cells.length > MAX_COLUMNS) return fail(`That file has more than ${MAX_COLUMNS} columns, so it isn't one of our templates. Check that it is the right file.`);
  if (head.cells.length === 1 && /[;\t]/.test(head.cells[0])) return fail("The columns in this file are separated by semicolons or tabs. Save it as CSV with commas (in Excel: CSV UTF-8) and add it again.");
  const keys = head.cells.map((h) => h.toLowerCase().replace(/\s+/g, " "));
  return {
    keys,
    total: rows.length,
    rows: rows.slice(0, maxRows + 1).map((r) => ({
      line: r.line,
      extra: r.cells.length > keys.length && r.cells.slice(keys.length).some(Boolean),
      v: Object.fromEntries(keys.map((k, i) => [k, unguard(r.cells[i] ?? "")])) as Record<string, string>,
    })),
  };
}
