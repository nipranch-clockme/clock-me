"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export type SearchOption = { value: string; label: string; group?: string; disabled?: boolean };

/**
 * A dropdown with a search box above it. Typing narrows the list (and opens it as a short list so the matches are
 * visible straight away); the field itself is still a normal <select>, so forms, labels and keyboard use work as before.
 * The search stays until it is changed, so the arrow keys move through the matches only. Short lists (under `minToSearch`
 * options) skip the search box.
 */
export default function SearchSelect({
  id, name, options, value, defaultValue = "", onChange, placeholder, className, required, disabled, minToSearch = 7, searchLabel = "Search", alwaysList = false,
}: {
  id: string; name?: string; options: SearchOption[]; value?: string; defaultValue?: string; onChange?: (v: string) => void;
  placeholder?: string; className?: string; required?: boolean; disabled?: boolean; minToSearch?: number; searchLabel?: string; alwaysList?: boolean;
}) {
  const [own, setOwn] = useState(value ?? defaultValue);
  const [q, setQ] = useState("");
  // A value that isn't among the options (a project just added as a row and so taken off the list) counts as nothing chosen,
  // so the browser doesn't quietly pick the first option instead.
  const given = value ?? own;
  const cur = given === "" || options.some((o) => o.value === given) ? given : "";
  useEffect(() => { if (value !== undefined) setOwn(value); }, [value]);
  const sid = useId();
  const sel = useRef<HTMLSelectElement>(null);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? options.filter((o) => o.value === cur || o.value === "" || `${o.group ?? ""} ${o.label}`.toLowerCase().includes(needle)) : options),
    [options, needle, cur],
  );
  const groups = [...new Set(shown.map((o) => o.group ?? ""))];
  const row = (o: SearchOption) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>;
  // Matches for the search, the current choice included, so picking the only match doesn't hide the list.
  const hits = needle ? shown.filter((o) => o.value !== "" && `${o.group ?? ""} ${o.label}`.toLowerCase().includes(needle)).length : shown.length;
  const labelled = !!placeholder && !alwaysList;
  // Nothing chosen: an empty option holds the empty value, so the first option isn't picked by itself.
  const blank = cur === "" && !options.some((o) => o.value === "");
  // A list box (while searching, or with alwaysList) treats even an empty option as a choice, so there nothing is
  // selected instead and a required list still asks for one.
  useLayoutEffect(() => { if (blank && sel.current && sel.current.size > 1) sel.current.selectedIndex = -1; });
  return (
    <div className="ssel">
      {(alwaysList || options.length >= minToSearch) && (
        <input id={sid} type="search" className="ssel-q" value={q} placeholder="Search…" aria-label={searchLabel}
          autoComplete="off" autoFocus={alwaysList} onChange={(e) => { e.stopPropagation(); setQ(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
            // Down arrow goes on to the list, like Tab.
            if (e.key === "ArrowDown" && sel.current && !sel.current.hidden) { e.preventDefault(); sel.current.focus(); }
          }} />
      )}
      <select ref={sel} id={id} name={name} className={className} required={required} disabled={disabled} value={cur}
        size={alwaysList ? 8 : needle ? Math.min(6, Math.max(2, shown.length)) : undefined} hidden={!!needle && hits === 0}
        onChange={(e) => { setOwn(e.target.value); onChange?.(e.target.value); }}>
        {labelled ? <option value="" disabled>{placeholder}</option> : blank && <option value="" disabled hidden />}
        {groups.map((g) => g
          ? <optgroup key={g} label={g}>{shown.filter((o) => (o.group ?? "") === g).map(row)}</optgroup>
          : shown.filter((o) => !o.group).map(row))}
      </select>
      {needle && hits === 0 && <p className="note ssel-none">Nothing matches "{q.trim()}".</p>}
    </div>
  );
}
