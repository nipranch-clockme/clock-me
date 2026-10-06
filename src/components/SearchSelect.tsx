"use client";
import { useEffect, useId, useMemo, useState } from "react";

export type SearchOption = { value: string; label: string; group?: string; disabled?: boolean };

/**
 * A dropdown with a search box above it. Typing narrows the list (and opens it as a short list so the matches are
 * visible straight away); the field itself is still a normal <select>, so forms, labels and keyboard use work as before.
 * Short lists (under `minToSearch` options) skip the search box.
 */
export default function SearchSelect({
  id, name, options, value, defaultValue = "", onChange, placeholder, className, required, disabled, minToSearch = 7, searchLabel = "Search", alwaysList = false,
}: {
  id: string; name?: string; options: SearchOption[]; value?: string; defaultValue?: string; onChange?: (v: string) => void;
  placeholder?: string; className?: string; required?: boolean; disabled?: boolean; minToSearch?: number; searchLabel?: string; alwaysList?: boolean;
}) {
  const [own, setOwn] = useState(value ?? defaultValue);
  const [q, setQ] = useState("");
  const cur = value ?? own;
  useEffect(() => { if (value !== undefined) setOwn(value); }, [value]);
  const sid = useId();
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? options.filter((o) => o.value === cur || o.value === "" || `${o.group ?? ""} ${o.label}`.toLowerCase().includes(needle)) : options),
    [options, needle, cur],
  );
  const groups = [...new Set(shown.map((o) => o.group ?? ""))];
  const row = (o: SearchOption) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>;
  const count = shown.filter((o) => o.value !== cur && o.value !== "").length;
  return (
    <div className="ssel">
      {(alwaysList || options.length >= minToSearch) && (
        <input id={sid} type="search" className="ssel-q" value={q} placeholder="Search…" aria-label={`${searchLabel} ${(placeholder ?? "").replace(/^Choose an? /i, "")}`.trim()}
          autoComplete="off" autoFocus={alwaysList} onChange={(e) => { e.stopPropagation(); setQ(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
      )}
      <select id={id} name={name} className={className} required={required} disabled={disabled} value={cur}
        size={alwaysList ? 8 : needle ? Math.min(6, Math.max(2, shown.length)) : undefined} hidden={!!needle && count === 0}
        onChange={(e) => { setOwn(e.target.value); setQ(""); onChange?.(e.target.value); }}>
        {placeholder && !alwaysList && <option value="" disabled>{placeholder}</option>}
        {groups.map((g) => g
          ? <optgroup key={g} label={g}>{shown.filter((o) => (o.group ?? "") === g).map(row)}</optgroup>
          : shown.filter((o) => !o.group).map(row))}
      </select>
      {needle && count === 0 && <p className="note ssel-none">Nothing matches &ldquo;{q.trim()}&rdquo;.</p>}
    </div>
  );
}
