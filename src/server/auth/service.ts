import { z } from "zod";
import { brand } from "@/config/brand";
import { db } from "../db";
import { decrypt, encrypt, generateTotpSecret, hashPassword, randomToken, sha256, verifyPassword, verifyTotp } from "../crypto";
import { AppError, conflict, validation } from "../errors";
import { queueEmail } from "../notifications/email";
import { audit } from "../audit";
import { deleteUserSessions } from "./session";

const COMMON_PASSWORDS = new Set(["password123", "password1234", "123456789012", "qwertyuiop12", "omnihack1234", "letmein12345", "iloveyou1234"]);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "This password is too common.")
  .refine((p) => /[A-Za-z]/.test(p) && /\d|[^A-Za-z0-9]/.test(p), "Include letters and at least one number or symbol.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms and privacy notice." }) }),
});

// Pre-computed dummy hash so unknown emails take the same time as wrong passwords.
let dummyHash: Promise<string> | null = null;

export async function registerUser(input: { name: string; email: string; password: string; acceptTerms: boolean }) {
  const data = registerSchema.parse(input);
  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) throw conflict("An account with this email already exists. Try signing in instead.");
  const user = await db.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      termsAcceptedAt: new Date(),
    },
  });
  await sendVerificationEmail(user.id);
  await audit({ actorId: user.id, action: "user.registered", entityType: "User", entityId: user.id });
  return user;
}

async function issueToken(userId: string, type: "EMAIL_VERIFY" | "PASSWORD_RESET", ttlMs: number) {
  const token = randomToken(32);
  await db.userToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await db.userToken.create({
    data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return;
  const token = await issueToken(user.id, "EMAIL_VERIFY", 24 * 3_600_000);
  await queueEmail({
    to: user.email,
    subject: "Verify your email",
    body: `Hi ${user.name},\n\nConfirm your email address to finish setting up your ${brand.name} account. This link expires in 24 hours.`,
    ctaLabel: "Verify email",
    ctaUrl: `/auth/verify-email?token=${token}`,
  });
}

async function consumeToken(token: string, type: "EMAIL_VERIFY" | "PASSWORD_RESET") {
  const record = await db.userToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
    throw validation("This link is invalid or has expired. Request a new one.");
  }
  await db.userToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return record;
}

export async function verifyEmail(token: string) {
  const record = await consumeToken(token, "EMAIL_VERIFY");
  await db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ actorId: record.userId, action: "user.email_verified", entityType: "User", entityId: record.userId });
}

export type AuthResult = { ok: true; userId: string; mfaRequired: boolean } | { ok: false; reason: "invalid" | "inactive" };

export async function authenticate(emailRaw: string, password: string): Promise<AuthResult> {
  const email = emailRaw.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    dummyHash ??= hashPassword("dummy-password-for-timing");
    await verifyPassword(password, await dummyHash);
    return { ok: false, reason: "invalid" };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await audit({ actorId: user.id, action: "auth.login_failed", entityType: "User", entityId: user.id });
    return { ok: false, reason: "invalid" };
  }
  if (user.status !== "ACTIVE") return { ok: false, reason: "inactive" };
  await audit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id });
  return { ok: true, userId: user.id, mfaRequired: Boolean(user.mfaEnabledAt) };
}

/** Always resolves the same way whether or not the email exists (no account enumeration). */
export async function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return;
  const token = await issueToken(user.id, "PASSWORD_RESET", 3_600_000);
  await queueEmail({
    to: user.email,
    subject: "Reset your password",
    body: `Someone (hopefully you) asked to reset the password for your ${brand.name} account. This link expires in 1 hour. If you did not request this, you can ignore this email.`,
    ctaLabel: "Choose a new password",
    ctaUrl: `/auth/reset-password?token=${token}`,
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const pw = passwordSchema.safeParse(newPassword);
  if (!pw.success) throw validation(pw.error.issues[0].message, { password: pw.error.issues[0].message });
  const record = await consumeToken(token, "PASSWORD_RESET");
  await db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(pw.data) } });
  await deleteUserSessions(record.userId);
  await audit({ actorId: record.userId, action: "auth.password_reset", entityType: "User", entityId: record.userId });
}

export async function changePassword(userId: string, current: string, next: string, keepSessionId?: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw validation("Your current password is incorrect.", { currentPassword: "Incorrect password." });
  }
  const pw = passwordSchema.safeParse(next);
  if (!pw.success) throw validation(pw.error.issues[0].message, { newPassword: pw.error.issues[0].message });
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw.data) } });
  await deleteUserSessions(userId, keepSessionId);
  await audit({ actorId: userId, action: "auth.password_changed", entityType: "User", entityId: userId });
}

// ── MFA (TOTP) ───────────────────────────────────────────────────────────────

export async function beginMfaSetup(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaEnabledAt) throw conflict("Two-factor authentication is already enabled.");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { mfaSecretEnc: encrypt(secret) } });
  const label = encodeURIComponent(`${brand.name}:${user.email}`);
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(brand.name)}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauth };
}

export async function confirmMfaSetup(userId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaSecretEnc) throw validation("Start the setup first.");
  if (!verifyTotp(decrypt(user.mfaSecretEnc), code))
    throw validation("That code is not valid. Check your authenticator app's time and try again.", { code: "Invalid code." });
  await db.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } });
  await audit({ actorId: userId, action: "auth.mfa_enabled", entityType: "User", entityId: userId });
}

export async function disableMfa(userId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaEnabledAt || !user.mfaSecretEnc) throw validation("Two-factor authentication is not enabled.");
  if (!verifyTotp(decrypt(user.mfaSecretEnc), code)) throw validation("That code is not valid.", { code: "Invalid code." });
  await db.user.update({ where: { id: userId }, data: { mfaEnabledAt: null, mfaSecretEnc: null } });
  await audit({ actorId: userId, action: "auth.mfa_disabled", entityType: "User", entityId: userId });
}

export async function verifyMfaCode(userId: string, code: string): Promise<boolean> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaEnabledAt || !user.mfaSecretEnc) return false;
  return verifyTotp(decrypt(user.mfaSecretEnc), code);
}

export async function deactivateAccount(userId: string, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw validation("Your password is incorrect.", { password: "Incorrect password." });
  }
  if (user.platformRole === "SUPER_ADMIN") {
    const others = await db.user.count({ where: { platformRole: "SUPER_ADMIN", status: "ACTIVE", id: { not: userId } } });
    if (others === 0) throw new AppError("PRECONDITION", "The last super administrator cannot deactivate their account.");
  }
  await db.user.update({ where: { id: userId }, data: { status: "DEACTIVATED", deactivatedAt: new Date() } });
  await deleteUserSessions(userId);
  await audit({ actorId: userId, action: "user.deactivated", entityType: "User", entityId: userId });
}
