import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const isPublic = p.startsWith("/login") || p.startsWith("/invite") || p.startsWith("/share/") || p.startsWith("/setup") || p.startsWith("/api/cron");
  // A page action (Add entry, Save) must get an action result, not a redirect, or the page crashes. The action checks the sign-in itself and sends the person to the sign-in page.
  const isAction = req.method === "POST" && req.headers.has("next-action");
  if (!isPublic && !isAction && !req.cookies.get("clockme_session")) {
    // A move between pages of an open app (a client navigation) means they were signed in until a moment ago, so say why they're on the sign-in page.
    return NextResponse.redirect(new URL(req.headers.has("rsc") ? "/login?reason=ended" : "/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico|icon.svg).*)"] };
