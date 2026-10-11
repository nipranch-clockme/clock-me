"use client";
import { useState } from "react";

/** Folds a section up and out again. The choice is kept in a cookie (so the next page load, on any page, starts the same way) and the section it
 *  controls is the element with `bodyId`, which the server renders hidden when the cookie says closed. */
export default function CollapseButton({ bodyId, cookie, closed }: { bodyId: string; cookie: string; closed: boolean }) {
  const [shut, setShut] = useState(closed);
  const toggle = () => {
    const next = !shut;
    setShut(next);
    const body = document.getElementById(bodyId);
    if (body) body.hidden = next;
    try { document.cookie = `${cookie}=${next ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`; } catch { /* the choice just isn't remembered */ }
  };
  return (
    <button type="button" className="btn sm" aria-expanded={!shut} aria-controls={bodyId} onClick={toggle}>{shut ? "Show" : "Hide"}</button>
  );
}
