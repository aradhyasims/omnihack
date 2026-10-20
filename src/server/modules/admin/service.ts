import { z } from "zod";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireCompetitionPermission, requirePlatformAdmin, requireSuperAdmin } from "../../authz";
import { AppError, precondition, validation } from "../../errors";
import { deleteUserSessions } from "../../auth/session";
import { parse, reqText, optText } from "../../validation";
import { rateLimit } from "../../rate-limit";
import { storage } from "../../storage";
import { validateUpload } from "../../storage/validate";
import { randomToken } from "../../crypto";
import { BUILTIN_MENTOR_DOMAINS, OTHER_DOMAIN, slugifyDomain, type DomainOption } from "@/content/mentor-domains";

export async function adminOverview(actor: Actor | null) {
  requirePlatformAdmin(actor);
  const [users, orgs, competitions, pending, inquiries, mentorApplications, failedEmails, failedJobs, queuedJobs] = await Promise.all([
    db.user.count(),
    db.organization.count(),
    db.competition.groupBy({ by: ["status"], _count: { _all: true } }),
    db.competition.count({ where: { status: "PENDING_APPROVAL" } }),
    db.contactInquiry.count({ where: { status: "NEW" } }),
    db.mentorApplication.count({ where: { status: "NEW" } }),
    db.emailOutbox.count({ where: { status: "FAILED" } }),
    db.job.count({ where: { status: "FAILED" } }),
    db.job.count({ where: { status: "QUEUED" } }),
  ]);
  return { users, orgs, competitions, pending, inquiries, mentorApplications, failedEmails, failedJobs, queuedJobs };
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

// ── Mentor applications (public) ───────────────────────────────────────────────

// Accept "linkedin.com/in/x" or "www.linkedin.com/in/x" without a scheme; store a canonical https URL.
const linkedinUrl = z
  .string({ required_error: "LinkedIn profile URL is required." })
  .trim()
  .min(1, "LinkedIn profile URL is required.")
  .max(300, "LinkedIn profile URL is too long.")
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(in|pub)\/[^/?#\s]+\/?([?#].*)?$/i.test(v), "Enter your LinkedIn profile URL, e.g. https://www.linkedin.com/in/your-name")
  .transform((v) => {
    const u = new URL(v.replace(/^http:/i, "https:"));
    return `https://www.linkedin.com${u.pathname.replace(/\/$/, "")}`;
  });

// Keep a leading "+" and digits only; 7–15 digits covers national and E.164 international numbers.
const mobile = z
  .string({ required_error: "Mobile number is required." })
  .trim()
  .min(1, "Mobile number is required.")
  .max(25, "Mobile number is too long.")
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .refine((v) => /^\+?\d{7,15}$/.test(v), "Enter a valid mobile number, e.g. +91 98765 43210");

const mentorApplicationSchema = z.object({
  name: reqText("Name", 2, 100),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  mobile,
  designation: reqText("Designation", 2, 120),
  qualification: reqText("Qualification", 2, 160),
  city: reqText("City", 2, 80),
  country: reqText("Country", 2, 80),
  linkedinUrl,
  domains: z
    .preprocess(
      (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]),
      z.array(z.string().max(60).regex(/^[a-z0-9-]+$/, "Choose from the listed domains.")),
    )
    .transform((v) => [...new Set(v)])
    .refine((v) => v.length >= 1, "Choose at least one domain.")
    .refine((v) => v.length <= 3, "Choose up to 3 domains."),
  otherDomain: optText(40),
  website: z.string().max(0, "Spam detected.").optional(), // honeypot
});

const DOMAIN_LABEL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &+./'-]*$/u;

/**
 * Map the picked values to stored domain values. "other" is replaced by the typed domain, which reuses a
 * built-in or existing custom domain when it matches one (case- and punctuation-insensitive) and is created otherwise.
 */
async function resolveMentorDomains(selected: string[], otherDomain: string | null) {
  const custom = await db.mentorDomain.findMany();
  const known: DomainOption[] = [...BUILTIN_MENTOR_DOMAINS, ...custom];
  const knownValues = new Set(known.map((d) => d.value));
  const out = selected.filter((v) => v !== OTHER_DOMAIN);
  if (out.some((v) => !knownValues.has(v))) throw validation("Choose from the listed domains.", { domains: "Choose from the listed domains." });
  if (!selected.includes(OTHER_DOMAIN)) return out;

  const label = (otherDomain ?? "").replace(/\s+/g, " ").trim();
  if (label.length < 2) throw validation("Please correct the highlighted fields.", { otherDomain: "Enter your domain." });
  if (!DOMAIN_LABEL_PATTERN.test(label))
    throw validation("Please correct the highlighted fields.", { otherDomain: "Use letters, numbers, spaces and & + . / ' - only." });
  const slug = slugifyDomain(label);
  const match = known.find((d) => d.value === slug || slugifyDomain(d.label) === slug || d.label.toLowerCase() === label.toLowerCase());
  let value = match?.value;
  if (!value) {
    // Non-Latin labels slugify to nothing; give them a stable random slug instead.
    value = slug || `domain-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    await db.mentorDomain.upsert({ where: { value }, create: { value, label: label[0]!.toUpperCase() + label.slice(1) }, update: {} });
  }
  return [...new Set([...out, value])];
}

/** Domains offered in the picker and as Mentorship filters: built-ins, then custom domains in public use, then "Other". */
export async function mentorDomainOptions() {
  const [custom, listed] = await Promise.all([
    db.mentorDomain.findMany({ orderBy: { label: "asc" } }),
    db.mentorApplication.findMany({ where: { status: { in: ["NEW", "APPROVED"] } }, select: { domains: true } }),
  ]);
  const inUse = new Set(listed.flatMap((m) => m.domains));
  const options: DomainOption[] = [...BUILTIN_MENTOR_DOMAINS, ...custom.filter((c) => inUse.has(c.value)).map(({ value, label }) => ({ value, label }))];
  const labels: Record<string, string> = Object.fromEntries([...BUILTIN_MENTOR_DOMAINS, ...custom].map((d) => [d.value, d.label]));
  return { options, labels };
}

const MENTOR_PHOTO_MAX_BYTES = 3 * 1024 * 1024;

export async function submitMentorApplication(input: unknown, photo: File | null, ip: string | null) {
  rateLimit(`mentor-application:${ip ?? "unknown"}`, 5, 60 * 60_000);
  // Report a missing "Other" domain together with any other field errors, not on a second submit.
  const raw = (input ?? {}) as Record<string, unknown>;
  const otherMissing = [raw.domains].flat().includes(OTHER_DOMAIN) && !String(raw.otherDomain ?? "").trim();
  let d: z.output<typeof mentorApplicationSchema>;
  try {
    d = parse(mentorApplicationSchema, input);
  } catch (e) {
    if (otherMissing && e instanceof AppError && e.fieldErrors) e.fieldErrors.otherDomain ??= "Enter your domain.";
    throw e;
  }
  const { website: _honeypot, otherDomain, ...fields } = d;
  let photoBuf: Buffer | null = null;
  let photoCheck: { mime: string; ext: string } | null = null;
  if (photo && photo.size > 0) {
    photoBuf = Buffer.from(await photo.arrayBuffer());
    const check = validateUpload(photo.name, photoBuf, MENTOR_PHOTO_MAX_BYTES, { imagesOnly: true });
    if (!check.ok) throw validation(check.error, { photo: check.error });
    photoCheck = check;
  }
  const existing = await db.mentorApplication.findFirst({ where: { linkedinUrl: fields.linkedinUrl, status: { in: ["NEW", "APPROVED"] } } });
  if (existing) throw precondition("We already have your mentor registration — our team will be in touch by email.");
  const data = { ...fields, domains: await resolveMentorDomains(fields.domains, otherDomain) };
  let photoKey: string | null = null;
  if (photoBuf && photoCheck) {
    photoKey = `public/mentors/${randomToken(12)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "x")}.${photoCheck.ext}`;
    await storage().put(photoKey, photoBuf, photoCheck.mime);
  }
  try {
    await db.mentorApplication.create({ data: { ...data, photoKey } });
  } catch (e) {
    if (photoKey) await storage().delete(photoKey).catch(() => {});
    throw e;
  }
  const admins = await db.user.findMany({ where: { platformRole: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
  await db.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "mentor_application.new",
      title: "New mentor registration",
      body: `${d.name} · ${d.designation} · ${d.city}, ${d.country}`,
      link: "/admin/mentors",
    })),
  });
}

/** Public mentor directory: everyone who registered, minus those an admin declined. Never exposes email. */
export async function listPublicMentors() {
  return db.mentorApplication.findMany({
    where: { status: { in: ["NEW", "APPROVED"] } },
    select: { id: true, name: true, designation: true, linkedinUrl: true, photoKey: true, domains: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export async function listMentorApplications(actor: Actor | null) {
  requirePlatformAdmin(actor);
  return db.mentorApplication.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
}

export async function setMentorApplicationStatus(actor: Actor | null, id: string, status: "NEW" | "APPROVED" | "DECLINED") {
  const admin = requirePlatformAdmin(actor);
  if (!["NEW", "APPROVED", "DECLINED"].includes(status)) throw validation("Invalid status.");
  await db.mentorApplication.update({ where: { id }, data: { status } });
  await audit({ actorId: admin.id, action: "admin.mentor_application_status", entityType: "MentorApplication", entityId: id, meta: { status } });
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
