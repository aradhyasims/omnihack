// Results lifecycle: NONE → PROVISIONAL (organizer prepares) → APPROVED (authorized approver)
// → PUBLISHED (public winners page). Provisional data is never shown publicly; any change to
// winners after approval returns the results to PROVISIONAL so they must be re-approved.
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, getCompetitionAccess, requireActor, requireCompetitionPermission } from "../../authz";
import { forbidden, notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { stageJudgingOverview } from "../judging/service";
import { projectMemberIds } from "../teams/service";

export async function finalJudgedStage(competitionId: string) {
  return db.stage.findFirst({ where: { competitionId, enabled: true, isJudged: true }, orderBy: { order: "desc" } });
}

export async function resultsWorkspace(actor: Actor | null, competitionId: string) {
  const access = await getCompetitionAccess(requireActor(actor), competitionId);
  if (!access.permissions.has("results.prepare") && !access.permissions.has("evaluation.view_all")) throw forbidden();
  const competition = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const stage = await finalJudgedStage(competitionId);
  const overview = stage ? await stageJudgingOverview(actor, stage.id) : null;
  const prizes = await db.prize.findMany({
    where: { competitionId },
    orderBy: [{ order: "asc" }],
    include: { track: true, winners: { include: { project: { select: { id: true, title: true, team: { select: { name: true } } } } } } },
  });
  const projects = await db.project.findMany({
    where: { competitionId, status: "ACTIVE" },
    select: { id: true, title: true, trackId: true, team: { select: { name: true } } },
    orderBy: { title: "asc" },
  });
  return { competition, stage, overview, prizes, projects, access };
}

async function invalidateApproval(competitionId: string, actorId: string) {
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (c.resultsStatus === "PUBLISHED") throw precondition("Results are published. Unpublish them before changing winners.");
  if (c.resultsStatus === "APPROVED") {
    await db.competition.update({ where: { id: competitionId }, data: { resultsStatus: "PROVISIONAL", resultsApprovedAt: null, resultsApprovedById: null } });
    await audit({ actorId, action: "results.approval_invalidated", entityType: "Competition", entityId: competitionId, competitionId });
  }
}

export async function assignWinner(actor: Actor | null, prizeId: string, projectId: string, citation?: string) {
  const prize = await db.prize.findUnique({ where: { id: prizeId } });
  if (!prize) throw notFound("Prize");
  await requireCompetitionPermission(actor, prize.competitionId, "results.prepare");
  const project = await db.project.findFirst({ where: { id: projectId, competitionId: prize.competitionId, status: "ACTIVE" } });
  if (!project) throw validation("Choose an active project from this competition.");
  if (prize.category === "TRACK" && prize.trackId && project.trackId !== prize.trackId) throw validation("This project is not in the prize's track.");
  const submitted = await db.submission.count({ where: { projectId, status: "SUBMITTED" } });
  if (submitted === 0) throw precondition("Only projects with a submission can win a prize.");
  await invalidateApproval(prize.competitionId, actor!.id);
  await db.awardWinner.upsert({
    where: { prizeId_projectId: { prizeId, projectId } },
    create: { prizeId, projectId, citation: citation?.slice(0, 300) || null },
    update: { citation: citation?.slice(0, 300) || null },
  });
  await audit({
    actorId: actor!.id,
    action: "results.winner_assigned",
    entityType: "Prize",
    entityId: prizeId,
    competitionId: prize.competitionId,
    meta: { projectId },
  });
}

export async function removeWinner(actor: Actor | null, prizeId: string, projectId: string) {
  const prize = await db.prize.findUnique({ where: { id: prizeId } });
  if (!prize) throw notFound("Prize");
  await requireCompetitionPermission(actor, prize.competitionId, "results.prepare");
  await invalidateApproval(prize.competitionId, actor!.id);
  await db.awardWinner.deleteMany({ where: { prizeId, projectId } });
  await audit({
    actorId: actor!.id,
    action: "results.winner_removed",
    entityType: "Prize",
    entityId: prizeId,
    competitionId: prize.competitionId,
    meta: { projectId },
  });
}

/** Fill ranked OVERALL and TRACK prizes from the final judged stage's ranking. */
export async function autoAssignRankedPrizes(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "results.prepare");
  const stage = await finalJudgedStage(competitionId);
  if (!stage) throw precondition("There is no judged stage to rank from.");
  const overview = await stageJudgingOverview(actor, stage.id);
  if (!overview.complete) throw precondition("Final-stage evaluations are not complete yet.");
  const ranked = overview.rows.filter((r) => r.rank !== null && r.result?.decision !== "DISQUALIFIED" && r.project.status === "ACTIVE");
  const prizes = await db.prize.findMany({ where: { competitionId, rank: { not: null }, category: { in: ["OVERALL", "TRACK"] } } });
  await invalidateApproval(competitionId, actor!.id);
  let assigned = 0;
  await db.$transaction(async (tx) => {
    for (const p of prizes) {
      const pool = p.category === "TRACK" ? ranked.filter((r) => r.project.trackId === p.trackId) : ranked;
      const winner = pool[p.rank! - 1];
      await tx.awardWinner.deleteMany({ where: { prizeId: p.id } });
      if (winner) {
        await tx.awardWinner.create({ data: { prizeId: p.id, projectId: winner.projectId } });
        assigned++;
      }
    }
    await audit(
      { actorId: actor!.id, action: "results.auto_assigned", entityType: "Competition", entityId: competitionId, competitionId, meta: { assigned } },
      tx,
    );
  });
  return assigned;
}

export async function prepareResults(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "results.prepare");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (c.resultsStatus !== "NONE") throw precondition("Results are already being prepared.");
  const stage = await finalJudgedStage(competitionId);
  if (stage) {
    const overview = await stageJudgingOverview(actor, stage.id);
    if (!overview.complete) throw precondition("All required final-stage evaluations must be finalized before preparing results.");
  }
  await db.competition.update({ where: { id: competitionId }, data: { resultsStatus: "PROVISIONAL" } });
  await audit({ actorId: actor!.id, action: "results.prepared", entityType: "Competition", entityId: competitionId, competitionId });
}

export async function approveResults(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "results.approve");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (c.resultsStatus !== "PROVISIONAL") throw precondition("Only provisional results can be approved.");
  const stage = await finalJudgedStage(competitionId);
  if (stage) {
    const overview = await stageJudgingOverview(actor, stage.id);
    if (!overview.complete) throw precondition("Evaluations are incomplete; results cannot be approved.");
  }
  const winners = await db.awardWinner.count({ where: { prize: { competitionId } } });
  if (winners === 0) throw precondition("Assign at least one prize winner before approving results.");
  await db.competition.update({
    where: { id: competitionId },
    data: { resultsStatus: "APPROVED", resultsApprovedAt: new Date(), resultsApprovedById: actor!.id },
  });
  await audit({ actorId: actor!.id, action: "results.approved", entityType: "Competition", entityId: competitionId, competitionId });
}

export async function publishResults(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "results.publish");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (c.resultsStatus !== "APPROVED") throw precondition("Results must be approved before they can be published.");
  await db.$transaction(async (tx) => {
    await tx.competition.update({
      where: { id: competitionId },
      data: { resultsStatus: "PUBLISHED", resultsPublishedAt: new Date(), ...(c.status === "PUBLISHED" ? { status: "COMPLETED" } : {}) },
    });
    if (c.status === "PUBLISHED") {
      await tx.competitionStatusChange.create({
        data: { competitionId, fromStatus: "PUBLISHED", toStatus: "COMPLETED", actorId: actor!.id, reason: "Results published" },
      });
    }
    await audit({ actorId: actor!.id, action: "results.published", entityType: "Competition", entityId: competitionId, competitionId }, tx);
  });
  const regs = await db.registration.findMany({ where: { competitionId, status: "APPROVED" }, select: { userId: true } });
  await notify({
    userIds: regs.map((r) => r.userId),
    type: "results.published",
    title: `Results are out: ${c.title}`,
    body: `The organizer published the results of ${c.title}.`,
    link: `/competitions/${c.slug}/results`,
    email: true,
    dedupeKey: `results:${competitionId}`,
  });
  const winners = await db.awardWinner.findMany({ where: { prize: { competitionId } }, include: { prize: true } });
  for (const w of winners) {
    await notify({
      userIds: await projectMemberIds(w.projectId),
      type: "results.winner",
      title: `Congratulations — ${w.prize.title}!`,
      body: `Your project won "${w.prize.title}" in ${c.title}.`,
      link: `/competitions/${c.slug}/results`,
      email: true,
      dedupeKey: `winner:${w.id}`,
    });
  }
}

export async function unpublishResults(actor: Actor | null, competitionId: string, reason: string) {
  await requireCompetitionPermission(actor, competitionId, "results.publish");
  if (!reason.trim()) throw validation("A reason is required.", { reason: "Required." });
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (c.resultsStatus !== "PUBLISHED") throw precondition("Results are not published.");
  await db.$transaction(async (tx) => {
    await tx.competition.update({
      where: { id: competitionId },
      data: { resultsStatus: "APPROVED", resultsPublishedAt: null, ...(c.status === "COMPLETED" ? { status: "PUBLISHED" } : {}) },
    });
    if (c.status === "COMPLETED")
      await tx.competitionStatusChange.create({ data: { competitionId, fromStatus: "COMPLETED", toStatus: "PUBLISHED", actorId: actor!.id, reason } });
    await audit({ actorId: actor!.id, action: "results.unpublished", entityType: "Competition", entityId: competitionId, competitionId, meta: { reason } }, tx);
  });
}

/** Public results: only when PUBLISHED. Exposes no scores or judge comments. */
export async function publicResults(slug: string) {
  const c = await db.competition.findUnique({ where: { slug }, include: { organization: { select: { name: true } } } });
  if (!c || c.resultsStatus !== "PUBLISHED" || c.visibility === "PRIVATE") return null;
  const prizes = await db.prize.findMany({
    where: { competitionId: c.id, winners: { some: {} } },
    orderBy: [{ order: "asc" }],
    include: {
      track: { select: { name: true } },
      winners: {
        include: {
          project: {
            select: {
              id: true,
              title: true,
              summary: true,
              showcaseStatus: true,
              showMembers: true,
              team: { select: { name: true, members: { select: { user: { select: { name: true, consentShowcase: true } } } } } },
              owner: { select: { name: true, consentShowcase: true } },
            },
          },
        },
      },
    },
  });
  const stage = await finalJudgedStage(c.id);
  const finalists = stage
    ? await db.project.findMany({
        where: { competitionId: c.id, status: "ACTIVE", stageResults: { some: { stageId: stage.id } } },
        select: { id: true, title: true, team: { select: { name: true } }, stageResults: { where: { stageId: stage.id }, select: { rank: true } } },
      })
    : [];
  finalists.sort((a, b) => (a.stageResults[0]?.rank ?? 9999) - (b.stageResults[0]?.rank ?? 9999));
  const memberNames = (p: (typeof prizes)[number]["winners"][number]["project"]) => {
    if (!p.showMembers) return [];
    const list = p.team ? p.team.members.map((m) => m.user) : p.owner ? [p.owner] : [];
    return list.filter((u) => u.consentShowcase).map((u) => u.name);
  };
  return {
    competition: c,
    prizes: prizes.map((p) => ({ ...p, winners: p.winners.map((w) => ({ ...w, members: memberNames(w.project) })) })),
    finalists,
  };
}

export async function recentWinners(take = 6) {
  return db.awardWinner.findMany({
    where: { prize: { competition: { resultsStatus: "PUBLISHED", visibility: "PUBLIC" } } },
    include: {
      prize: { select: { title: true, competition: { select: { title: true, slug: true, type: true, isDemo: true } } } },
      project: { select: { id: true, title: true, summary: true, showcaseStatus: true, team: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
