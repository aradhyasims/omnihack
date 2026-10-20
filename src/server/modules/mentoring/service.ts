import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireActor, requireCompetitionPermission } from "../../authz";
import { forbidden, notFound, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { projectMemberIds } from "../teams/service";

export async function assignMentor(actor: Actor | null, competitionId: string, mentorId: string, projectIds: string[]) {
  await requireCompetitionPermission(actor, competitionId, "mentor.assign");
  const mentor = await db.competitionMember.findFirst({
    where: { competitionId, userId: mentorId, role: "MENTOR", status: "ACTIVE" },
    include: { user: true },
  });
  if (!mentor) throw validation("Choose an active mentor of this competition.");
  const projects = await db.project.findMany({ where: { id: { in: projectIds }, competitionId, status: "ACTIVE" } });
  for (const p of projects) {
    await db.mentorAssignment.upsert({
      where: { mentorId_projectId: { mentorId, projectId: p.id } },
      create: { competitionId, mentorId, projectId: p.id },
      update: {},
    });
    await notify({
      userIds: await projectMemberIds(p.id),
      type: "mentor.assigned",
      title: `${mentor.user.name} is now your mentor`,
      body: `${mentor.user.name} was assigned to mentor your project "${p.title}".`,
      link: "/dashboard",
      dedupeKey: `mentor:${mentorId}:${p.id}`,
    });
  }
  await notify({
    userIds: [mentorId],
    type: "mentor.assignment",
    title: "New mentoring assignments",
    body: `You were assigned ${projects.length} project(s) to mentor.`,
    link: "/dashboard/mentoring",
    email: true,
    dedupeKey: `mentor-assign:${competitionId}:${Date.now()}`,
  });
  await audit({
    actorId: actor!.id,
    action: "mentor.assigned",
    entityType: "Competition",
    entityId: competitionId,
    competitionId,
    meta: { mentorId, projectIds: projects.map((p) => p.id) },
  });
  return projects.length;
}

export async function unassignMentor(actor: Actor | null, assignmentId: string) {
  const a = await db.mentorAssignment.findUnique({ where: { id: assignmentId } });
  if (!a) throw notFound("Assignment");
  await requireCompetitionPermission(actor, a.competitionId, "mentor.assign");
  await db.mentorAssignment.delete({ where: { id: assignmentId } });
}

export async function myMentees(actor: Actor | null) {
  const a = requireActor(actor);
  return db.mentorAssignment.findMany({
    where: { mentorId: a.id },
    include: {
      project: {
        include: {
          competition: { select: { title: true, slug: true, timezone: true } },
          challenge: { select: { title: true } },
          team: { select: { name: true, members: { select: { user: { select: { name: true } } } } } },
          owner: { select: { name: true } },
          mentorNotes: { where: { mentorId: a.id }, orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function addMentorNote(actor: Actor | null, projectId: string, body: string, visibleToTeam: boolean) {
  const a = requireActor(actor);
  const assignment = await db.mentorAssignment.findFirst({ where: { mentorId: a.id, projectId } });
  if (!assignment) throw forbidden("You are not assigned to mentor this project.");
  if (!body.trim() || body.length > 4000) throw validation("Write feedback between 1 and 4000 characters.", { body: "Required." });
  const note = await db.mentorNote.create({ data: { projectId, mentorId: a.id, body: body.trim(), visibleToTeam } });
  if (visibleToTeam) {
    await notify({
      userIds: await projectMemberIds(projectId),
      type: "mentor.feedback",
      title: "New mentor feedback",
      body: body.trim().slice(0, 300),
      link: "/dashboard",
      dedupeKey: `mnote:${note.id}`,
    });
  }
  return note;
}
