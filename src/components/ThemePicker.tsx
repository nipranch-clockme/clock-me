"use client";
import { useState } from "react";
import { THEMES, THEME_COOKIE, type ThemeId } from "@/lib/themes";

/** Five looks to choose from. The choice is saved in this browser and applied straight away. */
export default function ThemePicker({ initial }: { initial: ThemeId }) {
  const [cur, setCur] = useState<ThemeId>(initial);
  const pick = (id: ThemeId) => {
    setCur(id);
    document.documentElement.dataset.theme = id;
    try { document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`; } catch { /* cookies blocked: the choice lasts until the page is reloaded */ }
  };
  return (
    <div className="themes" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <label key={t.id} className={`themecard${cur === t.id ? " on" : ""}`}>
          <input type="radio" name="theme" value={t.id} checked={cur === t.id} onChange={() => pick(t.id)} />
          <span className="swatch" aria-hidden="true">{t.swatch.map((c) => <i key={c} style={{ background: c }} />)}</span>
          <b>{t.name}</b>
          <small>{t.note}</small>
        </label>
      ))}
    </div>
  );
}
