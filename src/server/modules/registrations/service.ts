import { z } from "zod";
import type { Competition, Prisma } from "@prisma/client";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireActor, requireCompetitionPermission } from "../../authz";
import { AppError, conflict, notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { checkbox, optText, parse } from "../../validation";
import { friendlyCode } from "../../crypto";
import { registrationState } from "../competitions/lifecycle";

export type CustomField = { key: string; label: string; type: "text" | "textarea" | "select" | "checkbox"; required: boolean; options?: string[] };

const baseSchema = z.object({
  participantType: z.enum(["STUDENT", "PROFESSIONAL", "STARTUP", "OTHER"], { errorMap: () => ({ message: "Tell us which group you belong to." }) }),
  institution: optText(200),
  country: optText(100),
  age: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(5).max(120).optional()),
  acceptRules: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.literal(true, { errorMap: () => ({ message: "You must accept the competition rules." }) }),
  ),
  mediaConsent: checkbox,
});

/**
 * Pure eligibility evaluation — returns a list of human-readable reasons the person is ineligible.
 * Age is only collected and checked when the organizer configured an age range.
 */
export function evaluateEligibility(
  c: Pick<Competition, "eligibilityTypes" | "minAge" | "maxAge" | "institutionRequirement" | "geoRestriction">,
  input: { participantType: string; institution: string | null; country: string | null; age?: number },
): string[] {
  const reasons: string[] = [];
  const types = c.eligibilityTypes;
  if (!types.includes("OPEN") && !types.includes(input.participantType)) {
    reasons.push(`This competition is open to ${types.map((t) => t.toLowerCase() + "s").join(", ")} only.`);
  }
  if (c.minAge != null || c.maxAge != null) {
    if (input.age == null) reasons.push("Please provide your age; this competition has an age requirement.");
    else {
      if (c.minAge != null && input.age < c.minAge) reasons.push(`Participants must be at least ${c.minAge} years old.`);
      if (c.maxAge != null && input.age > c.maxAge) reasons.push(`Participants must be ${c.maxAge} years old or younger.`);
    }
  }
  if (c.institutionRequirement && !input.institution) reasons.push(`An institution or organization is required: ${c.institutionRequirement}`);
  if (c.geoRestriction) {
    const allowed = c.geoRestriction
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length && !allowed.includes((input.country ?? "").trim().toLowerCase())) {
      reasons.push(`This competition is limited to participants from: ${c.geoRestriction}.`);
    }
  }
  return reasons;
}

export function validateCustomAnswers(fields: CustomField[], raw: Record<string, unknown>) {
  const answers: Record<string, string | boolean> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = raw[`cf_${f.key}`];
    if (f.type === "checkbox") {
      const checked = v === "on" || v === "true";
      if (f.required && !checked) errors[`cf_${f.key}`] = "Required.";
      answers[f.key] = checked;
      continue;
    }
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) {
      if (f.required) errors[`cf_${f.key}`] = `${f.label} is required.`;
      continue;
    }
    if (s.length > (f.type === "textarea" ? 3000 : 300)) errors[`cf_${f.key}`] = "Too long.";
    if (f.type === "select" && f.options && !f.options.includes(s)) errors[`cf_${f.key}`] = "Choose one of the options.";
    answers[f.key] = s;
  }
  return { answers, errors };
}

export async function registerForCompetition(actor: Actor | null, competitionId: string, input: unknown) {
  const a = requireActor(actor);
  if (!a.emailVerifiedAt) throw precondition("Verify your email address before registering. Check your inbox or resend the link from your dashboard.");
  const raw = (input ?? {}) as Record<string, unknown>;
  const d = parse(baseSchema, raw);

  return db
    .$transaction(async (tx) => {
      // Lock the competition row so capacity checks are safe under concurrent registrations.
      await tx.$executeRaw`SELECT id FROM "Competition" WHERE id = ${competitionId} FOR UPDATE`;
      const c = await tx.competition.findUnique({ where: { id: competitionId } });
      if (!c) throw notFound("Competition");
      const staffRole = await tx.competitionMember.findFirst({ where: { competitionId, userId: a.id, status: "ACTIVE", role: { in: ["JUDGE", "MENTOR"] } } });
      if (staffRole) throw precondition("Judges and mentors of this competition cannot register as participants.");
      const existing = await tx.registration.findUnique({ where: { competitionId_userId: { competitionId, userId: a.id } } });
      if (existing && existing.status !== "WITHDRAWN") throw conflict("You are already registered for this competition.");
      const active = await tx.registration.count({ where: { competitionId, status: { in: ["APPROVED", "PENDING"] } } });
      const state = registrationState(c, active);
      if (state !== "OPEN") {
        const messages: Record<string, string> = {
          UPCOMING: "Registration has not opened yet.",
          CLOSED: "Registration is closed.",
          FULL: "This competition has reached its participant limit.",
          CANCELLED: "This competition was cancelled.",
          COMPLETED: "This competition has ended.",
          NOT_PUBLISHED: "This competition is not open for registration.",
        };
        throw precondition(messages[state] ?? "Registration is not available.");
      }
      const paid = c.isPaid && c.feeAmountMinor > 0;
      if (paid && (!c.payeeAccountNumber || !c.payeeIfsc))
        throw new AppError("UNAVAILABLE", "The organizer hasn't added payment details yet, so paid registration can't be completed. Please contact them.");
      const reasons = evaluateEligibility(c, d);
      if (reasons.length) throw validation(reasons.join(" "), { _eligibility: reasons.join(" ") });
      const { answers, errors } = validateCustomAnswers((c.customFields as CustomField[]) ?? [], raw);
      if (Object.keys(errors).length) throw validation("Please answer the required questions.", errors);
      if (d.age != null) answers.__age = String(d.age);
      if (d.country) answers.__country = d.country;

      // Paid registrations stay pending until the organizer verifies the entry-fee transfer.
      const pending = c.requireRegistrationApproval || paid;
      const data = {
        status: pending ? "PENDING" : "APPROVED",
        eligibilityStatus: pending ? "PENDING" : "ELIGIBLE",
        participantType: d.participantType,
        institution: d.institution,
        answers: answers as Prisma.InputJsonValue,
        rulesAcceptedAt: new Date(),
        mediaConsent: d.mediaConsent,
        paymentStatus: paid ? "PENDING" : "NOT_REQUIRED",
      } as const;
      const reg = existing
        ? await tx.registration.update({ where: { id: existing.id }, data: { ...data, eligibilityNote: null, reviewedAt: null, reviewedById: null } })
        : await tx.registration.create({ data: { ...data, competitionId, userId: a.id, checkInCode: friendlyCode("CK", 3) } });
      await audit({ actorId: a.id, action: "registration.created", entityType: "Registration", entityId: reg.id, competitionId }, tx);
      return { registration: reg, competition: c };
    })
    .then(async ({ registration, competition }) => {
      await notify({
        userIds: [a.id],
        type: "registration.confirmed",
        title: registration.status === "APPROVED" ? `You're registered for ${competition.title}` : `Registration received for ${competition.title}`,
        body:
          registration.status === "APPROVED"
            ? `Your registration for ${competition.title} is confirmed. Next: ${competition.participationMode === "INDIVIDUAL" ? "start your project" : "create or join a team"} from your workspace.`
            : registration.paymentStatus === "PENDING"
              ? `Your registration for ${competition.title} is saved. Pay the entry fee to the organizer's account shown in your workspace and submit the transaction reference to confirm your place.`
              : `Your registration for ${competition.title} was received and is awaiting review by the organizer. We'll notify you when it's decided.`,
        link: `/dashboard/competitions/${competition.slug}`,
        email: true,
        dedupeKey: `reg:${registration.id}:${registration.updatedAt.getTime()}`,
      });
      return registration;
    });
}

export async function withdrawRegistration(actor: Actor | null, competitionId: string) {
  const a = requireActor(actor);
  await db.$transaction(async (tx) => {
    const reg = await tx.registration.findUnique({ where: { competitionId_userId: { competitionId, userId: a.id } } });
    if (!reg || reg.status === "WITHDRAWN") throw notFound("Registration");
    const membership = await tx.teamMembership.findUnique({
      where: { competitionId_userId: { competitionId, userId: a.id } },
      include: { team: { include: { members: true } } },
    });
    if (membership) {
      if (membership.role === "LEADER" && membership.team.members.length > 1) {
        throw precondition("Transfer team leadership to another member before withdrawing.");
      }
      await tx.teamMembership.delete({ where: { id: membership.id } });
      await tx.teamEvent.create({ data: { teamId: membership.teamId, userId: a.id, actorId: a.id, action: "LEFT", note: "Withdrew registration" } });
      if (membership.team.members.length === 1) {
        await tx.team.update({ where: { id: membership.teamId }, data: { status: "DISSOLVED" } });
        await tx.project.updateMany({ where: { teamId: membership.teamId }, data: { status: "WITHDRAWN" } });
      }
    }
    await tx.project.updateMany({ where: { competitionId, ownerId: a.id }, data: { status: "WITHDRAWN" } });
    await tx.registration.update({ where: { id: reg.id }, data: { status: "WITHDRAWN" } });
    await audit({ actorId: a.id, action: "registration.withdrawn", entityType: "Registration", entityId: reg.id, competitionId }, tx);
  });
}

export async function reviewRegistration(actor: Actor | null, registrationId: string, decision: "APPROVED" | "REJECTED" | "WAITLISTED", note?: string) {
  const reg = await db.registration.findUnique({ where: { id: registrationId }, include: { competition: true } });
  if (!reg) throw notFound("Registration");
  await requireCompetitionPermission(actor, reg.competitionId, "registration.review");
  if (reg.status === "WITHDRAWN") throw precondition("This participant withdrew.");
  if (decision === "APPROVED" && reg.competition.isPaid && reg.paymentStatus !== "PAID")
    throw precondition("Verify this participant's entry-fee payment before approving the registration.");
  if (decision === "REJECTED" && !note?.trim()) throw validation("Add a short reason; the participant will see it.", { note: "Required when rejecting." });
  await db.registration.update({
    where: { id: registrationId },
    data: {
      status: decision,
      eligibilityStatus: decision === "APPROVED" ? "ELIGIBLE" : decision === "REJECTED" ? "INELIGIBLE" : "PENDING",
      eligibilityNote: note?.trim() || null,
      reviewedById: actor!.id,
      reviewedAt: new Date(),
    },
  });
  await audit({
    actorId: actor!.id,
    action: `registration.${decision.toLowerCase()}`,
    entityType: "Registration",
    entityId: registrationId,
    competitionId: reg.competitionId,
    meta: { note: note ?? null },
  });
  const titles = { APPROVED: "approved", REJECTED: "not approved", WAITLISTED: "waitlisted" };
  await notify({
    userIds: [reg.userId],
    type: "registration.status",
    title: `Your registration for ${reg.competition.title} was ${titles[decision]}`,
    body: note?.trim() ? `Note from the organizer: ${note.trim()}` : `Your registration status is now: ${titles[decision]}.`,
    link: `/dashboard/competitions/${reg.competition.slug}`,
    email: true,
    dedupeKey: `reg-review:${registrationId}:${decision}:${Date.now()}`,
  });
}

export async function listRegistrations(actor: Actor | null, competitionId: string, filter: { status?: string; q?: string } = {}) {
  await requireCompetitionPermission(actor, competitionId, "registration.review");
  return db.registration.findMany({
    where: {
      competitionId,
      ...(filter.status ? { status: filter.status as never } : {}),
      ...(filter.q ? { user: { OR: [{ name: { contains: filter.q, mode: "insensitive" } }, { email: { contains: filter.q, mode: "insensitive" } }] } } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } }, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}
