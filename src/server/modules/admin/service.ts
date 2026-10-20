import { z } from "zod";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireCompetitionPermission, requirePlatformAdmin, requireSuperAdmin } from "../../authz";
import { precondition, validation } from "../../errors";
import { deleteUserSessions } from "../../auth/session";
import { parse, reqText, optText } from "../../validation";
import { rateLimit } from "../../rate-limit";

export async function adminOverview(actor: Actor | null) {
  requirePlatformAdmin(actor);
  const [users, orgs, competitions, pending, inquiries, failedEmails, failedJobs, queuedJobs] = await Promise.all([
    db.user.count(),
    db.organization.count(),
    db.competition.groupBy({ by: ["status"], _count: { _all: true } }),
    db.competition.count({ where: { status: "PENDING_APPROVAL" } }),
    db.contactInquiry.count({ where: { status: "NEW" } }),
    db.emailOutbox.count({ where: { status: "FAILED" } }),
    db.job.count({ where: { status: "FAILED" } }),
    db.job.count({ where: { status: "QUEUED" } }),
  ]);
  return { users, orgs, competitions, pending, inquiries, failedEmails, failedJobs, queuedJobs };
}

export async function listUsers(actor: Actor | null, q?: string, page = 1) {
  requirePlatformAdmin(actor);
  const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {};
  const [total, items] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: { id: true, name: true, email: true, platformRole: true, status: true, emailVerifiedAt: true, mfaEnabledAt: true, createdAt: true, isDemo: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 25,
      take: 25,
    }),
  ]);
  return { total, items, pageCount: Math.max(1, Math.ceil(total / 25)) };
}

export async function setUserStatus(actor: Actor | null, userId: string, status: "ACTIVE" | "SUSPENDED") {
  const admin = requirePlatformAdmin(actor);
  if (userId === admin.id) throw precondition("You cannot change your own account status.");
  const target = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.platformRole === "SUPER_ADMIN" && admin.platformRole !== "SUPER_ADMIN")
    throw precondition("Only a super administrator can change another super administrator.");
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status !== "ACTIVE") await deleteUserSessions(userId);
  await audit({ actorId: admin.id, action: `admin.user_${status.toLowerCase()}`, entityType: "User", entityId: userId });
}

export async function setPlatformRole(actor: Actor | null, userId: string, role: "USER" | "ADMIN" | "SUPER_ADMIN") {
  const admin = requireSuperAdmin(actor);
  if (userId === admin.id && role !== "SUPER_ADMIN") {
    const others = await db.user.count({ where: { platformRole: "SUPER_ADMIN", status: "ACTIVE", id: { not: admin.id } } });
    if (others === 0) throw precondition("Keep at least one super administrator.");
  }
  await db.user.update({ where: { id: userId }, data: { platformRole: role } });
  await audit({ actorId: admin.id, action: "admin.role_changed", entityType: "User", entityId: userId, meta: { role } });
}

export async function listOrganizations(actor: Actor | null) {
  requirePlatformAdmin(actor);
  return db.organization.findMany({ include: { _count: { select: { members: true, competitions: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function setOrganizationVerified(actor: Actor | null, organizationId: string, verified: boolean) {
  const admin = requirePlatformAdmin(actor);
  await db.organization.update({ where: { id: organizationId }, data: { verified } });
  await audit({
    actorId: admin.id,
    action: verified ? "admin.org_verified" : "admin.org_unverified",
    entityType: "Organization",
    entityId: organizationId,
    organizationId,
  });
}

export async function pendingApprovals(actor: Actor | null) {
  requirePlatformAdmin(actor);
  return db.competition.findMany({
    where: { status: "PENDING_APPROVAL" },
    include: { organization: true, createdBy: { select: { name: true, email: true } } },
    orderBy: { updatedAt: "asc" },
  });
}

export async function auditLog(actor: Actor | null, filters: { competitionId?: string; action?: string; page?: number }, opts: { platform: boolean }) {
  if (opts.platform) requirePlatformAdmin(actor);
  else {
    if (!filters.competitionId) throw validation("A competition is required.");
    await requireCompetitionPermission(actor, filters.competitionId, "audit.view");
  }
  const page = Math.max(1, filters.page ?? 1);
  const where = {
    ...(filters.competitionId ? { competitionId: filters.competitionId } : {}),
    ...(filters.action ? { action: { contains: filters.action } } : {}),
  };
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 50,
      take: 50,
    }),
  ]);
  return { total, items, pageCount: Math.max(1, Math.ceil(total / 50)) };
}

// ── Contact inquiries (public) ─────────────────────────────────────────────────

const inquirySchema = z.object({
  name: reqText("Name", 2, 100),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  organization: optText(150),
  topic: z.enum(["GENERAL", "HOST_DEMO", "HIRING", "SUPPORT", "PARTNERSHIP", "PRIVACY"]),
  message: reqText("Message", 10, 4000),
  website: z.string().max(0, "Spam detected.").optional(), // honeypot
});

export async function submitInquiry(input: unknown, ip: string | null) {
  rateLimit(`inquiry:${ip ?? "unknown"}`, 5, 60 * 60_000);
  const d = parse(inquirySchema, input);
  const { website: _honeypot, ...data } = d;
  await db.contactInquiry.create({ data });
  const admins = await db.user.findMany({ where: { platformRole: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
  await db.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "inquiry.new",
      title: `New ${d.topic.toLowerCase().replace("_", " ")} inquiry`,
      body: `${d.name}: ${d.message.slice(0, 200)}`,
      link: "/admin/inquiries",
    })),
  });
}

export async function listInquiries(actor: Actor | null) {
  requirePlatformAdmin(actor);
  return db.contactInquiry.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
}

export async function setInquiryStatus(actor: Actor | null, id: string, status: "NEW" | "IN_PROGRESS" | "CLOSED") {
  const admin = requirePlatformAdmin(actor);
  if (!["NEW", "IN_PROGRESS", "CLOSED"].includes(status)) throw validation("Invalid status.");
  await db.contactInquiry.update({ where: { id }, data: { status } });
  await audit({ actorId: admin.id, action: "admin.inquiry_status", entityType: "ContactInquiry", entityId: id, meta: { status } });
}

export async function systemQueues(actor: Actor | null) {
  requirePlatformAdmin(actor);
  const [emails, jobs] = await Promise.all([
    db.emailOutbox.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, toEmail: true, subject: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true, provider: true },
    }),
    db.job.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { emails, jobs };
}

export async function retryFailedEmails(actor: Actor | null) {
  const admin = requirePlatformAdmin(actor);
  const r = await db.emailOutbox.updateMany({ where: { status: "FAILED" }, data: { status: "QUEUED", attempts: 0 } });
  await audit({ actorId: admin.id, action: "admin.emails_retried", entityType: "EmailOutbox", meta: { count: r.count } });
  return r.count;
}
