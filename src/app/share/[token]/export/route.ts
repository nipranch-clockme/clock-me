import { NextResponse } from "next/server";
import { clientIp, takeAttempt } from "@/lib/throttle";
import { getSettings } from "@/lib/settings";
import { today } from "@/lib/dates";
import { toCsv, spToRecord } from "@/lib/report";
import { clientByShareToken, parseShareParams, shareChoices, shareRows } from "@/lib/clientShare";
import { tagText } from "@/lib/tags";

const noStore = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/** The client's view-only report as a CSV: one line per project and set of tags with its hours, for the filters on the page. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = await clientByShareToken(token);
  if (!client) {
    const { allowed } = await takeAttempt([[`share:${await clientIp()}`, 30]]);
    return new NextResponse(allowed ? "Not found" : "Too many attempts. Please wait a few minutes and try again.", { status: allowed ? 404 : 429, headers: noStore });
  }
  await getSettings(); // sets the company time zone, which decides the dates "This month" and the like cover
  const p = parseShareParams(spToRecord(new URL(req.url).searchParams));
  const choices = await shareChoices(client.id);
  p.project = p.project.filter((x) => choices.projects.some((c) => c.id === x));
  p.tag = p.tag.filter((x) => choices.tags.some((c) => c.id === x));
  const { rows } = await shareRows(client, p);
  const P = new Map(choices.projects.map((x) => [x.id, x.name])), T = new Map(choices.tags.map((x) => [x.id, x.name]));
  const sums = new Map<string, number>();
  // One line per project and set of tags, so the hours add up to the report's total.
  const tagsOf = (ids: string[]) => tagText(ids, T) || "No tag"; // a tag id with no tag left counts as no tag
  for (const r of rows) { const k = `${r.projectId}|${tagsOf(r.tagIds)}`; sums.set(k, (sums.get(k) ?? 0) + r.minutes); }
  const lines = [...sums].map(([k, m]) => { const i = k.indexOf("|"); return [P.get(k.slice(0, i)) ?? "", k.slice(i + 1), Math.round((m / 60) * 100) / 100] as [string, string, number]; })
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const name = client.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "client";
  return new NextResponse(toCsv([["Project", "Tags", "Hours"], ...lines]), {
    headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-time-report-${today()}.csv"` },
  });
}
