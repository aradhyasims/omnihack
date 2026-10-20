// Scenario 9 — operational failures: failed notifications, interrupted/invalid uploads, invalid
// submissions, expired sessions, database errors surfaced safely, and job retries.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { drainOutbox, queueEmail, setEmailProviderForTesting } from "@/server/notifications/email";
import { enqueueJob, runDueJobs } from "@/server/jobs/queue";
import { notify } from "@/server/notifications/notify";
import { handlers } from "@/server/jobs/worker";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { authenticate, registerUser, requestPasswordReset, resetPassword } from "@/server/auth/service";
import { runAction } from "@/server/action";
import { validation } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { makeUser, resetDb } from "../helpers";

beforeAll(resetDb);
afterEach(() => setEmailProviderForTesting(null));

describe("notifications", () => {
  it("retries failed email deliveries and marks them FAILED after max attempts", async () => {
    setEmailProviderForTesting({
      name: "broken",
      send: async () => {
        throw new Error("SMTP timeout");
      },
    });
    await queueEmail({ to: "x@test.example", subject: "Hello", body: "Body", dedupeKey: "fail-1" });
    for (let i = 0; i < 5; i++) await drainOutbox();
    const msg = await db.emailOutbox.findUniqueOrThrow({ where: { dedupeKey: "fail-1" } });
    expect(msg.status).toBe("FAILED");
    expect(msg.attempts).toBe(5);
    expect(msg.lastError).toMatch(/SMTP timeout/);
  });
  it("delivers when the provider recovers and de-duplicates messages", async () => {
    const sent: string[] = [];
    setEmailProviderForTesting({ name: "capture", send: async (m) => void sent.push(m.subject) });
    await queueEmail({ to: "y@test.example", subject: "Once", body: "b", dedupeKey: "dup" });
    await queueEmail({ to: "y@test.example", subject: "Once", body: "b", dedupeKey: "dup" });
    await drainOutbox();
    expect(sent.filter((s) => s.startsWith("Once"))).toHaveLength(1);
  });
  it("fans out large audiences through a background job", async () => {
    const users = await Promise.all(Array.from({ length: 30 }, (_, i) => makeUser(`bulk${i}@test.example`)));
    await notify({ userIds: users.map((u) => u.id), type: "announcement", title: "Bulk", body: "Hello all", dedupeKey: "bulk-1" });
    expect(await db.notification.count({ where: { type: "announcement" } })).toBe(0);
    expect(await runDueJobs(handlers)).toBe(1);
    expect(await db.notification.count({ where: { type: "announcement" } })).toBe(30);
    await notify({ userIds: users.map((u) => u.id), type: "announcement", title: "Bulk", body: "Hello all", dedupeKey: "bulk-1" });
    await runDueJobs(handlers);
    expect(await db.notification.count({ where: { type: "announcement" } })).toBe(30);
  });
  it("retries failed jobs with backoff", async () => {
    await enqueueJob("unknown.type", {});
    await runDueJobs(handlers);
    const job = await db.job.findFirstOrThrow({ where: { type: "unknown.type" } });
    expect(job.status).toBe("QUEUED");
    expect(job.attempts).toBe(1);
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(job.lastError).toMatch(/No handler/);
  });
});

describe("sessions & auth", () => {
  it("rejects expired sessions and enforces the absolute lifetime", async () => {
    const u = await makeUser("sess@test.example");
    const { token, session } = await createSession(u.id, { mfaVerified: true });
    expect(await validateSessionToken(token)).not.toBeNull();
    await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(token)).toBeNull();
    expect(await db.session.count({ where: { id: session.id } })).toBe(0);
    expect(await validateSessionToken("garbage")).toBeNull();
  });
  it("does not reveal whether an email exists and resets passwords with single-use tokens", async () => {
    await registerUser({ name: "Reset Me", email: "reset@test.example", password: "First-Pass-123", acceptTerms: true });
    await expect(registerUser({ name: "Dup", email: "RESET@test.example", password: "First-Pass-123", acceptTerms: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(registerUser({ name: "Weak", email: "weak@test.example", password: "password1234", acceptTerms: true })).rejects.toThrow();
    await requestPasswordReset("nobody@test.example"); // silently succeeds
    await requestPasswordReset("reset@test.example");
    const mail = await db.emailOutbox.findFirstOrThrow({ where: { toEmail: "reset@test.example", subject: { startsWith: "Reset" } } });
    const token = /token=([\w-]+)/.exec(mail.text)![1];
    await resetPassword(token, "Second-Pass-456");
    await expect(resetPassword(token, "Third-Pass-789")).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await authenticate("reset@test.example", "Second-Pass-456")).ok).toBe(true);
    expect((await authenticate("reset@test.example", "First-Pass-123")).ok).toBe(false);
    expect((await authenticate("ghost@test.example", "whatever-123")).ok).toBe(false);
  });
  it("rate limits repeated attempts", () => {
    for (let i = 0; i < 3; i++) rateLimit("t:key", 3, 60_000);
    expect(() => rateLimit("t:key", 3, 60_000)).toThrow(/Too many/);
  });
});

describe("error handling", () => {
  it("maps domain errors to field errors and hides internal/database errors", async () => {
    const v = await runAction(async () => {
      throw validation("Bad input", { title: "Required" });
    });
    expect(v).toMatchObject({ ok: false, error: "Bad input", fieldErrors: { title: "Required" } });
    const origError = console.error;
    console.error = () => {};
    const dbErr = await runAction(async () => {
      await db.$executeRawUnsafe("SELECT * FROM table_that_does_not_exist");
    });
    console.error = origError;
    expect(dbErr.ok).toBe(false);
    expect(dbErr.error).toMatch(/nothing was saved/);
    expect(dbErr.error).not.toMatch(/table_that_does_not_exist/);
  });
});
