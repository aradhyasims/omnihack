import type { Prisma } from "@prisma/client";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, getCompetitionAccess, requireActor, requireCompetitionPermission } from "../../authz";
import { forbidden, notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { judgeableProjects } from "../stages/service";
import { type CriterionDef, rankProjects, selectAdvancing, validateScorecard, weightedTotal } from "./scoring";

async function loadStage(stageId: string) {
  const stage = await db.stage.findUnique({
    where: { id: stageId },
    include: { competition: true, rubric: { include: { criteria: { orderBy: { order: "asc" } } } } },
  });
  if (!stage) throw notFound("Stage");
  return stage;
}

async function activeJudges(competitionId: string) {
  return db.competitionMember.findMany({
    where: { competitionId, role: "JUDGE", status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { userId: "asc" },
  });
}

/** Projects where the judge declared a conflict in any stage of the competition are never assigned again. */
async function conflictPairs(competitionId: string) {
  const rows = await db.judgeAssignment.findMany({
    where: { status: "CONFLICT_DECLARED", stage: { competitionId } },
    select: { judgeId: true, projectId: true },
  });
  return new Set(rows.map((r) => `${r.judgeId}:${r.projectId}`));
}

export async function assignJudges(actor: Actor | null, stageId: string, judgeIds: string[], projectIds: string[], dueAt?: Date | null) {
  const stage = await loadStage(stageId);
  await requireCompetitionPermission(actor, stage.competitionId, "judge.assign");
  if (!stage.isJudged) throw precondition("This stage is not judged.");
  if (stage.status === "COMPLETED") throw precondition("This stage is completed.");
  if (!judgeIds.length || !projectIds.length) throw validation("Select at least one judge and one project.");
  const judges = new Set((await activeJudges(stage.competitionId)).map((j) => j.userId));
  for (const id of judgeIds) if (!judges.has(id)) throw validation("Only active judges of this competition can be assigned.");
  const eligible = new Set((await judgeableProjects(stage)).map((p) => p.id));
  const conflicts = await conflictPairs(stage.competitionId);
  let created = 0;
  for (const judgeId of judgeIds) {
    for (const projectId of projectIds) {
      if (!eligible.has(projectId) || conflicts.has(`${judgeId}:${projectId}`)) continue;
      const existing = await db.judgeAssignment.findUnique({ where: { stageId_judgeId_projectId: { stageId, judgeId, projectId } } });
      if (existing && existing.status !== "REVOKED") continue;
      if (existing) await db.judgeAssignment.update({ where: { id: existing.id }, data: { status: "ASSIGNED", dueAt: dueAt ?? stage.endsAt } });
      else await db.judgeAssignment.create({ data: { stageId, judgeId, projectId, dueAt: dueAt ?? stage.endsAt } });
      created++;
    }
  }
  await audit({
    actorId: actor!.id,
    action: "judging.assigned",
    entityType: "Stage",
    entityId: stageId,
    competitionId: stage.competitionId,
    meta: { judgeIds, projectCount: projectIds.length, created },
  });
  await notify({
    userIds: judgeIds,
    type: "judge.assignment",
    title: `New judging assignments: ${stage.name}`,
    body: `You have new projects to evaluate for ${stage.competition.title}.`,
    link: "/dashboard/judging",
    email: true,
    dedupeKey: `assign:${stageId}:${Date.now()}`,
  });
  return created;
}

/**
 * Balanced automatic assignment: every judgeable project gets `perProject` judges, choosing the
 * least-loaded judges first (ties broken by judge id) and skipping declared conflicts.
 */
export async function autoAssignJudges(actor: Actor | null, stageId: string, perProject: number) {
  const stage = await loadStage(stageId);
  await requireCompetitionPermission(actor, stage.competitionId, "judge.assign");
  if (!stage.isJudged) throw precondition("This stage is not judged.");
  const judges = (await activeJudges(stage.competitionId)).map((j) => j.userId);
  if (judges.length === 0) throw precondition("Add judges to the competition first (People page).");
  const k = Math.max(1, Math.min(perProject, judges.length));
  const projects = await judgeableProjects(stage);
  const conflicts = await conflictPairs(stage.competitionId);
  const existing = await db.judgeAssignment.findMany({ where: { stageId, status: { not: "REVOKED" } } });
  const load = new Map(judges.map((j) => [j, 0]));
  existing.forEach((e) => load.set(e.judgeId, (load.get(e.judgeId) ?? 0) + 1));
  const plan: { judgeId: string; projectId: string }[] = [];
  for (const p of projects) {
    const already = existing.filter((e) => e.projectId === p.id && e.status !== "CONFLICT_DECLARED").map((e) => e.judgeId);
    let needed = k - already.length;
    const candidates = judges
      .filter((j) => !already.includes(j) && !conflicts.has(`${j}:${p.id}`) && !existing.some((e) => e.judgeId === j && e.projectId === p.id))
      .sort((a, b) => load.get(a)! - load.get(b)! || (a < b ? -1 : 1));
    for (const j of candidates) {
      if (needed <= 0) break;
      plan.push({ judgeId: j, projectId: p.id });
      load.set(j, load.get(j)! + 1);
      needed--;
    }
  }
  if (plan.length) {
    await db.judgeAssignment.createMany({ data: plan.map((x) => ({ ...x, stageId, dueAt: stage.endsAt })), skipDuplicates: true });
    await notify({
      userIds: [...new Set(plan.map((x) => x.judgeId))],
      type: "judge.assignment",
      title: `New judging assignments: ${stage.name}`,
      body: `You have new projects to evaluate for ${stage.competition.title}.`,
      link: "/dashboard/judging",
      email: true,
      dedupeKey: `auto-assign:${stageId}:${Date.now()}`,
    });
  }
  await audit({
    actorId: actor!.id,
    action: "judging.auto_assigned",
    entityType: "Stage",
    entityId: stageId,
    competitionId: stage.competitionId,
    meta: { perProject: k, created: plan.length },
  });
  return plan.length;
}

export async function revokeAssignment(actor: Actor | null, assignmentId: string) {
  const asg = await db.judgeAssignment.findUnique({ where: { id: assignmentId }, include: { stage: true, evaluation: true } });
  if (!asg) throw notFound("Assignment");
  await requireCompetitionPermission(actor, asg.stage.competitionId, "judge.assign");
  if (asg.evaluation?.status === "FINAL") throw precondition("This evaluation is already finalized and cannot be revoked.");
  await db.judgeAssignment.update({ where: { id: assignmentId }, data: { status: "REVOKED" } });
  await audit({ actorId: actor!.id, action: "judging.revoked", entityType: "JudgeAssignment", entityId: assignmentId, competitionId: asg.stage.competitionId });
}

// ── Judge-facing ───────────────────────────────────────────────────────────────

export async function myAssignments(actor: Actor | null) {
  const a = requireActor(actor);
  return db.judgeAssignment.findMany({
    where: { judgeId: a.id, status: { not: "REVOKED" }, stage: { competition: { status: { in: ["PUBLISHED", "COMPLETED"] } } } },
    include: {
      stage: { select: { id: true, name: true, status: true, endsAt: true, competition: { select: { id: true, title: true, slug: true, timezone: true } } } },
      project: { select: { id: true, title: true, challenge: { select: { title: true } } } },
      evaluation: { select: { status: true, totalScore: true, updatedAt: true } },
    },
    orderBy: [{ stage: { endsAt: { sort: "asc", nulls: "last" } } }, { createdAt: "asc" }],
  });
}

async function loadOwnAssignment(actor: Actor | null, assignmentId: string) {
  const a = requireActor(actor);
  const asg = await db.judgeAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      stage: { include: { competition: true, rubric: { include: { criteria: { orderBy: { order: "asc" } } } } } },
      evaluation: { include: { scores: true, corrections: { orderBy: { createdAt: "desc" } } } },
    },
  });
  // Judges may only open their own, non-revoked assignments.
  if (!asg || asg.judgeId !== a.id || asg.status === "REVOKED") throw forbidden("This evaluation is not assigned to you.");
  return asg;
}

export async function getScorecard(actor: Actor | null, assignmentId: string) {
  const asg = await loadOwnAssignment(actor, assignmentId);
  const project = await db.project.findUniqueOrThrow({
    where: { id: asg.projectId },
    include: {
      challenge: { select: { title: true, description: true } },
      track: { select: { name: true } },
      submissions: {
        where: { status: "SUBMITTED", stage: { order: { lte: asg.stage.order } } },
        include: {
          stage: { select: { name: true, order: true, submissionTemplate: true, submissionFields: true } },
          attachments: { where: { deletedAt: null } },
        },
        orderBy: { stage: { order: "asc" } },
      },
    },
  });
  // Judges see project content but not participants' personal contact details.
  return { assignment: asg, project };
}

function toCriteria(
  criteria: {
    id: string;
    name: string;
    weight: number;
    minScore: number;
    maxScore: number;
    commentRequired: boolean;
    tieBreakPriority: number | null;
    order: number;
  }[],
): CriterionDef[] {
  return criteria.map((c) => ({ ...c }));
}

export type ScorecardInput = {
  scores: Record<string, number | undefined>;
  comments: Record<string, string | undefined>;
  feedbackToTeam: string;
  privateComment: string;
};

export async function saveEvaluation(actor: Actor | null, assignmentId: string, input: ScorecardInput, finalize: boolean) {
  const asg = await loadOwnAssignment(actor, assignmentId);
  if (asg.status === "CONFLICT_DECLARED") throw precondition("You declared a conflict of interest for this project.");
  if (asg.stage.status !== "JUDGING") throw precondition("Judging for this stage is not open.");
  if (asg.evaluation?.status === "FINAL") throw precondition("This evaluation is finalized and locked. Contact the organizer if a correction is needed.");
  const criteria = toCriteria(asg.stage.rubric?.criteria ?? []);
  const errors = validateScorecard(criteria, input.scores, input.comments, finalize);
  if (Object.keys(errors).length) throw validation(finalize ? "Complete every criterion before finalizing." : "Some scores are out of range.", errors);
  if (input.feedbackToTeam.length > 5000 || input.privateComment.length > 5000) throw validation("Comments are limited to 5000 characters.");
  const scored = Object.fromEntries(Object.entries(input.scores).filter((e): e is [string, number] => typeof e[1] === "number" && !Number.isNaN(e[1])));
  const total = Object.keys(scored).length === criteria.length ? weightedTotal(criteria, scored) : null;

  return db.$transaction(async (tx) => {
    // Re-check inside the transaction to prevent racing a finalization.
    const current = await tx.evaluation.findUnique({ where: { assignmentId } });
    if (current?.status === "FINAL") throw precondition("This evaluation is already finalized.");
    const ev = await tx.evaluation.upsert({
      where: { assignmentId },
      create: { assignmentId, feedbackToTeam: input.feedbackToTeam, privateComment: input.privateComment, totalScore: total },
      update: { feedbackToTeam: input.feedbackToTeam, privateComment: input.privateComment, totalScore: total },
    });
    for (const c of criteria) {
      const s = scored[c.id];
      if (s === undefined) {
        await tx.evaluationScore.deleteMany({ where: { evaluationId: ev.id, criterionId: c.id } });
        continue;
      }
      await tx.evaluationScore.upsert({
        where: { evaluationId_criterionId: { evaluationId: ev.id, criterionId: c.id } },
        create: { evaluationId: ev.id, criterionId: c.id, score: s, comment: input.comments[c.id]?.slice(0, 2000) ?? "" },
        update: { score: s, comment: input.comments[c.id]?.slice(0, 2000) ?? "" },
      });
    }
    if (finalize) {
      await tx.evaluation.update({ where: { id: ev.id }, data: { status: "FINAL", finalizedAt: new Date() } });
      await tx.judgeAssignment.update({ where: { id: assignmentId }, data: { status: "SUBMITTED" } });
      await audit(
        {
          actorId: actor!.id,
          action: "evaluation.finalized",
          entityType: "Evaluation",
          entityId: ev.id,
          competitionId: asg.stage.competitionId,
          meta: { total },
        },
        tx,
      );
    } else if (asg.status === "ASSIGNED") {
      await tx.judgeAssignment.update({ where: { id: assignmentId }, data: { status: "IN_PROGRESS" } });
    }
    return { evaluationId: ev.id, total, finalized: finalize, savedAt: new Date() };
  });
}

export async function declareConflict(actor: Actor | null, assignmentId: string, note: string) {
  const asg = await loadOwnAssignment(actor, assignmentId);
  if (asg.evaluation?.status === "FINAL") throw precondition("This evaluation is already finalized.");
  if (!note.trim()) throw validation("Briefly describe the conflict of interest.", { note: "Required." });
  await db.judgeAssignment.update({ where: { id: assignmentId }, data: { status: "CONFLICT_DECLARED", conflictNote: note.trim().slice(0, 1000) } });
  await audit({
    actorId: actor!.id,
    action: "evaluation.conflict_declared",
    entityType: "JudgeAssignment",
    entityId: assignmentId,
    competitionId: asg.stage.competitionId,
  });
  const owners = await db.competitionMember.findMany({
    where: { competitionId: asg.stage.competitionId, role: { in: ["OWNER", "OPS_COORDINATOR"] }, status: "ACTIVE" },
    select: { userId: true },
  });
  await notify({
    userIds: owners.map((o) => o.userId),
    type: "judging.conflict",
    title: `Conflict of interest declared in ${asg.stage.name}`,
    body: "A judge declared a conflict of interest and was removed from one assignment. Reassign the project if more evaluations are needed.",
    link: `/organizer/competitions/${asg.stage.competitionId}/judging?stage=${asg.stageId}`,
  });
}

/** Authorized correction of a finalized evaluation, recorded with before/after values. */
export async function correctEvaluation(actor: Actor | null, evaluationId: string, scores: Record<string, number>, reason: string) {
  const ev = await db.evaluation.findUnique({
    where: { id: evaluationId },
    include: { scores: true, assignment: { include: { stage: { include: { rubric: { include: { criteria: true } } } } } } },
  });
  if (!ev) throw notFound("Evaluation");
  const stage = ev.assignment.stage;
  await requireCompetitionPermission(actor, stage.competitionId, "evaluation.correct");
  if (!reason.trim()) throw validation("A reason is required for any score correction.", { reason: "Required." });
  if (stage.status === "COMPLETED") throw precondition("The stage is completed; reopen judging before correcting scores.");
  const criteria = toCriteria(stage.rubric?.criteria ?? []);
  const errors = validateScorecard(criteria, scores, {}, true);
  if (Object.keys(errors).length) throw validation("Corrected scores are invalid.", errors);
  const before = Object.fromEntries(ev.scores.map((s) => [s.criterionId, s.score]));
  await db.$transaction(async (tx) => {
    for (const c of criteria) {
      await tx.evaluationScore.upsert({
        where: { evaluationId_criterionId: { evaluationId, criterionId: c.id } },
        create: { evaluationId, criterionId: c.id, score: scores[c.id] },
        update: { score: scores[c.id] },
      });
    }
    await tx.evaluation.update({ where: { id: evaluationId }, data: { totalScore: weightedTotal(criteria, scores) } });
    await tx.evaluationCorrection.create({ data: { evaluationId, actorId: actor!.id, reason: reason.trim(), before, after: scores } });
    await audit(
      {
        actorId: actor!.id,
        action: "evaluation.corrected",
        entityType: "Evaluation",
        entityId: evaluationId,
        competitionId: stage.competitionId,
        meta: { before, after: scores, reason },
      },
      tx,
    );
  });
}

// ── Organizer views ───────────────────────────────────────────────────────────

export async function stageJudgingOverview(actor: Actor | null, stageId: string) {
  const stage = await loadStage(stageId);
  const access = await getCompetitionAccess(requireActor(actor), stage.competitionId);
  if (!access.permissions.has("evaluation.view_all") && !access.permissions.has("judge.assign")) throw forbidden();
  const projects = await judgeableProjects(stage);
  const assignments = await db.judgeAssignment.findMany({
    where: { stageId, status: { not: "REVOKED" } },
    include: { judge: { select: { id: true, name: true } }, evaluation: { include: { scores: true } } },
  });
  const submissions = await db.submission.findMany({
    where: { stageId, projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true, submittedAt: true, isLate: true },
  });
  const criteria = toCriteria(stage.rubric?.criteria ?? []);
  const ranked = rankProjects(
    criteria,
    projects.map((p) => {
      const evs = assignments.filter((x) => x.projectId === p.id && x.status === "SUBMITTED" && x.evaluation?.status === "FINAL");
      const sub = submissions.find((s) => s.projectId === p.id);
      return {
        projectId: p.id,
        submittedAt: sub?.submittedAt ?? null,
        evaluations: evs.map((x) => ({ scores: Object.fromEntries(x.evaluation!.scores.map((s) => [s.criterionId, s.score])) })),
      };
    }),
  );
  const results = await db.stageResult.findMany({ where: { stageId } });
  const rows = ranked.map((r) => {
    const p = projects.find((x) => x.id === r.projectId)!;
    const asg = assignments.filter((x) => x.projectId === r.projectId);
    const pending = asg.filter((x) => x.status === "ASSIGNED" || x.status === "IN_PROGRESS").length;
    return {
      ...r,
      project: p,
      assignments: asg,
      pendingCount: pending,
      complete: r.evaluationCount >= stage.minJudgesPerProject && pending === 0,
      submission: submissions.find((s) => s.projectId === r.projectId) ?? null,
      result: results.find((x) => x.projectId === r.projectId) ?? null,
    };
  });
  const judges = await activeJudges(stage.competitionId);
  return {
    stage,
    rows,
    judges,
    complete: rows.length > 0 && rows.every((r) => r.complete),
    totals: {
      projects: rows.length,
      assignments: assignments.length,
      finalized: assignments.filter((x) => x.status === "SUBMITTED").length,
      pending: assignments.filter((x) => x.status === "ASSIGNED" || x.status === "IN_PROGRESS").length,
      conflicts: assignments.filter((x) => x.status === "CONFLICT_DECLARED").length,
    },
  };
}

/** Persist computed scores/ranks (preserving decisions). */
async function persistRanking(stageId: string, rows: Awaited<ReturnType<typeof stageJudgingOverview>>["rows"]) {
  for (const r of rows) {
    await db.stageResult.upsert({
      where: { stageId_projectId: { stageId, projectId: r.projectId } },
      create: { stageId, projectId: r.projectId, score: r.score, rank: r.rank, evaluationCount: r.evaluationCount },
      update: { score: r.score, rank: r.rank, evaluationCount: r.evaluationCount },
    });
  }
}

/** Apply the stage's advancement rule. Requires all required evaluations to be complete. */
export async function applyAdvancementRule(actor: Actor | null, stageId: string) {
  const overview = await stageJudgingOverview(actor, stageId);
  await requireCompetitionPermission(actor, overview.stage.competitionId, "advancement.decide");
  if (overview.stage.status !== "JUDGING") throw precondition("Advancement is decided while the stage is in judging.");
  if (!overview.complete) throw precondition("Some projects still need finalized evaluations before advancement can be decided.");
  if (overview.stage.advancementRule === "MANUAL") throw precondition("This stage uses manual decisions. Mark each project individually.");
  await persistRanking(stageId, overview.rows);
  const advancing = selectAdvancing(overview.rows, overview.stage.advancementRule, overview.stage.advancementValue);
  await db.$transaction(async (tx) => {
    for (const r of overview.rows) {
      if (r.result?.decision === "DISQUALIFIED") continue;
      await tx.stageResult.update({
        where: { stageId_projectId: { stageId, projectId: r.projectId } },
        data: {
          decision: advancing.has(r.projectId) ? "ADVANCED" : "NOT_ADVANCED",
          decidedById: actor!.id,
          decidedAt: new Date(),
          note: `Rule ${overview.stage.advancementRule} ${overview.stage.advancementValue ?? ""}`.trim(),
        },
      });
    }
    await audit(
      {
        actorId: actor!.id,
        action: "advancement.rule_applied",
        entityType: "Stage",
        entityId: stageId,
        competitionId: overview.stage.competitionId,
        meta: { advanced: [...advancing] },
      },
      tx,
    );
  });
  return advancing.size;
}

export async function setDecision(actor: Actor | null, stageId: string, projectId: string, decision: "ADVANCED" | "NOT_ADVANCED" | "PENDING", note?: string) {
  const overview = await stageJudgingOverview(actor, stageId);
  await requireCompetitionPermission(actor, overview.stage.competitionId, "advancement.decide");
  if (overview.stage.status !== "JUDGING") throw precondition("Decisions can only change while the stage is in judging.");
  const row = overview.rows.find((r) => r.projectId === projectId);
  if (!row) throw notFound("Project in this stage");
  if (decision === "ADVANCED" && !row.complete) throw precondition("This project's evaluations are not complete yet.");
  await persistRanking(stageId, overview.rows);
  await db.stageResult.update({
    where: { stageId_projectId: { stageId, projectId } },
    data: { decision, decidedById: actor!.id, decidedAt: new Date(), note: note?.slice(0, 500) ?? null },
  });
  await audit({
    actorId: actor!.id,
    action: "advancement.decided",
    entityType: "StageResult",
    competitionId: overview.stage.competitionId,
    meta: { stageId, projectId, decision, note: note ?? null },
  });
}

export type EvaluationDTO = Prisma.EvaluationGetPayload<{ include: { scores: true } }>;
