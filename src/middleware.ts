import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const target = p + req.nextUrl.search;
  const isPublic = p.startsWith("/login") || p.startsWith("/invite") || p.startsWith("/share/") || p.startsWith("/setup") || p.startsWith("/api/cron");
  // A page action (Add entry, Save) must get an action result, not a redirect, or the page crashes. The action checks the sign-in itself and sends the person to the sign-in page.
  const isAction = req.method === "POST" && req.headers.has("next-action");
  if (!isPublic && !isAction && !req.cookies.get("clockme_session")) {
    // A move between pages of an open app (a client navigation) means they were signed in until a moment ago, so say why they're on the sign-in page.
    // The page they asked for is passed on, so they can go back to it after signing in.
    const reason = req.headers.has("rsc") ? "reason=ended&" : "";
    return NextResponse.redirect(new URL(`/login?${reason}next=${encodeURIComponent(target)}`, req.url));
  }
  // Pages read the path they were asked for from this header, so a sign-in that has ended can send the person back to it.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", target);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next|favicon.ico|icon.svg|brand/).*)"] };
