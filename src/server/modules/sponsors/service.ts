// Sponsor management. A sponsor appears publicly only once the organizer marks the relationship
// as confirmed. Sponsor contact details are visible only to users with sponsor.manage.
import { z } from "zod";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireActor, getCompetitionAccess, requireCompetitionPermission } from "../../authz";
import { forbidden, notFound, validation } from "../../errors";
import { checkbox, optEmail, optText, optUrl, parse, reqText } from "../../validation";
import { slugify } from "../competitions/lifecycle";

const sponsorSchema = z.object({
  name: reqText("Sponsor name", 2, 120),
  website: optUrl,
  description: optText(1000),
  contactName: optText(120),
  contactEmail: optEmail,
  tier: reqText("Tier", 2, 40),
  benefits: optText(1000),
  confirmed: checkbox,
});

export async function addSponsor(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "sponsor.manage");
  const d = parse(sponsorSchema, input);
  const base = slugify(d.name) || "sponsor";
  let sponsor = await db.sponsor.findFirst({ where: { name: { equals: d.name, mode: "insensitive" } } });
  if (!sponsor) {
    let slug = base;
    for (let i = 2; await db.sponsor.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    sponsor = await db.sponsor.create({
      data: { name: d.name, slug, website: d.website, description: d.description ?? "", contactName: d.contactName, contactEmail: d.contactEmail },
    });
  } else {
    sponsor = await db.sponsor.update({
      where: { id: sponsor.id },
      data: {
        website: d.website ?? sponsor.website,
        description: d.description ?? sponsor.description,
        contactName: d.contactName ?? sponsor.contactName,
        contactEmail: d.contactEmail ?? sponsor.contactEmail,
      },
    });
  }
  const link = await db.competitionSponsor.upsert({
    where: { competitionId_sponsorId: { competitionId, sponsorId: sponsor.id } },
    create: { competitionId, sponsorId: sponsor.id, tier: d.tier, benefits: d.benefits ?? "", confirmed: d.confirmed },
    update: { tier: d.tier, benefits: d.benefits ?? "", confirmed: d.confirmed },
  });
  await audit({
    actorId: actor!.id,
    action: "sponsor.saved",
    entityType: "CompetitionSponsor",
    entityId: link.id,
    competitionId,
    meta: { sponsor: sponsor.name, confirmed: d.confirmed },
  });
  return link;
}

export async function setSponsorConfirmed(actor: Actor | null, linkId: string, confirmed: boolean) {
  const link = await db.competitionSponsor.findUnique({ where: { id: linkId } });
  if (!link) throw notFound("Sponsor");
  await requireCompetitionPermission(actor, link.competitionId, "sponsor.manage");
  await db.competitionSponsor.update({ where: { id: linkId }, data: { confirmed } });
  await audit({
    actorId: actor!.id,
    action: confirmed ? "sponsor.confirmed" : "sponsor.unconfirmed",
    entityType: "CompetitionSponsor",
    entityId: linkId,
    competitionId: link.competitionId,
  });
}

export async function removeSponsor(actor: Actor | null, linkId: string) {
  const link = await db.competitionSponsor.findUnique({ where: { id: linkId } });
  if (!link) throw notFound("Sponsor");
  await requireCompetitionPermission(actor, link.competitionId, "sponsor.manage");
  await db.$transaction([
    db.prize.updateMany({ where: { competitionId: link.competitionId, sponsorId: link.sponsorId }, data: { sponsorId: null } }),
    db.competitionSponsor.delete({ where: { id: linkId } }),
  ]);
  await audit({ actorId: actor!.id, action: "sponsor.removed", entityType: "CompetitionSponsor", entityId: linkId, competitionId: link.competitionId });
}

/** Attach a sponsor to a prize (sponsor awards). Only sponsors linked to the competition can be used. */
export async function setPrizeSponsor(actor: Actor | null, prizeId: string, sponsorId: string | null) {
  const prize = await db.prize.findUnique({ where: { id: prizeId } });
  if (!prize) throw notFound("Prize");
  await requireCompetitionPermission(actor, prize.competitionId, "sponsor.manage");
  if (sponsorId && !(await db.competitionSponsor.findUnique({ where: { competitionId_sponsorId: { competitionId: prize.competitionId, sponsorId } } }))) {
    throw validation("Add this sponsor to the competition first.");
  }
  await db.prize.update({ where: { id: prizeId }, data: { sponsorId } });
}

/** Staff view (includes contact details) — requires sponsor.manage or sponsor.report_view. */
export async function sponsorWorkspace(actor: Actor | null, competitionId: string) {
  const a = requireActor(actor);
  const access = await getCompetitionAccess(a, competitionId);
  const canManage = access.permissions.has("sponsor.manage");
  if (!canManage && !access.permissions.has("sponsor.report_view")) throw forbidden();
  const [links, prizes] = await Promise.all([
    db.competitionSponsor.findMany({ where: { competitionId }, include: { sponsor: true }, orderBy: { tier: "asc" } }),
    db.prize.findMany({ where: { competitionId }, orderBy: { order: "asc" }, include: { winners: { include: { project: { select: { title: true } } } } } }),
  ]);
  return {
    canManage,
    links: links.map((l) => ({ ...l, sponsor: canManage ? l.sponsor : { ...l.sponsor, contactName: null, contactEmail: null } })),
    prizes,
    report: await sponsorReport(competitionId),
  };
}

/** Aggregate-only report shared with sponsor representatives: no personal data. */
export async function sponsorReport(competitionId: string) {
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId }, select: { resultsStatus: true } });
  const [registrations, approved, institutions, teams, projects, submissions, attendance] = await Promise.all([
    db.registration.count({ where: { competitionId, status: { not: "WITHDRAWN" } } }),
    db.registration.count({ where: { competitionId, status: "APPROVED" } }),
    db.registration.groupBy({ by: ["institution"], where: { competitionId, institution: { not: null } }, _count: { _all: true } }),
    db.team.count({ where: { competitionId, status: { in: ["FORMING", "LOCKED"] } } }),
    db.project.count({ where: { competitionId, status: "ACTIVE" } }),
    db.submission.count({ where: { stage: { competitionId }, status: "SUBMITTED" } }),
    db.attendance.count({ where: { competitionId, scopeKey: "EVENT" } }),
  ]);
  const sponsoredWinners =
    c.resultsStatus === "PUBLISHED"
      ? await db.awardWinner.findMany({
          where: { prize: { competitionId, sponsorId: { not: null } } },
          select: { prize: { select: { title: true, sponsorId: true } }, project: { select: { title: true } } },
        })
      : [];
  return {
    registrations,
    approved,
    institutions: institutions.length,
    teams,
    projects,
    submissions,
    attendance,
    sponsoredWinners,
    resultsPublished: c.resultsStatus === "PUBLISHED",
  };
}
