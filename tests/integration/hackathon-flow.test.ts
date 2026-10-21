// Scenarios 4–8: hackathon setup, team project submission with files, judging, results,
// certificates & verification, and server-side security enforcement.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { Actor } from "@/server/authz";
import * as comp from "@/server/modules/competitions/service";
import { registerForCompetition } from "@/server/modules/registrations/service";
import { createTeam, inviteToTeam, joinTeamByCode, respondToInvitation, removeMember, setTeamLocked } from "@/server/modules/teams/service";
import { canViewProject, getProjectSubmissions, saveSubmission } from "@/server/modules/submissions/service";
import { transitionStage, updateStage } from "@/server/modules/stages/service";
import { applyAdvancementRule, autoAssignJudges, correctEvaluation, declareConflict, getScorecard, saveEvaluation } from "@/server/modules/judging/service";
import { approveResults, assignWinner, autoAssignRankedPrizes, prepareResults, publishResults, publicResults } from "@/server/modules/results/service";
import { getCertificateForDownload, issueCertificates, reissueCertificate, revokeCertificate, verifyCertificate } from "@/server/modules/certificates/service";
import { renderCertificatePdf } from "@/server/modules/certificates/pdf";
import { adminOverview, setUserStatus } from "@/server/modules/admin/service";
import { exportCsv } from "@/server/modules/analytics/service";
import { storage } from "@/server/storage";
import { days, file, local, makeUser, PDF_BYTES, resetDb } from "../helpers";

let owner: Actor, coordinator: Actor, j1: Actor, j2: Actor, j3: Actor;
let leaderA: Actor, memberA: Actor, leaderB: Actor, memberB: Actor, stranger: Actor;
let cid = "";
let finalStageId = "";
let demoStageId = "";
let teamAId = "",
  teamBId = "";
let projectAId = "",
  projectBId = "";

const PROJECT = (title: string, repo: string) => ({
  field_title: title,
  field_description: "A flood-alert tool combining rainfall data with community reports.",
  field_problemAddressed: "Late flood warnings in low-lying neighbourhoods.",
  field_proposedSolution: "SMS alerts driven by open rainfall data.",
  field_repoUrl: repo,
  field_demoUrl: "https://demo.example.com/app",
  field_originalityDeclaration: "on",
});

beforeAll(async () => {
  await resetDb();
  [owner, coordinator, j1, j2, j3, leaderA, memberA, leaderB, memberB, stranger] = await Promise.all(
    ["owner", "coord", "j1", "j2", "j3", "la", "ma", "lb", "mb", "stranger"].map((n) => makeUser(`${n}@test.example`)),
  );
});

describe("Scenario 4 — organizer creates a hackathon with team rules and submission requirements", () => {
  it("sets up and publishes", async () => {
    const org = await comp.createOrganization(owner, { name: "Climate Org", type: "NONPROFIT" });
    await comp.addOrgMember(owner, org.id, coordinator.email, "COORDINATOR");
    const c = await comp.createCompetitionDraft(coordinator, { organizationId: org.id, title: "Flood Hack", type: "HACKATHON" });
    cid = c.id;
    await comp.updateBasics(coordinator, cid, {
      title: "Flood Hack",
      slug: "flood-hack-test",
      tagline: "Build flood-resilience tools in a weekend.",
      description: "Integration-test hackathon covering teams, technical submissions and judging.",
      category: "Sustainability",
      language: "English",
      contactEmail: "c@test.example",
      bannerTheme: "emerald",
    });
    await comp.updateDelivery(coordinator, cid, { mode: "ONLINE", timezone: "UTC", onlineInstructions: "Join online." });
    await comp.updateEligibility(coordinator, cid, {
      participationMode: "TEAM",
      minTeamSize: "2",
      maxTeamSize: "3",
      eligibilityTypes: ["OPEN"],
      customFields: JSON.stringify([{ key: "github", label: "GitHub username", type: "text", required: true }]),
    });
    await comp.updateDates(coordinator, cid, {
      registrationOpensAt: local(days(-1)),
      registrationClosesAt: local(days(5)),
      startsAt: local(days(6)),
      endsAt: local(days(8)),
    });
    await comp.upsertChallenge(coordinator, cid, {
      title: "Flood alerts",
      description: "Hyperlocal flood alerting.",
      visibility: "PUBLIC",
      referenceLinks: "https://example.com/data",
    });
    await comp.upsertPrize(coordinator, cid, { title: "First prize", category: "OVERALL", rank: "1" });
    await comp.upsertPrize(coordinator, cid, { title: "Second prize", category: "OVERALL", rank: "2" });
    const final = await db.stage.findFirstOrThrow({ where: { competitionId: cid, type: "FINAL_SUBMISSION" } });
    finalStageId = final.id;
    demoStageId = (await db.stage.findFirstOrThrow({ where: { competitionId: cid, type: "DEMONSTRATION" } })).id;
    // Organizer makes the demo URL mandatory and requires a technical document upload.
    await updateStage(coordinator, finalStageId, {
      name: final.name,
      acceptsSubmissions: "on",
      submissionTemplate: "PROJECT",
      isJudged: "on",
      minJudgesPerProject: "2",
      advancementRule: "TOP_N",
      advancementValue: "1",
      resultVisibility: "PUBLIC",
      notifyOnOpen: "on",
      notifyOnAdvance: "on",
      ...Object.fromEntries(
        ["title", "description", "problemAddressed", "proposedSolution", "repoUrl", "demoUrl", "technicalDocs", "originalityDeclaration"].flatMap((k) => [
          [`f_${k}_present`, "1"],
          [`f_${k}_enabled`, "on"],
          [`f_${k}_required`, "on"],
        ]),
      ),
    });
    // Organization is unverified → approval required.
    expect(await comp.publishCompetition(coordinator, cid)).toBe("PENDING_APPROVAL");
    await expect(comp.reviewPublication(coordinator, cid, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = await makeUser("admin@test.example", { admin: true });
    await comp.reviewPublication(admin, cid, true);
    expect((await db.competition.findUniqueOrThrow({ where: { id: cid } })).status).toBe("PUBLISHED");
  });
});

describe("Scenario 5 — team submits a technical project", () => {
  it("registers participants (custom question required)", async () => {
    await expect(registerForCompetition(leaderA, cid, { participantType: "STUDENT", acceptRules: "on" })).rejects.toMatchObject({
      fieldErrors: { cf_github: expect.any(String) },
    });
    for (const u of [leaderA, memberA, leaderB, memberB])
      await registerForCompetition(u, cid, { participantType: "STUDENT", acceptRules: "on", cf_github: u.name });
  });

  it("forms teams via email invitation and invite code, enforcing conflicts", async () => {
    teamAId = (await createTeam(leaderA, cid, { name: "Rainmakers" })).id;
    teamBId = (await createTeam(leaderB, cid, { name: "Levees" })).id;
    await expect(createTeam(leaderA, cid, { name: "Second team" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createTeam(memberB, cid, { name: "Rainmakers" })).rejects.toMatchObject({ code: "VALIDATION" });
    const token = await inviteToTeam(leaderA, teamAId, memberA.email);
    await expect(respondToInvitation(stranger, token, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await respondToInvitation(memberA, token, true);
    const teamB = await db.team.findUniqueOrThrow({ where: { id: teamBId } });
    await joinTeamByCode(memberB, teamB.inviteCode);
    await expect(joinTeamByCode(memberA, teamB.inviteCode)).rejects.toThrow(/another team/);
    await expect(joinTeamByCode(stranger, teamB.inviteCode)).rejects.toThrow(/approved registration/);
    await expect(removeMember(memberA, teamAId, leaderA.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    projectAId = (await db.project.findUniqueOrThrow({ where: { teamId: teamAId } })).id;
    projectBId = (await db.project.findUniqueOrThrow({ where: { teamId: teamBId } })).id;
  });

  it("validates uploads, only lets the leader submit final, and stores files privately", async () => {
    await transitionStage(owner, (await db.stage.findFirstOrThrow({ where: { competitionId: cid, type: "REGISTRATION" } })).id, "OPEN");
    await transitionStage(owner, (await db.stage.findFirstOrThrow({ where: { competitionId: cid, type: "PROTOTYPE_DEVELOPMENT" } })).id, "OPEN");
    await transitionStage(owner, finalStageId, "OPEN");
    // Renamed executable is rejected.
    await expect(
      saveSubmission(leaderA, {
        stageId: finalStageId,
        values: PROJECT("FloodWatch", "https://github.com/x/floodwatch"),
        files: { technicalDocs: [file("docs.pdf", "MZ\x90\x00binary")] },
        removeAttachmentIds: [],
        final: true,
      }),
    ).rejects.toMatchObject({ fieldErrors: { technicalDocs: expect.stringMatching(/does not match/) } });
    // Missing required file.
    await expect(
      saveSubmission(leaderA, {
        stageId: finalStageId,
        values: PROJECT("FloodWatch", "https://github.com/x/floodwatch"),
        files: {},
        removeAttachmentIds: [],
        final: true,
      }),
    ).rejects.toMatchObject({ fieldErrors: { technicalDocs: expect.any(String) } });
    // Member can save a draft with the file but cannot submit the final version.
    await saveSubmission(memberA, {
      stageId: finalStageId,
      values: PROJECT("FloodWatch", "https://github.com/x/floodwatch"),
      files: { technicalDocs: [file("docs.pdf", PDF_BYTES)] },
      removeAttachmentIds: [],
      final: false,
    });
    await expect(
      saveSubmission(memberA, {
        stageId: finalStageId,
        values: PROJECT("FloodWatch", "https://github.com/x/floodwatch"),
        files: {},
        removeAttachmentIds: [],
        final: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const sub = await saveSubmission(leaderA, {
      stageId: finalStageId,
      values: PROJECT("FloodWatch", "https://github.com/x/floodwatch"),
      files: {},
      removeAttachmentIds: [],
      final: true,
    });
    expect(sub.status).toBe("SUBMITTED");
    const att = await db.attachment.findFirstOrThrow({ where: { submissionId: sub.id } });
    expect(att.storageKey.startsWith("submissions/")).toBe(true);
    expect(att.scanStatus).toBe("NOT_SCANNED");
    expect((await storage().get(att.storageKey)).equals(PDF_BYTES)).toBe(true);
    await saveSubmission(leaderB, {
      stageId: finalStageId,
      values: PROJECT("LeveeNet", "https://github.com/x/leveenet"),
      files: { technicalDocs: [file("spec.pdf", PDF_BYTES)] },
      removeAttachmentIds: [],
      final: true,
    });
  });
});

describe("Scenario 8 — security enforcement", () => {
  it("participants cannot view other teams' private submissions", async () => {
    expect(await canViewProject(leaderA, projectAId)).toBe(true);
    expect(await canViewProject(leaderA, projectBId)).toBe(false);
    expect(await canViewProject(stranger, projectAId)).toBe(false);
    await expect(getProjectSubmissions(memberB, projectAId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("participants cannot perform organizer or admin actions", async () => {
    await expect(transitionStage(leaderA, finalStageId, "CLOSED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setTeamLocked(leaderA, teamAId, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportCsv(leaderA, cid, "registrations")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminOverview(leaderA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setUserStatus(coordinator, stranger.id, "SUSPENDED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(publishResults(coordinator, cid)).rejects.toMatchObject({ code: "PRECONDITION" });
  });
  it("judges can only access their own, assigned projects", async () => {
    for (const j of [j1, j2, j3]) await comp.addStaff(owner, cid, { email: j.email, role: "JUDGE" });
    await expect(comp.addStaff(owner, cid, { email: leaderA.email, role: "JUDGE" })).rejects.toThrow(/participant/);
    await transitionStage(owner, finalStageId, "CLOSED");
    const created = await autoAssignJudges(owner, finalStageId, 2);
    expect(created).toBe(4);
    const load = await db.judgeAssignment.groupBy({ by: ["judgeId"], where: { stageId: finalStageId }, _count: { _all: true } });
    expect(Math.max(...load.map((l) => l._count._all)) - Math.min(...load.map((l) => l._count._all))).toBeLessThanOrEqual(1);
    const mine = await db.judgeAssignment.findFirstOrThrow({ where: { stageId: finalStageId, judgeId: j1.id } });
    const unassignedProject = mine.projectId === projectAId ? projectBId : projectAId;
    const j1HasOther = await db.judgeAssignment.findFirst({ where: { stageId: finalStageId, judgeId: j1.id, projectId: unassignedProject } });
    if (!j1HasOther) expect(await canViewProject(j1, unassignedProject)).toBe(false);
    const someoneElses = await db.judgeAssignment.findFirstOrThrow({ where: { stageId: finalStageId, judgeId: { not: j1.id } } });
    await expect(getScorecard(j1, someoneElses.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Scenario 6 — judges evaluate and the organizer approves", () => {
  it("handles a conflict of interest by reassignment", async () => {
    await transitionStage(owner, finalStageId, "JUDGING");
    const a = await db.judgeAssignment.findFirstOrThrow({ where: { stageId: finalStageId, projectId: projectAId } });
    await declareConflict(await db.user.findUniqueOrThrow({ where: { id: a.judgeId } }), a.id, "Former colleague of the team leader");
    const filled = await autoAssignJudges(owner, finalStageId, 2);
    expect(filled).toBe(1);
    const active = await db.judgeAssignment.findMany({ where: { stageId: finalStageId, projectId: projectAId, status: { not: "CONFLICT_DECLARED" } } });
    expect(active.map((x) => x.judgeId)).not.toContain(a.judgeId);
  });

  it("judges finalize; corrections are audited; advancement completes the stage", async () => {
    const asgs = await db.judgeAssignment.findMany({ where: { stageId: finalStageId, status: "ASSIGNED" }, include: { judge: true } });
    for (const a of asgs) {
      const judgeActor = {
        id: a.judge.id,
        email: a.judge.email,
        name: a.judge.name,
        platformRole: a.judge.platformRole,
        status: a.judge.status,
        emailVerifiedAt: a.judge.emailVerifiedAt,
      };
      const { assignment } = await getScorecard(judgeActor, a.id);
      const scores = Object.fromEntries(assignment.stage.rubric!.criteria.map((c) => [c.id, a.projectId === projectAId ? 8 : 6]));
      await saveEvaluation(judgeActor, a.id, { scores, comments: {}, feedbackToTeam: "Solid prototype.", privateComment: "PRIVATE-NOTE" }, true);
    }
    const ev = await db.evaluation.findFirstOrThrow({ where: { assignment: { projectId: projectBId } }, include: { scores: true } });
    await expect(correctEvaluation(leaderB, ev.id, {}, "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(correctEvaluation(owner, ev.id, Object.fromEntries(ev.scores.map((s) => [s.criterionId, 7])), "")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await correctEvaluation(owner, ev.id, Object.fromEntries(ev.scores.map((s) => [s.criterionId, 7])), "Arithmetic error reported by judge");
    expect(await db.evaluationCorrection.count({ where: { evaluationId: ev.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "evaluation.corrected" } })).toBe(1);
    await applyAdvancementRule(owner, finalStageId);
    await transitionStage(owner, finalStageId, "COMPLETED");
    await db.stage.update({ where: { id: demoStageId }, data: { enabled: false } }); // results come from the final submission round
  });

  it("participants see team feedback but never private judge comments", async () => {
    const { participantWorkspace } = await import("@/server/modules/participants/service");
    const w = await participantWorkspace(leaderA, "flood-hack-test");
    const json = JSON.stringify(w);
    expect(json).toContain("Solid prototype.");
    expect(json).not.toContain("PRIVATE-NOTE");
  });
});

describe("Scenario 7 — results and certificates", () => {
  it("keeps results private until approved and published", async () => {
    expect(await publicResults("flood-hack-test")).toBeNull();
    await prepareResults(coordinator, cid);
    expect(await autoAssignRankedPrizes(coordinator, cid)).toBe(2);
    // Coordinators cannot approve (separation of duties); owners can.
    await expect(approveResults(coordinator, cid)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await approveResults(owner, cid);
    // Changing winners after approval requires re-approval.
    const second = await db.prize.findFirstOrThrow({ where: { competitionId: cid, rank: 2 } });
    await assignWinner(coordinator, second.id, projectBId);
    expect((await db.competition.findUniqueOrThrow({ where: { id: cid } })).resultsStatus).toBe("PROVISIONAL");
    await expect(publishResults(owner, cid)).rejects.toMatchObject({ code: "PRECONDITION" });
    await approveResults(owner, cid);
    expect(await publicResults("flood-hack-test")).toBeNull();
    await publishResults(owner, cid);
    const r = await publicResults("flood-hack-test");
    expect(r?.prizes[0].winners[0].project.title).toBe("FloodWatch");
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE-NOTE|totalScore/);
    expect((await db.competition.findUniqueOrThrow({ where: { id: cid } })).status).toBe("COMPLETED");
  });

  it("issues certificates idempotently; recipients download; third parties verify; revocation shows", async () => {
    const res = await issueCertificates(owner, cid, ["PARTICIPANT", "WINNER", "JUDGE"]);
    expect(res.issued).toBeGreaterThanOrEqual(4 + 2 + 3);
    expect((await issueCertificates(owner, cid, ["PARTICIPANT", "WINNER", "JUDGE"])).issued).toBe(0);
    const cert = await db.certificate.findFirstOrThrow({ where: { userId: leaderA.id, category: "WINNER" } });
    const dl = await getCertificateForDownload(leaderA, cert.code);
    const pdf = await renderCertificatePdf({
      code: dl.code,
      recipientName: dl.recipientName,
      category: dl.category,
      distinction: dl.distinction,
      competitionTitle: dl.competition.title,
      organizerName: dl.competition.organization.name,
      issuedAt: dl.issuedAt,
      revoked: false,
      appUrl: "http://localhost:3000",
    });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(getCertificateForDownload(stranger, cert.code)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const v = await verifyCertificate(cert.code.toLowerCase());
    expect(v).toMatchObject({ valid: true, recipientName: leaderA.name, distinction: "First prize" });
    expect(JSON.stringify(v)).not.toContain(leaderA.email);
    expect(await verifyCertificate("OH-2222-3333-4444")).toBeNull();
    const reissued = await reissueCertificate(owner, cert.id);
    expect((await verifyCertificate(cert.code))?.valid).toBe(false);
    expect((await verifyCertificate(reissued.code))?.valid).toBe(true);
    await revokeCertificate(owner, reissued.id, "Issued in error");
    expect((await verifyCertificate(reissued.code))?.valid).toBe(false);
  });
});

describe("Master admin — permanent deletion of a fully used competition", () => {
  it("only a super admin can delete, with the exact title; all event data and files go, the audit entry stays", async () => {
    const superAdmin = await makeUser("master@test.example", { admin: true });
    const plainAdmin = { ...(await makeUser("plainadmin@test.example")), platformRole: "ADMIN" as const };
    await db.user.update({ where: { id: plainAdmin.id }, data: { platformRole: "ADMIN" } });
    const orgId = (await db.competition.findUniqueOrThrow({ where: { id: cid } })).organizationId;
    const fileKeys = (await db.attachment.findMany({ where: { submission: { project: { competitionId: cid } } } })).map((a) => a.storageKey);
    expect(fileKeys.length).toBeGreaterThan(0);
    expect(await db.certificate.count({ where: { competitionId: cid } })).toBeGreaterThan(0);

    await expect(comp.deleteCompetitionPermanently(owner, cid, "Flood Hack")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(comp.deleteCompetitionPermanently(plainAdmin, cid, "Flood Hack")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(comp.deleteCompetitionPermanently(superAdmin, cid, "flood hack")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.competition.count({ where: { id: cid } })).toBe(1);

    expect(await comp.deleteCompetitionPermanently(superAdmin, cid, " Flood Hack ")).toBe("Flood Hack");

    expect(await db.competition.count({ where: { id: cid } })).toBe(0);
    for (const n of await Promise.all([
      db.registration.count({ where: { competitionId: cid } }),
      db.team.count({ where: { competitionId: cid } }),
      db.project.count({ where: { competitionId: cid } }),
      db.stage.count({ where: { competitionId: cid } }),
      db.certificate.count({ where: { competitionId: cid } }),
      db.prize.count({ where: { competitionId: cid } }),
      db.attachment.count({ where: { storageKey: { in: fileKeys } } }),
    ]))
      expect(n).toBe(0);
    for (const k of fileKeys) await expect(storage().get(k)).rejects.toThrow();
    // People and the organization are untouched; the deletion is on the record.
    expect(await db.user.count({ where: { id: { in: [owner.id, leaderA.id, j1.id] } } })).toBe(3);
    expect(await db.organization.count({ where: { id: orgId } })).toBe(1);
    const entry = await db.auditLog.findFirstOrThrow({ where: { action: "competition.deleted", entityId: cid } });
    expect(entry.actorId).toBe(superAdmin.id);
    expect(entry.meta).toMatchObject({ title: "Flood Hack", filesFailed: 0 });
    await expect(comp.deleteCompetitionPermanently(superAdmin, cid, "Flood Hack")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
