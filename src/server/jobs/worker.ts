// Background worker: runs queued jobs, delivers the email outbox, and schedules deadline reminders.
// Runs in-process for single-instance/dev deployments (instrumentation.ts) or as a separate
// container (`npm run worker`) in production.
import { db } from "../db";
import { drainOutbox } from "../notifications/email";
import { deliverNotifications, notify, type NotifyInput } from "../notifications/notify";
import { purgeExpiredSessions } from "../auth/session";
import { runDueJobs } from "./queue";
import { scanAttachment, scanResume } from "../storage/scan-job";

export const handlers = {
  "notify.fanout": async (payload: unknown) => {
    const input = payload as NotifyInput;
    for (let i = 0; i < input.userIds.length; i += 100) {
      await deliverNotifications({ ...input, userIds: input.userIds.slice(i, i + 100) });
    }
  },
  "file.scan": async (payload: unknown) => {
    await scanAttachment((payload as { attachmentId: string }).attachmentId);
  },
  "resume.scan": async (payload: unknown) => {
    await scanResume((payload as { consentId: string }).consentId);
  },
};

const days = (env: string | undefined, fallback: number) => {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Data-retention purge (documented in docs/SECURITY.md). Periods are configurable:
 * RETENTION_EMAIL_DAYS (90), RETENTION_NOTIFICATION_DAYS (365, read notifications only),
 * RETENTION_JOB_DAYS (30, finished jobs), RETENTION_AUDIT_DAYS (730). Competition records,
 * submissions and certificates are kept (certificates must stay verifiable).
 */
export async function purgeExpiredData(now = new Date()) {
  const before = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const [emails, notifications, jobs, tokens, auditLogs] = await Promise.all([
    db.emailOutbox.deleteMany({ where: { status: { in: ["SENT", "FAILED"] }, createdAt: { lt: before(days(process.env.RETENTION_EMAIL_DAYS, 90)) } } }),
    db.notification.deleteMany({ where: { readAt: { not: null }, createdAt: { lt: before(days(process.env.RETENTION_NOTIFICATION_DAYS, 365)) } } }),
    db.job.deleteMany({ where: { status: "DONE", updatedAt: { lt: before(days(process.env.RETENTION_JOB_DAYS, 30)) } } }),
    db.userToken.deleteMany({ where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }], createdAt: { lt: before(7) } } }),
    db.auditLog.deleteMany({ where: { createdAt: { lt: before(days(process.env.RETENTION_AUDIT_DAYS, 730)) } } }),
  ]);
  return { emails: emails.count, notifications: notifications.count, jobs: jobs.count, tokens: tokens.count, auditLogs: auditLogs.count };
}

/** Submission, evaluation and team-formation reminders 24h before deadlines (deduplicated). */
export async function scanReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 3_600_000);
  const stages = await db.stage.findMany({
    where: { enabled: true, OR: [{ status: "OPEN", acceptsSubmissions: true, endsAt: { gt: now, lte: soon } }, { status: "JUDGING" }] },
    include: { competition: true },
  });
  for (const s of stages) {
    if (s.status === "OPEN") {
      const projects = await db.project.findMany({
        where: { competitionId: s.competitionId, status: "ACTIVE", NOT: { submissions: { some: { stageId: s.id, status: "SUBMITTED" } } } },
        select: { ownerId: true, team: { select: { members: { select: { userId: true } } } } },
      });
      await notify({
        userIds: projects.flatMap((p) => [...(p.ownerId ? [p.ownerId] : []), ...(p.team?.members.map((m) => m.userId) ?? [])]),
        type: "reminder.submission",
        title: `Reminder: ${s.name} closes soon`,
        body: `Submissions for "${s.name}" in ${s.competition.title} close within 24 hours. Make sure your final version is submitted.`,
        link: `/dashboard/competitions/${s.competition.slug}`,
        email: true,
        dedupeKey: `remind-sub:${s.id}`,
      });
    } else {
      const pending = await db.judgeAssignment.findMany({
        where: { stageId: s.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] }, dueAt: { gt: now, lte: soon } },
        select: { judgeId: true },
      });
      await notify({
        userIds: pending.map((p) => p.judgeId),
        type: "reminder.evaluation",
        title: `Reminder: evaluations due for ${s.name}`,
        body: `You have pending evaluations for ${s.competition.title} due within 24 hours.`,
        link: "/dashboard/judging",
        email: true,
        dedupeKey: `remind-eval:${s.id}`,
      });
    }
  }
  const comps = await db.competition.findMany({
    where: { status: "PUBLISHED", participationMode: { not: "INDIVIDUAL" }, teamFormationDeadline: { gt: now, lte: soon } },
  });
  for (const c of comps) {
    const regs = await db.registration.findMany({
      where: {
        competitionId: c.id,
        status: "APPROVED",
        user: { teamMemberships: { none: { competitionId: c.id } }, individualProjects: { none: { competitionId: c.id, status: "ACTIVE" } } },
      },
      select: { userId: true },
    });
    await notify({
      userIds: regs.map((r) => r.userId),
      type: "reminder.team",
      title: `Reminder: form your team for ${c.title}`,
      body: "Team formation closes within 24 hours. Create or join a team to take part.",
      link: `/dashboard/competitions/${c.slug}`,
      email: true,
      dedupeKey: `remind-team:${c.id}`,
    });
  }
  const regClosing = await db.competition.findMany({
    where: { status: "PUBLISHED", registrationClosedManually: false, registrationClosesAt: { gt: now, lte: soon } },
  });
  for (const c of regClosing) {
    // Remind people who started (pending review / waitlisted) that the deadline is near.
    const regs = await db.registration.findMany({ where: { competitionId: c.id, status: { in: ["PENDING", "WAITLISTED"] } }, select: { userId: true } });
    await notify({
      userIds: regs.map((r) => r.userId),
      type: "reminder.registration",
      title: `Registration for ${c.title} closes soon`,
      body: "Registration closes within 24 hours. Your registration is still under review.",
      link: `/competitions/${c.slug}`,
      dedupeKey: `remind-reg:${c.id}`,
    });
  }
}

let lastReminderScan = 0;
let lastPurge = 0;
let lastRetention = 0;

export async function workerTick() {
  await runDueJobs(handlers);
  await drainOutbox();
  const now = Date.now();
  if (now - lastReminderScan > 15 * 60_000) {
    lastReminderScan = now;
    await scanReminders();
  }
  if (now - lastPurge > 60 * 60_000) {
    lastPurge = now;
    await purgeExpiredSessions();
  }
  if (now - lastRetention > 24 * 60 * 60_000) {
    lastRetention = now;
    const r = await purgeExpiredData();
    console.info("[worker] retention purge", JSON.stringify(r));
  }
}

export function startWorkerLoop(intervalMs = 5000) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await workerTick();
    } catch (e) {
      console.error("[worker] tick failed:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
