import { currentUser } from "@/lib/auth";
import { canTab } from "@/lib/roles";
import { TEMPLATES, type ImportKind } from "@/lib/importTemplates";
import { CSV_BOM } from "@/lib/report";

/** The template CSV for one import, as it is stored after a byte order mark (like every CSV we send), under our own file name. */
export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const me = await currentUser();
  if (!me || !canTab("import-export", me.role)) return new Response("Not allowed", { status: 403 });
  const { kind } = await params;
  const t = TEMPLATES[kind as ImportKind];
  if (!t || !Object.hasOwn(TEMPLATES, kind)) return new Response("Not found", { status: 404 });
  if (kind === "people" && me.role !== "ADMIN" && me.role !== "LOCATION") return new Response("Not allowed", { status: 403 });
  return new Response(CSV_BOM + t.csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${t.file}"`, "Cache-Control": "no-store" },
  });
}
