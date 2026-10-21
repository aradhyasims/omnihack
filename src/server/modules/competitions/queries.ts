import type { Prisma } from "@prisma/client";
import { db } from "../../db";
import { type Actor, getCompetitionAccess, isPlatformAdmin } from "../../authz";
import { discoveryPhase, registrationState } from "./lifecycle";

export const PAGE_SIZE = 9;

export type CompetitionFilters = {
  q?: string;
  type?: string; // IDEATHON | HACKATHON | HYBRID
  mode?: string; // ONLINE | OFFLINE | HYBRID
  phase?: string; // open | upcoming | ongoing | completed
  category?: string;
  eligibility?: string; // STUDENT | PROFESSIONAL | STARTUP | OPEN
  participation?: string; // INDIVIDUAL | TEAM
  fee?: string; // free | paid
  deadline?: string; // 7 | 30 (days)
  organizer?: string; // organization slug
  hiring?: string; // "1" = only competitions offering internships / jobs
  page?: number;
};

const PUBLIC_STATUSES = ["PUBLISHED", "COMPLETED"] as const;

export function buildPublicWhere(f: CompetitionFilters, now = new Date()): Prisma.CompetitionWhereInput {
  const and: Prisma.CompetitionWhereInput[] = [{ status: { in: [...PUBLIC_STATUSES] } }, { visibility: "PUBLIC" }];
  if (f.q?.trim()) {
    const q = f.q.trim().slice(0, 100);
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { tagline: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { tags: { has: q.toLowerCase() } },
        { organization: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (f.type && ["IDEATHON", "HACKATHON", "HYBRID"].includes(f.type)) and.push({ type: f.type as never });
  if (f.mode && ["ONLINE", "OFFLINE", "HYBRID"].includes(f.mode)) and.push({ mode: f.mode as never });
  if (f.category) and.push({ category: { equals: f.category, mode: "insensitive" } });
  if (f.eligibility && ["STUDENT", "PROFESSIONAL", "STARTUP", "OPEN"].includes(f.eligibility))
    and.push({ OR: [{ eligibilityTypes: { has: f.eligibility } }, { eligibilityTypes: { has: "OPEN" } }] });
  if (f.participation === "INDIVIDUAL") and.push({ participationMode: { in: ["INDIVIDUAL", "BOTH"] } });
  if (f.participation === "TEAM") and.push({ participationMode: { in: ["TEAM", "BOTH"] } });
  if (f.fee === "free") and.push({ isPaid: false });
  if (f.fee === "paid") and.push({ isPaid: true });
  if (f.organizer) and.push({ organization: { slug: f.organizer } });
  if (f.hiring === "1") and.push({ hiringEnabled: true, openings: { some: { active: true } } });
  if (f.deadline === "7" || f.deadline === "30") {
    const until = new Date(now.getTime() + Number(f.deadline) * 86_400_000);
    and.push({ registrationClosesAt: { gt: now, lte: until }, registrationClosedManually: false });
  }
  switch (f.phase) {
    case "upcoming":
      and.push({ status: "PUBLISHED", registrationOpensAt: { gt: now } });
      break;
    case "open":
      and.push({
        status: "PUBLISHED",
        registrationClosedManually: false,
        OR: [{ registrationOpensAt: null }, { registrationOpensAt: { lte: now } }],
        AND: [{ OR: [{ registrationClosesAt: null }, { registrationClosesAt: { gt: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      });
      break;
    case "ongoing":
      and.push({
        status: "PUBLISHED",
        endsAt: { gt: now },
        OR: [{ registrationClosedManually: true }, { registrationClosesAt: { lte: now } }],
      });
      break;
    case "completed":
      and.push({ OR: [{ status: "COMPLETED" }, { endsAt: { lte: now } }] });
      break;
  }
  return { AND: and };
}

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  tagline: true,
  type: true,
  mode: true,
  category: true,
  status: true,
  bannerTheme: true,
  bannerImageKey: true,
  city: true,
  country: true,
  timezone: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  teamFormationDeadline: true,
  startsAt: true,
  endsAt: true,
  resultsAt: true,
  certificatesAt: true,
  registrationClosedManually: true,
  maxParticipants: true,
  participationMode: true,
  minTeamSize: true,
  maxTeamSize: true,
  eligibilityTypes: true,
  isPaid: true,
  feeAmountMinor: true,
  currency: true,
  isDemo: true,
  hiringEnabled: true,
  organization: { select: { name: true, slug: true, verified: true } },
  _count: { select: { registrations: { where: { status: { in: ["APPROVED", "PENDING"] } } }, openings: { where: { active: true } } } },
} satisfies Prisma.CompetitionSelect;

export type CompetitionCardData = Prisma.CompetitionGetPayload<{ select: typeof cardSelect }> & {
  phase: ReturnType<typeof discoveryPhase>;
  registration: ReturnType<typeof registrationState>;
};

function decorate(c: Prisma.CompetitionGetPayload<{ select: typeof cardSelect }>, now = new Date()): CompetitionCardData {
  return { ...c, phase: discoveryPhase(c, now), registration: registrationState(c, c._count.registrations, now) };
}

export async function listPublicCompetitions(f: CompetitionFilters) {
  const page = Math.max(1, Math.min(500, Math.floor(f.page ?? 1)));
  const where = buildPublicWhere(f);
  const [total, rows] = await Promise.all([
    db.competition.count({ where }),
    db.competition.findMany({
      where,
      select: cardSelect,
      orderBy: [{ isFeatured: "desc" }, { registrationClosesAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), items: rows.map((r) => decorate(r)) };
}

export async function featuredCompetitions(type: "IDEATHON" | "HACKATHON", take = 3) {
  const now = new Date();
  const rows = await db.competition.findMany({
    where: {
      status: "PUBLISHED",
      visibility: "PUBLIC",
      type: type === "IDEATHON" ? { in: ["IDEATHON", "HYBRID"] } : { in: ["HACKATHON", "HYBRID"] },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: cardSelect,
    orderBy: [{ isFeatured: "desc" }, { registrationClosesAt: { sort: "asc", nulls: "last" } }],
    take,
  });
  return rows.map((r) => decorate(r, now));
}

export async function upcomingDeadlines(take = 5) {
  const now = new Date();
  const rows = await db.competition.findMany({
    where: {
      status: "PUBLISHED",
      visibility: "PUBLIC",
      registrationClosedManually: false,
      registrationClosesAt: { gt: now },
      OR: [{ registrationOpensAt: null }, { registrationOpensAt: { lte: now } }],
    },
    select: cardSelect,
    orderBy: { registrationClosesAt: "asc" },
    take,
  });
  return rows.map((r) => decorate(r, now));
}

export async function publicCategories() {
  const rows = await db.competition.groupBy({
    by: ["category"],
    where: { status: { in: [...PUBLIC_STATUSES] }, visibility: "PUBLIC" },
    _count: { _all: true },
    orderBy: { _count: { category: "desc" } },
    take: 12,
  });
  return rows.map((r) => ({ category: r.category, count: r._count._all }));
}

export async function publicOrganizers() {
  return db.organization.findMany({
    where: { competitions: { some: { status: { in: [...PUBLIC_STATUSES] }, visibility: "PUBLIC" } } },
    select: { name: true, slug: true },
    orderBy: { name: "asc" },
    take: 100,
  });
}

/** Platform-wide counts computed from real records only (never fabricated). */
export async function platformStats() {
  const [competitions, participants, projects, certificates] = await Promise.all([
    db.competition.count({ where: { status: { in: [...PUBLIC_STATUSES] }, visibility: "PUBLIC", isDemo: false } }),
    db.registration.count({ where: { status: "APPROVED", competition: { isDemo: false } } }),
    db.submission.count({ where: { status: "SUBMITTED", project: { competition: { isDemo: false } } } }),
    db.certificate.count({ where: { revokedAt: null, competition: { isDemo: false } } }),
  ]);
  return { competitions, participants, projects, certificates };
}

const OFFER_STATUSES = ["OFFERED", "OFFER_ACCEPTED", "OFFER_DECLINED"] as const;

/**
 * Homepage impact numbers, from real records only (demo data excluded).
 * "Launched" means published at least once; Ideathon → Hackathon events count towards both formats.
 * Offers count candidates who received an offer, by offer type.
 */
export async function impactStats() {
  const live = { publishedAt: { not: null }, isDemo: false };
  const [ideathons, hackathons, students, institutions, mentors, internships, placements, companies, ideas] = await Promise.all([
    db.competition.count({ where: { ...live, type: { in: ["IDEATHON", "HYBRID"] } } }),
    db.competition.count({ where: { ...live, type: { in: ["HACKATHON", "HYBRID"] } } }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT r."userId") AS n FROM "Registration" r JOIN "Competition" c ON c.id = r."competitionId"
      WHERE r."participantType" = 'STUDENT' AND r.status <> 'WITHDRAWN' AND c."isDemo" = false`.then((r) => Number(r[0]?.n ?? 0)),
    db.organization.count({ where: { type: { in: ["UNIVERSITY", "COLLEGE", "SCHOOL"] }, isDemo: false } }),
    db.mentorApplication.count({ where: { status: { in: ["NEW", "APPROVED"] } } }),
    db.candidateApplication.count({ where: { status: { in: [...OFFER_STATUSES] }, offerType: "INTERNSHIP", competition: { isDemo: false } } }),
    db.candidateApplication.count({
      where: { status: { in: [...OFFER_STATUSES] }, offerType: { in: ["FULL_TIME", "PRE_PLACEMENT_OFFER", "CONTRACT"] }, competition: { isDemo: false } },
    }),
    // OmniHack's own organization (slug "omnihack") is the platform, not a registered company.
    db.organization.count({ where: { type: "COMPANY", isDemo: false, slug: { not: "omnihack" } } }),
    db.submission.count({ where: { status: "SUBMITTED", stage: { submissionTemplate: "IDEA" }, project: { competition: { isDemo: false } } } }),
  ]);
  return { ideathons, hackathons, students, institutions, mentors, internships, placements, companies, ideas };
}

/**
 * Full detail for the public competition page. Drafts/private events are only visible to staff
 * (preview). Hidden challenges are filtered; REGISTERED challenges are shown to registrants and staff.
 */
export async function getCompetitionPage(slug: string, actor: Actor | null) {
  const c = await db.competition.findUnique({
    where: { slug },
    include: {
      organization: { select: { id: true, name: true, slug: true, verified: true, website: true, description: true, type: true } },
      tracks: { orderBy: { order: "asc" } },
      challenges: { orderBy: { order: "asc" }, include: { track: { select: { name: true } } } },
      stages: {
        where: { enabled: true },
        orderBy: { order: "asc" },
        include: { rubric: { include: { criteria: { orderBy: { order: "asc" } } } } },
      },
      prizes: { orderBy: [{ order: "asc" }], include: { track: { select: { name: true } } } },
      members: {
        where: { status: "ACTIVE", showPublicly: true, role: { in: ["JUDGE", "MENTOR"] } },
        include: { user: { select: { name: true, headline: true } } },
      },
      sponsors: { where: { confirmed: true }, include: { sponsor: true } },
      sessions: { orderBy: { startsAt: "asc" } },
      _count: { select: { registrations: { where: { status: { in: ["APPROVED", "PENDING"] } } } } },
    },
  });
  if (!c) return null;
  const access = actor ? await getCompetitionAccess(actor, c.id) : null;
  const isStaff = Boolean(access?.permissions.has("competition.view_private")) || isPlatformAdmin(actor);
  const isPublic = (c.status === "PUBLISHED" || c.status === "COMPLETED" || c.status === "CANCELLED") && c.visibility !== "PRIVATE";
  const myRegistration = actor ? await db.registration.findUnique({ where: { competitionId_userId: { competitionId: c.id, userId: actor.id } } }) : null;
  const isPrivateInvitee = c.visibility === "PRIVATE" && Boolean(myRegistration);
  if (!isPublic && !isStaff && !isPrivateInvitee) return null;
  const canSeeRegisteredChallenges = isStaff || (myRegistration && myRegistration.status === "APPROVED");
  const challenges = c.challenges.filter(
    (ch) => ch.visibility === "PUBLIC" || (ch.visibility === "REGISTERED" && canSeeRegisteredChallenges) || (ch.visibility === "HIDDEN" && isStaff),
  );
  return {
    competition: { ...c, challenges },
    isStaff,
    isPreview: !isPublic,
    myRegistration,
    registration: registrationState(c, c._count.registrations),
    phase: discoveryPhase(c),
    lockedChallengeCount: c.challenges.filter((ch) => ch.visibility === "REGISTERED").length - challenges.filter((ch) => ch.visibility === "REGISTERED").length,
  };
}

/** Competitions the actor can manage (org membership or competition staff role). */
export async function listManagedCompetitions(actor: Actor) {
  const where: Prisma.CompetitionWhereInput = isPlatformAdmin(actor)
    ? {}
    : {
        OR: [
          { organization: { members: { some: { userId: actor.id, role: { in: ["OWNER", "COORDINATOR", "MEMBER"] } } } } },
          {
            members: {
              some: { userId: actor.id, status: "ACTIVE", role: { in: ["OWNER", "OPS_COORDINATOR", "AUDITOR", "SPONSOR_REP", "VOLUNTEER", "RECRUITER"] } },
            },
          },
        ],
      };
  return db.competition.findMany({
    where,
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      status: true,
      startsAt: true,
      endsAt: true,
      registrationClosesAt: true,
      timezone: true,
      resultsStatus: true,
      organization: { select: { name: true } },
      _count: { select: { registrations: true, projects: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}
