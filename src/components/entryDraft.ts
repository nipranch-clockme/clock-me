import { useEffect } from "react";
import { parseDuration } from "@/lib/format";
import type { EntryValue } from "./entryTypes";

// The entry form's typed text, kept in this tab's sessionStorage while the form is open. When a session ends, a save sends the person to
// sign in, and this brings the entry back after they sign in. Nothing is kept on the server, and no session data is stored here.
const KEY = "clockme-entry-draft";
const MAX_AGE = 2 * 60 * 60 * 1000;

/** What the entry form held: the fields as typed (start and duration as text), the entry being changed if any, and the page it was on. */
export type EntryDraft = {
  /** Pathname and search of the page the form was open on. A draft only comes back on that page. */
  path: string;
  savedAt: number;
  /** The signed-in person who was typing, and the account the entry is for (their own id, unless a manager or admin is changing someone else's time). */
  by: string;
  forId: string;
  id?: string;
  fixed: boolean;
  projectId: string;
  projectName?: string;
  phaseId: string;
  tagIds: string[];
  description: string;
  custom: Record<string, string>;
  date: string;
  start: string;
  duration: string;
  context?: string;
};

/** A form to open: the entry's values, plus the start and duration text as typed when it is a restored draft. */
export type EntryEdit = EntryValue & { restored?: { start: string; duration: string } };

/** The page the browser is on, as a draft records it. */
export const pagePath = () => window.location.pathname + window.location.search;

/** Keeps the form's typed text. Storage can be unavailable (private windows, blocked site data), so a failure just means nothing is kept. */
export function saveDraft(d: EntryDraft) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* not kept */ }
}

/** Drops the kept text once the entry is saved, deleted or closed. */
export function clearDraft() {
  try { window.sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
}

/** Takes the kept text for this page, for this person and this account, if it is less than two hours old. It is removed, so a refresh doesn't
 *  open it again; the form keeps it again while the entry is still open. A draft for another page or another person is left alone. */
export function takeDraft(by: string, forId: string): EntryDraft | null {
  try {
    const d = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as EntryDraft | null;
    if (!d || d.path !== pagePath() || d.by !== by || d.forId !== forId) return null;
    clearDraft();
    return Date.now() - d.savedAt > MAX_AGE ? null : d;
  } catch { return null; }
}

/** Opens a view's entry form with the draft for this page, once, when the view mounts. Nothing comes back into a view that is read only. */
export function useRestoreDraft(who: { by: string; forId: string; editable: boolean }, open: (d: EntryDraft) => void) {
  useEffect(() => {
    if (!who.editable) return;
    const d = takeDraft(who.by, who.forId);
    if (d) open(d);
    // Mount only: the draft belongs to the page as it was when the session ended, not to later changes of the page.
  }, []);
}

const clockMinutes = (v: string) => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The form's values from a draft, as the form held them. A view adds who the time is for and whether it is locked. */
export function draftEdit(d: EntryDraft): EntryEdit {
  const minutes = parseDuration(d.duration);
  return {
    projectId: d.projectId || undefined,
    projectName: d.projectName,
    phaseId: d.phaseId || null,
    tagIds: d.tagIds ?? [],
    description: d.description ?? "",
    custom: d.custom ?? {},
    date: d.date,
    startMin: clockMinutes(d.start) ?? undefined,
    minutes: minutes > 0 && minutes <= 1440 ? minutes : undefined,
    fixed: d.fixed,
    context: d.context,
    restored: { start: d.start, duration: d.duration },
  };
}
