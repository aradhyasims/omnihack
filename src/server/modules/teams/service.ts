import { z } from "zod";
import { db, type Tx } from "../../db";
import { audit } from "../../audit";
import { type Actor, hasCompetitionPermission, requireActor, requireCompetitionPermission } from "../../authz";
import { conflict, forbidden, notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { queueEmail } from "../../notifications/email";
import { friendlyCode, randomToken, sha256 } from "../../crypto";
import { optText, parse, reqText } from "../../validation";

async function requireApprovedRegistration(tx: Tx | typeof db, competitionId: string, userId: string) {
  const reg = await tx.registration.findUnique({ where: { competitionId_userId: { competitionId, userId } } });
  if (!reg || reg.status !== "APPROVED") throw precondition("You need an approved registration for this competition first.");
  return reg;
}

function teamFormationOpen(c: { teamFormationDeadline: Date | null; endsAt: Date | null; status: string }, now = new Date()) {
  if (c.status !== "PUBLISHED") return false;
  const deadline = c.teamFormationDeadline ?? c.endsAt;
  return !deadline || deadline > now;
}

async function lockTeam(tx: Tx, teamId: string) {
  await tx.$executeRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
  const team = await tx.team.findUnique({ where: { id: teamId }, include: { members: true, competition: true } });
  if (!team) throw notFound("Team");
  return team;
}

const createSchema = z.object({
  name: reqText("Team name", 2, 60),
  description: optText(500),
  challengeId: optText(40),
});

export async function createTeam(actor: Actor | null, competitionId: string, input: unknown) {
  const a = requireActor(actor);
  const d = parse(createSchema, input);
  const team = await db.$transaction(async (tx) => {
    const c = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } });
    if (c.participationMode === "INDIVIDUAL") throw precondition("This competition is for individual participants.");
    if (!teamFormationOpen(c)) throw precondition("Team formation is closed for this competition.");
    await requireApprovedRegistration(tx, competitionId, a.id);
    const existing = await tx.teamMembership.findUnique({ where: { competitionId_userId: { competitionId, userId: a.id } } });
    if (existing) throw conflict("You are already in a team for this competition.");
    const solo = await tx.project.findFirst({ where: { competitionId, ownerId: a.id, status: "ACTIVE" } });
    if (solo) throw conflict("You already started an individual project. Withdraw it before creating a team.");
    if (await tx.team.findUnique({ where: { competitionId_name: { competitionId, name: d.name } } })) {
      throw validation("That team name is taken in this competition.", { name: "Already taken." });
    }
    if (d.challengeId && !(await tx.challenge.findFirst({ where: { id: d.challengeId, competitionId, visibility: { not: "HIDDEN" } } }))) {
      throw validation("Choose a valid challenge.", { challengeId: "Invalid challenge." });
    }
    const challenge = d.challengeId ? await tx.challenge.findUnique({ where: { id: d.challengeId } }) : null;
    const t = await tx.team.create({
      data: {
        competitionId,
        name: d.name,
        description: d.description ?? "",
        leaderId: a.id,
        challengeId: d.challengeId,
        inviteCode: friendlyCode("TM", 2),
        members: { create: { userId: a.id, competitionId, role: "LEADER" } },
        events: { create: { userId: a.id, actorId: a.id, action: "CREATED" } },
      },
    });
    await tx.project.create({
      data: { competitionId, teamId: t.id, title: `${d.name} project`, challengeId: d.challengeId, trackId: challenge?.trackId ?? null },
    });
    await audit({ actorId: a.id, action: "team.created", entityType: "Team", entityId: t.id, competitionId }, tx);
    return t;
  });
  return team;
}

/** Start an individual (solo) project where the competition allows individual participation. */
export async function startSoloProject(actor: Actor | null, competitionId: string, input: unknown) {
  const a = requireActor(actor);
  const d = parse(z.object({ title: reqText("Project title", 3, 120), challengeId: optText(40) }), input);
  return db.$transaction(async (tx) => {
    const c = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } });
    if (c.participationMode === "TEAM") throw precondition("This competition requires teams.");
    await requireApprovedRegistration(tx, competitionId, a.id);
    if (await tx.teamMembership.findUnique({ where: { competitionId_userId: { competitionId, userId: a.id } } })) {
      throw conflict("You are in a team; your team's project is your entry.");
    }
    const existing = await tx.project.findUnique({ where: { competitionId_ownerId: { competitionId, ownerId: a.id } } });
    if (existing && existing.status === "ACTIVE") throw conflict("You already have an individual project.");
    const challenge = d.challengeId ? await tx.challenge.findFirst({ where: { id: d.challengeId, competitionId } }) : null;
    const data = { title: d.title, challengeId: challenge?.id ?? null, trackId: challenge?.trackId ?? null, status: "ACTIVE" as const };
    const p = existing
      ? await tx.project.update({ where: { id: existing.id }, data })
      : await tx.project.create({ data: { ...data, competitionId, ownerId: a.id } });
    await audit({ actorId: a.id, action: "project.solo_started", entityType: "Project", entityId: p.id, competitionId }, tx);
    return p;
  });
}

export async function joinTeamByCode(actor: Actor | null, inviteCode: string) {
  const a = requireActor(actor);
  const code = inviteCode.trim().toUpperCase();
  const found = await db.team.findUnique({ where: { inviteCode: code } });
  if (!found) throw validation("No team uses that invite code.", { code: "Invalid code." });
  await addMember(a, found.id, "Joined with invite code");
  return found;
}

async function addMember(a: Actor, teamId: string, note: string) {
  await db.$transaction(async (tx) => {
    const team = await lockTeam(tx, teamId);
    if (team.status !== "FORMING") throw precondition("This team is not accepting new members.");
    if (!teamFormationOpen(team.competition)) throw precondition("Team formation is closed for this competition.");
    await requireApprovedRegistration(tx, team.competitionId, a.id);
    if (team.members.length >= team.competition.maxTeamSize) throw precondition(`This team is full (maximum ${team.competition.maxTeamSize} members).`);
    const existing = await tx.teamMembership.findUnique({ where: { competitionId_userId: { competitionId: team.competitionId, userId: a.id } } });
    if (existing) throw conflict(existing.teamId === teamId ? "You are already in this team." : "You are already in another team for this competition.");
    const solo = await tx.project.findFirst({ where: { competitionId: team.competitionId, ownerId: a.id, status: "ACTIVE" } });
    if (solo) throw conflict("You have an individual project in this competition. Withdraw it before joining a team.");
    await tx.teamMembership.create({ data: { teamId, userId: a.id, competitionId: team.competitionId, role: "MEMBER" } });
    await tx.teamEvent.create({ data: { teamId, userId: a.id, actorId: a.id, action: "JOINED", note } });
    await audit({ actorId: a.id, action: "team.joined", entityType: "Team", entityId: teamId, competitionId: team.competitionId }, tx);
  });
  const team = await db.team.findUniqueOrThrow({ where: { id: teamId }, include: { competition: true } });
  await notify({
    userIds: [team.leaderId],
    type: "team.member_joined",
    title: `${a.name} joined ${team.name}`,
    body: `${a.name} joined your team for ${team.competition.title}.`,
    link: `/dashboard/competitions/${team.competition.slug}`,
    dedupeKey: `joined:${teamId}:${a.id}:${Date.now()}`,
  });
}

async function requireLeader(a: Actor, teamId: string) {
  const team = await db.team.findUnique({ where: { id: teamId }, include: { competition: true, members: true } });
  if (!team) throw notFound("Team");
  const isLeader = team.leaderId === a.id;
  if (!isLeader && !(await hasCompetitionPermission(a, team.competitionId, "team.manage"))) throw forbidden("Only the team leader can do that.");
  return team;
}

export async function inviteToTeam(actor: Actor | null, teamId: string, emailRaw: string) {
  const a = requireActor(actor);
  const email = z.string().trim().toLowerCase().email("Enter a valid email.").safeParse(emailRaw);
  if (!email.success) throw validation("Enter a valid email address.", { email: "Invalid email." });
  const team = await requireLeader(a, teamId);
  if (team.status !== "FORMING") throw precondition("This team is not accepting new members.");
  if (team.members.length >= team.competition.maxTeamSize) throw precondition("Your team is already full.");
  const pending = await db.teamInvitation.count({ where: { teamId, status: "PENDING", expiresAt: { gt: new Date() } } });
  if (team.members.length + pending >= team.competition.maxTeamSize + 3) throw precondition("Too many pending invitations. Revoke some first.");
  const token = randomToken(24);
  await db.teamInvitation.create({
    data: { teamId, email: email.data, tokenHash: sha256(token), invitedById: a.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
  });
  await db.teamEvent.create({ data: { teamId, actorId: a.id, action: "INVITED", note: email.data } });
  await queueEmail({
    to: email.data,
    subject: `${a.name} invited you to join ${team.name}`,
    body: `${a.name} invited you to join the team "${team.name}" for ${team.competition.title} on OmniHack.\n\nYou need an OmniHack account with this email address and an approved registration for the competition. The invitation expires in 7 days.`,
    ctaLabel: "View invitation",
    ctaUrl: `/invite/${token}`,
  });
  const invitee = await db.user.findUnique({ where: { email: email.data } });
  if (invitee) {
    await notify({
      userIds: [invitee.id],
      type: "team.invitation",
      title: `Team invitation: ${team.name}`,
      body: `${a.name} invited you to join ${team.name} for ${team.competition.title}.`,
      link: `/invite/${token}`,
    });
  }
  await audit({ actorId: a.id, action: "team.invited", entityType: "Team", entityId: teamId, competitionId: team.competitionId, meta: { email: email.data } });
  return token;
}

export async function getInvitation(token: string) {
  const inv = await db.teamInvitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      team: {
        include: {
          competition: { select: { id: true, title: true, slug: true, maxTeamSize: true } },
          members: { include: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!inv) return null;
  if (inv.status === "PENDING" && inv.expiresAt < new Date()) {
    await db.teamInvitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    return { ...inv, status: "EXPIRED" as const };
  }
  return inv;
}

export async function respondToInvitation(actor: Actor | null, token: string, accept: boolean) {
  const a = requireActor(actor);
  const inv = await getInvitation(token);
  if (!inv || inv.status !== "PENDING") throw precondition("This invitation is no longer valid.");
  if (inv.email !== a.email.toLowerCase()) throw forbidden("This invitation was sent to a different email address.");
  if (accept) await addMember(a, inv.teamId, "Accepted email invitation");
  await db.teamInvitation.update({ where: { id: inv.id }, data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() } });
  await audit({
    actorId: a.id,
    action: accept ? "team.invitation_accepted" : "team.invitation_declined",
    entityType: "Team",
    entityId: inv.teamId,
    competitionId: inv.team.competition.id,
  });
  return inv;
}

export async function revokeInvitation(actor: Actor | null, invitationId: string) {
  const a = requireActor(actor);
  const inv = await db.teamInvitation.findUnique({ where: { id: invitationId } });
  if (!inv) throw notFound("Invitation");
  await requireLeader(a, inv.teamId);
  await db.teamInvitation.update({ where: { id: invitationId }, data: { status: "REVOKED" } });
}

export async function removeMember(actor: Actor | null, teamId: string, userId: string) {
  const a = requireActor(actor);
  const team = await requireLeader(a, teamId);
  const isOrganizer = team.leaderId !== a.id;
  if (team.status === "LOCKED" && !isOrganizer) throw precondition("This team is locked by the organizer. Ask them to approve the change.");
  if (userId === team.leaderId) throw precondition("Transfer leadership before removing the leader.");
  await db.$transaction(async (tx) => {
    const m = await tx.teamMembership.findFirst({ where: { teamId, userId } });
    if (!m) throw notFound("Team member");
    await tx.teamMembership.delete({ where: { id: m.id } });
    await tx.teamEvent.create({ data: { teamId, userId, actorId: a.id, action: "REMOVED", note: isOrganizer ? "Removed by organizer" : "Removed by leader" } });
    await audit(
      { actorId: a.id, action: "team.member_removed", entityType: "Team", entityId: teamId, competitionId: team.competitionId, meta: { userId } },
      tx,
    );
  });
  await notify({
    userIds: [userId],
    type: "team.removed",
    title: `You were removed from ${team.name}`,
    body: `You are no longer a member of ${team.name} in ${team.competition.title}. You can create or join another team while team formation is open.`,
    link: `/dashboard/competitions/${team.competition.slug}`,
  });
}

export async function leaveTeam(actor: Actor | null, teamId: string) {
  const a = requireActor(actor);
  await db.$transaction(async (tx) => {
    const team = await lockTeam(tx, teamId);
    const m = team.members.find((x) => x.userId === a.id);
    if (!m) throw notFound("Membership");
    if (team.status === "LOCKED") throw precondition("This team is locked by the organizer. Ask them to approve the change.");
    if (m.role === "LEADER" && team.members.length > 1) throw precondition("Transfer leadership to another member before leaving.");
    await tx.teamMembership.delete({ where: { id: m.id } });
    await tx.teamEvent.create({ data: { teamId, userId: a.id, actorId: a.id, action: "LEFT" } });
    if (team.members.length === 1) await dissolveInTx(tx, teamId, a.id);
    await audit({ actorId: a.id, action: "team.left", entityType: "Team", entityId: teamId, competitionId: team.competitionId }, tx);
  });
}

async function dissolveInTx(tx: Tx, teamId: string, actorId: string) {
  const submitted = await tx.submission.count({ where: { project: { teamId }, status: "SUBMITTED" } });
  if (submitted > 0) throw precondition("Teams with submitted work cannot be dissolved; ask the organizer to withdraw the project.");
  await tx.teamMembership.deleteMany({ where: { teamId } });
  await tx.team.update({ where: { id: teamId }, data: { status: "DISSOLVED", inviteCode: `DISSOLVED-${teamId}` } });
  await tx.project.updateMany({ where: { teamId }, data: { status: "WITHDRAWN" } });
  await tx.teamInvitation.updateMany({ where: { teamId, status: "PENDING" }, data: { status: "REVOKED" } });
  await tx.teamEvent.create({ data: { teamId, actorId, action: "DISSOLVED" } });
}

export async function dissolveTeam(actor: Actor | null, teamId: string) {
  const a = requireActor(actor);
  const team = await requireLeader(a, teamId);
  if (team.status === "LOCKED" && team.leaderId === a.id) throw precondition("This team is locked by the organizer.");
  await db.$transaction((tx) => dissolveInTx(tx, teamId, a.id));
  await audit({ actorId: a.id, action: "team.dissolved", entityType: "Team", entityId: teamId, competitionId: team.competitionId });
  await notify({
    userIds: team.members.map((m) => m.userId).filter((u) => u !== a.id),
    type: "team.dissolved",
    title: `${team.name} was dissolved`,
    body: `The team ${team.name} in ${team.competition.title} was dissolved.`,
    link: `/dashboard/competitions/${team.competition.slug}`,
  });
}

export async function transferLeadership(actor: Actor | null, teamId: string, newLeaderId: string) {
  const a = requireActor(actor);
  const team = await requireLeader(a, teamId);
  if (!team.members.some((m) => m.userId === newLeaderId)) throw validation("The new leader must be a team member.");
  await db.$transaction(async (tx) => {
    await tx.teamMembership.updateMany({ where: { teamId, userId: team.leaderId }, data: { role: "MEMBER" } });
    await tx.teamMembership.updateMany({ where: { teamId, userId: newLeaderId }, data: { role: "LEADER" } });
    await tx.team.update({ where: { id: teamId }, data: { leaderId: newLeaderId } });
    await tx.teamEvent.create({ data: { teamId, userId: newLeaderId, actorId: a.id, action: "LEADER_CHANGED" } });
    await audit(
      { actorId: a.id, action: "team.leader_changed", entityType: "Team", entityId: teamId, competitionId: team.competitionId, meta: { newLeaderId } },
      tx,
    );
  });
}

export async function updateTeamDetails(actor: Actor | null, teamId: string, input: unknown) {
  const a = requireActor(actor);
  const team = await requireLeader(a, teamId);
  const d = parse(z.object({ description: optText(500), challengeId: optText(40), lookingForMembers: z.preprocess((v) => v === "on", z.boolean()) }), input);
  const challenge = d.challengeId
    ? await db.challenge.findFirst({ where: { id: d.challengeId, competitionId: team.competitionId, visibility: { not: "HIDDEN" } } })
    : null;
  if (d.challengeId && !challenge) throw validation("Choose a valid challenge.");
  await db.$transaction([
    db.team.update({
      where: { id: teamId },
      data: { description: d.description ?? "", challengeId: challenge?.id ?? null, lookingForMembers: d.lookingForMembers },
    }),
    db.project.updateMany({ where: { teamId }, data: { challengeId: challenge?.id ?? null, trackId: challenge?.trackId ?? null } }),
  ]);
}

/** Organizer approval of the final roster: locks membership changes (organizer can still edit). */
export async function setTeamLocked(actor: Actor | null, teamId: string, locked: boolean) {
  const team = await db.team.findUnique({ where: { id: teamId }, include: { members: true, competition: true } });
  if (!team) throw notFound("Team");
  await requireCompetitionPermission(actor, team.competitionId, "team.manage");
  if (locked && team.members.length < team.competition.minTeamSize)
    throw precondition(`This team has fewer than the minimum ${team.competition.minTeamSize} members.`);
  await db.team.update({ where: { id: teamId }, data: { status: locked ? "LOCKED" : "FORMING" } });
  await db.teamEvent.create({ data: { teamId, actorId: actor!.id, action: locked ? "LOCKED" : "UNLOCKED" } });
  await audit({
    actorId: actor!.id,
    action: locked ? "team.locked" : "team.unlocked",
    entityType: "Team",
    entityId: teamId,
    competitionId: team.competitionId,
  });
}

export async function disqualifyProject(actor: Actor | null, projectId: string, reason: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project");
  await requireCompetitionPermission(actor, project.competitionId, "team.manage");
  if (!reason.trim()) throw validation("A reason is required.", { reason: "Required." });
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { status: "DISQUALIFIED" } });
    if (project.teamId) await tx.team.update({ where: { id: project.teamId }, data: { status: "DISQUALIFIED" } });
    await tx.stageResult.updateMany({ where: { projectId }, data: { decision: "DISQUALIFIED", note: reason } });
    await audit(
      {
        actorId: actor!.id,
        action: "project.disqualified",
        entityType: "Project",
        entityId: projectId,
        competitionId: project.competitionId,
        meta: { reason },
      },
      tx,
    );
  });
}

/**
 * Team finder: teams that flagged "looking for members" and still have seats. Visible only to
 * approved participants of the same competition; exposes skills, not contact details.
 */
export async function listOpenTeams(actor: Actor | null, competitionId: string) {
  const a = requireActor(actor);
  const reg = await db.registration.findUnique({ where: { competitionId_userId: { competitionId, userId: a.id } } });
  if (!reg || reg.status !== "APPROVED") throw forbidden("Only approved participants can browse teams.");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const teams = await db.team.findMany({
    where: { competitionId, status: "FORMING", lookingForMembers: true },
    include: { challenge: { select: { title: true } }, members: { include: { user: { select: { skills: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return teams
    .filter((t) => t.members.length < c.maxTeamSize)
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      challenge: t.challenge?.title ?? null,
      members: t.members.length,
      seatsLeft: c.maxTeamSize - t.members.length,
      skills: [...new Set(t.members.flatMap((m) => m.user.skills))].slice(0, 12),
    }));
}

/** Ask a team leader to invite you. The leader receives your name, skills and message. */
export async function requestToJoin(actor: Actor | null, teamId: string, message: string) {
  const a = requireActor(actor);
  const team = await db.team.findUnique({ where: { id: teamId }, include: { competition: true, members: true } });
  if (!team || team.status !== "FORMING" || !team.lookingForMembers) throw precondition("This team is not looking for members.");
  await requireApprovedRegistration(db, team.competitionId, a.id);
  if (await db.teamMembership.findUnique({ where: { competitionId_userId: { competitionId: team.competitionId, userId: a.id } } })) {
    throw conflict("You are already in a team for this competition.");
  }
  if (team.members.length >= team.competition.maxTeamSize) throw precondition("This team is full.");
  const me = await db.user.findUniqueOrThrow({ where: { id: a.id }, select: { name: true, skills: true, email: true } });
  await notify({
    userIds: [team.leaderId],
    type: "team.join_request",
    title: `${me.name} would like to join ${team.name}`,
    body: `${me.name}${me.skills.length ? ` (skills: ${me.skills.join(", ")})` : ""} asked to join your team for ${team.competition.title}.${message.trim() ? `\n\n“${message.trim().slice(0, 500)}”` : ""}\n\nTo accept, invite ${me.email} from your team panel.`,
    link: `/dashboard/competitions/${team.competition.slug}`,
    email: true,
    dedupeKey: `join-request:${teamId}:${a.id}`,
  });
  await db.teamEvent.create({ data: { teamId, userId: a.id, actorId: a.id, action: "JOIN_REQUESTED" } });
}

/** The project the user participates with in a competition (team project or solo project). */
export async function projectForUser(competitionId: string, userId: string) {
  const membership = await db.teamMembership.findUnique({ where: { competitionId_userId: { competitionId, userId } } });
  if (membership) return db.project.findUnique({ where: { teamId: membership.teamId } });
  return db.project.findFirst({ where: { competitionId, ownerId: userId, status: { not: "WITHDRAWN" } } });
}

/** Can this user edit (as a participant) the given project? Active team members or the solo owner. */
export async function isProjectMember(projectId: string, userId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true, teamId: true } });
  if (!p) return false;
  if (p.ownerId === userId) return true;
  if (!p.teamId) return false;
  return Boolean(await db.teamMembership.findFirst({ where: { teamId: p.teamId, userId } }));
}

export async function projectMemberIds(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true, team: { select: { members: { select: { userId: true } } } } } });
  if (!p) return [];
  return [...(p.ownerId ? [p.ownerId] : []), ...(p.team?.members.map((m) => m.userId) ?? [])];
}
