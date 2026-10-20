"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/action";
import { db } from "@/server/db";
import { validation } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { authenticate, registerUser, requestPasswordReset, resetPassword, sendVerificationEmail, verifyMfaCode } from "@/server/auth/service";
import { clientMeta, endSession, getSession, startSession } from "@/server/auth/current";
import { audit } from "@/server/audit";

function safeNext(next: unknown) {
  // Only allow same-site relative paths to prevent open redirects.
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let destination = "/dashboard";
  const result = await runAction(async () => {
    const { ip } = await clientMeta();
    const email = String(fd.get("email") ?? "")
      .trim()
      .toLowerCase();
    rateLimit(`login:ip:${ip}`, 20, 15 * 60_000);
    rateLimit(`login:email:${email}`, 8, 15 * 60_000);
    const res = await authenticate(email, String(fd.get("password") ?? ""));
    if (!res.ok) {
      throw validation(
        res.reason === "inactive" ? "This account is deactivated or suspended. Contact support to restore access." : "Incorrect email or password.",
      );
    }
    await startSession(res.userId, !res.mfaRequired);
    destination = res.mfaRequired ? `/auth/mfa?next=${encodeURIComponent(safeNext(fd.get("next")))}` : safeNext(fd.get("next"));
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let destination = "/dashboard?welcome=1";
  const result = await runAction(async () => {
    const { ip } = await clientMeta();
    rateLimit(`register:${ip}`, 10, 60 * 60_000);
    const user = await registerUser({
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      acceptTerms: fd.get("acceptTerms") === "on",
    });
    await startSession(user.id, true);
    const next = fd.get("next");
    if (typeof next === "string" && next.startsWith("/")) destination = safeNext(next);
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

export async function mfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let destination = "/dashboard";
  const result = await runAction(async () => {
    const session = await getSession();
    if (!session) throw validation("Your sign-in expired. Please sign in again.");
    rateLimit(`mfa:${session.userId}`, 6, 10 * 60_000);
    const ok = await verifyMfaCode(session.userId, String(fd.get("code") ?? ""));
    if (!ok) {
      await audit({ actorId: session.userId, action: "auth.mfa_failed", entityType: "User", entityId: session.userId });
      throw validation("That code is not valid.", { code: "Invalid code." });
    }
    await db.session.update({ where: { id: session.id }, data: { mfaVerified: true } });
    destination = safeNext(fd.get("next"));
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ip } = await clientMeta();
    rateLimit(`forgot:${ip}`, 5, 60 * 60_000);
    await requestPasswordReset(String(fd.get("email") ?? ""));
    return "If an account exists for that email, a reset link is on its way. Check your inbox.";
  });
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    if (fd.get("password") !== fd.get("confirm")) throw validation("Passwords do not match.", { confirm: "Passwords do not match." });
    await resetPassword(String(fd.get("token") ?? ""), String(fd.get("password") ?? ""));
  });
  if (result.ok) redirect("/auth/login?reset=1");
  return result;
}

export async function resendVerificationAction(): Promise<ActionState> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw validation("Sign in first.");
    rateLimit(`resend:${session.userId}`, 3, 60 * 60_000);
    await sendVerificationEmail(session.userId);
    return "Verification email sent. Check your inbox.";
  });
}
