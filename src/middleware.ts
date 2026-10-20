// Edge middleware: fast redirect to sign-in for protected areas when no session cookie exists,
// and a request id for tracing. Real authorization happens server-side in every service call.
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/organizer", "/admin"];

export function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const { pathname, search } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !req.cookies.get("oh_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set("x-request-id", requestId);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("x-request-id", requestId);
  if (PROTECTED.some((p) => pathname.startsWith(p))) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|apple-icon.png|favicon.ico|brand/).*)"],
};
