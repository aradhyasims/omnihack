// Bank-transfer payments, verified by people (no payment gateway):
//  • Hosting fee — the organizer pays OmniHack's company account and reports the UTR; an OmniHack admin
//    verifies it against the bank statement, which enables the competition (publishing, judges & mentors).
//  • Participation fee — the participant pays the organizer's account and reports the UTR; the organizer
//    verifies it, which confirms the registration.
// Nothing is ever marked paid from what the payer reports alone.
import { z } from "zod";
import { Prisma, type Competition } from "@prisma/client";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireActor, requireCompetitionPermission, requirePlatformAdmin } from "../../authz";
import { conflict, notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { optText, parse, reqText } from "../../validation";
import { HOSTING_FEE } from "@/config/payments";

export const formatInr = (minor: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);

export const isHostingEnabled = (c: Pick<Competition, "hostingFeeStatus">) => c.hostingFeeStatus === "VERIFIED" || c.hostingFeeStatus === "WAIVED";

/** Throws unless OmniHack has verified (or waived) the hosting fee for this competition. */
export async function requireHostingEnabled(competitionId: string) {
  const c = await db.competition.findUnique({ where: { id: competitionId }, select: { hostingFeeStatus: true } });
  if (!c) throw notFound("Competition");
  if (!isHostingEnabled(c))
    throw precondition(
      `Pay the ${formatInr(HOSTING_FEE.amountMinor)} hosting fee first. Judges and mentors can be added once OmniHack verifies the payment (Overview → Hosting fee).`,
    );
}

// ── Shared transfer details ──────────────────────────────────────────────────

const transferSchema = z.object({
  utr: z
    .string({ required_error: "Enter the transaction reference (UTR)." })
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine((v) => /^[A-Z0-9]{6,30}$/.test(v), "Enter the UTR / transaction reference exactly as your bank shows it (6–30 letters and digits)."),
  paidOn: z
    .string({ required_error: "Enter the payment date." })
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter the payment date.")
    .transform((v) => new Date(`${v}T00:00:00Z`))
    .refine((d) => !Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 86_400_000, "The payment date can't be in the future.")
    .refine((d) => d.getTime() >= Date.now() - 366 * 86_400_000, "The payment date must be within the last year."),
  payerName: reqText("Name of the account holder who paid", 2, 120),
  note: optText(500),
});

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const DUPLICATE_UTR = "This transaction reference (UTR) has already been submitted. Check the number, or contact OmniHack support.";

async function competitionOwnerIds(competitionId: string) {
  const owners = await db.competitionMember.findMany({ where: { competitionId, role: "OWNER", status: "ACTIVE" }, select: { userId: true } });
  return owners.map((o) => o.userId);
}

async function platformAdminIds() {
  const admins = await db.user.findMany({ where: { platformRole: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
  return admins.map((a) => a.id);
}

// ── Hosting fee (organizer → OmniHack) ───────────────────────────────────────

export async function submitHostingFee(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "competition.edit");
  const d = parse(transferSchema, input);
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (isHostingEnabled(c)) throw precondition("The hosting fee for this competition is already settled.");
  if (c.hostingFeeStatus === "SUBMITTED") throw precondition("A payment is already awaiting verification. OmniHack will confirm it shortly.");
  try {
    await db.$transaction(async (tx) => {
      const p = await tx.hostingFeePayment.create({
        data: {
          competitionId,
          amountMinor: c.hostingFeeAmountMinor,
          utr: d.utr,
          paidOn: d.paidOn,
          payerName: d.payerName,
          note: d.note,
          submittedById: actor!.id,
        },
      });
      await tx.competition.update({ where: { id: competitionId }, data: { hostingFeeStatus: "SUBMITTED" } });
      await audit(
        {
          actorId: actor!.id,
          action: "hosting_fee.submitted",
          entityType: "HostingFeePayment",
          entityId: p.id,
          competitionId,
          meta: { utr: d.utr, amountMinor: p.amountMinor },
        },
        tx,
      );
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw validation(DUPLICATE_UTR, { utr: "Already submitted." });
    throw e;
  }
  await notify({
    userIds: await platformAdminIds(),
    type: "hosting_fee.submitted",
    title: `Hosting fee to verify: ${c.title}`,
    body: `${d.payerName} reported a ${formatInr(c.hostingFeeAmountMinor)} transfer (UTR ${d.utr}) for "${c.title}". Check the bank statement and enable the competition.`,
    link: "/admin/payments",
    dedupeKey: `hosting-fee:${competitionId}:${d.utr}`,
  });
}

export async function reviewHostingFee(actor: Actor | null, paymentId: string, approve: boolean, note?: string) {
  const admin = requirePlatformAdmin(actor);
  const p = await db.hostingFeePayment.findUnique({ where: { id: paymentId }, include: { competition: { select: { id: true, title: true } } } });
  if (!p) throw notFound("Payment");
  if (p.status !== "SUBMITTED") throw precondition("This payment was already reviewed.");
  if (!approve && !note?.trim()) throw validation("Tell the organizer why the payment couldn't be matched.", { reason: "Required." });
  await db.$transaction(async (tx) => {
    const updated = await tx.hostingFeePayment.updateMany({
      where: { id: paymentId, status: "SUBMITTED" },
      data: { status: approve ? "VERIFIED" : "REJECTED", reviewedById: admin.id, reviewedAt: new Date(), reviewNote: note?.trim() || null },
    });
    if (updated.count !== 1) throw conflict("This payment changed in the meantime. Refresh and try again.");
    await tx.competition.update({ where: { id: p.competitionId }, data: { hostingFeeStatus: approve ? "VERIFIED" : "REJECTED" } });
    await audit(
      {
        actorId: admin.id,
        action: approve ? "hosting_fee.verified" : "hosting_fee.rejected",
        entityType: "HostingFeePayment",
        entityId: paymentId,
        competitionId: p.competitionId,
        meta: { utr: p.utr, amountMinor: p.amountMinor, note: note?.trim() || null },
      },
      tx,
    );
  });
  await notify({
    userIds: await competitionOwnerIds(p.competitionId),
    type: approve ? "hosting_fee.verified" : "hosting_fee.rejected",
    title: approve ? `Payment received — ${p.competition.title} is enabled` : `We couldn't verify the hosting fee for ${p.competition.title}`,
    body: approve
      ? `OmniHack received your ${formatInr(p.amountMinor)} hosting fee (UTR ${p.utr}). You can now publish the competition and add judges and mentors from the mentor directory.`
      : `OmniHack couldn't match UTR ${p.utr}: ${note!.trim()} Please check the details and submit the payment again.`,
    link: `/organizer/competitions/${p.competitionId}`,
    email: true,
  });
}

export async function waiveHostingFee(actor: Actor | null, competitionId: string, reason: string) {
  const admin = requirePlatformAdmin(actor);
  if (!reason?.trim()) throw validation("Record why the fee is waived.", { reason: "Required." });
  const c = await db.competition.findUnique({ where: { id: competitionId } });
  if (!c) throw notFound("Competition");
  if (isHostingEnabled(c)) throw precondition("The hosting fee for this competition is already settled.");
  await db.$transaction(async (tx) => {
    // A transfer that was reported but is now unnecessary stays on record as rejected.
    await tx.hostingFeePayment.updateMany({
      where: { competitionId, status: "SUBMITTED" },
      data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: new Date(), reviewNote: "Fee waived" },
    });
    await tx.competition.update({ where: { id: competitionId }, data: { hostingFeeStatus: "WAIVED" } });
    await audit(
      { actorId: admin.id, action: "hosting_fee.waived", entityType: "Competition", entityId: competitionId, competitionId, meta: { reason: reason.trim() } },
      tx,
    );
  });
  await notify({
    userIds: await competitionOwnerIds(competitionId),
    type: "hosting_fee.waived",
    title: `${c.title} is enabled`,
    body: "OmniHack waived the hosting fee for this competition. You can now publish it and add judges and mentors.",
    link: `/organizer/competitions/${competitionId}`,
    email: true,
  });
}

export async function hostingFeeQueue(actor: Actor | null) {
  requirePlatformAdmin(actor);
  const [submitted, reviewed, unpaid] = await Promise.all([
    db.hostingFeePayment.findMany({
      where: { status: "SUBMITTED" },
      include: { competition: { select: { id: true, title: true, organization: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.hostingFeePayment.findMany({
      where: { status: { not: "SUBMITTED" } },
      include: { competition: { select: { id: true, title: true, organization: { select: { name: true } } } } },
      orderBy: { reviewedAt: "desc" },
      take: 50,
    }),
    db.competition.findMany({
      where: { hostingFeeStatus: { in: ["UNPAID", "REJECTED"] }, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
      select: { id: true, title: true, hostingFeeStatus: true, createdAt: true, organization: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const users = await db.user.findMany({
    where: { id: { in: [...new Set([...submitted, ...reviewed].flatMap((p) => [p.submittedById, p.reviewedById]).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, name: true, email: true },
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  return { submitted, reviewed, unpaid, users: byId };
}

// ── Organizer payee details (participation fee) ──────────────────────────────

export const payeeSchema = z.object({
  payeeAccountName: reqText("Account holder name", 2, 120),
  payeeAccountNumber: z
    .string({ required_error: "Enter the account number." })
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => /^\d{9,18}$/.test(v), "Enter a valid account number (9–18 digits)."),
  payeeIfsc: z
    .string({ required_error: "Enter the IFSC code." })
    .trim()
    .toUpperCase()
    .refine((v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), "Enter a valid 11-character IFSC code, e.g. BARB0VJGABZ."),
  payeeBankName: reqText("Bank name", 2, 120),
  payeeBranch: optText(120),
  payeeUpiId: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(100).optional())
    .refine((v) => !v || /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9.]{1,63}$/.test(v), "Enter a valid UPI ID, e.g. name@okaxis.")
    .transform((v) => v ?? null),
});

// ── Participation fee (participant → organizer) ──────────────────────────────

export async function submitParticipantPayment(actor: Actor | null, competitionId: string, input: unknown) {
  const a = requireActor(actor);
  const d = parse(transferSchema, input);
  const reg = await db.registration.findUnique({ where: { competitionId_userId: { competitionId, userId: a.id } }, include: { competition: true } });
  if (!reg) throw notFound("Registration");
  const c = reg.competition;
  if (!c.isPaid || c.feeAmountMinor <= 0) throw precondition("This competition has no entry fee.");
  if (reg.status === "WITHDRAWN" || reg.status === "REJECTED") throw precondition("This registration is no longer active.");
  if (reg.paymentStatus === "PAID") throw precondition("Your payment is already confirmed.");
  const pending = await db.payment.findFirst({ where: { registrationId: reg.id, status: "PENDING" } });
  if (pending) throw precondition("Your payment is already awaiting the organizer's verification.");
  try {
    await db.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          registrationId: reg.id,
          provider: "BANK_TRANSFER",
          providerRef: d.utr,
          amountMinor: c.feeAmountMinor,
          currency: c.currency,
          status: "PENDING",
          paidOn: d.paidOn,
          payerName: d.payerName,
        },
      });
      await tx.registration.update({ where: { id: reg.id }, data: { paymentStatus: "PENDING" } });
      await audit({ actorId: a.id, action: "payment.submitted", entityType: "Payment", entityId: p.id, competitionId, meta: { utr: d.utr } }, tx);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw validation(DUPLICATE_UTR, { utr: "Already submitted." });
    throw e;
  }
  await notify({
    userIds: await competitionOwnerIds(competitionId),
    type: "payment.submitted",
    title: `Entry fee to verify: ${a.name}`,
    body: `${a.name} reported a ${formatInr(c.feeAmountMinor, c.currency)} transfer (UTR ${d.utr}) for ${c.title}.`,
    link: `/organizer/competitions/${competitionId}/registrations?status=PENDING`,
    dedupeKey: `payment:${reg.id}:${d.utr}`,
  });
}

export async function reviewParticipantPayment(actor: Actor | null, paymentId: string, approve: boolean, note?: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { registration: { include: { competition: true } } } });
  if (!p) throw notFound("Payment");
  const reg = p.registration;
  const c = reg.competition;
  await requireCompetitionPermission(actor, c.id, "registration.review");
  if (p.status !== "PENDING") throw precondition("This payment was already reviewed.");
  if (!approve && !note?.trim()) throw validation("Tell the participant why the payment couldn't be matched.", { reason: "Required." });
  const confirmRegistration = approve && !c.requireRegistrationApproval && reg.status === "PENDING";
  await db.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: { status: approve ? "PAID" : "FAILED", reviewedById: actor!.id, reviewedAt: new Date(), reviewNote: note?.trim() || null },
    });
    if (updated.count !== 1) throw conflict("This payment changed in the meantime. Refresh and try again.");
    await tx.registration.update({
      where: { id: reg.id },
      data: {
        paymentStatus: approve ? "PAID" : "FAILED",
        ...(confirmRegistration ? { status: "APPROVED", eligibilityStatus: "ELIGIBLE", reviewedById: actor!.id, reviewedAt: new Date() } : {}),
      },
    });
    await audit(
      {
        actorId: actor!.id,
        action: approve ? "payment.verified" : "payment.rejected",
        entityType: "Payment",
        entityId: paymentId,
        competitionId: c.id,
        meta: { utr: p.providerRef, registrationId: reg.id, note: note?.trim() || null },
      },
      tx,
    );
  });
  await notify({
    userIds: [reg.userId],
    type: approve ? "payment.verified" : "payment.rejected",
    title: approve ? `Payment confirmed for ${c.title}` : `We couldn't confirm your payment for ${c.title}`,
    body: approve
      ? confirmRegistration
        ? `The organizer confirmed your ${formatInr(p.amountMinor, p.currency)} entry fee. You're registered — set up your team or project next.`
        : `The organizer confirmed your ${formatInr(p.amountMinor, p.currency)} entry fee. They'll review your registration next.`
      : `The organizer couldn't match UTR ${p.providerRef}: ${note!.trim()} Check the details and submit your payment again.`,
    link: `/dashboard/competitions/${c.slug}`,
    email: true,
  });
}
