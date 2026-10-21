"use server";

import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/current";
import * as admin from "@/server/modules/admin/service";
import { deleteCompetitionPermanently, reviewPublication, setFeatured } from "@/server/modules/competitions/service";
import { reviewHostingFee, waiveHostingFee } from "@/server/modules/payments/service";

export async function reviewPublicationAction(competitionId: string, approve: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await reviewPublication(await getCurrentUser(), competitionId, approve, String(fd.get("reason") ?? ""));
    return approve ? "Approved and published." : "Returned to the organizer.";
  });
}
export async function setUserStatusAction(userId: string, status: "ACTIVE" | "SUSPENDED"): Promise<ActionState> {
  return runAction(async () => admin.setUserStatus(await getCurrentUser(), userId, status));
}
export async function setRoleAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await admin.setPlatformRole(await getCurrentUser(), userId, String(fd.get("role")) as "USER" | "ADMIN" | "SUPER_ADMIN");
    return "Role updated.";
  });
}
export async function verifyOrgAction(orgId: string, verified: boolean): Promise<ActionState> {
  return runAction(async () => admin.setOrganizationVerified(await getCurrentUser(), orgId, verified));
}
export async function featureAction(competitionId: string, featured: boolean): Promise<ActionState> {
  return runAction(async () => setFeatured(await getCurrentUser(), competitionId, featured));
}
export async function deleteCompetitionAction(competitionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const title = await deleteCompetitionPermanently(await getCurrentUser(), competitionId, String(fd.get("reason") ?? ""));
    return `“${title}” was permanently deleted.`;
  });
}
export async function reviewHostingFeeAction(paymentId: string, approve: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await reviewHostingFee(await getCurrentUser(), paymentId, approve, String(fd.get("reason") ?? ""));
    return approve ? "Payment verified — the competition is enabled." : "Payment rejected; the organizer was notified.";
  });
}
export async function waiveHostingFeeAction(competitionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await waiveHostingFee(await getCurrentUser(), competitionId, String(fd.get("reason") ?? ""));
    return "Hosting fee waived — the competition is enabled.";
  });
}
export async function inquiryStatusAction(id: string, status: "NEW" | "IN_PROGRESS" | "CLOSED"): Promise<ActionState> {
  return runAction(async () => admin.setInquiryStatus(await getCurrentUser(), id, status));
}
export async function mentorApplicationStatusAction(id: string, status: "NEW" | "APPROVED" | "DECLINED"): Promise<ActionState> {
  return runAction(async () => admin.setMentorApplicationStatus(await getCurrentUser(), id, status));
}
export async function retryEmailsAction(): Promise<ActionState> {
  return runAction(async () => `${await admin.retryFailedEmails(await getCurrentUser())} email(s) re-queued.`);
}
