// Provider adapters: SMTP delivery (real local SMTP server), S3 driver (mocked AWS client),
// ClamAV scanning (real TCP clamd-protocol server) and the upload → scan → download pipeline.
import net from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { mockClient } from "aws-sdk-client-mock";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@/server/db";
import { drainOutbox, queueEmail, setEmailProviderForTesting } from "@/server/notifications/email";
import { createS3Driver } from "@/server/storage";
import { ClamdScanner } from "@/server/storage/scanner";
import { runDueJobs } from "@/server/jobs/queue";
import { handlers, purgeExpiredData } from "@/server/jobs/worker";
import * as comp from "@/server/modules/competitions/service";
import { registerForCompetition } from "@/server/modules/registrations/service";
import { startSoloProject } from "@/server/modules/teams/service";
import { downloadBlockReason, saveSubmission } from "@/server/modules/submissions/service";
import { transitionStage } from "@/server/modules/stages/service";
import { storage } from "@/server/storage";
import { days, enableHosting, file, local, makeUser, PDF_BYTES, resetDb } from "../helpers";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/** Minimal clamd INSTREAM server: replies FOUND when the stream contains the EICAR test string. */
function fakeClamd(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        const header = "zINSTREAM\0";
        if (buf.length < header.length) return;
        let off = header.length;
        const payload: Buffer[] = [];
        while (buf.length >= off + 4) {
          const len = buf.readUInt32BE(off);
          if (len === 0) {
            const content = Buffer.concat(payload).toString("latin1");
            sock.end(content.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
            return;
          }
          if (buf.length < off + 4 + len) return;
          payload.push(buf.subarray(off + 4, off + 4 + len));
          off += 4 + len;
        }
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as net.AddressInfo).port, close: () => server.close() }));
  });
}

beforeAll(resetDb);
afterEach(() => {
  setEmailProviderForTesting(null);
  process.env.EMAIL_PROVIDER = "console";
  process.env.MALWARE_SCANNER = "none";
});

describe("SMTP email adapter", () => {
  let server: SMTPServer;
  const received: { to: string; data: string }[] = [];
  let port = 0;
  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = new SMTPServer({
          authOptional: true,
          disabledCommands: ["STARTTLS"],
          onData(stream, session, cb) {
            let data = "";
            stream.on("data", (c) => (data += c.toString()));
            stream.on("end", () => {
              received.push({ to: session.envelope.rcptTo.map((r) => r.address).join(","), data });
              cb();
            });
          },
        });
        server.listen(0, "127.0.0.1", () => {
          port = (server.server.address() as net.AddressInfo).port;
          resolve();
        });
      }),
  );
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("delivers queued email over SMTP and marks it SENT", async () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(port),
      SMTP_ALLOW_INSECURE: "true",
      EMAIL_FROM: "OmniHack <no-reply@test.example>",
    });
    await queueEmail({
      to: "smtp-user@test.example",
      subject: "SMTP check",
      body: "Hello over SMTP",
      ctaLabel: "Open",
      ctaUrl: "/dashboard",
      dedupeKey: "smtp-1",
    });
    const r = await drainOutbox();
    expect(r).toEqual({ sent: 1, failed: 0 });
    expect(received[0].to).toBe("smtp-user@test.example");
    const raw = received[0].data.replace(/=\r?\n/g, ""); // undo quoted-printable soft line breaks
    expect(raw).toMatch(/^Subject: .*SMTP/m);
    expect(raw).toContain("http://localhost:3000/dashboard");
    expect(raw).toContain("Hello over SMTP");
    const row = await db.emailOutbox.findUniqueOrThrow({ where: { dedupeKey: "smtp-1" } });
    expect(row).toMatchObject({ status: "SENT", provider: "smtp" });
  });

  it("records a clear failure when SMTP is selected but not configured", async () => {
    Object.assign(process.env, { EMAIL_PROVIDER: "smtp" });
    const host = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    await queueEmail({ to: "x@test.example", subject: "No host", body: "b", dedupeKey: "smtp-2" });
    await drainOutbox();
    process.env.SMTP_HOST = host;
    const row = await db.emailOutbox.findUniqueOrThrow({ where: { dedupeKey: "smtp-2" } });
    expect(row.lastError).toMatch(/SMTP_HOST is not set/);
  });
});

describe("S3 storage adapter", () => {
  it("writes encrypted, never-overwriting objects, reads and deletes them, and pre-signs downloads", async () => {
    const s3 = mockClient(S3Client);
    s3.on(PutObjectCommand).resolves({});
    s3.on(GetObjectCommand).resolves({ Body: { transformToByteArray: async () => new Uint8Array(PDF_BYTES) } } as never);
    s3.on(DeleteObjectCommand).resolves({});
    process.env.S3_BUCKET = "omnihack-test-files";
    const driver = createS3Driver(new S3Client({ region: "ap-south-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } }));
    await driver.put("submissions/p1/s1/abc", PDF_BYTES, "application/pdf");
    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(put).toMatchObject({
      Bucket: "omnihack-test-files",
      Key: "submissions/p1/s1/abc",
      ContentType: "application/pdf",
      ServerSideEncryption: "aws:kms",
      IfNoneMatch: "*",
    });
    expect((await driver.get("submissions/p1/s1/abc")).equals(PDF_BYTES)).toBe(true);
    await driver.delete("submissions/p1/s1/abc");
    expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(1);
    const url = await driver.presignedGetUrl("submissions/p1/s1/abc", { fileName: "deck.pdf", contentType: "application/pdf", ttlSeconds: 60 });
    expect(url).toContain("omnihack-test-files");
    expect(url).toContain("X-Amz-Expires=60");
    expect(url).toContain("response-content-disposition=attachment");
    await expect(driver.put("../escape", PDF_BYTES, "application/pdf")).rejects.toThrow(/Invalid storage key/);
    s3.restore();
  });
});

describe("ClamAV scanning", () => {
  let clamd: { port: number; close: () => void };
  beforeAll(async () => {
    clamd = await fakeClamd();
  });
  afterAll(() => clamd.close());

  it("speaks the clamd INSTREAM protocol", async () => {
    const scanner = new ClamdScanner("127.0.0.1", clamd.port);
    expect(await scanner.scan(PDF_BYTES)).toEqual({ clean: true });
    expect(await scanner.scan(Buffer.from(EICAR))).toEqual({ clean: false, signature: "Eicar-Test-Signature" });
    await expect(new ClamdScanner("127.0.0.1", 1, 2000).scan(PDF_BYTES)).rejects.toThrow();
  });

  it("scans uploads in the background and blocks infected or unscanned files", async () => {
    Object.assign(process.env, { MALWARE_SCANNER: "clamav", CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(clamd.port) });
    const owner = await makeUser("scan-owner@test.example");
    const p = await makeUser("scan-p@test.example");
    const org = await comp.createOrganization(owner, { name: "Scan Org", type: "COMPANY" });
    await db.organization.update({ where: { id: org.id }, data: { verified: true } });
    const c = await comp.createCompetitionDraft(owner, { organizationId: org.id, title: "Scan Ideathon", type: "IDEATHON" });
    await enableHosting(c.id);
    await comp.updateBasics(owner, c.id, {
      title: "Scan Ideathon",
      slug: "scan-ideathon",
      tagline: "Testing malware scanning.",
      description: "A competition used to verify the scanning pipeline end to end.",
      category: "Test",
      language: "English",
      contactEmail: "o@test.example",
      bannerTheme: "indigo",
    });
    await comp.updateDelivery(owner, c.id, { mode: "ONLINE", timezone: "UTC", onlineInstructions: "Online" });
    await comp.updateDates(owner, c.id, {
      registrationOpensAt: local(days(-1)),
      registrationClosesAt: local(days(5)),
      startsAt: local(days(6)),
      endsAt: local(days(8)),
    });
    await comp.upsertChallenge(owner, c.id, { title: "Challenge", description: "Scan everything.", visibility: "PUBLIC" });
    await comp.publishCompetition(owner, c.id);
    await registerForCompetition(p, c.id, { participantType: "OTHER", acceptRules: "on" });
    await startSoloProject(p, c.id, { title: "Scanner" });
    const stages = await db.stage.findMany({ where: { competitionId: c.id }, orderBy: { order: "asc" } });
    await transitionStage(owner, stages[0].id, "OPEN");
    const idea = stages.find((s) => s.type === "IDEA_SUBMISSION")!;
    await transitionStage(owner, idea.id, "OPEN");
    const values = { field_title: "Scanner" };
    // EICAR inside a "PDF" wrapper so it passes the type check but trips the scanner.
    const infected = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from(EICAR)]);
    await saveSubmission(p, {
      stageId: idea.id,
      values,
      files: { pitchDeck: [file("clean.pdf", PDF_BYTES)], supportingDocuments: [file("evil.pdf", infected)] },
      removeAttachmentIds: [],
      final: false,
    });
    const atts = await db.attachment.findMany({ where: { submission: { stageId: idea.id } } });
    expect(atts.every((a) => a.scanStatus === "PENDING")).toBe(true);
    expect(downloadBlockReason(atts[0])?.status).toBe(423);
    expect(await runDueJobs(handlers)).toBe(2);
    const clean = await db.attachment.findFirstOrThrow({ where: { fileName: "clean.pdf" } });
    const evil = await db.attachment.findFirstOrThrow({ where: { fileName: "evil.pdf" } });
    expect(clean.scanStatus).toBe("CLEAN");
    expect(downloadBlockReason(clean)).toBeNull();
    expect(evil.scanStatus).toBe("INFECTED");
    expect(downloadBlockReason(evil)?.status).toBe(451);
    await expect(storage().get(evil.storageKey)).rejects.toThrow(); // object removed
    expect(await db.auditLog.count({ where: { action: "file.infected" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: p.id, type: "file.infected" } })).toBe(1);
  });

  it("retries when the scanner is unreachable", async () => {
    Object.assign(process.env, { MALWARE_SCANNER: "clamav", CLAMAV_PORT: "1" });
    const att = await db.attachment.findFirstOrThrow({ where: { fileName: "clean.pdf" } });
    await db.attachment.update({ where: { id: att.id }, data: { scanStatus: "PENDING" } });
    const { enqueueJob } = await import("@/server/jobs/queue");
    await enqueueJob("file.scan", { attachmentId: att.id });
    await runDueJobs(handlers);
    const job = await db.job.findFirstOrThrow({ where: { type: "file.scan" }, orderBy: { createdAt: "desc" } });
    expect(job.status).toBe("QUEUED");
    expect(job.lastError).toBeTruthy();
    expect((await db.attachment.findUniqueOrThrow({ where: { id: att.id } })).scanStatus).toBe("PENDING");
  });
});

describe("data retention", () => {
  it("purges old delivered emails, finished jobs and spent tokens but keeps recent data", async () => {
    const old = new Date(Date.now() - 400 * 86_400_000);
    await db.emailOutbox.create({ data: { toEmail: "old@test.example", subject: "old", text: "t", html: "h", status: "SENT", createdAt: old } });
    await db.emailOutbox.create({ data: { toEmail: "new@test.example", subject: "new", text: "t", html: "h", status: "SENT" } });
    await db.job.create({ data: { type: "x", payload: {}, status: "DONE", updatedAt: old } });
    const r = await purgeExpiredData();
    expect(r.emails).toBeGreaterThanOrEqual(1);
    expect(await db.emailOutbox.count({ where: { toEmail: "old@test.example" } })).toBe(0);
    expect(await db.emailOutbox.count({ where: { toEmail: "new@test.example" } })).toBe(1);
    expect(await db.certificate.count()).toBe(0); // nothing outside the policy is touched
  });
});
