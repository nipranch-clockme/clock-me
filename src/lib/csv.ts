/** Parses CSV text (commas, quoted fields, doubled quotes, CRLF or LF). Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** Turns rows into objects keyed by lower-cased header names. */
export function csvObjects(text: string) {
  const [head = [], ...rows] = parseCsv(text);
  const keys = head.map((h) => h.toLowerCase());
  return { keys, rows: rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])) as Record<string, string>) };
}
