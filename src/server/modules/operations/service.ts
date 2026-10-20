import { z } from "zod";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, getCompetitionAccess, requireActor, requireCompetitionPermission } from "../../authz";
import { conflict, forbidden, notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { optText, optUrl, parse, reqText, zonedDate } from "../../validation";
import { eligibleProjectsForStage } from "../stages/service";

// ── Schedule ──────────────────────────────────────────────────────────────────

export async function upsertSession(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "schedule.manage");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const d = parse(
    z
      .object({
        id: z.string().optional(),
        title: reqText("Title", 2, 160),
        kind: z.enum(["KICKOFF", "WORKSHOP", "MENTOR_SESSION", "PRESENTATION", "CHECKPOINT", "CEREMONY", "OTHER"]),
        description: optText(2000),
        startsAt: zonedDate(c.timezone),
        endsAt: zonedDate(c.timezone),
        location: optText(200),
        meetingUrl: optUrl,
        hostName: optText(120),
      })
      .superRefine((v, ctx) => {
        if (!v.startsAt) ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Start time is required." });
        if (!v.endsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End time is required." });
        if (v.startsAt && v.endsAt && v.startsAt >= v.endsAt)
          ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The session must end after it starts." });
      }),
    input,
  );
  const data = {
    title: d.title,
    kind: d.kind,
    description: d.description ?? "",
    startsAt: d.startsAt!,
    endsAt: d.endsAt!,
    location: d.location,
    meetingUrl: d.meetingUrl,
    hostName: d.hostName,
  };
  if (d.id) {
    if (!(await db.eventSession.findFirst({ where: { id: d.id, competitionId } }))) throw notFound("Session");
    await db.eventSession.update({ where: { id: d.id }, data });
  } else await db.eventSession.create({ data: { ...data, competitionId } });
  await audit({ actorId: actor!.id, action: "schedule.saved", entityType: "EventSession", entityId: d.id ?? null, competitionId });
}

export async function deleteSession(actor: Actor | null, competitionId: string, sessionId: string) {
  await requireCompetitionPermission(actor, competitionId, "schedule.manage");
  await db.eventSession.deleteMany({ where: { id: sessionId, competitionId } });
  await audit({ actorId: actor!.id, action: "schedule.deleted", entityType: "EventSession", entityId: sessionId, competitionId });
}

/** Allocate consecutive presentation slots for every eligible project in a judged stage. */
export async function allocatePresentationSlots(
  actor: Actor | null,
  stageId: string,
  input: { startsAt: Date; minutes: number; room?: string | null; sessionId?: string | null },
) {
  const stage = await db.stage.findUnique({ where: { id: stageId } });
  if (!stage) throw notFound("Stage");
  await requireCompetitionPermission(actor, stage.competitionId, "schedule.manage");
  if (input.minutes < 3 || input.minutes > 120) throw validation("Slots must be between 3 and 120 minutes.");
  const projects = await eligibleProjectsForStage(stage);
  if (!projects.length) throw precondition("No eligible projects in this stage yet.");
  await db.$transaction(async (tx) => {
    await tx.presentationSlot.deleteMany({ where: { stageId } });
    let t = input.startsAt.getTime();
    for (const p of projects) {
      await tx.presentationSlot.create({
        data: {
          stageId,
          projectId: p.id,
          sessionId: input.sessionId ?? null,
          startsAt: new Date(t),
          endsAt: new Date(t + input.minutes * 60_000),
          room: input.room ?? null,
        },
      });
      t += input.minutes * 60_000;
    }
    await audit(
      {
        actorId: actor!.id,
        action: "slots.allocated",
        entityType: "Stage",
        entityId: stageId,
        competitionId: stage.competitionId,
        meta: { count: projects.length },
      },
      tx,
    );
  });
  const members = await db.project.findMany({
    where: { id: { in: projects.map((p) => p.id) } },
    select: { ownerId: true, team: { select: { members: { select: { userId: true } } } } },
  });
  await notify({
    userIds: members.flatMap((m) => [...(m.ownerId ? [m.ownerId] : []), ...(m.team?.members.map((x) => x.userId) ?? [])]),
    type: "slot.allocated",
    title: `Presentation slot scheduled: ${stage.name}`,
    body: "Your presentation slot is now on your competition workspace timeline.",
    link: "/dashboard",
    email: true,
    dedupeKey: `slots:${stageId}:${Date.now()}`,
  });
  return projects.length;
}

// ── Check-in & attendance ─────────────────────────────────────────────────────

export async function checkIn(actor: Actor | null, competitionId: string, codeRaw: string, sessionId?: string | null) {
  await requireCompetitionPermission(actor, competitionId, "attendance.manage");
  const code = codeRaw.trim().toUpperCase();
  const reg = await db.registration.findUnique({ where: { checkInCode: code }, include: { user: { select: { id: true, name: true } } } });
  if (!reg || reg.competitionId !== competitionId) throw validation("No registration matches this code for this competition.", { code: "Unknown code." });
  if (reg.status !== "APPROVED") throw precondition(`This registration is ${reg.status.toLowerCase()}; check-in is not allowed.`);
  return recordAttendance(actor!, competitionId, reg.userId, reg.user.name, "QR", sessionId ?? null);
}

export async function manualCheckIn(actor: Actor | null, competitionId: string, userId: string, reason: string, sessionId?: string | null) {
  await requireCompetitionPermission(actor, competitionId, "attendance.override");
  if (!reason.trim()) throw validation("A reason is required for a manual check-in.", { reason: "Required." });
  const reg = await db.registration.findUnique({ where: { competitionId_userId: { competitionId, userId } }, include: { user: { select: { name: true } } } });
  if (!reg) throw notFound("Registration");
  return recordAttendance(actor!, competitionId, userId, reg.user.name, "MANUAL", sessionId ?? null, reason.trim());
}

async function recordAttendance(
  actor: Actor,
  competitionId: string,
  userId: string,
  name: string,
  method: "QR" | "MANUAL",
  sessionId: string | null,
  overrideReason?: string,
) {
  if (sessionId && !(await db.eventSession.findFirst({ where: { id: sessionId, competitionId } }))) throw notFound("Session");
  const scopeKey = sessionId ?? "EVENT";
  const existing = await db.attendance.findUnique({ where: { competitionId_userId_scopeKey: { competitionId, userId, scopeKey } } });
  if (existing) throw conflict(`${name} is already checked in (at ${existing.checkedInAt.toISOString().slice(11, 16)} UTC).`);
  await db.attendance.create({ data: { competitionId, userId, sessionId, scopeKey, method, checkedInById: actor.id, overrideReason } });
  await audit({
    actorId: actor.id,
    action: method === "QR" ? "attendance.checked_in" : "attendance.manual_override",
    entityType: "Attendance",
    competitionId,
    meta: { userId, sessionId, overrideReason: overrideReason ?? null },
  });
  return { name };
}

export async function undoCheckIn(actor: Actor | null, attendanceId: string) {
  const att = await db.attendance.findUnique({ where: { id: attendanceId } });
  if (!att) throw notFound("Attendance");
  await requireCompetitionPermission(actor, att.competitionId, "attendance.override");
  await db.attendance.delete({ where: { id: attendanceId } });
  await audit({
    actorId: actor!.id,
    action: "attendance.removed",
    entityType: "Attendance",
    entityId: attendanceId,
    competitionId: att.competitionId,
    meta: { userId: att.userId },
  });
}

// ── Announcements ─────────────────────────────────────────────────────────────

export async function postAnnouncement(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "announcement.create");
  const d = parse(
    z.object({
      title: reqText("Title", 3, 160),
      body: reqText("Message", 3, 5000),
      audience: z.enum(["ALL", "PARTICIPANTS", "JUDGES", "MENTORS", "STAFF"]),
      pinned: z.preprocess((v) => v === "on", z.boolean()),
      sendEmail: z.preprocess((v) => v === "on", z.boolean()),
    }),
    input,
  );
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const a = await db.announcement.create({
    data: { competitionId, title: d.title, body: d.body, audience: d.audience, pinned: d.pinned, authorId: actor!.id },
  });
  const userIds = new Set<string>();
  if (d.audience === "ALL" || d.audience === "PARTICIPANTS") {
    (await db.registration.findMany({ where: { competitionId, status: "APPROVED" }, select: { userId: true } })).forEach((r) => userIds.add(r.userId));
  }
  const roleMap = {
    JUDGES: ["JUDGE"],
    MENTORS: ["MENTOR"],
    STAFF: ["OWNER", "OPS_COORDINATOR", "VOLUNTEER"],
    ALL: ["JUDGE", "MENTOR", "OWNER", "OPS_COORDINATOR", "VOLUNTEER"],
    PARTICIPANTS: [],
  } as const;
  const roles = roleMap[d.audience];
  if (roles.length) {
    (await db.competitionMember.findMany({ where: { competitionId, status: "ACTIVE", role: { in: [...roles] } }, select: { userId: true } })).forEach((m) =>
      userIds.add(m.userId),
    );
  }
  await notify({
    userIds: [...userIds],
    type: "announcement",
    title: `${c.title}: ${d.title}`,
    body: d.body.slice(0, 500),
    link: `/dashboard/competitions/${c.slug}`,
    email: d.sendEmail,
    dedupeKey: `announcement:${a.id}`,
  });
  await audit({
    actorId: actor!.id,
    action: "announcement.posted",
    entityType: "Announcement",
    entityId: a.id,
    competitionId,
    meta: { audience: d.audience, recipients: userIds.size },
  });
  return userIds.size;
}

export async function deleteAnnouncement(actor: Actor | null, announcementId: string) {
  const a = await db.announcement.findUnique({ where: { id: announcementId } });
  if (!a) throw notFound("Announcement");
  await requireCompetitionPermission(actor, a.competitionId, "announcement.create");
  await db.announcement.delete({ where: { id: announcementId } });
}

/** Announcements visible to the actor in a competition, based on their role. */
export async function visibleAnnouncements(actor: Actor | null, competitionId: string) {
  const a = requireActor(actor);
  const access = await getCompetitionAccess(a, competitionId);
  const audiences = new Set(["ALL"]);
  const reg = await db.registration.findUnique({ where: { competitionId_userId: { competitionId, userId: a.id } } });
  if (reg?.status === "APPROVED") audiences.add("PARTICIPANTS");
  if (access.roles.includes("JUDGE")) audiences.add("JUDGES");
  if (access.roles.includes("MENTOR")) audiences.add("MENTORS");
  if (access.permissions.has("announcement.create") || access.roles.includes("VOLUNTEER"))
    ["STAFF", "JUDGES", "MENTORS", "PARTICIPANTS"].forEach((x) => audiences.add(x));
  return db.announcement.findMany({
    where: { competitionId, audience: { in: [...audiences] } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
}

// ── Support requests ──────────────────────────────────────────────────────────

export async function createSupportRequest(actor: Actor | null, input: unknown) {
  const a = requireActor(actor);
  const d = parse(z.object({ competitionId: optText(40), subject: reqText("Subject", 3, 160), body: reqText("Message", 10, 4000) }), input);
  if (d.competitionId) {
    const reg = await db.registration.findUnique({ where: { competitionId_userId: { competitionId: d.competitionId, userId: a.id } } });
    const access = await getCompetitionAccess(a, d.competitionId);
    if (!reg && access.roles.length === 0) throw validation("You are not part of that competition.");
  }
  const r = await db.supportRequest.create({ data: { userId: a.id, competitionId: d.competitionId, subject: d.subject, body: d.body } });
  if (d.competitionId) {
    const staff = await db.competitionMember.findMany({
      where: { competitionId: d.competitionId, status: "ACTIVE", role: { in: ["OWNER", "OPS_COORDINATOR"] } },
      select: { userId: true },
    });
    await notify({
      userIds: staff.map((s) => s.userId),
      type: "support.new",
      title: `Support request: ${d.subject}`,
      body: d.body.slice(0, 300),
      link: `/organizer/competitions/${d.competitionId}/operations`,
    });
  }
  return r;
}

export async function respondSupportRequest(actor: Actor | null, requestId: string, response: string, status: "IN_PROGRESS" | "RESOLVED") {
  const r = await db.supportRequest.findUnique({ where: { id: requestId } });
  if (!r || !r.competitionId) throw notFound("Support request");
  await requireCompetitionPermission(actor, r.competitionId, "support.respond");
  if (!response.trim()) throw validation("Write a response.", { response: "Required." });
  await db.supportRequest.update({ where: { id: requestId }, data: { response: response.trim().slice(0, 4000), status, respondedById: actor!.id } });
  await notify({
    userIds: [r.userId],
    type: "support.reply",
    title: `Reply to: ${r.subject}`,
    body: response.trim().slice(0, 500),
    link: "/dashboard",
    email: true,
    dedupeKey: `support:${requestId}:${Date.now()}`,
  });
}

// ── Operations dashboard ──────────────────────────────────────────────────────

export async function operationsDashboard(actor: Actor | null, competitionId: string) {
  const access = await getCompetitionAccess(requireActor(actor), competitionId);
  if (!access.permissions.has("attendance.manage") && !access.permissions.has("schedule.manage"))
    throw forbidden("You do not have access to event operations.");
  const now = new Date();
  const [competition, sessions, approved, checkedIn, recentAttendance, support, pendingRegs, stages, volunteers, conflicts] = await Promise.all([
    db.competition.findUniqueOrThrow({ where: { id: competitionId } }),
    db.eventSession.findMany({ where: { competitionId }, orderBy: { startsAt: "asc" }, include: { _count: { select: { attendance: true } } } }),
    db.registration.count({ where: { competitionId, status: "APPROVED" } }),
    db.attendance.count({ where: { competitionId, scopeKey: "EVENT" } }),
    db.attendance.findMany({ where: { competitionId }, orderBy: { checkedInAt: "desc" }, take: 15 }),
    db.supportRequest.findMany({
      where: { competitionId, status: { not: "RESOLVED" } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.registration.count({ where: { competitionId, status: "PENDING" } }),
    db.stage.findMany({
      where: { competitionId, enabled: true },
      orderBy: { order: "asc" },
      include: { _count: { select: { assignments: { where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } } } } } },
    }),
    db.competitionMember.findMany({
      where: { competitionId, role: "VOLUNTEER", status: "ACTIVE" },
      include: { user: { select: { name: true, email: true } } },
    }),
    db.judgeAssignment.count({ where: { stage: { competitionId }, status: "CONFLICT_DECLARED" } }),
  ]);
  const attendees = await db.user.findMany({ where: { id: { in: recentAttendance.map((a) => a.userId) } }, select: { id: true, name: true } });
  const alerts: { level: "info" | "warn"; text: string }[] = [];
  if (pendingRegs) alerts.push({ level: "warn", text: `${pendingRegs} registration(s) awaiting review.` });
  if (support.length) alerts.push({ level: "warn", text: `${support.length} open support request(s).` });
  if (conflicts) alerts.push({ level: "info", text: `${conflicts} judge conflict declaration(s) recorded; check coverage on the judging page.` });
  for (const s of stages) {
    if (s.status === "OPEN" && s.endsAt && s.endsAt.getTime() - now.getTime() < 24 * 3_600_000 && s.endsAt > now)
      alerts.push({ level: "warn", text: `"${s.name}" closes in under 24 hours.` });
    if (s.status === "OPEN" && s.endsAt && s.endsAt <= now)
      alerts.push({ level: "warn", text: `"${s.name}" deadline has passed but the stage is still open.` });
    if (s.status === "JUDGING" && s._count.assignments > 0)
      alerts.push({ level: "info", text: `"${s.name}": ${s._count.assignments} evaluation(s) still pending.` });
  }
  return {
    competition,
    sessions,
    upcoming: sessions.filter((s) => s.endsAt > now).slice(0, 6),
    approved,
    checkedIn,
    recentAttendance: recentAttendance.map((a) => ({ ...a, name: attendees.find((u) => u.id === a.userId)?.name ?? "Unknown" })),
    support,
    volunteers,
    alerts,
    access,
  };
}
