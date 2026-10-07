export type CsvRow = { line: number; cells: string[] };

/**
 * Parses CSV text (commas, quoted fields, doubled quotes, CRLF or LF). Blank lines are skipped.
 * A quote only starts a quoted field at the beginning of a field, so a stray quote inside text stays as typed.
 * Each row keeps the line number it starts on in the file, counting line breaks inside quoted fields.
 */
export function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [], cell = "", q = false, line = 1, rowLine = 1;
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
    } else if (c === '"' && !cell.trim()) { cell = ""; q = true; }
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      endRow();
      rowLine = ++line;
    } else cell += c;
  }
  endRow();
  return rows;
}

/** Undoes the apostrophe our CSV exports put in front of =, +, - and @ so spreadsheets don't treat text as a formula. */
const unguard = (v: string) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v);

/** Turns rows into objects keyed by lower-cased header names, with each row's line number in the file. */
export function csvObjects(text: string) {
  const [head = { line: 1, cells: [] }, ...rows] = parseCsv(text);
  const keys = head.cells.map((h) => h.toLowerCase().replace(/\s+/g, " "));
  return {
    keys,
    rows: rows.map((r) => ({ line: r.line, v: Object.fromEntries(keys.map((k, i) => [k, unguard(r.cells[i] ?? "")])) as Record<string, string> })),
  };
}
