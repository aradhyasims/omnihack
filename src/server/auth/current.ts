// Next.js glue: resolves the signed-in user from the session cookie.
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "../authz";
import { isPlatformAdmin } from "../authz";
import { createSession, SESSION_COOKIE, validateSessionToken, deleteSessionByToken } from "./session";

export type CurrentSession = NonNullable<Awaited<ReturnType<typeof validateSessionToken>>>;

export const getSession = cache(async (): Promise<CurrentSession | null> => {
  const store = await cookies();
  return validateSessionToken(store.get(SESSION_COOKIE)?.value);
});

/** The signed-in, fully-authenticated user (MFA completed when enabled), or null. */
export const getCurrentUser = cache(async (): Promise<(Actor & { mfaEnabledAt: Date | null; sessionId: string }) | null> => {
  const session = await getSession();
  if (!session) return null;
  if (session.user.mfaEnabledAt && !session.mfaVerified) return null;
  return { ...session.user, sessionId: session.id };
});

export async function requireUser(nextPath?: string) {
  const session = await getSession();
  if (!session) redirect(`/auth/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  if (session.user.mfaEnabledAt && !session.mfaVerified) redirect("/auth/mfa");
  return { ...session.user, sessionId: session.id };
}

export async function requireAdminUser() {
  const user = await requireUser("/admin");
  if (!isPlatformAdmin(user)) redirect("/dashboard?denied=admin");
  if (process.env.REQUIRE_ADMIN_MFA === "true" && !user.mfaEnabledAt) redirect("/dashboard/profile?mfa=required");
  return user;
}

export async function clientMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}

export async function startSession(userId: string, mfaVerified: boolean) {
  const meta = await clientMeta();
  const { token, cookieExpires } = await createSession(userId, { ...meta, mfaVerified });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: cookieExpires,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionByToken(token);
  store.delete(SESSION_COOKIE);
}
