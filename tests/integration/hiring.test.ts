// Placement & recruitment: consent gates, data minimization, company isolation, pipeline and analytics.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { Actor } from "@/server/authz";
import * as comp from "@/server/modules/competitions/service";
import { registerForCompetition } from "@/server/modules/registrations/service";
import { canViewProject } from "@/server/modules/submissions/service";
import * as talent from "@/server/modules/talent/service";
import { days, file, local, makeUser, PDF_BYTES, resetDb } from "../helpers";

let owner: Actor, recruiter: Actor, rival: Actor, ops: Actor, alice: Actor, bob: Actor, carl: Actor, outsider: Actor;
let cid = "";
const consentInput = { roleInterests: ["INTERNSHIP"], preferredLocations: "Pune, Remote", sharePortfolio: "on", adultConfirmed: "on", consent: "on" };

beforeAll(async () => {
  await resetDb();
  [owner, recruiter, rival, ops, alice, bob, carl, outsider] = await Promise.all(
    ["owner", "recruiter", "rival", "ops", "alice", "bob", "carl", "outsider"].map((n) => makeUser(`${n}@hire.example`)),
  );
  const org = await comp.createOrganization(owner, { name: "Hiring Org", type: "COMPANY" });
  await db.organization.update({ where: { id: org.id }, data: { verified: true } });
  const c = await comp.createCompetitionDraft(owner, { organizationId: org.id, title: "Hiring Hack", type: "HACKATHON" });
  cid = c.id;
  await comp.updateBasics(owner, cid, {
    title: "Hiring Hack",
    slug: "hiring-hack",
    tagline: "A hackathon with hiring partners.",
    description: "Integration test competition for placement and recruitment.",
    category: "Test",
    language: "English",
    contactEmail: "o@hire.example",
    bannerTheme: "indigo",
  });
  await comp.updateDelivery(owner, cid, { mode: "ONLINE", timezone: "UTC", onlineInstructions: "Online" });
  await comp.updateDates(owner, cid, {
    registrationOpensAt: local(days(-1)),
    registrationClosesAt: local(days(5)),
    startsAt: local(days(6)),
    endsAt: local(days(8)),
  });
  await comp.upsertChallenge(owner, cid, { title: "Challenge", description: "Build something useful.", visibility: "PUBLIC" });
  await comp.publishCompetition(owner, cid);
  await comp.addStaff(owner, cid, { email: recruiter.email, role: "RECRUITER", company: "Acme" });
  await comp.addStaff(owner, cid, { email: rival.email, role: "RECRUITER", company: "Globex" });
  await comp.addStaff(owner, cid, { email: ops.email, role: "OPS_COORDINATOR" });
  for (const u of [alice, bob, carl]) await registerForCompetition(u, cid, { participantType: "STUDENT", acceptRules: "on" });
});

describe("hiring setup", () => {
  it("requires a company for recruiters", async () => {
    await expect(comp.addStaff(owner, cid, { email: outsider.email, role: "RECRUITER" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("forces the recruiter's company on openings and lists them publicly only when hiring is on", async () => {
    await talent.upsertOpening(recruiter, cid, {
      company: "Spoofed Corp",
      title: "Data Intern",
      type: "INTERNSHIP",
      workMode: "REMOTE",
      skills: "Python, SQL",
      active: "on",
    });
    const o = await db.jobOpening.findFirstOrThrow({ where: { competitionId: cid } });
    expect(o.company).toBe("Acme");
    expect(o.skills).toEqual(["python", "sql"]);
    expect(await talent.competitionOpenings(cid)).toHaveLength(0);
    await talent.updateHiringSettings(owner, cid, { hiringEnabled: "on", showRankBandToRecruiters: "on" });
    expect((await talent.listPublicOpenings({ q: "python" })).items.map((x) => x.title)).toEqual(["Data Intern"]);
    await expect(talent.deleteOpening(rival, o.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(talent.updateHiringSettings(outsider, cid, { hiringEnabled: "on" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("consent", () => {
  it("requires an approved registration, 18+ confirmation and explicit consent", async () => {
    await expect(talent.giveConsent(outsider, cid, consentInput, null)).rejects.toMatchObject({ code: "PRECONDITION" });
    await expect(talent.giveConsent(alice, cid, { ...consentInput, adultConfirmed: undefined }, null)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(talent.giveConsent(alice, cid, { ...consentInput, consent: undefined }, null)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(talent.giveConsent(alice, cid, consentInput, file("cv.exe", "MZ"))).rejects.toMatchObject({ code: "VALIDATION" });
    const c = await talent.giveConsent(alice, cid, consentInput, file("Alice CV.pdf", PDF_BYTES, "application/pdf"));
    expect(c).toMatchObject({ roleInterests: ["INTERNSHIP"], preferredLocations: ["Pune", "Remote"], resumeName: "Alice CV.pdf" });
    await talent.giveConsent(bob, cid, { ...consentInput, roleInterests: ["FULL_TIME"], sharePortfolio: undefined }, null);
  });

  it("shows only consenting participants to recruiters, and denies others", async () => {
    const pool = await talent.talentPool(recruiter, cid);
    expect(pool.map((r) => r.userId).sort()).toEqual([alice.id, bob.id].sort());
    expect(pool.find((r) => r.userId === carl.id)).toBeUndefined();
    expect((await talent.talentPool(recruiter, cid, { type: "FULL_TIME" })).map((r) => r.userId)).toEqual([bob.id]);
    expect(JSON.stringify(pool)).not.toContain("@hire.example");
    await expect(talent.talentPool(ops, cid)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(talent.talentPool(outsider, cid)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("audits profile views and releases email only after shortlisting", async () => {
    const before = await talent.candidateProfile(recruiter, cid, alice.id);
    expect(before.user.email).toBeNull();
    expect(before.resumeUrl).toMatch(/^\/api\/v1\/talent\/resume\//);
    expect(await db.auditLog.count({ where: { action: "talent.profile_viewed", actorId: recruiter.id, entityId: alice.id } })).toBe(1);
    await expect(talent.candidateProfile(recruiter, cid, carl.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets recruiters read a project only when the candidate shares their portfolio", async () => {
    const pa = await db.project.create({ data: { competitionId: cid, ownerId: alice.id, title: "Alice App" } });
    const pb = await db.project.create({ data: { competitionId: cid, ownerId: bob.id, title: "Bob App" } });
    expect(await canViewProject(recruiter, pa.id)).toBe(true);
    expect(await canViewProject(recruiter, pb.id)).toBe(false);
    expect(await canViewProject(ops, pa.id)).toBe(false);
  });
});

describe("pipeline", () => {
  let appId = "";

  it("shortlists, invites, and moves to an accepted offer with notifications on both sides", async () => {
    const opening = await db.jobOpening.findFirstOrThrow({ where: { competitionId: cid } });
    const app = await talent.shortlistCandidate(recruiter, cid, { userId: alice.id, openingId: opening.id, note: "Great work" });
    appId = app.id;
    await expect(talent.shortlistCandidate(recruiter, cid, { userId: alice.id, openingId: opening.id })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(talent.shortlistCandidate(recruiter, cid, { userId: carl.id })).rejects.toMatchObject({ code: "PRECONDITION" });
    expect(await db.notification.count({ where: { userId: alice.id, type: "talent.shortlisted" } })).toBe(1);
    expect((await talent.candidateProfile(recruiter, cid, alice.id)).user.email).toBe(alice.email);

    await expect(talent.advanceApplication(recruiter, appId, { action: "INVITE_INTERVIEW" })).rejects.toMatchObject({ code: "VALIDATION" });
    await talent.advanceApplication(recruiter, appId, { action: "INVITE_INTERVIEW", interviewAt: "2030-01-15T10:30", interviewDetails: "Video call" });
    const invited = await db.candidateApplication.findUniqueOrThrow({ where: { id: appId } });
    expect(invited.interviewAt?.toISOString()).toBe("2030-01-15T10:30:00.000Z");
    await expect(talent.respondToApplication(bob, appId, "ACCEPT_INTERVIEW")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(talent.respondToApplication(alice, appId, "ACCEPT_OFFER")).rejects.toMatchObject({ code: "PRECONDITION" });
    await talent.respondToApplication(alice, appId, "ACCEPT_INTERVIEW", "Mornings work");
    await talent.advanceApplication(recruiter, appId, { action: "MAKE_OFFER", offerDetails: "6-month internship, starts June" });
    await talent.respondToApplication(alice, appId, "ACCEPT_OFFER");

    const final = await db.candidateApplication.findUniqueOrThrow({ where: { id: appId }, include: { events: { orderBy: { createdAt: "asc" } } } });
    expect(final).toMatchObject({ status: "OFFER_ACCEPTED", offerType: "INTERNSHIP", candidateNote: "Mornings work" });
    expect(final.events.map((e) => e.toStatus)).toEqual(["SHORTLISTED", "INTERVIEW_INVITED", "INTERVIEW_ACCEPTED", "OFFERED", "OFFER_ACCEPTED"]);
    expect(await db.notification.count({ where: { userId: recruiter.id, type: "talent.candidate_response" } })).toBe(2);
  });

  it("isolates companies and hides private notes from candidates", async () => {
    expect(await talent.hiringPipeline(rival, cid)).toHaveLength(0);
    expect(await talent.hiringPipeline(owner, cid)).toHaveLength(1);
    await expect(talent.advanceApplication(rival, appId, { action: "NOT_SELECTED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(talent.updateRecruiterNote(rival, appId, "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const mine = await talent.myOpportunities(alice);
    expect(mine.applications[0].recruiterNote).toBeUndefined();
    expect(JSON.stringify(mine)).not.toContain("Great work");
  });

  it("reports placement analytics", async () => {
    await talent.shortlistCandidate(rival, cid, { userId: bob.id });
    const all = await talent.placementAnalytics(owner, cid);
    expect(all).toMatchObject({ approved: 3, optedIn: 2, optInRate: 67, shortlisted: 2, interviews: 1, offers: 1, accepted: 1, openings: 1 });
    expect(all.acceptedByType.find((t) => t.type === "INTERNSHIP")?.count).toBe(1);
    const acme = await talent.placementAnalytics(recruiter, cid);
    expect(acme).toMatchObject({ company: "Acme", shortlisted: 1, accepted: 1 });
  });

  it("withdrawing consent hides the profile, deletes the CV and closes open applications", async () => {
    await talent.giveConsent(carl, cid, consentInput, null);
    const app = await talent.shortlistCandidate(recruiter, cid, { userId: carl.id });
    await talent.withdrawConsent(carl, cid);
    expect((await db.candidateApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("WITHDRAWN");
    await expect(talent.candidateProfile(recruiter, cid, carl.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await talent.talentPool(recruiter, cid)).map((r) => r.userId)).not.toContain(carl.id);
    const resumeKey = (await talent.getConsent(alice.id, cid))!.resumeKey!;
    await talent.withdrawConsent(alice, cid);
    expect((await talent.getConsent(alice.id, cid))!.resumeKey).toBeNull();
    expect(resumeKey).toMatch(/^talent\//);
    // Accepted offers are history, not open applications: they stay accepted.
    expect((await db.candidateApplication.findUniqueOrThrow({ where: { id: appId } })).status).toBe("OFFER_ACCEPTED");
  });
});

describe("results signal", () => {
  it("shows a rank band only after results are published", async () => {
    await talent.giveConsent(alice, cid, consentInput, null);
    const stage = await db.stage.findFirstOrThrow({ where: { competitionId: cid, isJudged: true }, orderBy: { order: "desc" } });
    const projects = await db.project.findMany({ where: { competitionId: cid }, orderBy: { title: "asc" } });
    for (const [i, p] of projects.entries()) await db.stageResult.create({ data: { stageId: stage.id, projectId: p.id, rank: i + 1, score: 90 - i } });
    expect((await talent.talentPool(recruiter, cid)).find((r) => r.userId === alice.id)?.rankBand).toBeNull();
    await db.competition.update({ where: { id: cid }, data: { resultsStatus: "PUBLISHED" } });
    const row = (await talent.talentPool(recruiter, cid)).find((r) => r.userId === alice.id)!;
    expect(row.rankBand).toBe("Top 50%");
    expect(Object.keys(row)).not.toContain("score");
    expect(JSON.stringify(row)).not.toMatch(/"(score|rank)"/);
    await talent.updateHiringSettings(owner, cid, { hiringEnabled: "on" });
    expect((await talent.talentPool(recruiter, cid)).find((r) => r.userId === alice.id)?.rankBand).toBeNull();
  });
});
