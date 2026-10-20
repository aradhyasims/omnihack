// Configurable competition engine: stages are data, not code. Organizers add, edit, reorder,
// enable/disable and transition stages; every transition is validated and recorded.
import { z } from "zod";
import type { Prisma, Stage, StageStatus } from "@prisma/client";
import { db, type Tx } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireCompetitionPermission } from "../../authz";
import { notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { checkbox, csvList, intWithDefault, optText, parse, reqText, zonedDate } from "../../validation";
import { validateRubric } from "../judging/scoring";
import { templateFields } from "../submissions/fields";

async function loadStage(stageId: string) {
  const stage = await db.stage.findUnique({ where: { id: stageId }, include: { competition: true, rubric: { include: { criteria: true } } } });
  if (!stage) throw notFound("Stage");
  return stage;
}

async function requireStageManage(actor: Actor | null, stageId: string) {
  const stage = await loadStage(stageId);
  await requireCompetitionPermission(actor, stage.competitionId, "stage.manage");
  return stage;
}

export async function listStages(competitionId: string) {
  return db.stage.findMany({
    where: { competitionId },
    orderBy: { order: "asc" },
    include: {
      rubric: { include: { criteria: { orderBy: { order: "asc" } } } },
      transitions: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { submissions: { where: { status: "SUBMITTED" } }, assignments: true } },
    },
  });
}

const stageTypeEnum = z.enum([
  "REGISTRATION",
  "ELIGIBILITY_SCREENING",
  "IDEA_SUBMISSION",
  "ABSTRACT_EVALUATION",
  "PITCH_PRESENTATION",
  "PROTOTYPE_DEVELOPMENT",
  "PROGRESS_CHECKPOINT",
  "FINAL_SUBMISSION",
  "TECHNICAL_REVIEW",
  "DEMONSTRATION",
  "FINAL_PRESENTATION",
  "RESULTS",
  "CERTIFICATE_ISSUANCE",
]);

export async function addStage(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "stage.manage");
  const d = parse(z.object({ name: reqText("Stage name", 2, 120), type: stageTypeEnum, description: optText(2000) }), input);
  const last = await db.stage.findFirst({ where: { competitionId }, orderBy: { order: "desc" } });
  const submissionTypes = ["IDEA_SUBMISSION", "FINAL_SUBMISSION", "PROGRESS_CHECKPOINT"];
  const judgedTypes = [
    "ABSTRACT_EVALUATION",
    "PITCH_PRESENTATION",
    "TECHNICAL_REVIEW",
    "DEMONSTRATION",
    "FINAL_PRESENTATION",
    "IDEA_SUBMISSION",
    "FINAL_SUBMISSION",
  ];
  const stage = await db.stage.create({
    data: {
      competitionId,
      name: d.name,
      type: d.type,
      description: d.description ?? "",
      order: (last?.order ?? 0) + 1,
      acceptsSubmissions: submissionTypes.includes(d.type),
      submissionTemplate: d.type === "IDEA_SUBMISSION" ? "IDEA" : submissionTypes.includes(d.type) ? "PROJECT" : "NONE",
      isJudged: judgedTypes.includes(d.type),
      rubric: judgedTypes.includes(d.type) ? { create: {} } : undefined,
    },
  });
  await audit({ actorId: actor!.id, action: "stage.created", entityType: "Stage", entityId: stage.id, competitionId });
  return stage;
}

export async function updateStage(actor: Actor | null, stageId: string, input: unknown) {
  const stage = await requireStageManage(actor, stageId);
  const tz = stage.competition.timezone;
  const raw = (input ?? {}) as Record<string, unknown>;
  const d = parse(
    z
      .object({
        name: reqText("Stage name", 2, 120),
        description: optText(3000),
        startsAt: zonedDate(tz),
        endsAt: zonedDate(tz),
        acceptsSubmissions: checkbox,
        submissionTemplate: z.enum(["NONE", "IDEA", "PROJECT"]).default("NONE"),
        requiredDocuments: csvList,
        allowLateSubmissions: checkbox,
        onlyAdvancedProjects: checkbox,
        isJudged: checkbox,
        minJudgesPerProject: intWithDefault(1, 1, 20),
        advancementRule: z.enum(["MANUAL", "TOP_N", "TOP_PERCENT", "MIN_SCORE"]).default("MANUAL"),
        advancementValue: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0).max(100000).optional()),
        resultVisibility: z.enum(["PRIVATE", "PROVISIONAL", "PUBLIC"]).default("PRIVATE"),
        notifyOnOpen: checkbox,
        notifyOnAdvance: checkbox,
      })
      .superRefine((v, ctx) => {
        if (v.startsAt && v.endsAt && v.startsAt >= v.endsAt)
          ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The stage must end after it starts." });
        if (v.acceptsSubmissions && v.submissionTemplate === "NONE")
          ctx.addIssue({ code: "custom", path: ["submissionTemplate"], message: "Choose a submission template." });
        if (v.advancementRule === "TOP_PERCENT" && (v.advancementValue ?? 0) > 100)
          ctx.addIssue({ code: "custom", path: ["advancementValue"], message: "Percentage must be 100 or less." });
        if (v.advancementRule !== "MANUAL" && !v.advancementValue)
          ctx.addIssue({ code: "custom", path: ["advancementValue"], message: "Enter a value for this rule." });
      }),
    raw,
  );
  const locked = stage.status !== "PENDING";
  if (
    locked &&
    (d.submissionTemplate !== stage.submissionTemplate ||
      d.isJudged !== stage.isJudged ||
      d.acceptsSubmissions !== stage.acceptsSubmissions ||
      d.onlyAdvancedProjects !== stage.onlyAdvancedProjects)
  ) {
    throw precondition("Submission, judging and eligibility settings are locked once a stage has started.");
  }
  // Per-field overrides from checkboxes named f_<key>_enabled / f_<key>_required.
  const overrides: Record<string, { enabled: boolean; required: boolean }> = {};
  if (d.acceptsSubmissions) {
    for (const f of templateFields(d.submissionTemplate)) {
      if (raw[`f_${f.key}_present`] === undefined) continue;
      const enabled = raw[`f_${f.key}_enabled`] === "on";
      overrides[f.key] = { enabled, required: enabled && raw[`f_${f.key}_required`] === "on" };
    }
  }
  const data: Prisma.StageUpdateInput = {
    name: d.name,
    description: d.description ?? "",
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    acceptsSubmissions: d.acceptsSubmissions,
    submissionTemplate: d.acceptsSubmissions ? d.submissionTemplate : "NONE",
    submissionFields: Object.keys(overrides).length ? overrides : (stage.submissionFields as Prisma.InputJsonValue),
    requiredDocuments: d.requiredDocuments,
    allowLateSubmissions: d.allowLateSubmissions,
    onlyAdvancedProjects: d.onlyAdvancedProjects,
    isJudged: d.isJudged,
    minJudgesPerProject: d.minJudgesPerProject,
    advancementRule: d.isJudged ? d.advancementRule : "MANUAL",
    advancementValue: d.isJudged && d.advancementRule !== "MANUAL" ? (d.advancementValue ?? null) : null,
    resultVisibility: d.resultVisibility,
    notifyOnOpen: d.notifyOnOpen,
    notifyOnAdvance: d.notifyOnAdvance,
  };
  await db.$transaction(async (tx) => {
    await tx.stage.update({ where: { id: stageId }, data });
    if (d.isJudged && !stage.rubric) await tx.rubric.create({ data: { stageId } });
    await audit({ actorId: actor!.id, action: "stage.updated", entityType: "Stage", entityId: stageId, competitionId: stage.competitionId }, tx);
  });
}

export async function moveStage(actor: Actor | null, stageId: string, direction: "up" | "down") {
  const stage = await requireStageManage(actor, stageId);
  const neighbor = await db.stage.findFirst({
    where: { competitionId: stage.competitionId, order: direction === "up" ? { lt: stage.order } : { gt: stage.order } },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;
  if (stage.status !== "PENDING" || neighbor.status !== "PENDING") throw precondition("Only stages that have not started can be reordered.");
  await db.$transaction([
    db.stage.update({ where: { id: stage.id }, data: { order: neighbor.order } }),
    db.stage.update({ where: { id: neighbor.id }, data: { order: stage.order } }),
  ]);
  await audit({
    actorId: actor!.id,
    action: "stage.reordered",
    entityType: "Stage",
    entityId: stageId,
    competitionId: stage.competitionId,
    meta: { direction },
  });
}

export async function setStageEnabled(actor: Actor | null, stageId: string, enabled: boolean) {
  const stage = await requireStageManage(actor, stageId);
  if (stage.status !== "PENDING") throw precondition("A stage that has started cannot be enabled or disabled.");
  await db.stage.update({ where: { id: stageId }, data: { enabled } });
  await audit({
    actorId: actor!.id,
    action: enabled ? "stage.enabled" : "stage.disabled",
    entityType: "Stage",
    entityId: stageId,
    competitionId: stage.competitionId,
  });
}

export async function deleteStage(actor: Actor | null, stageId: string) {
  const stage = await requireStageManage(actor, stageId);
  if (stage.status !== "PENDING") throw precondition("Only stages that have not started can be deleted.");
  const subs = await db.submission.count({ where: { stageId } });
  if (subs > 0) throw precondition("This stage already has submissions.");
  await db.stage.delete({ where: { id: stageId } });
  await audit({ actorId: actor!.id, action: "stage.deleted", entityType: "Stage", entityId: stageId, competitionId: stage.competitionId });
}

// ── Eligibility for a stage ───────────────────────────────────────────────────

/** Previous enabled judged stage, whose ADVANCED decisions gate `onlyAdvancedProjects` stages. */
export async function previousJudgedStage(stage: Pick<Stage, "competitionId" | "order">, client: Tx | typeof db = db) {
  return client.stage.findFirst({
    where: { competitionId: stage.competitionId, enabled: true, isJudged: true, order: { lt: stage.order } },
    orderBy: { order: "desc" },
  });
}

/** Active projects allowed to take part in a stage. */
export async function eligibleProjectsForStage(stage: Pick<Stage, "id" | "competitionId" | "order" | "onlyAdvancedProjects">, client: Tx | typeof db = db) {
  const where: Prisma.ProjectWhereInput = { competitionId: stage.competitionId, status: "ACTIVE" };
  if (stage.onlyAdvancedProjects) {
    const prev = await previousJudgedStage(stage, client);
    if (prev) where.stageResults = { some: { stageId: prev.id, decision: "ADVANCED" } };
  }
  return client.project.findMany({ where, orderBy: { createdAt: "asc" } });
}

export async function isProjectEligibleForStage(projectId: string, stage: Pick<Stage, "id" | "competitionId" | "order" | "onlyAdvancedProjects">) {
  const projects = await eligibleProjectsForStage(stage);
  return projects.some((p) => p.id === projectId);
}

/** Projects that should be judged in a stage: eligible and (if the stage collects work) submitted. */
export async function judgeableProjects(stage: Stage, client: Tx | typeof db = db) {
  const eligible = await eligibleProjectsForStage(stage, client);
  if (!stage.acceptsSubmissions) return eligible;
  const submitted = await client.submission.findMany({
    where: { stageId: stage.id, status: "SUBMITTED", projectId: { in: eligible.map((p) => p.id) } },
    select: { projectId: true },
  });
  const ids = new Set(submitted.map((s) => s.projectId));
  return eligible.filter((p) => ids.has(p.id));
}

// ── Transitions ───────────────────────────────────────────────────────────────

const ALLOWED: Record<StageStatus, StageStatus[]> = {
  PENDING: ["OPEN", "COMPLETED"],
  OPEN: ["CLOSED", "JUDGING", "COMPLETED"],
  CLOSED: ["OPEN", "JUDGING", "COMPLETED"],
  JUDGING: ["COMPLETED", "CLOSED"],
  COMPLETED: [],
};

export async function transitionStage(actor: Actor | null, stageId: string, to: StageStatus, reason?: string) {
  const stage = await requireStageManage(actor, stageId);
  const from = stage.status;
  if (!stage.enabled) throw precondition("Enable this stage before changing its status.");
  if (!ALLOWED[from].includes(to)) throw precondition(`A stage cannot move from ${from} to ${to}.`);
  if (stage.competition.status !== "PUBLISHED") throw precondition("Stages can only run while the competition is published.");

  if (to === "OPEN" && from === "PENDING") {
    const earlierPending = await db.stage.count({
      where: { competitionId: stage.competitionId, enabled: true, order: { lt: stage.order }, status: "PENDING" },
    });
    if (earlierPending > 0) throw precondition("Earlier stages must start before this one.");
    if (stage.onlyAdvancedProjects) {
      const prev = await previousJudgedStage(stage);
      if (prev && prev.status !== "COMPLETED") throw precondition(`Complete "${prev.name}" and its advancement decisions first.`);
    }
  }
  if (to === "COMPLETED" && from === "PENDING" && (stage.acceptsSubmissions || stage.isJudged)) {
    throw precondition("Stages that collect submissions or are judged must be opened first.");
  }
  if (to === "JUDGING") {
    if (!stage.isJudged) throw precondition("This stage is not configured for judging.");
    if (from === "OPEN" && stage.acceptsSubmissions) throw precondition("Close submissions before judging starts.");
    const issues = validateRubric(stage.rubric?.criteria ?? []);
    if (issues.length) throw precondition(`Fix the rubric first: ${issues.join(" ")}`);
  }
  if (to === "COMPLETED" && stage.isJudged) {
    if (from !== "JUDGING") throw precondition("Judged stages complete after judging.");
    const projects = await judgeableProjects(stage);
    const results = await db.stageResult.findMany({ where: { stageId, projectId: { in: projects.map((p) => p.id) } } });
    const decided = new Set(results.filter((r) => r.decision !== "PENDING").map((r) => r.projectId));
    const undecided = projects.filter((p) => !decided.has(p.id));
    if (undecided.length) throw precondition(`Record an advancement decision for all ${undecided.length} remaining project(s) before completing this stage.`);
  }

  await db.$transaction(async (tx) => {
    const res = await tx.stage.updateMany({ where: { id: stageId, status: from }, data: { status: to } });
    if (res.count !== 1) throw precondition("The stage changed in the meantime. Refresh and try again.");
    if (to === "JUDGING" && stage.rubric) await tx.rubric.update({ where: { id: stage.rubric.id }, data: { lockedAt: new Date() } });
    await tx.stageTransition.create({ data: { stageId, fromStatus: from, toStatus: to, actorId: actor!.id, reason } });
    await audit(
      {
        actorId: actor!.id,
        action: `stage.${to.toLowerCase()}`,
        entityType: "Stage",
        entityId: stageId,
        competitionId: stage.competitionId,
        meta: { from, to },
      },
      tx,
    );
  });

  await notifyTransition(stage, to);
}

async function participantUserIds(projectIds: string[]) {
  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { ownerId: true, team: { select: { members: { select: { userId: true } } } } },
  });
  return projects.flatMap((p) => [...(p.ownerId ? [p.ownerId] : []), ...(p.team?.members.map((m) => m.userId) ?? [])]);
}

async function notifyTransition(stage: Stage & { competition: { title: string; slug: string } }, to: StageStatus) {
  const link = `/dashboard/competitions/${stage.competition.slug}`;
  if (to === "OPEN" && stage.notifyOnOpen) {
    let userIds: string[];
    if (stage.onlyAdvancedProjects) {
      userIds = await participantUserIds((await eligibleProjectsForStage(stage)).map((p) => p.id));
    } else {
      const regs = await db.registration.findMany({ where: { competitionId: stage.competitionId, status: "APPROVED" }, select: { userId: true } });
      userIds = regs.map((r) => r.userId);
    }
    await notify({
      userIds,
      type: "stage.opened",
      title: `${stage.name} is now open`,
      body: stage.acceptsSubmissions
        ? `Submissions for "${stage.name}" in ${stage.competition.title} are open${stage.endsAt ? ` until ${stage.endsAt.toUTCString()}` : ""}.`
        : `"${stage.name}" has started in ${stage.competition.title}.`,
      link,
      email: stage.acceptsSubmissions,
      dedupeKey: `stage-open:${stage.id}`,
    });
  }
  if (to === "JUDGING") {
    const judges = await db.judgeAssignment.findMany({ where: { stageId: stage.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } }, select: { judgeId: true } });
    await notify({
      userIds: judges.map((j) => j.judgeId),
      type: "evaluation.open",
      title: `Judging is open: ${stage.name}`,
      body: `Your assigned evaluations for ${stage.competition.title} are ready.`,
      link: "/dashboard/judging",
      email: true,
      dedupeKey: `judging-open:${stage.id}`,
    });
  }
  if (to === "COMPLETED" && stage.isJudged && stage.notifyOnAdvance) {
    const results = await db.stageResult.findMany({ where: { stageId: stage.id }, select: { projectId: true, decision: true } });
    const advanced = results.filter((r) => r.decision === "ADVANCED").map((r) => r.projectId);
    const notAdvanced = results.filter((r) => r.decision === "NOT_ADVANCED").map((r) => r.projectId);
    await notify({
      userIds: await participantUserIds(advanced),
      type: "stage.advanced",
      title: `You advanced past ${stage.name}`,
      body: `Congratulations — your project advanced to the next stage of ${stage.competition.title}.`,
      link,
      email: true,
      dedupeKey: `advanced:${stage.id}`,
    });
    await notify({
      userIds: await participantUserIds(notAdvanced),
      type: "stage.not_advanced",
      title: `${stage.name} results`,
      body: `Thank you for taking part in ${stage.name}. Your project did not advance this time. Any feedback shared by the judges is available in your workspace.`,
      link,
      email: true,
      dedupeKey: `not-advanced:${stage.id}`,
    });
  }
}

// ── Rubric ─────────────────────────────────────────────────────────────────────

const criterionSchema = z.object({
  id: z.string().optional(),
  name: reqText("Criterion name", 2, 120),
  description: optText(1000),
  weight: z.coerce.number().int("Use whole percentages.").min(1, "Weight must be at least 1%.").max(100),
  minScore: z.coerce.number().int().min(0).max(1000),
  maxScore: z.coerce.number().int().min(1).max(1000),
  commentRequired: checkbox,
  instructions: optText(1000),
  tieBreakPriority: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(1).max(20).optional()),
});

export async function upsertCriterion(actor: Actor | null, stageId: string, input: unknown) {
  const stage = await requireStageManage(actor, stageId);
  if (!stage.isJudged) throw precondition("Enable judging for this stage first.");
  const rubric = stage.rubric ?? (await db.rubric.create({ data: { stageId }, include: { criteria: true } }));
  if (rubric.lockedAt) throw precondition("The rubric is locked because judging has started.");
  const d = parse(criterionSchema, input);
  if (d.maxScore <= d.minScore) throw validation("Maximum score must be above the minimum.", { maxScore: "Must exceed the minimum." });
  const data = {
    name: d.name,
    description: d.description ?? "",
    weight: d.weight,
    minScore: d.minScore,
    maxScore: d.maxScore,
    commentRequired: d.commentRequired,
    instructions: d.instructions ?? "",
    tieBreakPriority: d.tieBreakPriority ?? null,
  };
  if (d.id) {
    if (!rubric.criteria.some((c) => c.id === d.id)) throw notFound("Criterion");
    await db.rubricCriterion.update({ where: { id: d.id }, data });
  } else {
    await db.rubricCriterion.create({ data: { ...data, rubricId: rubric.id, order: rubric.criteria.length } });
  }
  await audit({ actorId: actor!.id, action: "rubric.criterion_saved", entityType: "Rubric", entityId: rubric.id, competitionId: stage.competitionId });
}

export async function deleteCriterion(actor: Actor | null, stageId: string, criterionId: string) {
  const stage = await requireStageManage(actor, stageId);
  if (stage.rubric?.lockedAt) throw precondition("The rubric is locked because judging has started.");
  if (!stage.rubric?.criteria.some((c) => c.id === criterionId)) throw notFound("Criterion");
  await db.rubricCriterion.delete({ where: { id: criterionId } });
  await audit({ actorId: actor!.id, action: "rubric.criterion_deleted", entityType: "Rubric", entityId: stage.rubric.id, competitionId: stage.competitionId });
}

export async function updateRubricInstructions(actor: Actor | null, stageId: string, instructions: string) {
  const stage = await requireStageManage(actor, stageId);
  if (!stage.rubric) throw precondition("This stage has no rubric.");
  await db.rubric.update({ where: { id: stage.rubric.id }, data: { instructions: instructions.slice(0, 3000) } });
}
