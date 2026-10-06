import { redirect } from "next/navigation";

/** The Calendar is now a view inside the Timesheet. Old links and bookmarks land there. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ w?: string; u?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ view: "cal" });
  if (sp.w) q.set("w", sp.w);
  if (sp.u) q.set("u", sp.u);
  redirect(`/timesheet?${q}`);
}
