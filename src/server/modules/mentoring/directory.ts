// Mentor & jury directory for organizers of enabled competitions (hosting fee verified or waived).
// Organizers see the public profile plus qualification and location, and assign people as Mentor or Judge.
// Mentors' email and mobile are never shown: the server matches the registration to an account by email.
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireCompetitionPermission } from "../../authz";
import { notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { queueEmail } from "../../notifications/email";
import { addStaff } from "../competitions/service";
import { requireHostingEnabled } from "../payments/service";

const ROLES = ["MENTOR", "JUDGE"] as const;
type DirectoryRole = (typeof ROLES)[number];

export async function mentorDirectory(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "staff.manage");
  await requireHostingEnabled(competitionId);
  const apps = await db.mentorApplication.findMany({
    where: { status: { in: ["NEW", "APPROVED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  const [users, members, invites] = await Promise.all([
    db.user.findMany({ where: { email: { in: apps.map((a) => a.email) }, status: "ACTIVE" }, select: { id: true, email: true } }),
    db.competitionMember.findMany({ where: { competitionId, status: "ACTIVE", role: { in: [...ROLES] } }, select: { userId: true, role: true } }),
    db.mentorInvite.findMany({ where: { competitionId, status: "PENDING" }, select: { mentorApplicationId: true, role: true } }),
  ]);
  const userByEmail = new Map(users.map((u) => [u.email, u.id]));
  const memberKeys = new Set(members.map((m) => `${m.userId}:${m.role}`));
  const inviteKeys = new Set(invites.map((i) => `${i.mentorApplicationId}:${i.role}`));
  return apps.map(({ email, mobile: _mobile, ...profile }) => {
    const userId = userByEmail.get(email);
    const state = (role: DirectoryRole) =>
      userId && memberKeys.has(`${userId}:${role}`) ? "ASSIGNED" : inviteKeys.has(`${profile.id}:${role}`) ? "INVITED" : "NONE";
    return { ...profile, hasAccount: Boolean(userId), mentor: state("MENTOR"), judge: state("JUDGE") };
  });
}

export async function assignFromDirectory(actor: Actor | null, competitionId: string, mentorApplicationId: string, role: string) {
  await requireCompetitionPermission(actor, competitionId, "staff.manage");
  await requireHostingEnabled(competitionId);
  if (!ROLES.includes(role as DirectoryRole)) throw validation("Choose Mentor or Judge.");
  const app = await db.mentorApplication.findUnique({ where: { id: mentorApplicationId } });
  if (!app || app.status === "DECLINED") throw notFound("Mentor");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId }, select: { title: true } });
  const user = await db.user.findUnique({ where: { email: app.email } });

  if (user && user.status === "ACTIVE") {
    // Same path as adding staff by email: participant conflicts, notification and audit all apply.
    await addStaff(actor, competitionId, { email: app.email, role, expertise: app.designation, showPublicly: "" });
    await db.mentorInvite.upsert({
      where: { competitionId_mentorApplicationId_role: { competitionId, mentorApplicationId, role: role as DirectoryRole } },
      create: { competitionId, mentorApplicationId, role: role as DirectoryRole, invitedById: actor!.id, status: "ACCEPTED", acceptedAt: new Date() },
      update: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    return "ASSIGNED" as const;
  }

  const existing = await db.mentorInvite.findUnique({
    where: { competitionId_mentorApplicationId_role: { competitionId, mentorApplicationId, role: role as DirectoryRole } },
  });
  if (existing?.status === "PENDING") throw precondition(`${app.name} is already invited. The role applies once they create their OmniHack account.`);
  await db.mentorInvite.upsert({
    where: { competitionId_mentorApplicationId_role: { competitionId, mentorApplicationId, role: role as DirectoryRole } },
    create: { competitionId, mentorApplicationId, role: role as DirectoryRole, invitedById: actor!.id },
    update: { status: "PENDING", invitedById: actor!.id, acceptedAt: null },
  });
  const roleLabel = role === "JUDGE" ? "judge" : "mentor";
  await queueEmail({
    to: app.email,
    subject: `You're invited to ${roleLabel} ${c.title} on OmniHack`,
    body: `Hi ${app.name},\n\nThe organizers of ${c.title} would like you to join as a ${roleLabel}. Create your free OmniHack account with this email address (${app.email}) and verify it — the ${roleLabel} role is then added to your account automatically.`,
    ctaLabel: "Create my account",
    ctaUrl: "/auth/register",
    dedupeKey: `mentor-invite:${competitionId}:${mentorApplicationId}:${role}`,
  });
  await audit({
    actorId: actor!.id,
    action: "mentor_directory.invited",
    entityType: "MentorApplication",
    entityId: mentorApplicationId,
    competitionId,
    meta: { role },
  });
  return "INVITED" as const;
}

/** Applies pending directory invitations once the invited person has a verified account with the same email. */
export async function applyPendingMentorInvites(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.emailVerifiedAt || user.status !== "ACTIVE") return 0;
  const invites = await db.mentorInvite.findMany({
    where: { status: "PENDING", mentorApplication: { email: user.email } },
    include: { competition: { select: { id: true, title: true } } },
  });
  let applied = 0;
  for (const inv of invites) {
    const participant = await db.registration.findUnique({ where: { competitionId_userId: { competitionId: inv.competitionId, userId } } });
    if (participant && participant.status !== "WITHDRAWN") {
      await db.mentorInvite.update({ where: { id: inv.id }, data: { status: "CANCELLED" } });
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.competitionMember.upsert({
        where: { competitionId_userId_role: { competitionId: inv.competitionId, userId, role: inv.role } },
        create: { competitionId: inv.competitionId, userId, role: inv.role },
        update: { status: "ACTIVE" },
      });
      await tx.mentorInvite.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await audit(
        {
          actorId: userId,
          action: "mentor_directory.invite_accepted",
          entityType: "CompetitionMember",
          competitionId: inv.competitionId,
          meta: { role: inv.role, inviteId: inv.id },
        },
        tx,
      );
    });
    await notify({
      userIds: [userId],
      type: inv.role === "JUDGE" ? "judge.assigned" : "mentor.assigned",
      title: `You were added as ${inv.role === "JUDGE" ? "judge" : "mentor"} for ${inv.competition.title}`,
      body: `Your invitation to ${inv.competition.title} is now active. Open your dashboard to see what's assigned to you.`,
      link: inv.role === "JUDGE" ? "/dashboard/judging" : "/dashboard/mentoring",
    });
    applied++;
  }
  return applied;
}
