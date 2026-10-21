// Scenarios 1–3: create & publish an ideathon, register & submit an idea, judge & shortlist.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { Actor } from "@/server/authz";
import * as comp from "@/server/modules/competitions/service";
import { registerForCompetition } from "@/server/modules/registrations/service";
import { startSoloProject } from "@/server/modules/teams/service";
import { saveSubmission } from "@/server/modules/submissions/service";
import { transitionStage, upsertCriterion } from "@/server/modules/stages/service";
import { applyAdvancementRule, assignJudges, getScorecard, saveEvaluation, stageJudgingOverview } from "@/server/modules/judging/service";
import { days, enableHosting, local, makeUser, resetDb } from "../helpers";

let organizer: Actor, judge: Actor, alice: Actor, bob: Actor, outsider: Actor;
let competitionId = "";
let ideaStageId = "";

const IDEA = (title: string) => ({
  field_title: title,
  field_problemStatement: "Students with visual impairments struggle to navigate campus buildings independently.",
  field_targetUsers: "Visually impaired students",
  field_proposedSolution: "BLE beacons with an audio wayfinding app.",
  field_innovation: "Works offline and indoors.",
  field_impact: "Independent mobility for thousands of students.",
});

beforeAll(async () => {
  await resetDb();
  organizer = await makeUser("org@test.example");
  judge = await makeUser("judge@test.example");
  alice = await makeUser("alice@test.example");
  bob = await makeUser("bob@test.example");
  outsider = await makeUser("outsider@test.example");
});

describe("Scenario 1 — organizer creates and publishes an ideathon", () => {
  it("creates an organization and a draft with the ideathon stage template", async () => {
    const org = await comp.createOrganization(organizer, { name: "Test University", type: "UNIVERSITY" });
    await db.organization.update({ where: { id: org.id }, data: { verified: true } });
    const c = await comp.createCompetitionDraft(organizer, { organizationId: org.id, title: "Campus Ideathon", type: "IDEATHON" });
    competitionId = c.id;
    const stages = await db.stage.findMany({ where: { competitionId }, orderBy: { order: "asc" } });
    expect(stages.map((s) => s.type)).toContain("IDEA_SUBMISSION");
    const idea = stages.find((s) => s.type === "IDEA_SUBMISSION")!;
    expect(idea.submissionTemplate).toBe("IDEA");
    ideaStageId = idea.id;
  });

  it("blocks publishing until requirements are met", async () => {
    await expect(comp.publishCompetition(organizer, competitionId)).rejects.toThrow(/issue/);
    const issues = await comp.getPublishIssues(competitionId);
    expect(issues.join(" ")).toMatch(/problem statement/);
    expect(issues.join(" ")).toMatch(/hosting fee/);
  });

  it("configures basics, eligibility, dates and a problem statement, then publishes", async () => {
    await comp.updateBasics(organizer, competitionId, {
      title: "Campus Ideathon",
      slug: "campus-ideathon-test",
      tagline: "Ideas that make campuses more inclusive.",
      description: "A test ideathon used by the integration suite to verify the full workflow.",
      category: "Education",
      language: "English",
      contactEmail: "org@test.example",
      bannerTheme: "indigo",
      tags: "education",
    });
    await comp.updateDelivery(organizer, competitionId, { mode: "ONLINE", timezone: "UTC", meetingUrl: "https://meet.example.com/x" });
    await comp.updateEligibility(organizer, competitionId, {
      participationMode: "BOTH",
      minTeamSize: "1",
      maxTeamSize: "3",
      eligibilityTypes: ["STUDENT"],
      customFields: "[]",
    });
    await expect(
      comp.updateDates(organizer, competitionId, { registrationOpensAt: local(days(-1)), registrationClosesAt: local(days(-2)) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await comp.updateDates(organizer, competitionId, {
      registrationOpensAt: local(days(-1)),
      registrationClosesAt: local(days(10)),
      startsAt: local(days(11)),
      endsAt: local(days(20)),
    });
    await comp.upsertChallenge(organizer, competitionId, {
      title: "Accessible navigation",
      description: "Help students navigate campus independently.",
      visibility: "PUBLIC",
      referenceLinks: "",
    });
    expect(await comp.getPublishIssues(competitionId)).toEqual([expect.stringMatching(/hosting fee/)]);
    await enableHosting(competitionId);
    expect(await comp.getPublishIssues(competitionId)).toEqual([]);
    expect(await comp.publishCompetition(organizer, competitionId)).toBe("PUBLISHED");
    const history = await db.competitionStatusChange.findMany({ where: { competitionId } });
    expect(history.map((h) => h.toStatus)).toContain("PUBLISHED");
  });

  it("does not let another user edit or publish it", async () => {
    await expect(comp.updateRules(outsider, competitionId, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(comp.cancelCompetition(outsider, competitionId, "nope")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Scenario 2 — participant registers and submits an idea", () => {
  it("rejects ineligible participants with a clear reason", async () => {
    await expect(registerForCompetition(bob, competitionId, { participantType: "PROFESSIONAL", acceptRules: "on" })).rejects.toThrow(/students/);
    await expect(registerForCompetition(bob, competitionId, { participantType: "STUDENT" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("registers eligible participants and sends a truthful confirmation", async () => {
    const reg = await registerForCompetition(alice, competitionId, { participantType: "STUDENT", institution: "Test U", acceptRules: "on" });
    expect(reg.status).toBe("APPROVED");
    await registerForCompetition(bob, competitionId, { participantType: "STUDENT", acceptRules: "on" });
    await expect(registerForCompetition(alice, competitionId, { participantType: "STUDENT", acceptRules: "on" })).rejects.toMatchObject({ code: "CONFLICT" });
    const n = await db.notification.findFirst({ where: { userId: alice.id, type: "registration.confirmed" } });
    expect(n?.title).toMatch(/registered/);
    expect(await db.emailOutbox.count({ where: { toEmail: alice.email } })).toBeGreaterThan(0);
  });

  it("does not accept submissions before the stage opens", async () => {
    await startSoloProject(alice, competitionId, { title: "BeaconWay" });
    await expect(saveSubmission(alice, { stageId: ideaStageId, values: IDEA("BeaconWay"), files: {}, removeAttachmentIds: [], final: true })).rejects.toThrow(
      /not opened/,
    );
  });

  it("saves drafts, enforces required fields on final submit, and versions submissions", async () => {
    await transitionStage(organizer, (await db.stage.findFirstOrThrow({ where: { competitionId, type: "REGISTRATION" } })).id, "OPEN");
    await transitionStage(organizer, ideaStageId, "OPEN");
    const draft = await saveSubmission(alice, { stageId: ideaStageId, values: { field_title: "BeaconWay" }, files: {}, removeAttachmentIds: [], final: false });
    expect(draft.status).toBe("DRAFT");
    await expect(
      saveSubmission(alice, { stageId: ideaStageId, values: { field_title: "BeaconWay" }, files: {}, removeAttachmentIds: [], final: true }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const sub = await saveSubmission(alice, { stageId: ideaStageId, values: IDEA("BeaconWay"), files: {}, removeAttachmentIds: [], final: true });
    expect(sub.status).toBe("SUBMITTED");
    expect(sub.version).toBe(1);
    const again = await saveSubmission(alice, { stageId: ideaStageId, values: IDEA("BeaconWay v2"), files: {}, removeAttachmentIds: [], final: true });
    expect(again.version).toBe(2);
    expect(await db.submissionVersion.count({ where: { submissionId: sub.id } })).toBe(2);
    const n = await db.notification.findFirst({ where: { userId: alice.id, type: "submission.received" }, orderBy: { createdAt: "desc" } });
    expect(n?.body).toMatch(/Version 2/);
    // Ideathon submissions never require a prototype or repository.
    expect(Object.keys(sub.content as object)).not.toContain("repoUrl");

    await startSoloProject(bob, competitionId, { title: "PeerLink" });
    await saveSubmission(bob, { stageId: ideaStageId, values: IDEA("PeerLink"), files: {}, removeAttachmentIds: [], final: true });
  });
});

describe("Scenario 3 — judge evaluates and organizer shortlists", () => {
  it("assigns a judge, locks the rubric when judging starts", async () => {
    await comp.addStaff(organizer, competitionId, { email: judge.email, role: "JUDGE" });
    const projects = await db.project.findMany({ where: { competitionId } });
    expect(
      await assignJudges(
        organizer,
        ideaStageId,
        [judge.id],
        projects.map((p) => p.id),
      ),
    ).toBe(2);
    await transitionStage(organizer, ideaStageId, "CLOSED");
    await transitionStage(organizer, ideaStageId, "JUDGING");
    const rubric = await db.rubric.findUniqueOrThrow({ where: { stageId: ideaStageId } });
    expect(rubric.lockedAt).not.toBeNull();
    await expect(upsertCriterion(organizer, ideaStageId, { name: "Late change", weight: 5, minScore: 0, maxScore: 10 })).rejects.toThrow(/locked/);
  });

  it("judge completes, finalizes and cannot edit a locked scorecard", async () => {
    const asgs = await db.judgeAssignment.findMany({ where: { stageId: ideaStageId, judgeId: judge.id }, include: { project: true } });
    for (const a of asgs) {
      const { assignment } = await getScorecard(judge, a.id);
      const criteria = assignment.stage.rubric!.criteria;
      const high = a.project.title.startsWith("BeaconWay");
      const scores = Object.fromEntries(criteria.map((c) => [c.id, high ? 9 : 6]));
      await saveEvaluation(judge, a.id, { scores: { [criteria[0].id]: 5 }, comments: {}, feedbackToTeam: "", privateComment: "" }, false);
      await expect(
        saveEvaluation(judge, a.id, { scores: { [criteria[0].id]: 5 }, comments: {}, feedbackToTeam: "", privateComment: "" }, true),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      const r = await saveEvaluation(judge, a.id, { scores, comments: {}, feedbackToTeam: "Clear problem framing.", privateComment: "internal" }, true);
      expect(r.total).toBe(high ? 90 : 60);
      await expect(saveEvaluation(judge, a.id, { scores, comments: {}, feedbackToTeam: "", privateComment: "" }, false)).rejects.toThrow(/locked|finalized/);
    }
  });

  it("organizer applies the top-N rule and completes the stage", async () => {
    await db.stage.update({ where: { id: ideaStageId }, data: { advancementRule: "TOP_N", advancementValue: 1 } });
    const overview = await stageJudgingOverview(organizer, ideaStageId);
    expect(overview.complete).toBe(true);
    expect(overview.rows[0].project.title).toMatch(/BeaconWay/);
    expect(await applyAdvancementRule(organizer, ideaStageId)).toBe(1);
    await transitionStage(organizer, ideaStageId, "COMPLETED");
    const results = await db.stageResult.findMany({ where: { stageId: ideaStageId }, include: { project: true } });
    expect(results.find((r) => r.project.title.startsWith("BeaconWay"))?.decision).toBe("ADVANCED");
    expect(results.find((r) => r.project.title.startsWith("PeerLink"))?.decision).toBe("NOT_ADVANCED");
    expect(await db.notification.count({ where: { userId: alice.id, type: "stage.advanced" } })).toBe(1);
    expect(await db.stageTransition.count({ where: { stageId: ideaStageId } })).toBe(4);
  });

  it("only advanced projects take part in the shortlist-only pitch round", async () => {
    const pitch = await db.stage.findFirstOrThrow({ where: { competitionId, type: "PITCH_PRESENTATION" } });
    const { eligibleProjectsForStage } = await import("@/server/modules/stages/service");
    const eligible = await eligibleProjectsForStage(pitch);
    expect(eligible.map((p) => p.title)).toEqual([expect.stringMatching(/BeaconWay/)]);
  });
});
