// DEVELOPMENT SEED DATA — demo placement & recruitment content (companies end in "(Demo)").
// Idempotent: runs after the main seed and on databases that were seeded before this module existed.
import type { PrismaClient } from "@prisma/client";

const DAY = 86_400_000;

export async function seedHiring(db: PrismaClient, passwordHash: string) {
  if (await db.user.findUnique({ where: { email: "recruiter@omnihack.example" } })) return false;
  const [climate, campus, openData] = await Promise.all(
    ["climate-code-hackathon-demo", "smart-campus-ideathon-demo", "open-data-hackathon-demo"].map((slug) => db.competition.findUnique({ where: { slug } })),
  );
  if (!climate || !campus || !openData) return false;
  const company = "Example Tech (Demo)";
  const recruiter = await db.user.create({
    data: {
      email: "recruiter@omnihack.example",
      name: "Riya Recruiter (Demo)",
      headline: `Campus hiring, ${company}`,
      passwordHash,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      isDemo: true,
    },
  });

  const note = "Hiring partners may contact participants who opt into the talent pool. All roles below are demo data.";
  for (const c of [climate, campus, openData]) {
    await db.competition.update({ where: { id: c.id }, data: { hiringEnabled: true, hiringNote: note } });
    await db.competitionMember.create({ data: { competitionId: c.id, userId: recruiter.id, role: "RECRUITER", company } });
  }

  const closes = new Date(Date.now() + 45 * DAY);
  const opening = (
    competitionId: string,
    o: { title: string; type: "INTERNSHIP" | "FULL_TIME" | "PRE_PLACEMENT_OFFER" | "CONTRACT"; company?: string; skills: string[]; extra?: object },
  ) =>
    db.jobOpening.create({
      data: {
        competitionId,
        company: o.company ?? company,
        title: o.title,
        type: o.type,
        workMode: "HYBRID",
        locations: ["Bengaluru", "Remote"],
        skills: o.skills,
        description: `Demo opening. Work with the ${o.company ?? company} team on problems similar to this competition's challenges.`,
        positions: 2,
        closesAt: closes,
        createdById: recruiter.id,
        ...o.extra,
      },
    });
  const climateIntern = await opening(climate.id, {
    title: "Climate Data Intern (Demo)",
    type: "INTERNSHIP",
    skills: ["python", "data", "ml"],
    extra: { durationText: "6 months", compensation: "Stipend disclosed at interview (demo)" },
  });
  await opening(climate.id, { title: "Graduate Software Engineer (Demo)", type: "FULL_TIME", skills: ["react", "node", "go"] });
  await opening(campus.id, {
    title: "Product Design Intern (Demo)",
    type: "INTERNSHIP",
    company: "Sample Studio (Demo)",
    skills: ["ui design", "research"],
    extra: { durationText: "3 months" },
  });
  const ppo = await opening(openData.id, { title: "Data Engineering PPO (Demo)", type: "PRE_PLACEMENT_OFFER", skills: ["sql", "python", "data"] });

  const approved = async (competitionId: string) =>
    db.registration.findMany({ where: { competitionId, status: "APPROVED" }, include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } });

  // Climate Code: some participants opted in; alice is left out so the opt-in flow can be tried.
  for (const r of (await approved(climate.id)).filter((r) => r.user.email !== "alice@omnihack.example").slice(0, 3)) {
    await db.talentConsent.create({
      data: {
        competitionId: climate.id,
        userId: r.userId,
        roleInterests: ["INTERNSHIP", "FULL_TIME"],
        preferredLocations: ["Bengaluru"],
        graduationYear: 2027,
        adultConfirmed: true,
      },
    });
  }
  const climateConsent = await db.talentConsent.findFirst({ where: { competitionId: climate.id }, orderBy: { consentedAt: "asc" } });
  if (climateConsent) {
    const app = await db.candidateApplication.create({
      data: {
        competitionId: climate.id,
        candidateId: climateConsent.userId,
        openingId: climateIntern.id,
        openingKey: climateIntern.id,
        company,
        recruiterId: recruiter.id,
        recruiterNote: "Strong data pipeline work (demo note).",
      },
    });
    await db.applicationEvent.create({ data: { applicationId: app.id, toStatus: "SHORTLISTED", actorId: recruiter.id } });
  }

  // Open Data (completed): a full pipeline ending in an accepted pre-placement offer.
  const od = await approved(openData.id);
  for (const r of od.slice(0, 2)) {
    await db.talentConsent.create({
      data: {
        competitionId: openData.id,
        userId: r.userId,
        roleInterests: ["PRE_PLACEMENT_OFFER", "INTERNSHIP"],
        adultConfirmed: true,
        consentedAt: new Date(Date.now() - 20 * DAY),
      },
    });
  }
  if (od[0]) {
    const start = Date.now() - 18 * DAY;
    const app = await db.candidateApplication.create({
      data: {
        competitionId: openData.id,
        candidateId: od[0].userId,
        openingId: ppo.id,
        openingKey: ppo.id,
        company,
        recruiterId: recruiter.id,
        status: "OFFER_ACCEPTED",
        interviewAt: new Date(start + 5 * DAY),
        interviewDetails: "Video call, 45 minutes (demo).",
        offerType: "PRE_PLACEMENT_OFFER",
        offerDetails: "Pre-placement offer, joining after graduation (demo).",
        firstResponseAt: new Date(start + 2 * DAY),
        createdAt: new Date(start),
      },
    });
    const steps = [
      ["SHORTLISTED", 0, recruiter.id],
      ["INTERVIEW_INVITED", 2, recruiter.id],
      ["INTERVIEW_ACCEPTED", 3, od[0].userId],
      ["OFFERED", 8, recruiter.id],
      ["OFFER_ACCEPTED", 10, od[0].userId],
    ] as const;
    let prev: (typeof steps)[number][0] | null = null;
    for (const [status, d, actorId] of steps) {
      await db.applicationEvent.create({ data: { applicationId: app.id, fromStatus: prev, toStatus: status, actorId, createdAt: new Date(start + d * DAY) } });
      prev = status;
    }
  }
  return true;
}
