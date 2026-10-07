import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const isPublic = p.startsWith("/login") || p.startsWith("/invite") || p.startsWith("/share/") || p.startsWith("/setup") || p.startsWith("/api/cron");
  if (!isPublic && !req.cookies.get("clockme_session")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico|icon.svg).*)"] };
