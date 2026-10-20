// Placement & recruitment through competitions.
//
// Principles (documented in docs/SECURITY.md and docs/RECRUITMENT.md):
//  - Participants opt in per competition (TalentConsent); nothing is shared without it, and
//    withdrawing hides the profile immediately, deletes the CV and closes open applications.
//  - Only adults (18+) can opt in. Recruiters never see judging scores or judge comments; a coarse
//    rank band ("Top 10%") and awards are shown only after results are officially published.
//  - Recruiters see their own company's pipeline only; owners see all companies.
//  - Every profile view, shortlist and status change is audited; candidates are notified.
import crypto from "node:crypto";
import { z } from "zod";
import type { ApplicationStatus, OpeningType, Prisma } from "@prisma/client";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, getCompetitionAccess, isPlatformAdmin, requireActor, requireCompetitionPermission } from "../../authz";
import { conflict, forbidden, notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { checkbox, csvList, optText, parse, reqText, zonedDate } from "../../validation";
import { storage } from "../../storage";
import { validateUpload } from "../../storage/validate";
import { scannerEnabled } from "../../storage/scanner";
import { enqueueJob } from "../../jobs/queue";
import { signPayload } from "../../crypto";
import { finalJudgedStage } from "../results/service";
import { zonedLocalToUtc } from "@/lib/time";

export const OPENING_TYPE_LABEL: Record<OpeningType, string> = {
  INTERNSHIP: "Internship",
  FULL_TIME: "Full-time",
  PRE_PLACEMENT_OFFER: "Pre-placement offer",
  CONTRACT: "Contract",
};

const FINAL: ApplicationStatus[] = ["OFFER_ACCEPTED", "OFFER_DECLINED", "NOT_SELECTED", "WITHDRAWN"];
const RESPONSE_SLA_DAYS = 14;

// ── Settings & openings ────────────────────────────────────────────────────────

export async function updateHiringSettings(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "hiring.manage");
  const d = parse(z.object({ hiringEnabled: checkbox, showRankBandToRecruiters: checkbox, hiringNote: optText(1000) }), input);
  await db.competition.update({ where: { id: competitionId }, data: d });
  await audit({ actorId: actor!.id, action: "hiring.settings_updated", entityType: "Competition", entityId: competitionId, competitionId, meta: d });
}

/** Company a recruiter acts for (null for owners/admins, who may act for any company). */
async function recruiterCompany(actor: Actor, competitionId: string): Promise<string | null> {
  if (isPlatformAdmin(actor)) return null;
  const access = await getCompetitionAccess(actor, competitionId);
  const ownerLike = access.orgRole === "OWNER" || access.orgRole === "COORDINATOR" || access.roles.includes("OWNER");
  if (ownerLike) return null;
  const m = await db.competitionMember.findFirst({ where: { competitionId, userId: actor.id, role: "RECRUITER", status: "ACTIVE" } });
  if (!m) throw forbidden();
  if (!m.company) throw precondition("Your recruiter profile has no company set. Ask the organizer to add it on the People page.");
  return m.company;
}

export async function upsertOpening(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "hiring.manage");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const d = parse(
    z.object({
      id: z.string().optional(),
      company: optText(120),
      title: reqText("Role title", 2, 120),
      type: z.enum(["INTERNSHIP", "FULL_TIME", "PRE_PLACEMENT_OFFER", "CONTRACT"]),
      workMode: z.enum(["ONSITE", "REMOTE", "HYBRID"]),
      locations: csvList,
      skills: csvList,
      description: optText(4000),
      compensation: optText(120),
      durationText: optText(60),
      positions: z.coerce.number().int().min(1).max(500).default(1),
      closesAt: zonedDate(c.timezone),
      active: checkbox,
    }),
    input,
  );
  const forced = await recruiterCompany(actor!, competitionId);
  const company = forced ?? d.company;
  if (!company) throw validation("Enter the hiring company.", { company: "Required." });
  const data = {
    company,
    title: d.title,
    type: d.type,
    workMode: d.workMode,
    locations: d.locations,
    skills: d.skills.map((s) => s.toLowerCase()),
    description: d.description ?? "",
    compensation: d.compensation,
    durationText: d.durationText,
    positions: d.positions,
    closesAt: d.closesAt,
    active: d.active,
  };
  if (d.id) {
    const existing = await db.jobOpening.findFirst({ where: { id: d.id, competitionId } });
    if (!existing) throw notFound("Opening");
    if (forced && existing.company !== forced) throw forbidden("You can only edit your company's openings.");
    await db.jobOpening.update({ where: { id: d.id }, data });
  } else {
    await db.jobOpening.create({ data: { ...data, competitionId, createdById: actor!.id } });
  }
  await audit({
    actorId: actor!.id,
    action: "hiring.opening_saved",
    entityType: "JobOpening",
    entityId: d.id ?? null,
    competitionId,
    meta: { title: d.title, company },
  });
}

export async function deleteOpening(actor: Actor | null, openingId: string) {
  const o = await db.jobOpening.findUnique({ where: { id: openingId } });
  if (!o) throw notFound("Opening");
  await requireCompetitionPermission(actor, o.competitionId, "hiring.manage");
  const forced = await recruiterCompany(actor!, o.competitionId);
  if (forced && o.company !== forced) throw forbidden("You can only remove your company's openings.");
  const apps = await db.candidateApplication.count({ where: { openingId } });
  if (apps) await db.jobOpening.update({ where: { id: openingId }, data: { active: false } });
  else await db.jobOpening.delete({ where: { id: openingId } });
  await audit({
    actorId: actor!.id,
    action: apps ? "hiring.opening_closed" : "hiring.opening_deleted",
    entityType: "JobOpening",
    entityId: openingId,
    competitionId: o.competitionId,
  });
}

/** Openings shown publicly (competition published, public, hiring enabled, opening active and not closed). */
export function publicOpeningWhere(now = new Date()): Prisma.JobOpeningWhereInput {
  return {
    active: true,
    OR: [{ closesAt: null }, { closesAt: { gt: now } }],
    competition: { hiringEnabled: true, visibility: "PUBLIC", status: { in: ["PUBLISHED", "COMPLETED"] } },
  };
}

export async function competitionOpenings(competitionId: string) {
  return db.jobOpening.findMany({ where: { ...publicOpeningWhere(), competitionId }, orderBy: [{ company: "asc" }, { createdAt: "asc" }] });
}

/** All openings (incl. inactive) for the hiring console; recruiters see their company's only. */
export async function managedOpenings(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "hiring.manage");
  const company = await recruiterCompany(actor!, competitionId);
  return db.jobOpening.findMany({
    where: { competitionId, ...(company ? { company } : {}) },
    include: { _count: { select: { applications: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
}

/** The company the current user recruits for in this competition (null for owners/admins). */
export async function actingCompany(actor: Actor | null, competitionId: string) {
  return recruiterCompany(requireActor(actor), competitionId);
}

export async function listPublicOpenings(f: { q?: string; type?: string; workMode?: string; page?: number }) {
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.JobOpeningWhereInput = {
    AND: [
      publicOpeningWhere(),
      f.type && f.type in OPENING_TYPE_LABEL ? { type: f.type as OpeningType } : {},
      f.workMode && ["ONSITE", "REMOTE", "HYBRID"].includes(f.workMode) ? { workMode: f.workMode as never } : {},
      f.q
        ? {
            OR: [
              { title: { contains: f.q, mode: "insensitive" } },
              { company: { contains: f.q, mode: "insensitive" } },
              { skills: { has: f.q.toLowerCase() } },
              { locations: { has: f.q } },
            ],
          }
        : {},
    ],
  };
  const [total, items] = await Promise.all([
    db.jobOpening.count({ where }),
    db.jobOpening.findMany({
      where,
      include: { competition: { select: { title: true, slug: true, type: true, registrationClosesAt: true, timezone: true, isDemo: true, status: true } } },
      orderBy: [{ closesAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * 12,
      take: 12,
    }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / 12)), items };
}

// ── Participant consent ────────────────────────────────────────────────────────

export async function getConsent(userId: string, competitionId: string) {
  return db.talentConsent.findUnique({ where: { competitionId_userId: { competitionId, userId } } });
}

export async function giveConsent(actor: Actor | null, competitionId: string, input: unknown, resume: File | null) {
  const a = requireActor(actor);
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (!c.hiringEnabled) throw precondition("This competition is not running a hiring programme.");
  const reg = await db.registration.findUnique({ where: { competitionId_userId: { competitionId, userId: a.id } } });
  if (!reg || reg.status !== "APPROVED") throw precondition("You need an approved registration before joining the talent pool.");
  const d = parse(
    z.object({
      roleInterests: z.preprocess(
        (v) => (Array.isArray(v) ? v : v ? [v] : []),
        z.array(z.enum(["INTERNSHIP", "FULL_TIME", "PRE_PLACEMENT_OFFER", "CONTRACT"])).min(1, "Choose at least one opportunity type."),
      ),
      preferredLocations: csvList,
      availableFrom: zonedDate(c.timezone),
      graduationYear: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(1990).max(2100).optional()),
      sharePortfolio: checkbox,
      adultConfirmed: z.preprocess(
        (v) => v === "on" || v === true,
        z.literal(true, { errorMap: () => ({ message: "Only participants aged 18 or over can join the talent pool." }) }),
      ),
      consent: z.preprocess(
        (v) => v === "on" || v === true,
        z.literal(true, { errorMap: () => ({ message: "Please confirm that hiring partners may view your profile." }) }),
      ),
    }),
    input,
  );
  const age = Number((reg.answers as Record<string, unknown>)?.__age);
  if (Number.isFinite(age) && age < 18) throw precondition("Only participants aged 18 or over can join the talent pool.");

  const existing = await getConsent(a.id, competitionId);
  let resumeKey = existing && !existing.withdrawnAt ? existing.resumeKey : null;
  let resumeName = existing && !existing.withdrawnAt ? existing.resumeName : null;
  let newKey: string | null = null;
  if (resume && resume.size > 0) {
    const buf = Buffer.from(await resume.arrayBuffer());
    const check = validateUpload(resume.name, buf, 5 * 1024 * 1024);
    if (!check.ok || check.ext !== "pdf") throw validation("Upload your CV as a PDF up to 5 MB.", { resume: check.ok ? "PDF only." : check.error });
    newKey = `talent/${competitionId}/${a.id}/${crypto.randomUUID()}`;
    await storage().put(newKey, buf, "application/pdf");
  }
  const oldKey = newKey ? resumeKey : null;
  if (newKey) {
    resumeKey = newKey;
    resumeName = resume!.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
  }
  const data = {
    roleInterests: d.roleInterests,
    preferredLocations: d.preferredLocations,
    availableFrom: d.availableFrom,
    graduationYear: d.graduationYear ?? null,
    sharePortfolio: d.sharePortfolio,
    adultConfirmed: true,
    resumeKey,
    resumeName,
    ...(newKey ? { resumeScanStatus: scannerEnabled() ? ("PENDING" as const) : ("NOT_SCANNED" as const) } : {}),
    withdrawnAt: null,
  };
  const consent = await db.talentConsent.upsert({
    where: { competitionId_userId: { competitionId, userId: a.id } },
    create: { ...data, competitionId, userId: a.id },
    update: { ...data, ...(existing?.withdrawnAt ? { consentedAt: new Date() } : {}) },
  });
  if (oldKey)
    await storage()
      .delete(oldKey)
      .catch(() => {});
  if (newKey && scannerEnabled()) await enqueueJob("resume.scan", { consentId: consent.id });
  await audit({
    actorId: a.id,
    action: "talent.consent_given",
    entityType: "TalentConsent",
    entityId: consent.id,
    competitionId,
    meta: { roleInterests: d.roleInterests, sharePortfolio: d.sharePortfolio },
  });
  return consent;
}

export async function withdrawConsent(actor: Actor | null, competitionId: string) {
  const a = requireActor(actor);
  const consent = await getConsent(a.id, competitionId);
  if (!consent || consent.withdrawnAt) throw notFound("Talent-pool membership");
  const open = await db.candidateApplication.findMany({ where: { competitionId, candidateId: a.id, status: { notIn: FINAL } } });
  await db.$transaction(async (tx) => {
    await tx.talentConsent.update({ where: { id: consent.id }, data: { withdrawnAt: new Date(), resumeKey: null, resumeName: null } });
    for (const app of open) {
      await tx.candidateApplication.update({ where: { id: app.id }, data: { status: "WITHDRAWN" } });
      await tx.applicationEvent.create({
        data: { applicationId: app.id, fromStatus: app.status, toStatus: "WITHDRAWN", actorId: a.id, note: "Candidate withdrew talent-pool consent" },
      });
    }
    await audit(
      {
        actorId: a.id,
        action: "talent.consent_withdrawn",
        entityType: "TalentConsent",
        entityId: consent.id,
        competitionId,
        meta: { closedApplications: open.length },
      },
      tx,
    );
  });
  if (consent.resumeKey)
    await storage()
      .delete(consent.resumeKey)
      .catch(() => {});
  if (open.length) {
    await notify({
      userIds: [...new Set(open.map((o) => o.recruiterId))],
      type: "talent.candidate_withdrew",
      title: "A candidate left the talent pool",
      body: "A candidate in your pipeline withdrew consent. Their profile is no longer available and open applications were closed.",
      link: `/organizer/competitions/${competitionId}/hiring`,
    });
  }
}

// ── Recruiter: talent pool & candidate profiles ─────────────────────────────────

type RankInfo = { band: string | null; awards: string[] };

/** Coarse, published-only signal: never scores or comments. */
async function rankInfo(competitionId: string, projectIds: string[]): Promise<Map<string, RankInfo>> {
  const out = new Map<string, RankInfo>();
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (c.resultsStatus !== "PUBLISHED") return out;
  const stage = await finalJudgedStage(competitionId);
  const results = stage ? await db.stageResult.findMany({ where: { stageId: stage.id, rank: { not: null } } }) : [];
  const total = results.length;
  const awards = await db.awardWinner.findMany({
    where: { projectId: { in: projectIds }, prize: { competitionId } },
    include: { prize: { select: { title: true } } },
  });
  for (const pid of projectIds) {
    const r = results.find((x) => x.projectId === pid);
    let band: string | null = null;
    if (c.showRankBandToRecruiters && r?.rank && total) {
      const pct = r.rank / total;
      band = pct <= 0.1 ? "Top 10%" : pct <= 0.25 ? "Top 25%" : pct <= 0.5 ? "Top 50%" : "Finalist";
    }
    out.set(pid, { band, awards: awards.filter((w) => w.projectId === pid).map((w) => w.prize.title) });
  }
  return out;
}

async function projectOf(competitionId: string, userId: string) {
  const m = await db.teamMembership.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    include: { team: { include: { project: true } } },
  });
  if (m?.team.project) return { project: m.team.project, teamName: m.team.name };
  const solo = await db.project.findFirst({ where: { competitionId, ownerId: userId, status: { not: "WITHDRAWN" } } });
  return solo ? { project: solo, teamName: null } : null;
}

export type PoolFilters = { q?: string; type?: string; band?: string; status?: string };

export async function talentPool(actor: Actor | null, competitionId: string, f: PoolFilters = {}) {
  await requireCompetitionPermission(actor, competitionId, "talent.view");
  const company = await recruiterCompany(actor!, competitionId);
  const consents = await db.talentConsent.findMany({
    where: {
      competitionId,
      withdrawnAt: null,
      ...(f.type ? { roleInterests: { has: f.type } } : {}),
      ...(f.q
        ? {
            user: {
              OR: [
                { name: { contains: f.q, mode: "insensitive" } },
                { skills: { has: f.q.toLowerCase() } },
                { institution: { contains: f.q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    include: { user: { select: { id: true, name: true, headline: true, skills: true, institution: true, country: true } } },
    orderBy: { consentedAt: "asc" },
  });
  const projects = await Promise.all(consents.map((c) => projectOf(competitionId, c.userId)));
  const ranks = await rankInfo(
    competitionId,
    projects.filter((p) => p).map((p) => p!.project.id),
  );
  const apps = await db.candidateApplication.findMany({
    where: { competitionId, candidateId: { in: consents.map((c) => c.userId) }, ...(company ? { company } : {}) },
  });
  const rows = consents.map((c, i) => {
    const p = projects[i];
    const r = p ? ranks.get(p.project.id) : undefined;
    return {
      userId: c.userId,
      name: c.user.name,
      headline: c.user.headline,
      skills: c.user.skills,
      institution: c.user.institution,
      country: c.user.country,
      roleInterests: c.roleInterests,
      preferredLocations: c.preferredLocations,
      availableFrom: c.availableFrom,
      graduationYear: c.graduationYear,
      hasResume: Boolean(c.resumeKey),
      project: p ? { id: p.project.id, title: p.project.title, team: p.teamName, showcase: p.project.showcaseStatus === "PUBLISHED" } : null,
      rankBand: r?.band ?? null,
      awards: r?.awards ?? [],
      applications: apps.filter((x) => x.candidateId === c.userId).map((x) => ({ id: x.id, status: x.status, company: x.company, openingId: x.openingId })),
    };
  });
  return rows.filter(
    (r) =>
      (!f.band || r.rankBand === f.band || (f.band === "awarded" && r.awards.length > 0)) &&
      (!f.status || (f.status === "none" ? r.applications.length === 0 : r.applications.some((x) => x.status === f.status))),
  );
}

export async function candidateProfile(actor: Actor | null, competitionId: string, userId: string) {
  await requireCompetitionPermission(actor, competitionId, "talent.view");
  const company = await recruiterCompany(actor!, competitionId);
  const consent = await getConsent(userId, competitionId);
  if (!consent || consent.withdrawnAt) throw notFound("Candidate");
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      headline: true,
      bio: true,
      skills: true,
      institution: true,
      country: true,
      githubUrl: true,
      linkedinUrl: true,
    },
  });
  const p = await projectOf(competitionId, userId);
  const rank = p ? (await rankInfo(competitionId, [p.project.id])).get(p.project.id) : undefined;
  const apps = await db.candidateApplication.findMany({
    where: { competitionId, candidateId: userId, ...(company ? { company } : {}) },
    include: { opening: { select: { title: true, type: true } }, events: { orderBy: { createdAt: "asc" } } },
  });
  const certificates = await db.certificate.findMany({
    where: { competitionId, userId, revokedAt: null },
    select: { code: true, category: true, distinction: true },
  });
  const submissions =
    consent.sharePortfolio && p
      ? await db.submission.findMany({
          where: { projectId: p.project.id, status: "SUBMITTED" },
          include: {
            stage: { select: { name: true, order: true, submissionTemplate: true, submissionFields: true } },
            attachments: { where: { deletedAt: null, scanStatus: { in: ["CLEAN", "NOT_SCANNED"] } } },
          },
          orderBy: { stage: { order: "asc" } },
        })
      : [];
  await audit({ actorId: actor!.id, action: "talent.profile_viewed", entityType: "User", entityId: userId, competitionId, meta: { company } });
  return {
    consent,
    // Contact details are released once this company has the candidate in its pipeline.
    user: { ...user, email: apps.length ? user.email : null },
    project: p ? { ...p.project, team: p.teamName } : null,
    rankBand: rank?.band ?? null,
    awards: rank?.awards ?? [],
    certificates,
    submissions,
    applications: apps,
    resumeUrl: consent.resumeKey && consent.resumeScanStatus !== "INFECTED" && consent.resumeScanStatus !== "PENDING" ? signedResumeUrl(consent.id) : null,
    resumePending: consent.resumeScanStatus === "PENDING",
  };
}

export function signedResumeUrl(consentId: string, ttlSeconds = 600) {
  const { exp, sig } = signPayload(`resume:${consentId}`, ttlSeconds);
  return `/api/v1/talent/resume/${consentId}?exp=${exp}&sig=${sig}`;
}

/** Authorization for CV download: talent.view on the competition and active consent. */
export async function resumeForDownload(actor: Actor | null, consentId: string) {
  const consent = await db.talentConsent.findUnique({ where: { id: consentId } });
  if (!consent || consent.withdrawnAt || !consent.resumeKey) throw notFound("CV");
  const own = actor?.id === consent.userId;
  if (!own) await requireCompetitionPermission(actor, consent.competitionId, "talent.view");
  if (consent.resumeScanStatus === "PENDING") throw precondition("The CV is still being scanned for malware.");
  if (consent.resumeScanStatus === "INFECTED") throw forbidden("The CV failed the malware scan.");
  if (!own)
    await audit({
      actorId: actor!.id,
      action: "talent.resume_downloaded",
      entityType: "TalentConsent",
      entityId: consentId,
      competitionId: consent.competitionId,
    });
  return consent;
}

/** Recruiters with talent.view may read a consenting candidate's project (sharePortfolio). */
export async function recruiterCanViewProject(actor: Actor, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { competitionId: true, ownerId: true, team: { select: { members: { select: { userId: true } } } } },
  });
  if (!project) return false;
  const access = await getCompetitionAccess(actor, project.competitionId);
  if (!access.permissions.has("talent.view")) return false;
  const members = [...(project.ownerId ? [project.ownerId] : []), ...(project.team?.members.map((m) => m.userId) ?? [])];
  return (
    (await db.talentConsent.count({ where: { competitionId: project.competitionId, userId: { in: members }, withdrawnAt: null, sharePortfolio: true } })) > 0
  );
}

// ── Pipeline ───────────────────────────────────────────────────────────────────

async function record(appId: string, from: ApplicationStatus | null, to: ApplicationStatus, actorId: string, note?: string | null) {
  await db.applicationEvent.create({ data: { applicationId: appId, fromStatus: from, toStatus: to, actorId, note: note ?? null } });
}

export async function shortlistCandidate(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "talent.view");
  const d = parse(z.object({ userId: z.string().min(1), openingId: optText(40), company: optText(120), note: optText(1000) }), input);
  const consent = await getConsent(d.userId, competitionId);
  if (!consent || consent.withdrawnAt) throw precondition("This participant has not opted into the talent pool.");
  const forced = await recruiterCompany(actor!, competitionId);
  const opening = d.openingId ? await db.jobOpening.findFirst({ where: { id: d.openingId, competitionId } }) : null;
  if (d.openingId && !opening) throw validation("Unknown opening.");
  if (opening && forced && opening.company !== forced) throw forbidden("You can only shortlist for your company's openings.");
  const company = opening?.company ?? forced ?? d.company;
  if (!company) throw validation("Choose an opening or enter the hiring company.", { company: "Required." });
  const openingKey = opening?.id ?? "general";
  const exists = await db.candidateApplication.findUnique({
    where: { competitionId_candidateId_openingKey: { competitionId, candidateId: d.userId, openingKey } },
  });
  if (exists && exists.company === company && !FINAL.includes(exists.status)) throw conflict("This candidate is already in your pipeline for this opening.");
  const app = exists
    ? await db.candidateApplication.update({
        where: { id: exists.id },
        data: { status: "SHORTLISTED", company, recruiterId: actor!.id, recruiterNote: d.note ?? "", firstResponseAt: null },
      })
    : await db.candidateApplication.create({
        data: {
          competitionId,
          candidateId: d.userId,
          openingId: opening?.id ?? null,
          openingKey,
          company,
          recruiterId: actor!.id,
          recruiterNote: d.note ?? "",
        },
      });
  await record(app.id, exists?.status ?? null, "SHORTLISTED", actor!.id);
  await audit({
    actorId: actor!.id,
    action: "talent.shortlisted",
    entityType: "CandidateApplication",
    entityId: app.id,
    competitionId,
    meta: { candidateId: d.userId, company, opening: opening?.title ?? null },
  });
  const comp = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  await notify({
    userIds: [d.userId],
    type: "talent.shortlisted",
    title: `${company} shortlisted you${opening ? ` for ${opening.title}` : ""}`,
    body: `Your work in ${comp.title} caught the attention of ${company}. You'll be notified about next steps such as an interview invitation.`,
    link: "/dashboard/opportunities",
    email: true,
    dedupeKey: `shortlist:${app.id}:${Date.now()}`,
  });
  return app;
}

const recruiterActionSchema = z.object({
  action: z.enum(["INVITE_INTERVIEW", "MAKE_OFFER", "NOT_SELECTED"]),
  interviewAt: optText(40),
  interviewDetails: optText(2000),
  offerType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["INTERNSHIP", "FULL_TIME", "PRE_PLACEMENT_OFFER", "CONTRACT"]).optional()),
  offerDetails: optText(2000),
  message: optText(1000),
});

export async function advanceApplication(actor: Actor | null, applicationId: string, input: unknown) {
  const app = await db.candidateApplication.findUnique({ where: { id: applicationId }, include: { competition: true, opening: true } });
  if (!app) throw notFound("Application");
  await requireCompetitionPermission(actor, app.competitionId, "talent.view");
  const forced = await recruiterCompany(actor!, app.competitionId);
  if (forced && app.company !== forced) throw forbidden("This application belongs to another company.");
  const d = parse(recruiterActionSchema, input);
  let to: ApplicationStatus;
  const data: Prisma.CandidateApplicationUpdateInput = {};
  if (d.action === "INVITE_INTERVIEW") {
    if (app.status !== "SHORTLISTED") throw precondition("Only shortlisted candidates can be invited to interview.");
    // datetime-local input is interpreted in the competition's timezone
    const at = d.interviewAt ? zonedLocalToUtc(d.interviewAt, app.competition.timezone) : null;
    if (d.interviewAt && !at) throw validation("Enter a valid interview date and time.", { interviewAt: "Invalid." });
    if (!d.interviewDetails) throw validation("Add interview details (format, link or location).", { interviewDetails: "Required." });
    to = "INTERVIEW_INVITED";
    Object.assign(data, { interviewAt: at, interviewDetails: d.interviewDetails });
  } else if (d.action === "MAKE_OFFER") {
    if (!["SHORTLISTED", "INTERVIEW_ACCEPTED"].includes(app.status)) throw precondition("Offers can be made after shortlisting or an accepted interview.");
    const offerType = d.offerType ?? app.opening?.type;
    if (!offerType) throw validation("Choose the offer type.", { offerType: "Required." });
    if (!d.offerDetails) throw validation("Describe the offer (role, start date, compensation).", { offerDetails: "Required." });
    to = "OFFERED";
    Object.assign(data, { offerType, offerDetails: d.offerDetails });
  } else {
    if (FINAL.includes(app.status)) throw precondition("This application is already closed.");
    to = "NOT_SELECTED";
  }
  const res = await db.candidateApplication.updateMany({ where: { id: app.id, status: app.status }, data: { status: to } });
  if (res.count !== 1) throw conflict("The application changed in the meantime. Refresh and try again.");
  await db.candidateApplication.update({ where: { id: app.id }, data: { ...data, ...(app.firstResponseAt ? {} : { firstResponseAt: new Date() }) } });
  await record(app.id, app.status, to, actor!.id, d.message);
  await audit({
    actorId: actor!.id,
    action: `talent.${to.toLowerCase()}`,
    entityType: "CandidateApplication",
    entityId: app.id,
    competitionId: app.competitionId,
  });
  const role = app.opening?.title ?? "an opportunity";
  const messages: Record<string, { title: string; body: string }> = {
    INTERVIEW_INVITED: {
      title: `Interview invitation from ${app.company}`,
      body: `${app.company} invited you to interview for ${role}. ${d.interviewDetails ?? ""}`.trim(),
    },
    OFFERED: {
      title: `🎉 Offer from ${app.company}`,
      body: `${app.company} made you an offer for ${role}: ${d.offerDetails}. Review and respond from your opportunities page.`,
    },
    NOT_SELECTED: {
      title: `Update from ${app.company}`,
      body: `Thank you for your interest in ${role}. ${app.company} has decided not to proceed at this time.${d.message ? ` Message: ${d.message}` : ""} Your certificates and portfolio remain yours.`,
    },
  };
  await notify({
    userIds: [app.candidateId],
    type: `talent.${to.toLowerCase()}`,
    ...messages[to],
    link: "/dashboard/opportunities",
    email: true,
    dedupeKey: `app:${app.id}:${to}:${Date.now()}`,
  });
}

export async function updateRecruiterNote(actor: Actor | null, applicationId: string, note: string) {
  const app = await db.candidateApplication.findUnique({ where: { id: applicationId } });
  if (!app) throw notFound("Application");
  await requireCompetitionPermission(actor, app.competitionId, "talent.view");
  const forced = await recruiterCompany(actor!, app.competitionId);
  if (forced && app.company !== forced) throw forbidden();
  await db.candidateApplication.update({ where: { id: applicationId }, data: { recruiterNote: note.slice(0, 2000) } });
}

export async function hiringPipeline(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "talent.view");
  const company = await recruiterCompany(actor!, competitionId);
  return db.candidateApplication.findMany({
    where: { competitionId, ...(company ? { company } : {}) },
    include: { candidate: { select: { id: true, name: true, institution: true } }, opening: { select: { title: true, type: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

// ── Candidate-facing ───────────────────────────────────────────────────────────

export async function myOpportunities(actor: Actor | null) {
  const a = requireActor(actor);
  const [applications, consents] = await Promise.all([
    db.candidateApplication.findMany({
      where: { candidateId: a.id },
      include: {
        opening: true,
        competition: { select: { title: true, slug: true, timezone: true } },
        events: { orderBy: { createdAt: "asc" }, select: { toStatus: true, createdAt: true, note: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.talentConsent.findMany({
      where: { userId: a.id },
      include: { competition: { select: { title: true, slug: true, id: true } } },
      orderBy: { consentedAt: "desc" },
    }),
  ]);
  // Never expose the hiring team's private note to the candidate.
  return { applications: applications.map((x) => ({ ...x, recruiterNote: undefined })), consents };
}

export async function respondToApplication(
  actor: Actor | null,
  applicationId: string,
  action: "ACCEPT_INTERVIEW" | "ACCEPT_OFFER" | "DECLINE_OFFER" | "WITHDRAW",
  note?: string,
) {
  const a = requireActor(actor);
  const app = await db.candidateApplication.findUnique({ where: { id: applicationId } });
  if (!app || app.candidateId !== a.id) throw notFound("Application");
  const transitions: Record<typeof action, [ApplicationStatus[], ApplicationStatus]> = {
    ACCEPT_INTERVIEW: [["INTERVIEW_INVITED"], "INTERVIEW_ACCEPTED"],
    ACCEPT_OFFER: [["OFFERED"], "OFFER_ACCEPTED"],
    DECLINE_OFFER: [["OFFERED"], "OFFER_DECLINED"],
    WITHDRAW: [["SHORTLISTED", "INTERVIEW_INVITED", "INTERVIEW_ACCEPTED", "OFFERED"], "WITHDRAWN"],
  };
  const [from, to] = transitions[action];
  if (!from.includes(app.status)) throw precondition("This action is not available at the current stage.");
  const res = await db.candidateApplication.updateMany({
    where: { id: app.id, status: app.status },
    data: { status: to, candidateNote: note?.slice(0, 1000) || app.candidateNote },
  });
  if (res.count !== 1) throw conflict("The application changed in the meantime. Refresh and try again.");
  await record(app.id, app.status, to, a.id, note);
  await audit({
    actorId: a.id,
    action: `talent.candidate_${to.toLowerCase()}`,
    entityType: "CandidateApplication",
    entityId: app.id,
    competitionId: app.competitionId,
  });
  const titles: Record<string, string> = {
    INTERVIEW_ACCEPTED: `${a.name} accepted the interview`,
    OFFER_ACCEPTED: `${a.name} accepted your offer 🎉`,
    OFFER_DECLINED: `${a.name} declined your offer`,
    WITHDRAWN: `${a.name} withdrew from your pipeline`,
  };
  await notify({
    userIds: [app.recruiterId],
    type: "talent.candidate_response",
    title: titles[to],
    body: note ? `Message: ${note}` : `Application status is now ${to.replace(/_/g, " ").toLowerCase()}.`,
    link: `/organizer/competitions/${app.competitionId}/hiring`,
    email: true,
    dedupeKey: `resp:${app.id}:${to}`,
  });
}

// ── Placement analytics ─────────────────────────────────────────────────────────

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
}

export async function placementAnalytics(actor: Actor | null, competitionId: string) {
  const access = await getCompetitionAccess(requireActor(actor), competitionId);
  if (!access.permissions.has("talent.view") && !access.permissions.has("hiring.manage") && !access.permissions.has("analytics.view")) throw forbidden();
  const company = access.permissions.has("talent.view") ? await recruiterCompany(actor!, competitionId).catch(() => null) : null;
  const scope = company ? { company } : {};
  const [approved, optedIn, openings, apps, events] = await Promise.all([
    db.registration.count({ where: { competitionId, status: "APPROVED" } }),
    db.talentConsent.count({ where: { competitionId, withdrawnAt: null } }),
    db.jobOpening.findMany({ where: { competitionId, active: true, ...scope }, select: { positions: true, type: true } }),
    db.candidateApplication.findMany({ where: { competitionId, ...scope }, include: { candidate: { select: { id: true } } } }),
    db.applicationEvent.findMany({ where: { application: { competitionId, ...scope } }, select: { applicationId: true, toStatus: true, createdAt: true } }),
  ]);
  const reached = (s: ApplicationStatus) => new Set(events.filter((e) => e.toStatus === s).map((e) => e.applicationId)).size;
  const accepted = apps.filter((a) => a.status === "OFFER_ACCEPTED");
  const byType = (["INTERNSHIP", "FULL_TIME", "PRE_PLACEMENT_OFFER", "CONTRACT"] as const).map((t) => ({
    type: t,
    count: accepted.filter((a) => a.offerType === t).length,
  }));
  const responseDays = apps.filter((a) => a.firstResponseAt).map((a) => (a.firstResponseAt!.getTime() - a.createdAt.getTime()) / 86_400_000);
  const offerDays = accepted
    .map((a) => {
      const acc = events.find((e) => e.applicationId === a.id && e.toStatus === "OFFER_ACCEPTED");
      return acc ? (acc.createdAt.getTime() - a.createdAt.getTime()) / 86_400_000 : null;
    })
    .filter((x): x is number => x !== null);
  const now = Date.now();
  const overdue = apps.filter((a) => a.status === "SHORTLISTED" && !a.firstResponseAt && now - a.createdAt.getTime() > RESPONSE_SLA_DAYS * 86_400_000).length;
  const regs = await db.registration.findMany({ where: { competitionId, userId: { in: accepted.map((a) => a.candidateId) } }, select: { institution: true } });
  const byInstitution = Object.entries(
    regs.reduce<Record<string, number>>((acc, r) => ((acc[r.institution ?? "Not stated"] = (acc[r.institution ?? "Not stated"] ?? 0) + 1), acc), {}),
  )
    .map(([label, count]) => ({ label, count }))
    .sort((x, y) => y.count - x.count);
  return {
    company,
    approved,
    optedIn,
    optInRate: approved ? Math.round((optedIn / approved) * 100) : 0,
    openings: openings.length,
    positions: openings.reduce((s, o) => s + o.positions, 0),
    shortlisted: new Set(apps.map((a) => a.candidateId)).size,
    interviews: reached("INTERVIEW_INVITED"),
    offers: reached("OFFERED"),
    accepted: accepted.length,
    acceptedByType: byType,
    byInstitution,
    medianResponseDays: median(responseDays),
    medianDaysToAcceptedOffer: median(offerDays),
    overdueResponses: overdue,
    slaDays: RESPONSE_SLA_DAYS,
  };
}
