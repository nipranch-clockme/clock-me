import { redirect } from "next/navigation";

/** The Calendar tab was removed from the Timesheet. Old links and bookmarks land on the Timesheet for the same week and person. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ w?: string; u?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  if (sp.w) q.set("w", sp.w);
  if (sp.u) q.set("u", sp.u);
  redirect(`/timesheet${q.size ? `?${q}` : ""}`);
}
