import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/home", "/cases", "/billing", "/onboarding"];
const SESSION_COOKIE = "ujris_session";

// A lightweight presence check only — middleware runs on the Edge runtime
// and cannot verify the JWT signature with the Node `jose` + secret here
// without extra config. Every protected page and server action still
// performs full, server-authoritative session verification via
// `getCurrentUser()` / `getSession()` before returning or mutating any
// data. This middleware only avoids an unnecessary render for obviously
// signed-out visitors.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*", "/cases/:path*", "/billing/:path*", "/onboarding/:path*"],
};
