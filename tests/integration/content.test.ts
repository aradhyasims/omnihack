// Event catalog & final report uploads, and testimonials (master-admin managed; organizers submit drafts).
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { Actor } from "@/server/authz";
import * as comp from "@/server/modules/competitions/service";
import { eventHasEnded, setEventDocument } from "@/server/modules/competitions/documents";
import * as testimonials from "@/server/modules/content/testimonials";
import { storage } from "@/server/storage";
import { days, file, makeUser, PDF_BYTES, resetDb } from "../helpers";

let master: Actor, admin: Actor, owner: Actor, stranger: Actor;
let cid = "";
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const quote = { category: "INSTITUTION", quote: "Our students built real products in two days — the judging was fair and transparent.", authorName: "Dr. A. Rao", organization: "Test University" };

beforeAll(async () => {
  await resetDb();
  [owner, stranger] = await Promise.all([makeUser("doc-owner@test.example"), makeUser("doc-stranger@test.example")]);
  master = await makeUser("doc-master@test.example", { admin: true });
  admin = { ...(await makeUser("doc-admin@test.example")), platformRole: "ADMIN" as const };
  await db.user.update({ where: { id: admin.id }, data: { platformRole: "ADMIN" } });
  const org = await comp.createOrganization(owner, { name: "Docs Org", type: "UNIVERSITY" });
  cid = (await comp.createCompetitionDraft(owner, { organizationId: org.id, title: "Docs Hack", type: "HACKATHON" })).id;
});

describe("Event catalog and final report", () => {
  it("lets organizers publish a catalog (PDF or image) and rejects other files and other people", async () => {
    await expect(setEventDocument(stranger, cid, "catalog", file("c.pdf", PDF_BYTES))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setEventDocument(owner, cid, "catalog", file("c.docx", PDF_BYTES))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setEventDocument(owner, cid, "catalog", file("fake.pdf", "not a pdf"))).rejects.toMatchObject({ code: "VALIDATION" });
    await setEventDocument(owner, cid, "catalog", file("Brochure 2026.pdf", PDF_BYTES));
    const first = (await db.competition.findUniqueOrThrow({ where: { id: cid } })).catalogKey!;
    expect(first).toMatch(/^public\/competitions\/.+\/catalog-.+\.pdf$/);
    // Replacing removes the previous file.
    await setEventDocument(owner, cid, "catalog", file("poster.png", PNG));
    const c = await db.competition.findUniqueOrThrow({ where: { id: cid } });
    expect(c.catalogKey).toMatch(/\.png$/);
    expect(c.catalogName).toBe("poster.png");
    await expect(storage().get(first)).rejects.toThrow();
    expect((await storage().get(c.catalogKey!)).length).toBe(PNG.length);
  });

  it("accepts the final report only after the event has ended, then allows removal", async () => {
    await db.competition.update({ where: { id: cid }, data: { endsAt: days(2) } });
    expect(eventHasEnded(await db.competition.findUniqueOrThrow({ where: { id: cid } }))).toBe(false);
    await expect(setEventDocument(owner, cid, "report", file("report.pdf", PDF_BYTES))).rejects.toMatchObject({ code: "PRECONDITION" });
    await db.competition.update({ where: { id: cid }, data: { endsAt: days(-1) } });
    await setEventDocument(owner, cid, "report", file("Final report.pdf", PDF_BYTES));
    const c = await db.competition.findUniqueOrThrow({ where: { id: cid } });
    expect(c).toMatchObject({ reportName: "Final report.pdf" });
    expect(c.reportUploadedAt).not.toBeNull();
    await setEventDocument(owner, cid, "report", null);
    expect(await db.competition.findUniqueOrThrow({ where: { id: cid } })).toMatchObject({ reportKey: null, reportName: null, reportUploadedAt: null });
    await expect(storage().get(c.reportKey!)).rejects.toThrow();
    expect(await db.auditLog.count({ where: { competitionId: cid, action: { startsWith: "competition.report_" } } })).toBe(2);
  });
});

describe("Testimonials — only the master admin manages them", () => {
  it("refuses organizers, plain admins and strangers", async () => {
    for (const who of [owner, admin, stranger])
      await expect(testimonials.createTestimonial(who, { ...quote, published: "on", featured: "on" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(testimonials.listAllTestimonials(admin)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("master admin creates, edits, features and deletes; the homepage shows only published featured ones", async () => {
    await expect(testimonials.createTestimonial(master, { ...quote, quote: "Too short" })).rejects.toMatchObject({ code: "VALIDATION" });
    const draft = await testimonials.createTestimonial(master, { ...quote, category: "RECRUITMENT", organization: "Acme Corp" });
    const live = await testimonials.createTestimonial(master, { ...quote, published: "on", featured: "on", sortOrder: "2" });
    expect(draft).toMatchObject({ published: false, featured: false, createdById: master.id });
    expect((await testimonials.homepageTestimonials()).map((t) => t.id)).toEqual([live.id]);

    await testimonials.updateTestimonial(master, draft.id, { ...quote, category: "RECRUITMENT", organization: "Acme Corp", published: "on", featured: "on", sortOrder: "1" });
    expect((await testimonials.homepageTestimonials()).map((t) => t.id)).toEqual([draft.id, live.id]);
    await expect(testimonials.updateTestimonial(admin, draft.id, quote)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await testimonials.deleteTestimonial(master, live.id);
    expect((await testimonials.homepageTestimonials()).map((t) => t.id)).toEqual([draft.id]);
    expect(await db.auditLog.count({ where: { entityType: "Testimonial", actorId: master.id } })).toBe(4);
  });

  it("organizers submit event testimonials after the event; they stay drafts until the master admin publishes", async () => {
    await db.competition.update({ where: { id: cid }, data: { endsAt: days(3) } });
    await expect(testimonials.submitEventTestimonial(owner, cid, quote)).rejects.toMatchObject({ code: "PRECONDITION" });
    await db.competition.update({ where: { id: cid }, data: { endsAt: days(-1) } });
    await expect(testimonials.submitEventTestimonial(stranger, cid, quote)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const t = await testimonials.submitEventTestimonial(owner, cid, { ...quote, published: "on", featured: "on" });
    expect(t).toMatchObject({ competitionId: cid, published: false, featured: false });
    expect(await testimonials.eventTestimonials(cid)).toEqual([]);
    expect(await db.notification.count({ where: { userId: master.id, type: "testimonial.submitted" } })).toBe(1);

    await testimonials.updateTestimonial(master, t.id, { ...quote, competitionId: cid, published: "on" });
    expect((await testimonials.eventTestimonials(cid)).map((x) => x.id)).toEqual([t.id]);
    expect((await testimonials.homepageTestimonials()).some((x) => x.id === t.id)).toBe(false);
  });
});
