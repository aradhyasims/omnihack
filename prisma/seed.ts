// DEVELOPMENT SEED DATA — clearly labelled demo content (isDemo=true, "(Demo)" titles, example.com-style
// addresses). Refuses to run in production. Run with `npm run db:seed` after migrations.
import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword, friendlyCode } from "../src/server/crypto";
import { seedStages } from "../src/server/modules/competitions/service";
import { DEFAULT_RULES } from "../src/server/modules/competitions/lifecycle";
import { weightedTotal } from "../src/server/modules/judging/scoring";
import { seedHiring } from "./seed-hiring";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const db = new PrismaClient();
const DAY = 86_400_000;
const now = Date.now();
const at = (days: number, hour = 10) => {
  const d = new Date(now + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

async function main() {
  const existing = await db.user.count({ where: { isDemo: true } });
  const password = await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? "OmniHack!Demo2026");
  if (existing > 0) {
    const added = await seedHiring(db, password);
    console.log(added ? "Demo data already present — added demo hiring data." : "Demo data already present — skipping. (Use a fresh database to reseed.)");
    return;
  }
  const mk = (email: string, name: string, extra: Partial<Prisma.UserCreateInput> = {}) =>
    db.user.create({
      data: { email, name, passwordHash: password, emailVerifiedAt: new Date(), termsAcceptedAt: new Date(), isDemo: true, consentShowcase: true, ...extra },
    });

  const admin = await mk("admin@omnihack.example", "Platform Admin (Demo)", { platformRole: "SUPER_ADMIN" });
  const organizer = await mk("organizer@omnihack.example", "Olivia Organizer (Demo)", { headline: "Innovation programme lead" });
  const coordinator = await mk("coordinator@omnihack.example", "Chris Coordinator (Demo)");
  const judges = await Promise.all([
    mk("judge1@omnihack.example", "Jordan Judge (Demo)", { headline: "Principal engineer" }),
    mk("judge2@omnihack.example", "Priya Panel (Demo)", { headline: "Product strategist" }),
    mk("judge3@omnihack.example", "Sam Scorer (Demo)", { headline: "Data scientist" }),
  ]);
  const mentor = await mk("mentor@omnihack.example", "Morgan Mentor (Demo)", { headline: "Startup advisor" });
  const people = await Promise.all(
    [
      ["alice", "Alice Anand", "STUDENT", "Demo Institute of Technology", ["python", "ml", "ui design"]],
      ["bob", "Bob Banerjee", "STUDENT", "Demo Institute of Technology", ["react", "node"]],
      ["carol", "Carol Chen", "PROFESSIONAL", "Demo Labs", ["product", "research"]],
      ["dan", "Dan D'Souza", "STUDENT", "Example College", ["iot", "embedded"]],
      ["erin", "Erin Evans", "PROFESSIONAL", "Sample Startup", ["data", "sql"]],
      ["frank", "Frank Fernandes", "STUDENT", "Example College", ["go", "devops"]],
      ["grace", "Grace Gupta", "STARTUP", "Sample Startup", ["pitching", "finance"]],
      ["henry", "Henry Hussain", "STUDENT", "Demo Institute of Technology", ["flutter", "firebase"]],
    ].map(([u, name, , inst, skills]) =>
      mk(`${u}@omnihack.example`, `${name} (Demo)`, { institution: inst as string, skills: skills as string[], country: "India" }),
    ),
  );
  const types = ["STUDENT", "STUDENT", "PROFESSIONAL", "STUDENT", "PROFESSIONAL", "STUDENT", "STARTUP", "STUDENT"];

  const org = await db.organization.create({
    data: {
      name: "OmniHack Demo University",
      slug: "omnihack-demo-university",
      type: "UNIVERSITY",
      description: "Fictional organization used for demonstration data.",
      verified: true,
      isDemo: true,
    },
  });
  const org2 = await db.organization.create({
    data: {
      name: "Example Climate Collective",
      slug: "example-climate-collective",
      type: "NONPROFIT",
      description: "Fictional nonprofit used for demonstration data.",
      verified: false,
      isDemo: true,
    },
  });
  await db.organizationMembership.createMany({
    data: [
      { organizationId: org.id, userId: organizer.id, role: "OWNER" },
      { organizationId: org.id, userId: coordinator.id, role: "COORDINATOR" },
      { organizationId: org2.id, userId: organizer.id, role: "OWNER" },
    ],
  });

  type CompInput = Partial<Prisma.CompetitionUncheckedCreateInput> & { slug: string; title: string; type: "IDEATHON" | "HACKATHON" | "HYBRID" };
  async function competition(input: CompInput) {
    const c = await db.competition.create({
      data: {
        organizationId: org.id,
        createdById: organizer.id,
        tagline: "",
        description: "",
        eligibilityTypes: ["OPEN"],
        rules: DEFAULT_RULES,
        contactName: organizer.name,
        contactEmail: "events@omnihack.example",
        timezone: "Asia/Kolkata",
        status: "PUBLISHED",
        publishedAt: new Date(),
        isDemo: true,
        ...input,
      } as Prisma.CompetitionUncheckedCreateInput,
    });
    await db.$transaction((tx) => seedStages(tx, c.id, input.type));
    await db.competitionMember.createMany({
      data: [
        { competitionId: c.id, userId: organizer.id, role: "OWNER" },
        { competitionId: c.id, userId: coordinator.id, role: "OPS_COORDINATOR" },
        ...judges.map((j, i) => ({
          competitionId: c.id,
          userId: j.id,
          role: "JUDGE" as const,
          showPublicly: true,
          expertise: ["Engineering", "Product", "Data"][i],
        })),
        { competitionId: c.id, userId: mentor.id, role: "MENTOR", showPublicly: true, expertise: "Go-to-market" },
      ],
    });
    return c;
  }

  // 1 — Open ideathon
  const ideathon = await competition({
    slug: "smart-campus-ideathon-demo",
    title: "Smart Campus Ideathon 2026 (Demo)",
    type: "IDEATHON",
    tagline: "Reimagine how students learn, move and live on campus — pitch ideas that make campuses smarter and more inclusive.",
    description:
      "This is demonstration content.\n\nThe Smart Campus Ideathon invites students and early professionals to propose ideas that improve campus life: accessibility, sustainability, safety, learning and wellbeing.\n\nYou do not need to build a prototype. Submit a structured idea with a clear problem statement, target users, solution and expected impact. Shortlisted ideas pitch to a jury, and finalists present on demo day.",
    category: "Education",
    tags: ["education", "accessibility", "sustainability"],
    mode: "HYBRID",
    venueName: "Demo University Innovation Hall",
    venueAddress: "1 Example Road, Bengaluru",
    city: "Bengaluru",
    country: "India",
    meetingUrl: "https://meet.example.com/smart-campus",
    onlineInstructions: "Online participants join pitch sessions through the meeting link shared in announcements.",
    participationMode: "BOTH",
    minTeamSize: 1,
    maxTeamSize: 3,
    eligibilityTypes: ["STUDENT", "PROFESSIONAL"],
    registrationOpensAt: at(-6),
    registrationClosesAt: at(18, 18),
    teamFormationDeadline: at(18, 18),
    startsAt: at(20),
    endsAt: at(34, 18),
    resultsAt: at(36),
    certificatesAt: at(37),
    isFeatured: true,
    bannerTheme: "indigo",
    faqs: [
      { q: "Do I need to write code?", a: "No. This is an ideathon; a structured idea submission is all that is required." },
      { q: "Can I participate alone?", a: "Yes — individuals and teams of up to 3 are welcome." },
    ],
  });
  const track1 = await db.track.create({
    data: { competitionId: ideathon.id, name: "Inclusive campus", description: "Accessibility and wellbeing", order: 0 },
  });
  const track2 = await db.track.create({ data: { competitionId: ideathon.id, name: "Green campus", description: "Energy, waste and mobility", order: 1 } });
  await db.challenge.createMany({
    data: [
      {
        competitionId: ideathon.id,
        trackId: track1.id,
        title: "Accessible navigation for every student",
        description: "Design a way for students with visual or mobility impairments to navigate campus buildings independently.",
        context: "Many campus buildings lack accessible wayfinding.",
        desiredOutcome: "A practical concept that could be piloted within one semester.",
        order: 0,
      },
      {
        competitionId: ideathon.id,
        trackId: track2.id,
        title: "Cutting campus food waste",
        description: "Propose an idea that measurably reduces food waste in campus dining.",
        desiredOutcome: "A measurable reduction approach with a clear pilot plan.",
        order: 1,
      },
      {
        competitionId: ideathon.id,
        trackId: track1.id,
        title: "Peer support at scale",
        description: "Help students find peer support quickly and safely.",
        order: 2,
        visibility: "REGISTERED",
      },
    ],
  });
  await db.prize.createMany({
    data: [
      {
        competitionId: ideathon.id,
        title: "First prize",
        category: "OVERALL",
        rank: 1,
        description: "Incubation support and mentoring (demo)",
        valueText: "Mentoring programme",
        order: 0,
      },
      { competitionId: ideathon.id, title: "Second prize", category: "OVERALL", rank: 2, order: 1 },
      { competitionId: ideathon.id, title: "Best green idea", category: "TRACK", rank: 1, trackId: track2.id, order: 2 },
    ],
  });
  for (const [i, p] of people.slice(0, 5).entries()) {
    await db.registration.create({
      data: {
        competitionId: ideathon.id,
        userId: p.id,
        status: "APPROVED",
        eligibilityStatus: "ELIGIBLE",
        participantType: types[i],
        institution: p.institution,
        rulesAcceptedAt: new Date(),
        checkInCode: friendlyCode("CK", 3),
        createdAt: new Date(now - (6 - i) * DAY),
      },
    });
  }
  await db.project.create({
    data: {
      competitionId: ideathon.id,
      ownerId: people[2].id,
      title: "CampusWay",
      challengeId: (await db.challenge.findFirstOrThrow({ where: { competitionId: ideathon.id, order: 0 } })).id,
      trackId: track1.id,
    },
  });
  const regStage = await db.stage.findFirstOrThrow({ where: { competitionId: ideathon.id, type: "REGISTRATION" } });
  await db.stage.update({ where: { id: regStage.id }, data: { status: "OPEN" } });
  const ideaStage = await db.stage.findFirstOrThrow({ where: { competitionId: ideathon.id, type: "IDEA_SUBMISSION" } });
  await db.stage.update({ where: { id: ideaStage.id }, data: { status: "OPEN", startsAt: at(-6), endsAt: at(19, 18) } });
  await db.announcement.create({
    data: {
      competitionId: ideathon.id,
      title: "Welcome to the Smart Campus Ideathon (demo)",
      body: "Idea submissions are open. Use the structured template in your workspace — you can save drafts at any time.",
      authorId: organizer.id,
      pinned: true,
    },
  });
  await db.eventSession.createMany({
    data: [
      {
        competitionId: ideathon.id,
        title: "Kick-off & briefing",
        kind: "KICKOFF",
        startsAt: at(-5, 11),
        endsAt: at(-5, 12),
        location: "Innovation Hall",
        meetingUrl: "https://meet.example.com/smart-campus",
      },
      {
        competitionId: ideathon.id,
        title: "Office hours with mentors",
        kind: "MENTOR_SESSION",
        startsAt: at(7, 12),
        endsAt: at(7, 14),
        hostName: mentor.name,
        meetingUrl: "https://meet.example.com/mentors",
      },
    ],
  });

  // 2 — Open hackathon
  const hackathon = await competition({
    slug: "climate-code-hackathon-demo",
    title: "Climate Code Hackathon (Demo)",
    type: "HACKATHON",
    organizationId: org.id,
    tagline: "48 hours to build open tools for climate resilience — from flood alerts to carbon dashboards.",
    description:
      "This is demonstration content.\n\nTeams of 2–4 build working prototypes that help communities measure, adapt to or reduce climate impact. Submit your repository, a demo and documentation for technical judging.",
    category: "Sustainability",
    tags: ["climate", "open data", "iot"],
    mode: "ONLINE",
    meetingUrl: "https://meet.example.com/climate-code",
    onlineInstructions: "All sessions run online. Join the kick-off through the meeting link.",
    participationMode: "TEAM",
    minTeamSize: 2,
    maxTeamSize: 4,
    eligibilityTypes: ["OPEN"],
    registrationOpensAt: at(-10),
    registrationClosesAt: at(9, 18),
    teamFormationDeadline: at(11, 18),
    startsAt: at(12),
    endsAt: at(14, 18),
    resultsAt: at(16),
    isFeatured: true,
    bannerTheme: "emerald",
    maxParticipants: 200,
  });
  await db.challenge.createMany({
    data: [
      {
        competitionId: hackathon.id,
        title: "Hyperlocal flood alerts",
        description: "Build an alerting tool that combines open rainfall data with community reports.",
        order: 0,
      },
      {
        competitionId: hackathon.id,
        title: "Carbon footprint for small businesses",
        description: "Help small businesses estimate and reduce their emissions.",
        order: 1,
      },
    ],
  });
  await db.prize.createMany({
    data: [
      { competitionId: hackathon.id, title: "First prize", category: "OVERALL", rank: 1, order: 0 },
      { competitionId: hackathon.id, title: "Second prize", category: "OVERALL", rank: 2, order: 1 },
      { competitionId: hackathon.id, title: "Best use of open data", category: "SPECIAL", order: 2 },
    ],
  });
  for (const [i, p] of people.slice(3, 8).entries()) {
    await db.registration.create({
      data: {
        competitionId: hackathon.id,
        userId: p.id,
        status: "APPROVED",
        eligibilityStatus: "ELIGIBLE",
        participantType: types[i + 3],
        institution: p.institution,
        rulesAcceptedAt: new Date(),
        checkInCode: friendlyCode("CK", 3),
      },
    });
  }
  const t1 = await db.team.create({
    data: {
      competitionId: hackathon.id,
      name: "Rainmakers",
      leaderId: people[3].id,
      inviteCode: friendlyCode("TM", 2),
      members: {
        create: [
          { userId: people[3].id, competitionId: hackathon.id, role: "LEADER" },
          { userId: people[4].id, competitionId: hackathon.id },
        ],
      },
      events: { create: { action: "CREATED", userId: people[3].id, actorId: people[3].id } },
    },
  });
  await db.project.create({ data: { competitionId: hackathon.id, teamId: t1.id, title: "Rainmakers project" } });
  await db.stage.updateMany({ where: { competitionId: hackathon.id, type: "REGISTRATION" }, data: { status: "OPEN" } });

  // 3 — Upcoming hybrid challenge (unverified org — published directly by seed for display)
  await competition({
    slug: "healthtech-idea-to-prototype-demo",
    title: "HealthTech Idea-to-Prototype Challenge (Demo)",
    type: "HYBRID",
    organizationId: org2.id,
    tagline: "Start with an idea, finish with a prototype: the best health ideas advance to a build phase with mentors.",
    description:
      "This is demonstration content.\n\nRound 1 is an ideathon. The top ideas advance to a four-week prototype phase with mentors, followed by a technical review and a final demo.",
    category: "Healthcare",
    mode: "OFFLINE",
    venueName: "Example Health Hub",
    venueAddress: "22 Sample Street, Pune",
    city: "Pune",
    country: "India",
    participationMode: "BOTH",
    maxTeamSize: 4,
    eligibilityTypes: ["STUDENT", "STARTUP"],
    registrationOpensAt: at(5),
    registrationClosesAt: at(30),
    startsAt: at(32),
    endsAt: at(75),
    bannerTheme: "rose",
  });

  // 4 — Completed hackathon with published results
  const done = await competition({
    slug: "open-data-hackathon-demo",
    title: "Open Data Hackathon 2026 (Demo)",
    type: "HACKATHON",
    tagline: "Teams turned public datasets into useful civic tools in a weekend sprint.",
    description: "This is demonstration content showing a completed competition with published results, a project showcase and verifiable certificates.",
    category: "AI & Data",
    tags: ["open data", "civic tech"],
    mode: "ONLINE",
    meetingUrl: "https://meet.example.com/open-data",
    participationMode: "TEAM",
    minTeamSize: 1,
    maxTeamSize: 4,
    registrationOpensAt: at(-60),
    registrationClosesAt: at(-40),
    startsAt: at(-38),
    endsAt: at(-36),
    resultsAt: at(-30),
    status: "COMPLETED",
    resultsStatus: "PUBLISHED",
    resultsApprovedAt: at(-31),
    resultsApprovedById: organizer.id,
    resultsPublishedAt: at(-30),
    bannerTheme: "cyan",
  });
  const doneChallenge = await db.challenge.create({
    data: { competitionId: done.id, title: "Make public transport data useful", description: "Build tools on top of open transit datasets." },
  });
  const p1 = await db.prize.create({ data: { competitionId: done.id, title: "First prize", category: "OVERALL", rank: 1, order: 0 } });
  const p2 = await db.prize.create({ data: { competitionId: done.id, title: "Second prize", category: "OVERALL", rank: 2, order: 1 } });
  const teamsSpec = [
    {
      name: "Transit Titans",
      members: [people[0], people[1]],
      title: "BusBuddy",
      summary: "Real-time crowding predictions for city buses using open GTFS feeds.",
      scores: [
        [9, 8, 8, 7, 8],
        [8, 8, 9, 7, 7],
        [9, 7, 8, 8, 8],
      ],
    },
    {
      name: "Data Dhaba",
      members: [people[5], people[6]],
      title: "StopSafe",
      summary: "Accessibility ratings for bus stops crowdsourced from commuters.",
      scores: [
        [7, 8, 8, 8, 9],
        [8, 7, 7, 8, 8],
        [7, 8, 8, 7, 8],
      ],
    },
    {
      name: "Route 42",
      members: [people[7]],
      title: "FareFair",
      summary: "A fare comparison tool across city transit modes.",
      scores: [
        [6, 7, 6, 7, 6],
        [7, 6, 6, 6, 7],
        [6, 6, 7, 6, 6],
      ],
    },
  ];
  const finalStage = await db.stage.findFirstOrThrow({
    where: { competitionId: done.id, type: "FINAL_SUBMISSION" },
    include: { rubric: { include: { criteria: { orderBy: { order: "asc" } } } } },
  });
  const demoStage = await db.stage.findFirstOrThrow({ where: { competitionId: done.id, type: "DEMONSTRATION" } });
  await db.stage.update({ where: { id: demoStage.id }, data: { enabled: false } });
  await db.stage.updateMany({ where: { competitionId: done.id, enabled: true }, data: { status: "COMPLETED" } });
  await db.rubric.update({ where: { id: finalStage.rubric!.id }, data: { lockedAt: at(-36) } });
  const criteria = finalStage.rubric!.criteria;
  const projectIds: string[] = [];
  for (const [i, spec] of teamsSpec.entries()) {
    for (const m of spec.members) {
      await db.registration.create({
        data: {
          competitionId: done.id,
          userId: m.id,
          status: "APPROVED",
          eligibilityStatus: "ELIGIBLE",
          participantType: "STUDENT",
          rulesAcceptedAt: at(-50),
          checkInCode: friendlyCode("CK", 3),
        },
      });
    }
    const team = await db.team.create({
      data: {
        competitionId: done.id,
        name: spec.name,
        leaderId: spec.members[0].id,
        inviteCode: friendlyCode("TM", 2),
        status: "LOCKED",
        challengeId: doneChallenge.id,
        members: { create: spec.members.map((m, j) => ({ userId: m.id, competitionId: done.id, role: j === 0 ? ("LEADER" as const) : ("MEMBER" as const) })) },
      },
    });
    const content = {
      title: spec.title,
      description: spec.summary,
      problemAddressed: "Commuters lack timely, trustworthy transit information.",
      proposedSolution: spec.summary,
      repoUrl: `https://example.com/demo/${spec.title.toLowerCase()}`,
      demoUrl: `https://example.com/demo/${spec.title.toLowerCase()}/live`,
      originalityDeclaration: true,
    };
    const project = await db.project.create({
      data: {
        competitionId: done.id,
        teamId: team.id,
        title: spec.title,
        summary: spec.summary,
        challengeId: doneChallenge.id,
        showcaseStatus: "PUBLISHED",
        showcaseSummary: spec.summary,
        showcaseImpact: "Demo impact statement.",
        repoUrl: content.repoUrl,
        demoUrl: content.demoUrl,
        showMembers: true,
      },
    });
    projectIds.push(project.id);
    const sub = await db.submission.create({
      data: {
        projectId: project.id,
        stageId: finalStage.id,
        status: "SUBMITTED",
        content,
        version: 1,
        submittedAt: at(-36, 9 + i),
        submittedById: spec.members[0].id,
      },
    });
    await db.submissionVersion.create({ data: { submissionId: sub.id, version: 1, content, createdById: spec.members[0].id } });
    for (const [j, judge] of judges.entries()) {
      const asg = await db.judgeAssignment.create({ data: { stageId: finalStage.id, judgeId: judge.id, projectId: project.id, status: "SUBMITTED" } });
      const scoreMap = Object.fromEntries(criteria.map((c, k) => [c.id, spec.scores[j][k]]));
      await db.evaluation.create({
        data: {
          assignmentId: asg.id,
          status: "FINAL",
          finalizedAt: at(-35),
          totalScore: weightedTotal(criteria, scoreMap),
          feedbackToTeam: "Demo feedback: strong idea, clear demo. Consider documenting your data pipeline.",
          privateComment: "Demo private judge note — never shown to participants.",
          scores: { create: criteria.map((c) => ({ criterionId: c.id, score: scoreMap[c.id] })) },
        },
      });
    }
  }
  const totals = await Promise.all(
    projectIds.map(async (pid) => {
      const evs = await db.evaluation.findMany({ where: { assignment: { projectId: pid } } });
      return { pid, score: evs.reduce((s, e) => s + (e.totalScore ?? 0), 0) / evs.length };
    }),
  );
  totals.sort((a, b) => b.score - a.score);
  for (const [i, t] of totals.entries()) {
    await db.stageResult.create({
      data: {
        stageId: finalStage.id,
        projectId: t.pid,
        score: Math.round(t.score * 100) / 100,
        rank: i + 1,
        evaluationCount: 3,
        decision: i < 2 ? "ADVANCED" : "NOT_ADVANCED",
        decidedById: organizer.id,
        decidedAt: at(-34),
      },
    });
  }
  await db.awardWinner.create({ data: { prizeId: p1.id, projectId: totals[0].pid } });
  await db.awardWinner.create({ data: { prizeId: p2.id, projectId: totals[1].pid } });
  const winnerTeams = await db.project.findMany({
    where: { id: { in: [totals[0].pid, totals[1].pid] } },
    include: { team: { include: { members: { include: { user: true } } } } },
  });
  for (const p of winnerTeams) {
    const prizeTitle = p.id === totals[0].pid ? "First prize" : "Second prize";
    for (const m of p.team!.members) {
      await db.certificate.create({
        data: {
          code: friendlyCode("OH"),
          competitionId: done.id,
          userId: m.userId,
          recipientName: m.user.name,
          category: "WINNER",
          distinction: prizeTitle,
          issuedById: organizer.id,
          issuedAt: at(-29),
        },
      });
    }
  }
  for (const spec of teamsSpec) {
    for (const m of spec.members) {
      await db.certificate.create({
        data: {
          code: friendlyCode("OH"),
          competitionId: done.id,
          userId: m.id,
          recipientName: m.name,
          category: "PARTICIPANT",
          issuedById: organizer.id,
          issuedAt: at(-29),
        },
      });
    }
  }

  // 5 — Draft owned by the organizer
  await competition({
    slug: "fintech-sprint-draft-demo",
    title: "FinTech Sprint (Draft, Demo)",
    type: "HACKATHON",
    status: "DRAFT",
    publishedAt: null,
    tagline: "Draft competition used to demonstrate the creation wizard.",
    description: "Draft description for demonstration purposes only.",
    category: "FinTech",
    wizardStep: 3,
  });

  await seedHiring(db, password);

  console.log("Demo data seeded. Sign in with any *@omnihack.example account, e.g.:");
  console.log("  admin@omnihack.example / organizer@omnihack.example / judge1@omnihack.example / alice@omnihack.example / recruiter@omnihack.example");
  console.log(`  password: ${process.env.SEED_ADMIN_PASSWORD ? "(value of SEED_ADMIN_PASSWORD)" : "OmniHack!Demo2026"}`);
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
