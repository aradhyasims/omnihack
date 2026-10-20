// REST API helpers: consistent envelopes, error mapping, CSRF origin checks, request ids and rate limits.
import { NextResponse, type NextRequest } from "next/server";
import { isAppError } from "./errors";
import { rateLimit } from "./rate-limit";
import { validateSessionToken, SESSION_COOKIE } from "./auth/session";
import type { Actor } from "./authz";

export type ApiContext = { req: NextRequest; requestId: string; actor: Actor | null };

export function ok(data: unknown, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status });
}

function errorResponse(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) }, requestId }, { status, headers: { "x-request-id": requestId } });
}

async function resolveActor(req: NextRequest): Promise<Actor | null> {
  const session = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  if (session.user.mfaEnabledAt && !session.mfaVerified) return null;
  return session.user;
}

/** Wrap a route handler: auth resolution, CSRF origin check for unsafe methods, rate limit, error mapping. */
export function api(handler: (ctx: ApiContext) => Promise<Response>, opts: { rate?: [number, number] } = {}) {
  return async (req: NextRequest) => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const origin = req.headers.get("origin");
        const host = req.headers.get("host");
        if (origin && host && new URL(origin).host !== host) return errorResponse(403, "FORBIDDEN", "Cross-origin request rejected.", requestId);
      }
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
      const [limit, windowMs] = opts.rate ?? [120, 60_000];
      rateLimit(`api:${ip}:${req.nextUrl.pathname}`, limit, windowMs);
      const actor = await resolveActor(req);
      const res = await handler({ req, requestId, actor });
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (e) {
      if (isAppError(e)) return errorResponse(e.status, e.code, e.message, requestId, e.fieldErrors);
      console.error(`[api:${requestId}]`, e);
      return errorResponse(500, "INTERNAL", "An unexpected error occurred.", requestId);
    }
  };
}
