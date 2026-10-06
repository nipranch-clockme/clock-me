"use client";
import { useState } from "react";
import { THEME_COOKIE, type ThemeId } from "@/lib/themes";

/** A round button next to the profile picture that switches between the light and dark look. The choice is kept in this browser. */
export default function ThemeToggle({ initial }: { initial: ThemeId }) {
  const [cur, setCur] = useState<ThemeId>(initial);
  const next: ThemeId = cur === "dark" ? "light" : "dark";
  const flip = () => {
    setCur(next);
    document.documentElement.dataset.theme = next;
    try { document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`; } catch { /* cookies blocked: the choice lasts until the page is reloaded */ }
  };
  return (
    <button type="button" className="themebtn" onClick={flip} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} aria-pressed={cur === "dark"}>
      {cur === "dark"
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>}
    </button>
  );
}
