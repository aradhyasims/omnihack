// Participant-facing aggregates: dashboard overview, competition workspace, profile, data export.
import { z } from "zod";
import { db } from "../../db";
import { type Actor, requireActor } from "../../authz";
import { notFound } from "../../errors";
import { checkbox, csvList, optText, optUrl, parse, reqText } from "../../validation";
import { audit } from "../../audit";
import { registrationState } from "../competitions/lifecycle";
import { resolveFields } from "../submissions/fields";
import { signedFileUrl } from "../submissions/service";
import { visibleAnnouncements } from "../operations/service";

export async function dashboardOverview(actor: Actor | null) {
  const a = requireActor(actor);
  const [registrations, judging, mentoring, certificates, notifications, managed, invitations] = await Promise.all([
    db.registration.findMany({
      where: { userId: a.id, status: { not: "WITHDRAWN" } },
      include: {
        competition: {
          select: {
            id: true,
            title: true,
            slug: true,
            type: true,
            status: true,
            startsAt: true,
            endsAt: true,
            timezone: true,
            bannerTheme: true,
            resultsStatus: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.judgeAssignment.count({ where: { judgeId: a.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] }, stage: { status: "JUDGING" } } }),
    db.mentorAssignment.count({ where: { mentorId: a.id } }),
    db.certificate.count({ where: { userId: a.id, revokedAt: null } }),
    db.notification.findMany({ where: { userId: a.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.organizationMembership.count({ where: { userId: a.id } }),
    db.teamInvitation.findMany({
      where: { email: a.email.toLowerCase(), status: "PENDING", expiresAt: { gt: new Date() } },
      include: { team: { select: { name: true, competition: { select: { title: true } } } } },
    }),
  ]);
  const isJudge = await db.competitionMember.count({ where: { userId: a.id, role: "JUDGE", status: "ACTIVE" } });
  const isMentor = await db.competitionMember.count({ where: { userId: a.id, role: "MENTOR", status: "ACTIVE" } });
  const isStaff = await db.competitionMember.count({
    where: { userId: a.id, status: "ACTIVE", role: { in: ["OWNER", "OPS_COORDINATOR", "AUDITOR", "VOLUNTEER", "SPONSOR_REP", "RECRUITER"] } },
  });
  return {
    registrations,
    pendingEvaluations: judging,
    menteeCount: mentoring,
    certificates,
    notifications,
    isOrganizer: managed > 0 || isStaff > 0,
    isJudge: isJudge > 0,
    isMentor: isMentor > 0,
    invitations,
  };
}

/** Everything a participant needs for one competition. Only their own project's data is loaded. */
export async function participantWorkspace(actor: Actor | null, slug: string) {
  const a = requireActor(actor);
  const competition = await db.competition.findUnique({
    where: { slug },
    include: {
      challenges: { where: { visibility: { not: "HIDDEN" } }, orderBy: { order: "asc" } },
      stages: { where: { enabled: true }, orderBy: { order: "asc" } },
      sessions: { orderBy: { startsAt: "asc" } },
      _count: { select: { registrations: { where: { status: { in: ["APPROVED", "PENDING"] } } } } },
    },
  });
  if (!competition) throw notFound("Competition");
  const registration = await db.registration.findUnique({ where: { competitionId_userId: { competitionId: competition.id, userId: a.id } } });
  if (!registration) return { competition, registration: null } as const;

  const membership = await db.teamMembership.findUnique({ where: { competitionId_userId: { competitionId: competition.id, userId: a.id } } });
  const team = membership
    ? await db.team.findUnique({
        where: { id: membership.teamId },
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, skills: true } } }, orderBy: { joinedAt: "asc" } },
          invitations: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" } },
          events: { orderBy: { createdAt: "desc" }, take: 10 },
          challenge: { select: { id: true, title: true } },
        },
      })
    : null;
  const project = team
    ? await db.project.findUnique({ where: { teamId: team.id } })
    : await db.project.findFirst({ where: { competitionId: competition.id, ownerId: a.id, status: { not: "WITHDRAWN" } } });

  const submissions = project
    ? await db.submission.findMany({
        where: { projectId: project.id },
        include: { attachments: { where: { deletedAt: null } }, versions: { orderBy: { version: "desc" }, select: { version: true, createdAt: true } } },
      })
    : [];
  const stageResults = project ? await db.stageResult.findMany({ where: { projectId: project.id } }) : [];
  // Participants see judges' team feedback only for COMPLETED stages with PUBLIC result visibility —
  // never private comments, never other teams' data.
  const publicStages = competition.stages.filter((s) => s.status === "COMPLETED" && s.resultVisibility === "PUBLIC").map((s) => s.id);
  const feedback =
    project && publicStages.length
      ? await db.evaluation.findMany({
          where: { status: "FINAL", assignment: { projectId: project.id, stageId: { in: publicStages } }, feedbackToTeam: { not: "" } },
          select: { feedbackToTeam: true, totalScore: true, assignment: { select: { stageId: true } } },
        })
      : [];
  const mentorNotes = project
    ? await db.mentorNote.findMany({
        where: { projectId: project.id, visibleToTeam: true },
        include: { mentor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const slots = project
    ? await db.presentationSlot.findMany({ where: { projectId: project.id }, include: { stage: { select: { name: true } } }, orderBy: { startsAt: "asc" } })
    : [];
  const announcements = await visibleAnnouncements(a, competition.id);
  const awards =
    project && competition.resultsStatus === "PUBLISHED" ? await db.awardWinner.findMany({ where: { projectId: project.id }, include: { prize: true } }) : [];
  const supportRequests = await db.supportRequest.findMany({ where: { userId: a.id, competitionId: competition.id }, orderBy: { createdAt: "desc" } });
  const certificates = await db.certificate.findMany({ where: { userId: a.id, competitionId: competition.id, revokedAt: null } });
  const attendance = await db.attendance.findFirst({ where: { competitionId: competition.id, userId: a.id, scopeKey: "EVENT" } });
  const pendingStageIds = new Set(competition.stages.map((s) => s.id));

  return {
    competition,
    registration,
    registrationOpen: registrationState(competition, competition._count.registrations),
    team,
    isLeader: team ? team.leaderId === a.id : Boolean(project && project.ownerId === a.id),
    project,
    stages: competition.stages
      .filter((s) => pendingStageIds.has(s.id))
      .map((s) => ({
        stage: s,
        fields: resolveFields(s.submissionTemplate, s.submissionFields),
        submission: submissions.find((x) => x.stageId === s.id) ?? null,
        result: stageResults.find((r) => r.stageId === s.id && s.status === "COMPLETED") ?? null,
        feedback: feedback.filter((f) => f.assignment.stageId === s.id),
      })),
    files: Object.fromEntries(submissions.flatMap((s) => s.attachments.map((att) => [att.id, signedFileUrl(att.id)]))),
    mentorNotes,
    slots,
    announcements,
    awards,
    supportRequests,
    certificates,
    attendance,
  } as const;
}

// ── Profile & privacy ─────────────────────────────────────────────────────────

export async function updateProfile(actor: Actor | null, input: unknown) {
  const a = requireActor(actor);
  const d = parse(
    z.object({
      name: reqText("Name", 2, 100),
      headline: optText(160),
      bio: optText(2000),
      skills: csvList,
      institution: optText(200),
      country: optText(100),
      githubUrl: optUrl,
      linkedinUrl: optUrl,
      consentShowcase: checkbox,
      consentMarketing: checkbox,
    }),
    input,
  );
  await db.user.update({ where: { id: a.id }, data: { ...d, skills: d.skills.map((s) => s.slice(0, 40)).slice(0, 25) } });
  await audit({ actorId: a.id, action: "user.profile_updated", entityType: "User", entityId: a.id });
}

/** Personal data export (JSON). Excludes judges' private notes and other people's data. */
export async function exportMyData(actor: Actor | null) {
  const a = requireActor(actor);
  const user = await db.user.findUniqueOrThrow({
    where: { id: a.id },
    select: {
      id: true,
      email: true,
      name: true,
      headline: true,
      bio: true,
      skills: true,
      institution: true,
      country: true,
      githubUrl: true,
      linkedinUrl: true,
      consentShowcase: true,
      consentMarketing: true,
      termsAcceptedAt: true,
      createdAt: true,
      emailVerifiedAt: true,
      platformRole: true,
      registrations: {
        select: {
          competition: { select: { title: true } },
          status: true,
          participantType: true,
          institution: true,
          answers: true,
          createdAt: true,
          mediaConsent: true,
        },
      },
      teamMemberships: { select: { team: { select: { name: true } }, role: true, joinedAt: true } },
      certificates: { select: { code: true, category: true, distinction: true, issuedAt: true, revokedAt: true, competition: { select: { title: true } } } },
      notifications: { select: { title: true, body: true, createdAt: true, readAt: true }, take: 500, orderBy: { createdAt: "desc" } },
      supportRequests: { select: { subject: true, body: true, status: true, response: true, createdAt: true } },
    },
  });
  const projects = await db.project.findMany({
    where: { OR: [{ ownerId: a.id }, { team: { members: { some: { userId: a.id } } } }] },
    select: {
      title: true,
      competition: { select: { title: true } },
      submissions: { select: { stage: { select: { name: true } }, status: true, content: true, submittedAt: true, version: true } },
    },
  });
  await audit({ actorId: a.id, action: "user.data_exported", entityType: "User", entityId: a.id });
  return { exportedAt: new Date().toISOString(), user, projects };
}
