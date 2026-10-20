// Organizer analytics computed directly from transactional data with indexed queries.
// All figures are real counts; demo competitions are flagged in the UI.
import { db } from "../../db";
import { type Actor, requireCompetitionPermission } from "../../authz";

export type AnalyticsFilters = { from?: Date | null; to?: Date | null; trackId?: string | null; stageId?: string | null };

export async function competitionAnalytics(actor: Actor | null, competitionId: string, f: AnalyticsFilters = {}) {
  await requireCompetitionPermission(actor, competitionId, "analytics.view");
  const createdAt = f.from || f.to ? { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } : undefined;
  const regWhere = { competitionId, ...(createdAt ? { createdAt } : {}) };
  const projectWhere = { competitionId, ...(f.trackId ? { trackId: f.trackId } : {}) };

  const [competition, regByStatus, regTypes, institutions, regs, teams, teamSizes, soloProjects, projectsByStatus, stages, attendance, certificates, winners] =
    await Promise.all([
      db.competition.findUniqueOrThrow({ where: { id: competitionId }, include: { tracks: true } }),
      db.registration.groupBy({ by: ["status"], where: regWhere, _count: { _all: true } }),
      db.registration.groupBy({ by: ["participantType"], where: { ...regWhere, status: { not: "WITHDRAWN" } }, _count: { _all: true } }),
      db.registration.groupBy({
        by: ["institution"],
        where: { ...regWhere, status: { not: "WITHDRAWN" }, institution: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { institution: "desc" } },
        take: 10,
      }),
      db.registration.findMany({ where: regWhere, select: { createdAt: true, eligibilityStatus: true } }),
      db.team.count({ where: { competitionId, status: { in: ["FORMING", "LOCKED"] } } }),
      db.teamMembership.groupBy({ by: ["teamId"], where: { competitionId }, _count: { _all: true } }),
      db.project.count({ where: { ...projectWhere, ownerId: { not: null }, status: "ACTIVE" } }),
      db.project.groupBy({ by: ["status"], where: projectWhere, _count: { _all: true } }),
      db.stage.findMany({ where: { competitionId, enabled: true, ...(f.stageId ? { id: f.stageId } : {}) }, orderBy: { order: "asc" } }),
      db.attendance.count({ where: { competitionId, scopeKey: "EVENT" } }),
      db.certificate.groupBy({ by: ["category"], where: { competitionId, revokedAt: null }, _count: { _all: true } }),
      db.awardWinner.count({ where: { prize: { competitionId } } }),
    ]);
  // Engagement: share of competition notifications (links reference the slug) that were read.
  const [totalNotifs, read] = await Promise.all([
    db.notification.count({ where: { link: { contains: competition.slug } } }),
    db.notification.count({ where: { link: { contains: competition.slug }, readAt: { not: null } } }),
  ]);

  const stageRows = await Promise.all(
    stages.map(async (s) => {
      const [submitted, drafts, assignments, finalized, advanced, decided] = await Promise.all([
        db.submission.count({ where: { stageId: s.id, status: "SUBMITTED", project: projectWhere } }),
        db.submission.count({ where: { stageId: s.id, status: "DRAFT", project: projectWhere } }),
        db.judgeAssignment.count({ where: { stageId: s.id, status: { not: "REVOKED" }, project: projectWhere } }),
        db.judgeAssignment.count({ where: { stageId: s.id, status: "SUBMITTED", project: projectWhere } }),
        db.stageResult.count({ where: { stageId: s.id, decision: "ADVANCED", project: projectWhere } }),
        db.stageResult.count({ where: { stageId: s.id, decision: { not: "PENDING" }, project: projectWhere } }),
      ]);
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        acceptsSubmissions: s.acceptsSubmissions,
        isJudged: s.isJudged,
        submitted,
        drafts,
        assignments,
        finalized,
        advanced,
        decided,
      };
    }),
  );

  // Daily registrations series (UTC days)
  const byDay = new Map<string, number>();
  for (const r of regs) {
    const k = r.createdAt.toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const series = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, count]) => ({ day, count }));

  const count = (rows: { _count: { _all: number } }[]) => rows.reduce((s, r) => s + r._count._all, 0);
  const statusCount = (s: string) => regByStatus.find((r) => r.status === s)?._count._all ?? 0;
  const membersInTeams = teamSizes.reduce((s, t) => s + t._count._all, 0);
  const activeProjects = projectsByStatus.find((p) => p.status === "ACTIVE")?._count._all ?? 0;

  return {
    competition,
    registrations: {
      total: count(regByStatus),
      approved: statusCount("APPROVED"),
      pending: statusCount("PENDING"),
      rejected: statusCount("REJECTED"),
      waitlisted: statusCount("WAITLISTED"),
      withdrawn: statusCount("WITHDRAWN"),
      eligible: regs.filter((r) => r.eligibilityStatus === "ELIGIBLE").length,
      byType: regTypes.map((r) => ({ label: r.participantType, count: r._count._all })),
      series,
    },
    institutions: institutions.map((i) => ({ label: i.institution ?? "—", count: i._count._all })),
    teams: { count: teams, avgSize: teamSizes.length ? Math.round((membersInTeams / teamSizes.length) * 10) / 10 : 0, soloProjects, activeProjects },
    stages: stageRows,
    attendance: { checkedIn: attendance, rate: statusCount("APPROVED") ? Math.round((attendance / statusCount("APPROVED")) * 100) : 0 },
    certificates: certificates.map((c) => ({ label: c.category, count: c._count._all })),
    engagement: { notifications: totalNotifs, readRate: totalNotifs ? Math.round((read / totalNotifs) * 100) : null },
    winners,
    completed: competition.resultsStatus === "PUBLISHED",
  };
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

export async function exportCsv(actor: Actor | null, competitionId: string, kind: "registrations" | "teams" | "submissions" | "rankings" | "attendance") {
  await requireCompetitionPermission(actor, competitionId, kind === "registrations" || kind === "attendance" ? "registration.review" : "analytics.view");
  switch (kind) {
    case "registrations": {
      const rows = await db.registration.findMany({
        where: { competitionId },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      return toCsv(
        ["Name", "Email", "Status", "Eligibility", "Participant type", "Institution", "Registered at", "Checked-in code"],
        rows.map((r) => [r.user.name, r.user.email, r.status, r.eligibilityStatus, r.participantType, r.institution, r.createdAt, r.checkInCode]),
      );
    }
    case "teams": {
      const rows = await db.team.findMany({
        where: { competitionId },
        include: { members: { include: { user: { select: { name: true, email: true } } } }, challenge: { select: { title: true } } },
      });
      return toCsv(
        ["Team", "Status", "Challenge", "Members", "Member emails", "Created at"],
        rows.map((t) => [
          t.name,
          t.status,
          t.challenge?.title,
          t.members.map((m) => m.user.name).join("; "),
          t.members.map((m) => m.user.email).join("; "),
          t.createdAt,
        ]),
      );
    }
    case "submissions": {
      const rows = await db.submission.findMany({
        where: { stage: { competitionId } },
        include: {
          stage: { select: { name: true } },
          project: { select: { title: true, team: { select: { name: true } } } },
          _count: { select: { attachments: true } },
        },
      });
      return toCsv(
        ["Stage", "Project", "Team", "Status", "Version", "Late", "Submitted at", "Attachments"],
        rows.map((s) => [
          s.stage.name,
          s.project.title,
          s.project.team?.name,
          s.status,
          s.version,
          s.isLate ? "yes" : "no",
          s.submittedAt,
          s._count.attachments,
        ]),
      );
    }
    case "rankings": {
      const rows = await db.stageResult.findMany({
        where: { stage: { competitionId } },
        include: { stage: { select: { name: true, order: true } }, project: { select: { title: true, team: { select: { name: true } } } } },
        orderBy: [{ stage: { order: "asc" } }, { rank: "asc" }],
      });
      return toCsv(
        ["Stage", "Rank", "Project", "Team", "Score (0-100)", "Evaluations", "Decision"],
        rows.map((r) => [r.stage.name, r.rank, r.project.title, r.project.team?.name, r.score, r.evaluationCount, r.decision]),
      );
    }
    case "attendance": {
      const rows = await db.attendance.findMany({
        where: { competitionId },
        include: { session: { select: { title: true } } },
        orderBy: { checkedInAt: "asc" },
      });
      const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true, email: true } });
      return toCsv(
        ["Name", "Email", "Scope", "Method", "Checked in at", "Override reason"],
        rows.map((r) => {
          const u = users.find((x) => x.id === r.userId);
          return [u?.name, u?.email, r.session?.title ?? "Event", r.method, r.checkedInAt, r.overrideReason];
        }),
      );
    }
  }
}
