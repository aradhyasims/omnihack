import type { CertificateCategory } from "@prisma/client";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, getCompetitionAccess, requireActor, requireCompetitionPermission } from "../../authz";
import { forbidden, notFound, precondition, validation } from "../../errors";
import { friendlyCode } from "../../crypto";
import { notify } from "../../notifications/notify";
import { finalJudgedStage } from "../results/service";

type Recipient = { userId: string; name: string; category: CertificateCategory; distinction: string };

async function membersOf(projectIds: string[]) {
  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      owner: { select: { id: true, name: true } },
      team: { select: { members: { select: { user: { select: { id: true, name: true } } } } } },
    },
  });
  return projects.flatMap((p) => [
    ...(p.owner ? [{ projectId: p.id, ...p.owner }] : []),
    ...(p.team?.members.map((m) => ({ projectId: p.id, ...m.user })) ?? []),
  ]);
}

/** Determine who is entitled to each certificate category from recorded data. */
export async function eligibleRecipients(competitionId: string, categories: CertificateCategory[]): Promise<Recipient[]> {
  const out: Recipient[] = [];
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (categories.includes("PARTICIPANT")) {
    const projects = await db.project.findMany({
      where: { competitionId, status: "ACTIVE", submissions: { some: { status: "SUBMITTED" } } },
      select: { id: true },
    });
    const members = await membersOf(projects.map((p) => p.id));
    const approved = new Set((await db.registration.findMany({ where: { competitionId, status: "APPROVED" }, select: { userId: true } })).map((r) => r.userId));
    for (const m of members) if (approved.has(m.id)) out.push({ userId: m.id, name: m.name, category: "PARTICIPANT", distinction: "" });
  }
  if (categories.includes("FINALIST") || categories.includes("WINNER")) {
    if (c.resultsStatus !== "PUBLISHED") throw precondition("Publish results before issuing finalist or winner certificates.");
  }
  if (categories.includes("FINALIST")) {
    const stage = await finalJudgedStage(competitionId);
    if (stage) {
      const rows = await db.stageResult.findMany({ where: { stageId: stage.id, decision: { not: "DISQUALIFIED" } }, select: { projectId: true } });
      for (const m of await membersOf(rows.map((r) => r.projectId))) out.push({ userId: m.id, name: m.name, category: "FINALIST", distinction: "" });
    }
  }
  if (categories.includes("WINNER")) {
    const winners = await db.awardWinner.findMany({ where: { prize: { competitionId } }, include: { prize: true } });
    for (const w of winners) {
      for (const m of await membersOf([w.projectId])) out.push({ userId: m.id, name: m.name, category: "WINNER", distinction: w.prize.title });
    }
  }
  const staffMap: [CertificateCategory, ("JUDGE" | "MENTOR" | "VOLUNTEER" | "OWNER" | "OPS_COORDINATOR")[]][] = [
    ["JUDGE", ["JUDGE"]],
    ["MENTOR", ["MENTOR"]],
    ["VOLUNTEER", ["VOLUNTEER"]],
    ["ORGANIZER", ["OWNER", "OPS_COORDINATOR"]],
  ];
  for (const [cat, roles] of staffMap) {
    if (!categories.includes(cat)) continue;
    const members = await db.competitionMember.findMany({
      where: { competitionId, status: "ACTIVE", role: { in: roles } },
      include: { user: { select: { id: true, name: true } } },
    });
    const seen = new Set<string>();
    for (const m of members) {
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      out.push({ userId: m.userId, name: m.user.name, category: cat, distinction: "" });
    }
  }
  return out;
}

/** Bulk issue. Idempotent: existing (non-revoked) certificates for the same recipient/category are kept. */
export async function issueCertificates(actor: Actor | null, competitionId: string, categories: CertificateCategory[]) {
  await requireCompetitionPermission(actor, competitionId, "certificate.issue");
  if (!categories.length) throw validation("Choose at least one certificate category.");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const needsEventEnd = categories.some((k) => k === "PARTICIPANT" || k === "MENTOR" || k === "JUDGE" || k === "VOLUNTEER" || k === "ORGANIZER");
  if (needsEventEnd && c.resultsStatus !== "PUBLISHED" && (!c.endsAt || c.endsAt > new Date())) {
    throw precondition("Certificates can be issued after the event ends or results are published.");
  }
  const recipients = await eligibleRecipients(competitionId, categories);
  let issued = 0;
  const notifyIds = new Set<string>();
  for (const r of recipients) {
    const existing = await db.certificate.findUnique({
      where: { competitionId_userId_category_distinction: { competitionId, userId: r.userId, category: r.category, distinction: r.distinction } },
    });
    if (existing) continue;
    await db.certificate.create({
      data: {
        code: friendlyCode("OH"),
        competitionId,
        userId: r.userId,
        recipientName: r.name,
        category: r.category,
        distinction: r.distinction,
        issuedById: actor!.id,
      },
    });
    issued++;
    notifyIds.add(r.userId);
  }
  await audit({
    actorId: actor!.id,
    action: "certificates.issued",
    entityType: "Competition",
    entityId: competitionId,
    competitionId,
    meta: { categories, issued },
  });
  await notify({
    userIds: [...notifyIds],
    type: "certificate.available",
    title: `Your certificate for ${c.title} is ready`,
    body: `A verifiable certificate for ${c.title} is now available in your dashboard.`,
    link: "/dashboard/certificates",
    email: true,
    dedupeKey: `cert:${competitionId}:${categories.sort().join(",")}`,
  });
  return { issued, eligible: recipients.length };
}

export async function revokeCertificate(actor: Actor | null, certificateId: string, reason: string) {
  const cert = await db.certificate.findUnique({ where: { id: certificateId } });
  if (!cert) throw notFound("Certificate");
  await requireCompetitionPermission(actor, cert.competitionId, "certificate.issue");
  if (!reason.trim()) throw validation("A reason is required to revoke a certificate.", { reason: "Required." });
  if (cert.revokedAt) throw precondition("Already revoked.");
  await db.certificate.update({ where: { id: certificateId }, data: { revokedAt: new Date(), revokedReason: reason.trim().slice(0, 300) } });
  await audit({
    actorId: actor!.id,
    action: "certificate.revoked",
    entityType: "Certificate",
    entityId: certificateId,
    competitionId: cert.competitionId,
    meta: { reason },
  });
}

/** Reissue: revokes the old certificate and creates a new code with the recipient's current name. */
export async function reissueCertificate(actor: Actor | null, certificateId: string) {
  const cert = await db.certificate.findUnique({ where: { id: certificateId }, include: { user: true } });
  if (!cert) throw notFound("Certificate");
  await requireCompetitionPermission(actor, cert.competitionId, "certificate.issue");
  const created = await db.$transaction(async (tx) => {
    await tx.certificate.update({
      where: { id: certificateId },
      data: {
        revokedAt: cert.revokedAt ?? new Date(),
        revokedReason: cert.revokedReason ?? "Reissued",
        distinction: `${cert.distinction}#replaced-${cert.code}`,
      },
    });
    const n = await tx.certificate.create({
      data: {
        code: friendlyCode("OH"),
        competitionId: cert.competitionId,
        userId: cert.userId,
        recipientName: cert.user.name,
        category: cert.category,
        distinction: cert.distinction,
        issuedById: actor!.id,
        replacesId: cert.id,
      },
    });
    await audit(
      {
        actorId: actor!.id,
        action: "certificate.reissued",
        entityType: "Certificate",
        entityId: n.id,
        competitionId: cert.competitionId,
        meta: { replaces: cert.code },
      },
      tx,
    );
    return n;
  });
  return created;
}

/** Public verification. Returns minimal information only (no email or other personal data). */
export async function verifyCertificate(codeRaw: string) {
  const code = codeRaw.trim().toUpperCase();
  if (!/^OH(-[2-9A-Z]{4}){3}$/.test(code)) return null;
  const cert = await db.certificate.findUnique({
    where: { code },
    include: { competition: { select: { title: true, slug: true, type: true, organization: { select: { name: true } }, visibility: true } } },
  });
  if (!cert) return null;
  await db.certificate.update({ where: { id: cert.id }, data: { verifications: { increment: 1 } } });
  return {
    code: cert.code,
    valid: !cert.revokedAt,
    revokedAt: cert.revokedAt,
    recipientName: cert.recipientName,
    category: cert.category,
    distinction: cert.distinction.split("#replaced-")[0],
    issuedAt: cert.issuedAt,
    competition: {
      title: cert.competition.title,
      slug: cert.competition.visibility === "PUBLIC" ? cert.competition.slug : null,
      type: cert.competition.type,
      organizer: cert.competition.organization.name,
    },
  };
}

export async function getCertificateForDownload(actor: Actor | null, code: string) {
  const a = requireActor(actor);
  const cert = await db.certificate.findUnique({
    where: { code },
    include: { competition: { include: { organization: true, certificateTemplate: true } } },
  });
  if (!cert) throw notFound("Certificate");
  if (cert.userId !== a.id) {
    const access = await getCompetitionAccess(a, cert.competitionId);
    if (!access.permissions.has("certificate.issue")) throw forbidden();
  }
  return cert;
}

export async function upsertTemplate(
  actor: Actor | null,
  competitionId: string,
  input: { heading: string; bodyText: string; signatoryName: string; signatoryTitle: string; accentColor: string },
) {
  await requireCompetitionPermission(actor, competitionId, "certificate.issue");
  if (!/^#[0-9a-fA-F]{6}$/.test(input.accentColor)) throw validation("Use a hex colour like #4F46E5.", { accentColor: "Invalid colour." });
  const data = {
    heading: input.heading.trim().slice(0, 80) || "Certificate of Achievement",
    bodyText: input.bodyText.trim().slice(0, 400),
    signatoryName: input.signatoryName.trim().slice(0, 80),
    signatoryTitle: input.signatoryTitle.trim().slice(0, 80),
    accentColor: input.accentColor,
  };
  await db.certificateTemplate.upsert({ where: { competitionId }, create: { competitionId, ...data }, update: data });
}
