import { z } from "zod";
import type { CompetitionStatus, Prisma } from "@prisma/client";
import { db, type Tx } from "../../db";
import { audit } from "../../audit";
import { type Actor, isPlatformAdmin, requireActor, requireCompetitionPermission, requireOrgRole, requirePlatformAdmin, requireSuperAdmin } from "../../authz";
import { AppError, conflict, notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { features } from "../../env";
import { checkbox, csvList, intWithDefault, optEmail, optInt, optText, optUrl, parse, reqText, zonedDate } from "../../validation";
import { isValidTimeZone } from "@/lib/time";
import { canTransition, DEFAULT_RULES, RULE_KEYS, slugify, validateDates } from "./lifecycle";
import { STAGE_TEMPLATES } from "../stages/templates";
import { validateRubric } from "../judging/scoring";
import { storage } from "../../storage";
import { validateUpload } from "../../storage/validate";
import { randomToken } from "../../crypto";

// ── Organizations ────────────────────────────────────────────────────────────

const orgSchema = z.object({
  name: reqText("Organization name", 2, 120),
  type: z.enum(["COMPANY", "UNIVERSITY", "COLLEGE", "SCHOOL", "NONPROFIT", "COMMUNITY", "GOVERNMENT", "OTHER"]),
  description: optText(1000),
  website: optUrl,
});

export async function createOrganization(actor: Actor | null, input: unknown) {
  const a = requireActor(actor);
  if (!a.emailVerifiedAt) throw precondition("Verify your email address before creating an organization.");
  const data = parse(orgSchema, input);
  const slug = await uniqueSlug(slugify(data.name) || "org", (s) => db.organization.findUnique({ where: { slug: s } }));
  const org = await db.$transaction(async (tx) => {
    const o = await tx.organization.create({ data: { ...data, slug } });
    await tx.organizationMembership.create({ data: { organizationId: o.id, userId: a.id, role: "OWNER" } });
    await audit({ actorId: a.id, action: "organization.created", entityType: "Organization", entityId: o.id, organizationId: o.id }, tx);
    return o;
  });
  return org;
}

export async function addOrgMember(actor: Actor | null, organizationId: string, email: string, role: "OWNER" | "COORDINATOR" | "MEMBER") {
  await requireOrgRole(actor, organizationId, ["OWNER"]);
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw validation("No OmniHack account uses that email. Ask them to sign up first.", { email: "Account not found." });
  await db.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    create: { organizationId, userId: user.id, role },
    update: { role },
  });
  await audit({
    actorId: actor!.id,
    action: "organization.member_set",
    entityType: "Organization",
    entityId: organizationId,
    organizationId,
    meta: { userId: user.id, role },
  });
}

export async function removeOrgMember(actor: Actor | null, organizationId: string, userId: string) {
  await requireOrgRole(actor, organizationId, ["OWNER"]);
  const owners = await db.organizationMembership.count({ where: { organizationId, role: "OWNER" } });
  const target = await db.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!target) return;
  if (target.role === "OWNER" && owners <= 1) throw precondition("An organization must keep at least one owner.");
  await db.organizationMembership.delete({ where: { id: target.id } });
  await audit({
    actorId: actor!.id,
    action: "organization.member_removed",
    entityType: "Organization",
    entityId: organizationId,
    organizationId,
    meta: { userId },
  });
}

// ── Drafts ───────────────────────────────────────────────────────────────────

async function uniqueSlug(base: string, exists: (s: string) => Promise<unknown>) {
  let slug = base;
  for (let i = 2; await exists(slug); i++) slug = `${base}-${i}`.slice(0, 64);
  return slug;
}

const createSchema = z.object({
  organizationId: z.string().min(1, "Choose an organization."),
  title: reqText("Event name", 3, 120),
  type: z.enum(["IDEATHON", "HACKATHON", "HYBRID"]),
});

export async function createCompetitionDraft(actor: Actor | null, input: unknown) {
  const a = requireActor(actor);
  const data = parse(createSchema, input);
  await requireOrgRole(a, data.organizationId, ["OWNER", "COORDINATOR"]);
  const slug = await uniqueSlug(slugify(data.title) || "competition", (s) => db.competition.findUnique({ where: { slug: s } }));
  return db.$transaction(async (tx) => {
    const c = await tx.competition.create({
      data: {
        organizationId: data.organizationId,
        createdById: a.id,
        title: data.title,
        slug,
        type: data.type,
        eligibilityTypes: ["OPEN"],
        rules: DEFAULT_RULES,
        participationMode: data.type === "IDEATHON" ? "BOTH" : "TEAM",
        minTeamSize: 1,
        maxTeamSize: data.type === "IDEATHON" ? 3 : 4,
        contactEmail: a.email,
        contactName: a.name,
      },
    });
    await tx.competitionMember.create({ data: { competitionId: c.id, userId: a.id, role: "OWNER" } });
    await seedStages(tx, c.id, data.type);
    await audit({ actorId: a.id, action: "competition.created", entityType: "Competition", entityId: c.id, competitionId: c.id }, tx);
    return c;
  });
}

export async function seedStages(tx: Tx, competitionId: string, type: "IDEATHON" | "HACKATHON" | "HYBRID") {
  const seeds = STAGE_TEMPLATES[type];
  for (const [i, s] of seeds.entries()) {
    const stage = await tx.stage.create({
      data: {
        competitionId,
        name: s.name,
        type: s.type,
        description: s.description,
        order: i + 1,
        enabled: s.enabled ?? true,
        acceptsSubmissions: s.acceptsSubmissions ?? false,
        submissionTemplate: s.submissionTemplate ?? "NONE",
        isJudged: s.isJudged ?? false,
        onlyAdvancedProjects: s.onlyAdvancedProjects ?? false,
        advancementRule: s.advancementRule ?? "MANUAL",
        advancementValue: s.advancementValue ?? null,
      },
    });
    if (s.isJudged) {
      await tx.rubric.create({
        data: {
          stageId: stage.id,
          criteria: {
            create: (s.criteria ?? []).map((c, j) => ({
              name: c.name,
              description: c.description,
              weight: c.weight,
              minScore: c.minScore ?? 0,
              maxScore: c.maxScore ?? 10,
              tieBreakPriority: c.tieBreakPriority ?? null,
              order: j,
            })),
          },
        },
      });
    }
  }
}

async function loadEditable(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "competition.edit");
  const c = await db.competition.findUnique({ where: { id: competitionId } });
  if (!c) throw notFound("Competition");
  if (c.status === "ARCHIVED" || c.status === "CANCELLED") throw precondition("Archived or cancelled competitions cannot be edited.");
  return c;
}

async function saveStep(actor: Actor, competitionId: string, step: number, data: Prisma.CompetitionUpdateInput, client: Tx | typeof db = db) {
  const c = await client.competition.update({
    where: { id: competitionId },
    data: { ...data, wizardStep: { set: step } },
  });
  await audit({ actorId: actor.id, action: "competition.updated", entityType: "Competition", entityId: competitionId, competitionId, meta: { step } }, client);
  return c;
}

// Step 1 — basics
const basicsSchema = z.object({
  title: reqText("Event name", 3, 120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only.")
    .min(3)
    .max(64),
  tagline: reqText("Short description", 10, 200),
  description: reqText("Full description", 30, 20000),
  bannerTheme: z.enum(["indigo", "cyan", "emerald", "amber", "rose", "violet"]).default("indigo"),
  contactName: optText(120),
  contactEmail: optEmail,
  category: reqText("Category", 2, 60),
  language: reqText("Language", 2, 40),
  tags: csvList,
});

export async function updateBasics(actor: Actor | null, competitionId: string, input: unknown) {
  const c = await loadEditable(actor, competitionId);
  const data = parse(basicsSchema, input);
  if (data.slug !== c.slug) {
    if (c.status !== "DRAFT") throw validation("The URL can only change while the competition is a draft.", { slug: "Locked after publishing." });
    const taken = await db.competition.findUnique({ where: { slug: data.slug } });
    if (taken) throw validation("That URL is already taken.", { slug: "Already in use." });
  }
  return saveStep(actor!, competitionId, Math.max(c.wizardStep, 2), data);
}

export async function setCompetitionImage(actor: Actor | null, competitionId: string, kind: "banner" | "logo", file: File | null) {
  const c = await loadEditable(actor, competitionId);
  const field = kind === "banner" ? "bannerImageKey" : "logoImageKey";
  if (!file || file.size === 0) {
    await db.competition.update({ where: { id: competitionId }, data: { [field]: null } });
    return;
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const check = validateUpload(file.name, buf, 5 * 1024 * 1024, { imagesOnly: true });
  if (!check.ok) throw validation(check.error, { [kind]: check.error });
  const key = `public/competitions/${c.id}/${kind}-${randomToken(8)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x")}.${check.ext}`;
  await storage().put(key, buf, check.mime);
  await db.competition.update({ where: { id: competitionId }, data: { [field]: key } });
  await audit({ actorId: actor!.id, action: `competition.${kind}_uploaded`, entityType: "Competition", entityId: competitionId, competitionId });
}

// Step 2 — type. Changing the type re-seeds the default stage template while nothing has started.
export async function updateType(actor: Actor | null, competitionId: string, input: unknown) {
  const c = await loadEditable(actor, competitionId);
  const { type } = parse(z.object({ type: z.enum(["IDEATHON", "HACKATHON", "HYBRID"]) }), input);
  if (type === c.type) return saveStep(actor!, competitionId, Math.max(c.wizardStep, 3), {});
  if (c.status !== "DRAFT") throw precondition("The competition type cannot change after publishing.");
  return db.$transaction(async (tx) => {
    const started = await tx.stage.count({ where: { competitionId, status: { not: "PENDING" } } });
    if (started > 0) throw precondition("Stages have already started; the type can no longer change.");
    await tx.stage.deleteMany({ where: { competitionId } });
    await seedStages(tx, competitionId, type);
    return saveStep(actor!, competitionId, Math.max(c.wizardStep, 3), { type }, tx);
  });
}

// Step 3 — delivery
export async function updateDelivery(actor: Actor | null, competitionId: string, input: unknown) {
  const c = await loadEditable(actor, competitionId);
  const data = parse(
    z
      .object({
        mode: z.enum(["ONLINE", "OFFLINE", "HYBRID"]),
        timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone."),
        venueName: optText(200),
        venueAddress: optText(500),
        city: optText(100),
        country: optText(100),
        meetingUrl: optUrl,
        onlineInstructions: optText(3000),
      })
      .superRefine((d, ctx) => {
        if (d.mode !== "ONLINE" && !d.venueName) ctx.addIssue({ code: "custom", path: ["venueName"], message: "Venue is required for in-person events." });
        if (d.mode !== "ONLINE" && !d.venueAddress)
          ctx.addIssue({ code: "custom", path: ["venueAddress"], message: "Address is required for in-person events." });
      }),
    input,
  );
  return saveStep(actor!, competitionId, Math.max(c.wizardStep, 4), data);
}

// Step 4 — eligibility
const customFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "textarea", "select", "checkbox"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
});

export async function updateEligibility(actor: Actor | null, competitionId: string, input: unknown) {
  const c = await loadEditable(actor, competitionId);
  const data = parse(
    z
      .object({
        participationMode: z.enum(["INDIVIDUAL", "TEAM", "BOTH"]),
        minTeamSize: intWithDefault(1, 1, 20),
        maxTeamSize: intWithDefault(4, 1, 20),
        maxParticipants: optInt(1, 1_000_000),
        eligibilityTypes: z.preprocess(
          (v) => (Array.isArray(v) ? v : v ? [v] : []),
          z.array(z.enum(["STUDENT", "PROFESSIONAL", "STARTUP", "OPEN"])).min(1, "Choose at least one eligible group."),
        ),
        minAge: optInt(0, 120),
        maxAge: optInt(0, 120),
        institutionRequirement: optText(300),
        geoRestriction: optText(300),
        requiredDocuments: csvList,
        customFields: z.preprocess(
          (v) => {
            if (typeof v !== "string" || !v.trim()) return [];
            try {
              return JSON.parse(v);
            } catch {
              return "invalid";
            }
          },
          z.array(customFieldSchema).max(20, "At most 20 custom fields."),
        ),
        requireRegistrationApproval: checkbox,
      })
      .superRefine((d, ctx) => {
        if (d.minTeamSize > d.maxTeamSize) ctx.addIssue({ code: "custom", path: ["maxTeamSize"], message: "Maximum team size must be at least the minimum." });
        if (d.minAge != null && d.maxAge != null && d.minAge > d.maxAge)
          ctx.addIssue({ code: "custom", path: ["maxAge"], message: "Maximum age must be at least the minimum." });
        const keys = d.customFields.map((f) => f.key);
        if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["customFields"], message: "Custom field keys must be unique." });
      }),
    input,
  );
  if (data.participationMode === "INDIVIDUAL") {
    data.minTeamSize = 1;
    data.maxTeamSize = 1;
  }
  return saveStep(actor!, competitionId, Math.max(c.wizardStep, 5), { ...data, customFields: data.customFields as Prisma.InputJsonValue });
}

// Step 5 — tracks and challenges
export async function addTrack(actor: Actor | null, competitionId: string, input: unknown) {
  await loadEditable(actor, competitionId);
  const data = parse(z.object({ name: reqText("Track name", 2, 80), description: optText(1000) }), input);
  const count = await db.track.count({ where: { competitionId } });
  const t = await db.track.create({ data: { competitionId, name: data.name, description: data.description ?? "", order: count } });
  await audit({ actorId: actor!.id, action: "track.created", entityType: "Track", entityId: t.id, competitionId });
  return t;
}

export async function deleteTrack(actor: Actor | null, competitionId: string, trackId: string) {
  await loadEditable(actor, competitionId);
  const t = await db.track.findFirst({ where: { id: trackId, competitionId } });
  if (!t) throw notFound("Track");
  await db.track.delete({ where: { id: trackId } });
  await audit({ actorId: actor!.id, action: "track.deleted", entityType: "Track", entityId: trackId, competitionId });
}

const challengeSchema = z.object({
  id: z.string().optional(),
  title: reqText("Title", 3, 160),
  description: reqText("Description", 10, 5000),
  context: optText(5000),
  desiredOutcome: optText(3000),
  trackId: optText(40),
  eligibilityNote: optText(1000),
  submissionRequirements: optText(3000),
  evaluationNotes: optText(3000),
  referenceLinks: csvList.refine((l) => l.every((u) => /^https?:\/\//i.test(u)), "Reference links must start with http:// or https://"),
  visibility: z.enum(["PUBLIC", "REGISTERED", "HIDDEN"]),
});

export async function upsertChallenge(actor: Actor | null, competitionId: string, input: unknown) {
  await loadEditable(actor, competitionId);
  const d = parse(challengeSchema, input);
  if (d.trackId && !(await db.track.findFirst({ where: { id: d.trackId, competitionId } }))) throw validation("Unknown track.", { trackId: "Unknown track." });
  const data = {
    title: d.title,
    description: d.description,
    context: d.context ?? "",
    desiredOutcome: d.desiredOutcome ?? "",
    trackId: d.trackId,
    eligibilityNote: d.eligibilityNote ?? "",
    submissionRequirements: d.submissionRequirements ?? "",
    evaluationNotes: d.evaluationNotes ?? "",
    referenceLinks: d.referenceLinks,
    visibility: d.visibility,
  };
  let id = d.id;
  if (id) {
    const existing = await db.challenge.findFirst({ where: { id, competitionId } });
    if (!existing) throw notFound("Challenge");
    await db.challenge.update({ where: { id }, data });
  } else {
    const order = await db.challenge.count({ where: { competitionId } });
    id = (await db.challenge.create({ data: { ...data, competitionId, order } })).id;
  }
  await audit({ actorId: actor!.id, action: d.id ? "challenge.updated" : "challenge.created", entityType: "Challenge", entityId: id, competitionId });
  await db.competition.update({
    where: { id: competitionId },
    data: { wizardStep: { set: Math.max((await db.competition.findUniqueOrThrow({ where: { id: competitionId } })).wizardStep, 6) } },
  });
}

export async function deleteChallenge(actor: Actor | null, competitionId: string, challengeId: string) {
  await loadEditable(actor, competitionId);
  const ch = await db.challenge.findFirst({ where: { id: challengeId, competitionId } });
  if (!ch) throw notFound("Challenge");
  await db.challenge.delete({ where: { id: challengeId } });
  await audit({ actorId: actor!.id, action: "challenge.deleted", entityType: "Challenge", entityId: challengeId, competitionId });
}

// Step 6 — dates
export async function updateDates(actor: Actor | null, competitionId: string, input: unknown) {
  const c = await loadEditable(actor, competitionId);
  const tz = c.timezone;
  const data = parse(
    z.object({
      registrationOpensAt: zonedDate(tz),
      registrationClosesAt: zonedDate(tz),
      teamFormationDeadline: zonedDate(tz),
      startsAt: zonedDate(tz),
      endsAt: zonedDate(tz),
      resultsAt: zonedDate(tz),
      certificatesAt: zonedDate(tz),
    }),
    input,
  );
  const errors = validateDates(data);
  if (Object.keys(errors).length) throw validation("Some dates conflict with each other.", errors);
  return saveStep(actor!, competitionId, Math.max(c.wizardStep, 7), data);
}

// Step 7 — prizes
const prizeSchema = z.object({
  id: z.string().optional(),
  title: reqText("Prize title", 2, 120),
  category: z.enum(["OVERALL", "TRACK", "SPECIAL", "SPONSOR", "NON_MONETARY"]),
  rank: optInt(1, 100),
  trackId: optText(40),
  description: optText(1000),
  valueText: optText(120),
  valueVerified: checkbox,
});

export async function upsertPrize(actor: Actor | null, competitionId: string, input: unknown) {
  await loadEditable(actor, competitionId);
  const d = parse(prizeSchema, input);
  if (d.category === "TRACK" && !d.trackId) throw validation("Choose the track for a track award.", { trackId: "Required for track awards." });
  if (d.trackId && !(await db.track.findFirst({ where: { id: d.trackId, competitionId } }))) throw validation("Unknown track.");
  const data = {
    title: d.title,
    category: d.category,
    rank: d.rank,
    trackId: d.category === "TRACK" ? d.trackId : null,
    description: d.description ?? "",
    valueText: d.valueText,
    valueVerified: d.valueText ? d.valueVerified : false,
  };
  if (d.id) {
    if (!(await db.prize.findFirst({ where: { id: d.id, competitionId } }))) throw notFound("Prize");
    await db.prize.update({ where: { id: d.id }, data });
  } else {
    const order = await db.prize.count({ where: { competitionId } });
    await db.prize.create({ data: { ...data, competitionId, order } });
  }
  await audit({ actorId: actor!.id, action: "prize.saved", entityType: "Prize", entityId: d.id ?? null, competitionId });
}

export async function deletePrize(actor: Actor | null, competitionId: string, prizeId: string) {
  await loadEditable(actor, competitionId);
  const p = await db.prize.findFirst({ where: { id: prizeId, competitionId }, include: { _count: { select: { winners: true } } } });
  if (!p) throw notFound("Prize");
  if (p._count.winners > 0) throw precondition("Remove the assigned winners before deleting this prize.");
  await db.prize.delete({ where: { id: prizeId } });
  await audit({ actorId: actor!.id, action: "prize.deleted", entityType: "Prize", entityId: prizeId, competitionId });
}

// Step 9 — rules, FAQs, fee
export async function updateRules(actor: Actor | null, competitionId: string, input: unknown) {
  const c = await loadEditable(actor, competitionId);
  const raw = (input ?? {}) as Record<string, unknown>;
  const rules: Record<string, string> = {};
  for (const [key] of RULE_KEYS) {
    const v = typeof raw[`rule_${key}`] === "string" ? (raw[`rule_${key}`] as string).trim() : "";
    if (v.length > 5000) throw validation("Rules are limited to 5000 characters each.", { [`rule_${key}`]: "Too long." });
    rules[key] = v;
  }
  const faqSchema = z.array(z.object({ q: z.string().trim().min(3).max(300), a: z.string().trim().min(1).max(3000) })).max(30);
  let faqs: { q: string; a: string }[] = [];
  try {
    faqs = faqSchema.parse(JSON.parse(typeof raw.faqs === "string" && raw.faqs.trim() ? raw.faqs : "[]"));
  } catch {
    throw validation("Each FAQ needs a question (3+ characters) and an answer.", { faqs: "Check the FAQ entries." });
  }
  const fee = parse(
    z.object({
      isPaid: checkbox,
      feeAmount: z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().min(0).max(1_000_000)),
      currency: z.string().trim().toUpperCase().length(3).default("INR"),
    }),
    { isPaid: raw.isPaid, feeAmount: raw.feeAmount, currency: raw.currency || "INR" },
  );
  return saveStep(actor!, competitionId, Math.max(c.wizardStep, 10), {
    rules,
    faqs,
    isPaid: fee.isPaid,
    feeAmountMinor: fee.isPaid ? Math.round(fee.feeAmount * 100) : 0,
    currency: fee.currency,
  });
}

export async function setVisibility(actor: Actor | null, competitionId: string, visibility: "PUBLIC" | "UNLISTED" | "PRIVATE") {
  await loadEditable(actor, competitionId);
  await db.competition.update({ where: { id: competitionId }, data: { visibility } });
  await audit({
    actorId: actor!.id,
    action: "competition.visibility_changed",
    entityType: "Competition",
    entityId: competitionId,
    competitionId,
    meta: { visibility },
  });
}

// ── Staff (judges, mentors, coordinators…) ───────────────────────────────────

const staffSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(["OWNER", "OPS_COORDINATOR", "JUDGE", "MENTOR", "SPONSOR_REP", "AUDITOR", "VOLUNTEER", "RECRUITER"]),
  expertise: optText(200),
  note: optText(300),
  company: optText(120),
  showPublicly: checkbox,
});

export async function addStaff(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "staff.manage");
  const d = parse(staffSchema, input);
  const user = await db.user.findUnique({ where: { email: d.email } });
  if (!user || user.status !== "ACTIVE")
    throw validation("No active OmniHack account uses that email. Ask them to sign up first.", { email: "Account not found." });
  const comp = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (d.role === "JUDGE" || d.role === "MENTOR" || d.role === "RECRUITER") {
    const participant = await db.registration.findUnique({ where: { competitionId_userId: { competitionId, userId: user.id } } });
    if (participant && participant.status !== "WITHDRAWN")
      throw precondition("A registered participant cannot also judge, mentor or recruit in this competition.");
  }
  if (d.role === "RECRUITER" && !d.company) throw validation("Enter the recruiter's company.", { company: "Required for recruiters." });
  const company = d.role === "RECRUITER" ? d.company : null;
  await db.competitionMember.upsert({
    where: { competitionId_userId_role: { competitionId, userId: user.id, role: d.role } },
    create: { competitionId, userId: user.id, role: d.role, expertise: d.expertise, note: d.note, company, showPublicly: d.showPublicly },
    update: { status: "ACTIVE", expertise: d.expertise, note: d.note, company, showPublicly: d.showPublicly },
  });
  await audit({ actorId: actor!.id, action: "staff.added", entityType: "CompetitionMember", competitionId, meta: { userId: user.id, role: d.role } });
  const roleLabel = d.role.replace("_", " ").toLowerCase();
  await notify({
    userIds: [user.id],
    type: d.role === "JUDGE" ? "judge.assigned" : d.role === "MENTOR" ? "mentor.assigned" : "staff.assigned",
    title: `You were added as ${roleLabel} for ${comp.title}`,
    body: `You now have the ${roleLabel} role for ${comp.title}. Open your dashboard to see what's assigned to you.`,
    link:
      d.role === "JUDGE"
        ? "/dashboard/judging"
        : d.role === "MENTOR"
          ? "/dashboard/mentoring"
          : d.role === "RECRUITER"
            ? `/organizer/competitions/${competitionId}/hiring`
            : `/organizer/competitions/${competitionId}`,
    email: true,
    dedupeKey: `staff:${competitionId}:${d.role}`,
  });
}

export async function removeStaff(actor: Actor | null, competitionId: string, memberId: string) {
  await requireCompetitionPermission(actor, competitionId, "staff.manage");
  const m = await db.competitionMember.findFirst({ where: { id: memberId, competitionId } });
  if (!m) throw notFound("Staff member");
  if (m.role === "OWNER") {
    const owners = await db.competitionMember.count({ where: { competitionId, role: "OWNER", status: "ACTIVE" } });
    if (owners <= 1) throw precondition("A competition must keep at least one owner.");
  }
  await db.$transaction(async (tx) => {
    await tx.competitionMember.update({ where: { id: memberId }, data: { status: "REMOVED" } });
    if (m.role === "JUDGE") {
      await tx.judgeAssignment.updateMany({
        where: { judgeId: m.userId, stage: { competitionId }, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
        data: { status: "REVOKED" },
      });
    }
    if (m.role === "MENTOR") await tx.mentorAssignment.deleteMany({ where: { competitionId, mentorId: m.userId } });
    await audit(
      {
        actorId: actor!.id,
        action: "staff.removed",
        entityType: "CompetitionMember",
        entityId: memberId,
        competitionId,
        meta: { userId: m.userId, role: m.role },
      },
      tx,
    );
  });
}

// ── Publication lifecycle ────────────────────────────────────────────────────

export async function getPublishIssues(competitionId: string): Promise<string[]> {
  const c = await db.competition.findUnique({
    where: { id: competitionId },
    include: {
      challenges: true,
      stages: { where: { enabled: true }, include: { rubric: { include: { criteria: true } } }, orderBy: { order: "asc" } },
    },
  });
  if (!c) throw notFound("Competition");
  const issues: string[] = [];
  if (c.tagline.length < 10) issues.push("Add a short description (step 1).");
  if (c.description.length < 30) issues.push("Add a full description of at least 30 characters (step 1).");
  if (!c.contactEmail) issues.push("Add a contact email (step 1).");
  if (c.mode !== "ONLINE" && (!c.venueName || !c.venueAddress)) issues.push("Add venue details for an in-person event (step 3).");
  if (c.mode !== "OFFLINE" && !c.meetingUrl && !c.onlineInstructions) issues.push("Add a meeting link or online participation instructions (step 3).");
  if (c.eligibilityTypes.length === 0) issues.push("Choose who is eligible (step 4).");
  if (c.challenges.filter((ch) => ch.visibility !== "HIDDEN").length === 0) issues.push("Publish at least one problem statement or challenge (step 5).");
  if (!c.registrationOpensAt || !c.registrationClosesAt || !c.startsAt || !c.endsAt)
    issues.push("Set registration opening/closing and event start/end dates (step 6).");
  for (const msg of Object.values(validateDates(c))) issues.push(`${msg} (step 6)`);
  if (c.stages.length === 0) issues.push("Enable at least one stage (step 8).");
  let prev: Date | null = null;
  for (const s of c.stages) {
    if (s.startsAt && s.endsAt && s.startsAt >= s.endsAt) issues.push(`Stage "${s.name}" must end after it starts.`);
    if (s.startsAt && prev && s.startsAt < prev) issues.push(`Stage "${s.name}" starts before the previous stage.`);
    if (s.startsAt) prev = s.startsAt;
    if (s.isJudged) {
      for (const msg of validateRubric(s.rubric?.criteria ?? [])) issues.push(`Rubric for "${s.name}": ${msg}`);
    }
    if (s.advancementRule !== "MANUAL" && (s.advancementValue == null || s.advancementValue <= 0))
      issues.push(`Stage "${s.name}" needs a value for its advancement rule.`);
  }
  if (!c.stages.some((s) => s.acceptsSubmissions)) issues.push("At least one enabled stage must accept submissions (step 8).");
  if (c.isPaid && !features.payments())
    issues.push("Paid registration requires the payment module, which is not configured on this platform. Make the event free or configure payments.");
  return issues;
}

async function changeStatus(
  tx: Tx,
  competitionId: string,
  from: CompetitionStatus,
  to: CompetitionStatus,
  actorId: string,
  reason?: string,
  extra: Prisma.CompetitionUpdateInput = {},
) {
  if (!canTransition(from, to)) throw precondition(`Cannot change status from ${from} to ${to}.`);
  const updated = await tx.competition.updateMany({
    where: { id: competitionId, status: from },
    data: { status: to, ...(extra as Prisma.CompetitionUpdateManyMutationInput) },
  });
  if (updated.count !== 1) throw conflict("The competition changed in the meantime. Refresh and try again.");
  await tx.competitionStatusChange.create({ data: { competitionId, fromStatus: from, toStatus: to, actorId, reason } });
  await audit(
    {
      actorId,
      action: `competition.status.${to.toLowerCase()}`,
      entityType: "Competition",
      entityId: competitionId,
      competitionId,
      meta: { from, to, reason: reason ?? null },
    },
    tx,
  );
}

/** Publish, or request platform approval when the organization is not verified. */
export async function publishCompetition(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "competition.publish");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId }, include: { organization: true } });
  if (c.status !== "DRAFT") throw precondition("Only drafts can be published.");
  const issues = await getPublishIssues(competitionId);
  if (issues.length) throw new AppError("PRECONDITION", `Resolve ${issues.length} issue(s) before publishing.`);
  const direct = c.organization.verified || isPlatformAdmin(actor);
  await db.$transaction((tx) =>
    changeStatus(tx, competitionId, "DRAFT", direct ? "PUBLISHED" : "PENDING_APPROVAL", actor!.id, undefined, direct ? { publishedAt: new Date() } : {}),
  );
  if (!direct) {
    const admins = await db.user.findMany({ where: { platformRole: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
    await notify({
      userIds: admins.map((u) => u.id),
      type: "competition.approval_requested",
      title: `Approval requested: ${c.title}`,
      body: `${c.organization.name} requested approval to publish "${c.title}".`,
      link: "/admin/approvals",
      dedupeKey: `approval:${competitionId}:${Date.now()}`,
    });
  }
  return direct ? "PUBLISHED" : "PENDING_APPROVAL";
}

export async function reviewPublication(actor: Actor | null, competitionId: string, approve: boolean, reason?: string) {
  const admin = requirePlatformAdmin(actor);
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (c.status !== "PENDING_APPROVAL") throw precondition("This competition is not awaiting approval.");
  if (!approve && !reason?.trim()) throw validation("Give a reason so the organizer can fix the issue.", { reason: "Required." });
  await db.$transaction((tx) =>
    changeStatus(tx, competitionId, "PENDING_APPROVAL", approve ? "PUBLISHED" : "DRAFT", admin.id, reason, approve ? { publishedAt: new Date() } : {}),
  );
  const owners = await db.competitionMember.findMany({ where: { competitionId, role: "OWNER", status: "ACTIVE" }, select: { userId: true } });
  await notify({
    userIds: owners.map((o) => o.userId),
    type: approve ? "competition.approved" : "competition.rejected",
    title: approve ? `${c.title} is now live` : `${c.title} needs changes before publishing`,
    body: approve ? "Your competition was approved and is now published." : `A platform administrator returned your competition to draft: ${reason}`,
    link: `/organizer/competitions/${competitionId}`,
    email: true,
  });
}

export async function unpublishCompetition(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "competition.publish");
  const regs = await db.registration.count({ where: { competitionId, status: { not: "WITHDRAWN" } } });
  if (regs > 0) throw precondition("Participants have registered. Cancel the competition instead of unpublishing it.");
  await db.$transaction((tx) => changeStatus(tx, competitionId, "PUBLISHED", "DRAFT", actor!.id));
}

export async function setRegistrationClosed(actor: Actor | null, competitionId: string, closed: boolean) {
  await requireCompetitionPermission(actor, competitionId, "competition.publish");
  await db.competition.update({ where: { id: competitionId }, data: { registrationClosedManually: closed } });
  await audit({
    actorId: actor!.id,
    action: closed ? "competition.registration_closed" : "competition.registration_reopened",
    entityType: "Competition",
    entityId: competitionId,
    competitionId,
  });
}

export async function cancelCompetition(actor: Actor | null, competitionId: string, reason: string) {
  await requireCompetitionPermission(actor, competitionId, "competition.cancel");
  if (!reason?.trim()) throw validation("Give a reason for cancelling; participants will see it.", { reason: "Required." });
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  await db.$transaction((tx) =>
    changeStatus(tx, competitionId, c.status, "CANCELLED", actor!.id, reason, { cancelledAt: new Date(), cancellationReason: reason.trim() }),
  );
  const regs = await db.registration.findMany({ where: { competitionId, status: { in: ["APPROVED", "PENDING", "WAITLISTED"] } }, select: { userId: true } });
  await notify({
    userIds: regs.map((r) => r.userId),
    type: "competition.cancelled",
    title: `${c.title} has been cancelled`,
    body: `The organizer cancelled ${c.title}. Reason: ${reason.trim()}`,
    link: `/competitions/${c.slug}`,
    email: true,
    dedupeKey: `cancel:${competitionId}`,
  });
}

export async function archiveCompetition(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "competition.archive");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  await db.$transaction((tx) => changeStatus(tx, competitionId, c.status, "ARCHIVED", actor!.id, undefined, { archivedAt: new Date() }));
}

/**
 * Permanently delete a competition and everything that belongs to it (registrations, teams, projects,
 * submissions, scores, results, certificates, hiring data) plus its uploaded files. Super admins only, and
 * the exact title must be typed as confirmation. The audit entry survives because AuditLog has no foreign key.
 */
export async function deleteCompetitionPermanently(actor: Actor | null, competitionId: string, confirmTitle: string) {
  const admin = requireSuperAdmin(actor);
  const c = await db.competition.findUnique({
    where: { id: competitionId },
    include: { organization: { select: { id: true, name: true } }, _count: { select: { registrations: true, teams: true, projects: true, certificates: true } } },
  });
  if (!c) throw notFound("Competition");
  if (confirmTitle.trim() !== c.title.trim())
    throw validation("Type the competition name exactly to confirm.", { reason: `Type “${c.title}” to confirm.` });

  const [attachments, consents] = await Promise.all([
    db.attachment.findMany({ where: { submission: { project: { competitionId } } }, select: { storageKey: true } }),
    db.talentConsent.findMany({ where: { competitionId, resumeKey: { not: null } }, select: { resumeKey: true } }),
  ]);
  const fileKeys = [c.bannerImageKey, c.logoImageKey, ...attachments.map((a) => a.storageKey), ...consents.map((t) => t.resumeKey)].filter(
    (k): k is string => Boolean(k),
  );

  await db.competition.delete({ where: { id: competitionId } }); // child rows cascade
  // Files go after the rows: a failed file delete leaves an orphan object, never a row pointing at a missing file.
  const results = await Promise.allSettled(fileKeys.map((k) => storage().delete(k)));
  const filesFailed = results.filter((r) => r.status === "rejected").length;
  await audit({
    actorId: admin.id,
    action: "competition.deleted",
    entityType: "Competition",
    entityId: competitionId,
    competitionId,
    organizationId: c.organization.id,
    meta: { title: c.title, slug: c.slug, organization: c.organization.name, status: c.status, ...c._count, files: fileKeys.length, filesFailed },
  });
  return c.title;
}

export async function setFeatured(actor: Actor | null, competitionId: string, featured: boolean) {
  const admin = requirePlatformAdmin(actor);
  await db.competition.update({ where: { id: competitionId }, data: { isFeatured: featured } });
  await audit({ actorId: admin.id, action: "competition.featured", entityType: "Competition", entityId: competitionId, competitionId, meta: { featured } });
}
