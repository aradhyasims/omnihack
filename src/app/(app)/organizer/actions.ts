"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/current";
import { formToObject } from "@/server/validation";
import { validation } from "@/server/errors";
import { db } from "@/server/db";
import { zonedLocalToUtc } from "@/lib/time";
import * as comp from "@/server/modules/competitions/service";
import * as stages from "@/server/modules/stages/service";
import { reviewRegistration } from "@/server/modules/registrations/service";
import { disqualifyProject, removeMember, setTeamLocked } from "@/server/modules/teams/service";
import * as judging from "@/server/modules/judging/service";
import * as results from "@/server/modules/results/service";
import * as certs from "@/server/modules/certificates/service";
import * as ops from "@/server/modules/operations/service";
import { assignMentor, unassignMentor } from "@/server/modules/mentoring/service";
import { moderateShowcase } from "@/server/modules/showcase/service";
import * as sponsors from "@/server/modules/sponsors/service";
import * as talent from "@/server/modules/talent/service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const me = () => getCurrentUser();

// ── Organizations & drafts ─────────────────────────────────────────────────────

export async function createOrgAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const org = await comp.createOrganization(await me(), formToObject(fd));
    return `Organization "${org.name}" created.`;
  });
}

export async function addOrgMemberAction(orgId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await comp.addOrgMember(await me(), orgId, str(fd, "email"), str(fd, "role") as "OWNER" | "COORDINATOR" | "MEMBER");
    return "Member added.";
  });
}

export async function removeOrgMemberAction(orgId: string, userId: string): Promise<ActionState> {
  return runAction(async () => {
    await comp.removeOrgMember(await me(), orgId, userId);
    return "Member removed.";
  });
}

export async function createCompetitionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    id = (await comp.createCompetitionDraft(await me(), formToObject(fd))).id;
  });
  if (r.ok) redirect(`/organizer/competitions/${id}/edit?step=1`);
  return r;
}

// ── Wizard steps ───────────────────────────────────────────────────────────────

export async function saveStepAction(id: string, step: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(async () => {
    const actor = await me();
    const input = formToObject(fd);
    if (step === 1) {
      await comp.updateBasics(actor, id, input);
      const banner = fd.get("bannerImage");
      if (banner instanceof File && banner.size > 0) await comp.setCompetitionImage(actor, id, "banner", banner);
      if (fd.get("removeBanner") === "on") await comp.setCompetitionImage(actor, id, "banner", null);
      const logo = fd.get("logoImage");
      if (logo instanceof File && logo.size > 0) await comp.setCompetitionImage(actor, id, "logo", logo);
    } else if (step === 2) await comp.updateType(actor, id, input);
    else if (step === 3) await comp.updateDelivery(actor, id, input);
    else if (step === 4) await comp.updateEligibility(actor, id, input);
    else if (step === 6) await comp.updateDates(actor, id, input);
    else if (step === 9) await comp.updateRules(actor, id, input);
    else throw validation("Unknown step.");
  });
  if (r.ok && fd.get("next") === "1") redirect(`/organizer/competitions/${id}/edit?step=${step + 1}`);
  return r.ok ? { ...r, message: "Saved." } : r;
}

export async function addTrackAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await comp.addTrack(await me(), id, formToObject(fd));
    return "Track added.";
  });
}
export async function deleteTrackAction(id: string, trackId: string): Promise<ActionState> {
  return runAction(async () => comp.deleteTrack(await me(), id, trackId));
}
export async function upsertChallengeAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await comp.upsertChallenge(await me(), id, formToObject(fd));
    return "Challenge saved.";
  });
}
export async function deleteChallengeAction(id: string, challengeId: string): Promise<ActionState> {
  return runAction(async () => comp.deleteChallenge(await me(), id, challengeId));
}
export async function upsertPrizeAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await comp.upsertPrize(await me(), id, formToObject(fd));
    return "Prize saved.";
  });
}
export async function deletePrizeAction(id: string, prizeId: string): Promise<ActionState> {
  return runAction(async () => comp.deletePrize(await me(), id, prizeId));
}
export async function setVisibilityAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await comp.setVisibility(await me(), id, str(fd, "visibility") as "PUBLIC" | "UNLISTED" | "PRIVATE");
    return "Visibility updated.";
  });
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

export async function publishAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const status = await comp.publishCompetition(await me(), id);
    return status === "PUBLISHED" ? "Published! Your competition is live." : "Submitted for platform approval. You'll be notified when it's reviewed.";
  });
}
export async function unpublishAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await comp.unpublishCompetition(await me(), id);
    return "Unpublished — the competition is a draft again.";
  });
}
export async function registrationClosedAction(id: string, closed: boolean): Promise<ActionState> {
  return runAction(async () => {
    await comp.setRegistrationClosed(await me(), id, closed);
    return closed ? "Registration closed." : "Registration reopened.";
  });
}
export async function cancelAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await comp.cancelCompetition(await me(), id, str(fd, "reason"));
    return "Competition cancelled. Registered participants were notified.";
  });
}
export async function archiveAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await comp.archiveCompetition(await me(), id);
    return "Competition archived.";
  });
}

// ── Stages & rubrics ───────────────────────────────────────────────────────────

export async function addStageAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await stages.addStage(await me(), id, formToObject(fd));
    return "Stage added.";
  });
}
export async function updateStageAction(stageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await stages.updateStage(await me(), stageId, formToObject(fd));
    return "Stage saved.";
  });
}
export async function moveStageAction(stageId: string, direction: "up" | "down"): Promise<ActionState> {
  return runAction(async () => stages.moveStage(await me(), stageId, direction));
}
export async function toggleStageAction(stageId: string, enabled: boolean): Promise<ActionState> {
  return runAction(async () => stages.setStageEnabled(await me(), stageId, enabled));
}
export async function deleteStageAction(stageId: string): Promise<ActionState> {
  return runAction(async () => stages.deleteStage(await me(), stageId));
}
export async function transitionStageAction(stageId: string, to: "OPEN" | "CLOSED" | "JUDGING" | "COMPLETED"): Promise<ActionState> {
  return runAction(async () => {
    await stages.transitionStage(await me(), stageId, to);
    return `Stage moved to ${to.toLowerCase()}.`;
  });
}
export async function upsertCriterionAction(stageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await stages.upsertCriterion(await me(), stageId, formToObject(fd));
    return "Criterion saved.";
  });
}
export async function deleteCriterionAction(stageId: string, criterionId: string): Promise<ActionState> {
  return runAction(async () => stages.deleteCriterion(await me(), stageId, criterionId));
}

// ── Registrations, teams, people ───────────────────────────────────────────────

export async function reviewRegistrationAction(registrationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await reviewRegistration(await me(), registrationId, str(fd, "decision") as "APPROVED" | "REJECTED" | "WAITLISTED", str(fd, "note") || str(fd, "reason"));
    return "Registration updated.";
  });
}
export async function lockTeamAction(teamId: string, locked: boolean): Promise<ActionState> {
  return runAction(async () => {
    await setTeamLocked(await me(), teamId, locked);
    return locked ? "Team roster approved and locked." : "Team unlocked.";
  });
}
export async function organizerRemoveMemberAction(teamId: string, userId: string): Promise<ActionState> {
  return runAction(async () => removeMember(await me(), teamId, userId));
}
export async function disqualifyAction(projectId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await disqualifyProject(await me(), projectId, str(fd, "reason"));
    return "Project disqualified.";
  });
}
export async function addStaffAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await comp.addStaff(await me(), id, formToObject(fd));
    return "Person added and notified.";
  });
}
export async function removeStaffAction(id: string, memberId: string): Promise<ActionState> {
  return runAction(async () => comp.removeStaff(await me(), id, memberId));
}
export async function assignMentorAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const n = await assignMentor(await me(), id, str(fd, "mentorId"), fd.getAll("projectIds").map(String));
    return `Mentor assigned to ${n} project(s).`;
  });
}
export async function unassignMentorAction(assignmentId: string): Promise<ActionState> {
  return runAction(async () => unassignMentor(await me(), assignmentId));
}

// ── Judging ────────────────────────────────────────────────────────────────────

export async function assignJudgesAction(stageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const n = await judging.assignJudges(await me(), stageId, fd.getAll("judgeIds").map(String), fd.getAll("projectIds").map(String));
    return `${n} assignment(s) created.`;
  });
}
export async function autoAssignAction(stageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const n = await judging.autoAssignJudges(await me(), stageId, Number(fd.get("perProject") || 2));
    return n ? `${n} assignment(s) created with balanced load.` : "Every project already has enough judges.";
  });
}
export async function revokeAssignmentAction(assignmentId: string): Promise<ActionState> {
  return runAction(async () => judging.revokeAssignment(await me(), assignmentId));
}
export async function applyRuleAction(stageId: string): Promise<ActionState> {
  return runAction(async () => {
    const n = await judging.applyAdvancementRule(await me(), stageId);
    return `${n} project(s) marked as advancing. Review, then complete the stage.`;
  });
}
export async function setDecisionAction(stageId: string, projectId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await judging.setDecision(await me(), stageId, projectId, str(fd, "decision") as "ADVANCED" | "NOT_ADVANCED" | "PENDING", str(fd, "note"));
  });
}
export async function correctEvaluationAction(evaluationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const scores: Record<string, number> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("score_")) scores[k.slice(6)] = Number(v);
    await judging.correctEvaluation(await me(), evaluationId, scores, str(fd, "reason"));
    return "Correction saved and recorded in the audit log.";
  });
}

// ── Results & certificates ─────────────────────────────────────────────────────

export async function assignWinnerAction(prizeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await results.assignWinner(await me(), prizeId, str(fd, "projectId"), str(fd, "citation"));
    return "Winner assigned.";
  });
}
export async function removeWinnerAction(prizeId: string, projectId: string): Promise<ActionState> {
  return runAction(async () => results.removeWinner(await me(), prizeId, projectId));
}
export async function autoPrizesAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const n = await results.autoAssignRankedPrizes(await me(), id);
    return `${n} ranked prize(s) filled from the final ranking.`;
  });
}
export async function prepareResultsAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await results.prepareResults(await me(), id);
    return "Provisional results prepared (private).";
  });
}
export async function approveResultsAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await results.approveResults(await me(), id);
    return "Results approved. They are still private until published.";
  });
}
export async function publishResultsAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await results.publishResults(await me(), id);
    return "Results published and participants notified.";
  });
}
export async function unpublishResultsAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await results.unpublishResults(await me(), id, str(fd, "reason"));
    return "Results unpublished.";
  });
}
export async function issueCertificatesAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const r = await certs.issueCertificates(await me(), id, fd.getAll("categories").map(String) as never);
    return `${r.issued} new certificate(s) issued (${r.eligible} eligible in total; existing ones were kept).`;
  });
}
export async function revokeCertificateAction(certId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await certs.revokeCertificate(await me(), certId, str(fd, "reason"));
    return "Certificate revoked.";
  });
}
export async function reissueCertificateAction(certId: string): Promise<ActionState> {
  return runAction(async () => {
    const c = await certs.reissueCertificate(await me(), certId);
    return `Reissued as ${c.code}.`;
  });
}
export async function templateAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await certs.upsertTemplate(await me(), id, {
      heading: str(fd, "heading"),
      bodyText: str(fd, "bodyText"),
      signatoryName: str(fd, "signatoryName"),
      signatoryTitle: str(fd, "signatoryTitle"),
      accentColor: str(fd, "accentColor") || "#4F46E5",
    });
    return "Template saved.";
  });
}

// ── Operations ─────────────────────────────────────────────────────────────────

export async function sessionAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await ops.upsertSession(await me(), id, formToObject(fd));
    return "Session saved.";
  });
}
export async function deleteSessionAction(id: string, sessionId: string): Promise<ActionState> {
  return runAction(async () => ops.deleteSession(await me(), id, sessionId));
}
export async function checkInAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const r = await ops.checkIn(await me(), id, str(fd, "code"), str(fd, "sessionId") || null);
    return `✓ ${r.name} checked in.`;
  });
}
export async function manualCheckInAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const r = await ops.manualCheckIn(await me(), id, str(fd, "userId"), str(fd, "reason"), str(fd, "sessionId") || null);
    return `✓ ${r.name} checked in manually.`;
  });
}
export async function undoCheckInAction(attendanceId: string): Promise<ActionState> {
  return runAction(async () => ops.undoCheckIn(await me(), attendanceId));
}
export async function announcementAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const n = await ops.postAnnouncement(await me(), id, formToObject(fd));
    return `Announcement posted to ${n} recipient(s).`;
  });
}
export async function deleteAnnouncementAction(announcementId: string): Promise<ActionState> {
  return runAction(async () => ops.deleteAnnouncement(await me(), announcementId));
}
export async function supportReplyAction(requestId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await ops.respondSupportRequest(await me(), requestId, str(fd, "response"), (str(fd, "status") || "RESOLVED") as "IN_PROGRESS" | "RESOLVED");
    return "Reply sent.";
  });
}
export async function slotsAction(stageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const stage = await db.stage.findUniqueOrThrow({ where: { id: stageId }, include: { competition: true } });
    const startsAt = zonedLocalToUtc(str(fd, "startsAt"), stage.competition.timezone);
    if (!startsAt) throw validation("Choose a start time.", { startsAt: "Required." });
    const n = await ops.allocatePresentationSlots(await me(), stageId, { startsAt, minutes: Number(fd.get("minutes") || 10), room: str(fd, "room") || null });
    return `${n} slot(s) allocated and teams notified.`;
  });
}
export async function addSponsorAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await sponsors.addSponsor(await me(), id, formToObject(fd));
    return "Sponsor saved.";
  });
}
export async function sponsorConfirmedAction(linkId: string, confirmed: boolean): Promise<ActionState> {
  return runAction(async () => sponsors.setSponsorConfirmed(await me(), linkId, confirmed));
}
export async function removeSponsorAction(linkId: string): Promise<ActionState> {
  return runAction(async () => sponsors.removeSponsor(await me(), linkId));
}
export async function prizeSponsorAction(prizeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await sponsors.setPrizeSponsor(await me(), prizeId, str(fd, "sponsorId") || null);
    return "Prize sponsor updated.";
  });
}
// ── Placement & recruitment (hiring side) ──────────────────────────────────────

export async function hiringSettingsAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await talent.updateHiringSettings(await me(), id, formToObject(fd));
    return "Hiring settings saved.";
  });
}
export async function openingAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await talent.upsertOpening(await me(), id, formToObject(fd));
    return "Opening saved.";
  });
}
export async function deleteOpeningAction(openingId: string): Promise<ActionState> {
  return runAction(async () => talent.deleteOpening(await me(), openingId));
}
export async function shortlistAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await talent.shortlistCandidate(await me(), id, formToObject(fd));
    return "Candidate shortlisted and notified.";
  });
}
export async function advanceApplicationAction(applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await talent.advanceApplication(await me(), applicationId, formToObject(fd));
    return "Candidate updated and notified.";
  });
}
export async function recruiterNoteAction(applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await talent.updateRecruiterNote(await me(), applicationId, str(fd, "recruiterNote"));
    return "Note saved.";
  });
}

export async function moderateShowcaseAction(projectId: string, approve: boolean): Promise<ActionState> {
  return runAction(async () => moderateShowcase(await me(), projectId, approve));
}
