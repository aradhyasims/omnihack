// Deterministic scoring and ranking — pure functions, documented in docs/SCORING.md.
//
// 1. Each finalized evaluation gets a weighted total on a 0–100 scale:
//      total = Σ weight_i × (score_i − min_i) / (max_i − min_i)       (weights sum to 100)
// 2. A project's stage score is the arithmetic mean of its finalized evaluation totals
//    (conflict-declared and revoked assignments are excluded).
// 3. Projects are ordered by:
//      a. stage score, descending
//      b. tie-break criteria in ascending tieBreakPriority — mean normalised score, descending
//      c. earlier submission time for the stage (submitting earlier wins)
//      d. project id, ascending (final deterministic fallback)
//    Every project receives a unique rank; projects without any finalized evaluation are unranked.
// All comparisons use values rounded to 4 decimal places to avoid floating-point noise.
import type { AdvancementRule } from "@prisma/client";

export type CriterionDef = {
  id: string;
  name?: string;
  weight: number;
  minScore: number;
  maxScore: number;
  commentRequired?: boolean;
  tieBreakPriority: number | null;
  order: number;
};

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export function weightTotal(criteria: Pick<CriterionDef, "weight">[]): number {
  return criteria.reduce((s, c) => s + c.weight, 0);
}

export function validateRubric(criteria: CriterionDef[]): string[] {
  const issues: string[] = [];
  if (criteria.length === 0) issues.push("Add at least one scoring criterion.");
  const total = weightTotal(criteria);
  if (total !== 100) issues.push(`Criterion weights must total 100% (currently ${total}%).`);
  for (const c of criteria) {
    if (c.weight <= 0) issues.push(`"${c.name ?? c.id}" must have a positive weight.`);
    if (c.maxScore <= c.minScore) issues.push(`"${c.name ?? c.id}" needs a maximum score above its minimum.`);
  }
  return issues;
}

function normalised(c: CriterionDef, score: number) {
  return (score - c.minScore) / (c.maxScore - c.minScore);
}

export function weightedTotal(criteria: CriterionDef[], scores: Record<string, number>): number {
  let total = 0;
  for (const c of criteria) {
    const s = scores[c.id];
    if (typeof s !== "number") continue;
    total += c.weight * normalised(c, s);
  }
  return round(total, 2);
}

/** Validates a scorecard. Drafts may be partial; final evaluations must be complete. */
export function validateScorecard(
  criteria: CriterionDef[],
  scores: Record<string, number | undefined>,
  comments: Record<string, string | undefined>,
  final: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const c of criteria) {
    const s = scores[c.id];
    if (s === undefined || Number.isNaN(s)) {
      if (final) errors[c.id] = "Score required.";
      continue;
    }
    if (s < c.minScore || s > c.maxScore) errors[c.id] = `Score must be between ${c.minScore} and ${c.maxScore}.`;
    else if (Math.round(s * 2) !== s * 2) errors[c.id] = "Use whole or half points.";
    if (final && c.commentRequired && !comments[c.id]?.trim()) errors[`comment:${c.id}`] = "A comment is required for this criterion.";
  }
  return errors;
}

export type ProjectEvaluations = {
  projectId: string;
  submittedAt: Date | null;
  evaluations: { scores: Record<string, number> }[];
};

export type RankedProject = {
  projectId: string;
  score: number | null;
  evaluationCount: number;
  criterionMeans: Record<string, number>;
  rank: number | null;
};

export function rankProjects(criteria: CriterionDef[], projects: ProjectEvaluations[]): RankedProject[] {
  const tieBreakers = criteria.filter((c) => c.tieBreakPriority != null).sort((a, b) => a.tieBreakPriority! - b.tieBreakPriority! || a.order - b.order);

  const rows = projects.map((p) => {
    const totals = p.evaluations.map((e) => weightedTotal(criteria, e.scores));
    const criterionMeans: Record<string, number> = {};
    for (const c of criteria) {
      const vals = p.evaluations.map((e) => e.scores[c.id]).filter((v): v is number => typeof v === "number");
      if (vals.length) criterionMeans[c.id] = round(vals.reduce((s, v) => s + normalised(c, v), 0) / vals.length);
    }
    return {
      projectId: p.projectId,
      submittedAt: p.submittedAt,
      score: totals.length ? round(totals.reduce((s, v) => s + v, 0) / totals.length, 2) : null,
      evaluationCount: totals.length,
      criterionMeans,
    };
  });

  rows.sort((a, b) => {
    if (a.score === null || b.score === null) {
      if (a.score === b.score) return a.projectId < b.projectId ? -1 : 1;
      return a.score === null ? 1 : -1;
    }
    if (a.score !== b.score) return b.score - a.score;
    for (const c of tieBreakers) {
      const d = (b.criterionMeans[c.id] ?? 0) - (a.criterionMeans[c.id] ?? 0);
      if (d !== 0) return d;
    }
    const at = a.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    return a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0;
  });

  let next = 1;
  return rows.map((r) => ({
    projectId: r.projectId,
    score: r.score,
    evaluationCount: r.evaluationCount,
    criterionMeans: r.criterionMeans,
    rank: r.score === null ? null : next++,
  }));
}

/** Projects that advance under an automatic rule. MANUAL returns an empty set (organizer decides). */
export function selectAdvancing(ranked: RankedProject[], rule: AdvancementRule, value: number | null): Set<string> {
  const scored = ranked.filter((r) => r.rank !== null);
  switch (rule) {
    case "TOP_N":
      return new Set(scored.slice(0, Math.max(0, Math.floor(value ?? 0))).map((r) => r.projectId));
    case "TOP_PERCENT": {
      const n = Math.ceil((scored.length * Math.min(100, Math.max(0, value ?? 0))) / 100);
      return new Set(scored.slice(0, n).map((r) => r.projectId));
    }
    case "MIN_SCORE":
      return new Set(scored.filter((r) => (r.score ?? 0) >= (value ?? 0)).map((r) => r.projectId));
    default:
      return new Set();
  }
}
