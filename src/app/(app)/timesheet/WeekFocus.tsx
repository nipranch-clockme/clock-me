"use client";
import { useEffect, useRef } from "react";

/** After a change of week, puts focus on the week label (`target`) when the link that was used has gone ("This week" leaves once you are on
 *  the current week), so keyboard users keep their place. It leaves focus alone on the first load and whenever something still has it. */
export default function WeekFocus({ week, target }: { week: string; target: string }) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const a = document.activeElement;
    if (!a || a === document.body) document.getElementById(target)?.focus({ preventScroll: true });
  }, [week, target]);
  return null;
}
