"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/action";
import { getCurrentUser, getSession, endSession } from "@/server/auth/current";
import { formToObject } from "@/server/validation";
import { validation } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { db } from "@/server/db";
import { registerForCompetition, withdrawRegistration } from "@/server/modules/registrations/service";
import {
  createTeam,
  dissolveTeam,
  inviteToTeam,
  joinTeamByCode,
  leaveTeam,
  removeMember,
  requestToJoin,
  respondToInvitation,
  revokeInvitation,
  startSoloProject,
  transferLeadership,
  updateTeamDetails,
} from "@/server/modules/teams/service";
import { saveSubmission } from "@/server/modules/submissions/service";
import { requestShowcase, withdrawShowcase } from "@/server/modules/showcase/service";
import { createSupportRequest } from "@/server/modules/operations/service";
import { markNotificationsRead } from "@/server/notifications/notify";
import { updateProfile } from "@/server/modules/participants/service";
import { beginMfaSetup, changePassword, confirmMfaSetup, deactivateAccount, disableMfa } from "@/server/auth/service";
import { declareConflict, saveEvaluation } from "@/server/modules/judging/service";
import { addMentorNote } from "@/server/modules/mentoring/service";
import { deleteUserSessions } from "@/server/auth/session";
import { giveConsent, respondToApplication, withdrawConsent } from "@/server/modules/talent/service";
import { submitParticipantPayment } from "@/server/modules/payments/service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

// ── Registration ───────────────────────────────────────────────────────────────

export async function registerAction(competitionId: string, slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const user = await getCurrentUser();
    rateLimit(`reg:${user?.id}`, 10, 60_000);
    await registerForCompetition(user, competitionId, formToObject(fd));
  });
  if (result.ok) redirect(`/dashboard/competitions/${slug}?registered=1`);
  return result;
}

export async function submitEntryFeeAction(competitionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    rateLimit(`entry-fee:${user?.id}`, 10, 60 * 60_000);
    await submitParticipantPayment(user, competitionId, formToObject(fd));
    return "Payment details sent to the organizer. You'll be notified once they verify the transfer.";
  });
}

export async function withdrawAction(competitionId: string, slug: string): Promise<ActionState> {
  return runAction(async () => {
    await withdrawRegistration(await getCurrentUser(), competitionId);
    revalidatePath(`/dashboard/competitions/${slug}`);
    return "You withdrew from this competition.";
  });
}

// ── Teams ──────────────────────────────────────────────────────────────────────

export async function createTeamAction(competitionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await createTeam(await getCurrentUser(), competitionId, formToObject(fd));
    return "Team created. Share the invite code with your teammates.";
  });
}

export async function startSoloAction(competitionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await startSoloProject(await getCurrentUser(), competitionId, formToObject(fd));
    return "Your individual project is ready.";
  });
}

export async function joinTeamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    rateLimit(`join:${user?.id}`, 15, 10 * 60_000);
    const team = await joinTeamByCode(user, str(fd, "code"));
    return `You joined ${team.name}.`;
  });
}

export async function inviteAction(teamId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    rateLimit(`invite:${user?.id}`, 20, 60 * 60_000);
    await inviteToTeam(user, teamId, str(fd, "email"));
    return `Invitation sent to ${str(fd, "email")}.`;
  });
}

export async function revokeInviteAction(invitationId: string): Promise<ActionState> {
  return runAction(async () => {
    await revokeInvitation(await getCurrentUser(), invitationId);
    return "Invitation revoked.";
  });
}

export async function respondInviteAction(token: string, accept: boolean): Promise<ActionState> {
  let slug = "";
  const result = await runAction(async () => {
    const inv = await respondToInvitation(await getCurrentUser(), token, accept);
    slug = inv.team.competition.slug;
  });
  if (result.ok) redirect(accept ? `/dashboard/competitions/${slug}` : "/dashboard");
  return result;
}

export async function requestJoinAction(teamId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    rateLimit(`join-request:${user?.id}`, 10, 60 * 60_000);
    await requestToJoin(user, teamId, str(fd, "message"));
    return "Request sent. The team leader will invite you by email if it's a match.";
  });
}

// ── Placement & recruitment (candidate side) ───────────────────────────────────

export async function talentConsentAction(competitionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const resume = fd.get("resume");
    await giveConsent(await getCurrentUser(), competitionId, formToObject(fd), resume instanceof File ? resume : null);
    return "You're in the talent pool. Hiring partners of this competition can now view your profile.";
  });
}

export async function withdrawConsentAction(competitionId: string): Promise<ActionState> {
  return runAction(async () => {
    await withdrawConsent(await getCurrentUser(), competitionId);
    return "You left the talent pool. Your profile is hidden and your CV was deleted.";
  });
}

export async function respondApplicationAction(
  applicationId: string,
  action: "ACCEPT_INTERVIEW" | "ACCEPT_OFFER" | "DECLINE_OFFER" | "WITHDRAW",
  _: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await respondToApplication(await getCurrentUser(), applicationId, action, str(fd, "note") || str(fd, "reason"));
    return "Response sent to the hiring team.";
  });
}

export async function removeMemberAction(teamId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await removeMember(await getCurrentUser(), teamId, str(fd, "userId"));
    return "Member removed.";
  });
}

export async function leaveTeamAction(teamId: string): Promise<ActionState> {
  return runAction(async () => {
    await leaveTeam(await getCurrentUser(), teamId);
    return "You left the team.";
  });
}

export async function dissolveTeamAction(teamId: string): Promise<ActionState> {
  return runAction(async () => {
    await dissolveTeam(await getCurrentUser(), teamId);
    return "Team dissolved.";
  });
}

export async function transferLeaderAction(teamId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await transferLeadership(await getCurrentUser(), teamId, str(fd, "userId"));
    return "Leadership transferred.";
  });
}

export async function updateTeamAction(teamId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await updateTeamDetails(await getCurrentUser(), teamId, formToObject(fd));
    return "Team details saved.";
  });
}

// ── Submissions ────────────────────────────────────────────────────────────────

export async function saveSubmissionAction(stageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const final = fd.get("intent") === "submit";
    const files: Record<string, File[]> = {};
    for (const [key, value] of fd.entries()) {
      if (key.startsWith("file_") && value instanceof File && value.size > 0) (files[key.slice(5)] ??= []).push(value);
    }
    const result = await saveSubmission(await getCurrentUser(), {
      stageId,
      values: formToObject(fd),
      files,
      removeAttachmentIds: fd.getAll("removeAttachment").map(String),
      final,
    });
    return final ? `Submitted — version ${result.version} received at ${new Date(result.submittedAt ?? Date.now()).toUTCString()}.` : "Draft saved.";
  });
}

export async function requestShowcaseAction(projectId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requestShowcase(await getCurrentUser(), projectId, formToObject(fd));
    return "Showcase request sent to the organizer for approval.";
  });
}

export async function withdrawShowcaseAction(projectId: string): Promise<ActionState> {
  return runAction(async () => {
    await withdrawShowcase(await getCurrentUser(), projectId);
    return "Your project was removed from the showcase.";
  });
}

export async function supportRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    rateLimit(`support:${user?.id}`, 10, 60 * 60_000);
    await createSupportRequest(user, formToObject(fd));
    return "Your request was sent to the organizers.";
  });
}

// ── Notifications & profile ────────────────────────────────────────────────────

export async function markAllReadAction(): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (user) await markNotificationsRead(user.id);
    revalidatePath("/dashboard", "layout");
  });
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await updateProfile(await getCurrentUser(), formToObject(fd));
    return "Profile saved.";
  });
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw validation("Sign in again.");
    if (str(fd, "newPassword") !== str(fd, "confirm")) throw validation("Passwords do not match.", { confirm: "Passwords do not match." });
    await changePassword(user.id, str(fd, "currentPassword"), str(fd, "newPassword"), user.sessionId);
    return "Password changed. Other sessions were signed out.";
  });
}

export async function beginMfaAction(): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw validation("Sign in again.");
    const { secret, otpauth } = await beginMfaSetup(user.id);
    const QRCode = (await import("qrcode")).default;
    const qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 200 });
    return { data: { secret, qr } };
  });
}

export async function confirmMfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw validation("Sign in again.");
    await confirmMfaSetup(user.id, str(fd, "code"));
    await db.session.update({ where: { id: user.sessionId }, data: { mfaVerified: true } });
    return "Two-factor authentication is now enabled.";
  });
}

export async function disableMfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw validation("Sign in again.");
    await disableMfa(user.id, str(fd, "code"));
    return "Two-factor authentication was turned off.";
  });
}

export async function signOutOthersAction(): Promise<ActionState> {
  return runAction(async () => {
    const s = await getSession();
    if (s) await deleteUserSessions(s.userId, s.id);
    return "Signed out of all other sessions.";
  });
}

export async function deactivateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw validation("Sign in again.");
    await deactivateAccount(user.id, str(fd, "password"));
  });
  if (result.ok) {
    await endSession();
    redirect("/?deactivated=1");
  }
  return result;
}

// ── Judging & mentoring ────────────────────────────────────────────────────────

function parseScorecard(fd: FormData) {
  const scores: Record<string, number | undefined> = {};
  const comments: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("score_")) scores[k.slice(6)] = v === "" ? undefined : Number(v);
    if (k.startsWith("comment_")) comments[k.slice(8)] = String(v);
  }
  return { scores, comments, feedbackToTeam: str(fd, "feedbackToTeam"), privateComment: str(fd, "privateComment") };
}

export async function saveEvaluationAction(assignmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const finalize = fd.get("intent") === "finalize";
    const r = await saveEvaluation(await getCurrentUser(), assignmentId, parseScorecard(fd), finalize);
    return {
      message: finalize ? "Evaluation finalized and locked." : `Draft saved${r.total != null ? ` · weighted total ${r.total}` : ""}.`,
      data: { total: r.total, savedAt: r.savedAt.toISOString() },
    };
  });
}

/** Autosave endpoint used by the scorecard (never finalizes). */
export async function autosaveEvaluationAction(assignmentId: string, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const r = await saveEvaluation(await getCurrentUser(), assignmentId, parseScorecard(fd), false);
    return { data: { total: r.total, savedAt: r.savedAt.toISOString() } };
  });
}

export async function declareConflictAction(assignmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await declareConflict(await getCurrentUser(), assignmentId, str(fd, "reason"));
    return "Conflict declared. The organizer has been notified.";
  });
}

export async function mentorNoteAction(projectId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await addMentorNote(await getCurrentUser(), projectId, str(fd, "body"), fd.get("visibleToTeam") === "on");
    return "Feedback saved.";
  });
}
