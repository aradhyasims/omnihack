import { describe, expect, it } from "vitest";
import { rankProjects, selectAdvancing, validateRubric, validateScorecard, weightedTotal, type CriterionDef } from "@/server/modules/judging/scoring";

const C: CriterionDef[] = [
  { id: "a", name: "Innovation", weight: 60, minScore: 0, maxScore: 10, tieBreakPriority: 1, order: 0 },
  { id: "b", name: "Impact", weight: 40, minScore: 0, maxScore: 10, tieBreakPriority: null, order: 1 },
];

describe("weightedTotal", () => {
  it("normalises each criterion and applies weights on a 0–100 scale", () => {
    expect(weightedTotal(C, { a: 10, b: 10 })).toBe(100);
    expect(weightedTotal(C, { a: 5, b: 0 })).toBe(30);
    expect(weightedTotal(C, { a: 8, b: 6 })).toBe(72);
  });
  it("handles non-zero minimums", () => {
    const c: CriterionDef[] = [{ id: "x", weight: 100, minScore: 1, maxScore: 5, tieBreakPriority: null, order: 0 }];
    expect(weightedTotal(c, { x: 3 })).toBe(50);
  });
});

describe("validateRubric", () => {
  it("requires weights totalling 100", () => {
    expect(validateRubric(C)).toEqual([]);
    expect(validateRubric([{ ...C[0], weight: 50 }])[0]).toMatch(/total 100/);
    expect(validateRubric([])).toContain("Add at least one scoring criterion.");
  });
});

describe("validateScorecard", () => {
  it("allows partial drafts but requires all scores to finalize", () => {
    expect(validateScorecard(C, { a: 5 }, {}, false)).toEqual({});
    expect(validateScorecard(C, { a: 5 }, {}, true)).toHaveProperty("b");
  });
  it("rejects out-of-range and non-half-point scores", () => {
    expect(validateScorecard(C, { a: 11, b: 2 }, {}, false)).toHaveProperty("a");
    expect(validateScorecard(C, { a: 2.3, b: 2 }, {}, false)).toHaveProperty("a");
    expect(validateScorecard(C, { a: 2.5, b: 2 }, {}, true)).toEqual({});
  });
  it("enforces required comments on finalize", () => {
    const withComment = [{ ...C[0], commentRequired: true }, C[1]];
    expect(validateScorecard(withComment, { a: 5, b: 5 }, {}, true)).toHaveProperty("comment:a");
    expect(validateScorecard(withComment, { a: 5, b: 5 }, { a: "ok" }, true)).toEqual({});
  });
});

describe("rankProjects (deterministic)", () => {
  const t = (iso: string) => new Date(iso);
  it("orders by mean score", () => {
    const r = rankProjects(C, [
      { projectId: "p1", submittedAt: null, evaluations: [{ scores: { a: 5, b: 5 } }] },
      { projectId: "p2", submittedAt: null, evaluations: [{ scores: { a: 9, b: 9 } }, { scores: { a: 7, b: 7 } }] },
    ]);
    expect(r.map((x) => x.projectId)).toEqual(["p2", "p1"]);
    expect(r[0].score).toBe(80);
    expect(r[0].rank).toBe(1);
  });
  it("breaks ties by tie-break criterion, then submission time, then id", () => {
    // p1 and p2 both total 60, but p2 is stronger on the tie-break criterion "a".
    const tie = rankProjects(C, [
      { projectId: "p1", submittedAt: t("2026-01-01"), evaluations: [{ scores: { a: 4, b: 9 } }] },
      { projectId: "p2", submittedAt: t("2026-01-02"), evaluations: [{ scores: { a: 10, b: 0 } }] },
    ]);
    expect(tie.map((x) => x.projectId)).toEqual(["p2", "p1"]);
    const sameAll = rankProjects(C, [
      { projectId: "zz", submittedAt: t("2026-01-01T10:00:00Z"), evaluations: [{ scores: { a: 5, b: 5 } }] },
      { projectId: "aa", submittedAt: t("2026-01-01T11:00:00Z"), evaluations: [{ scores: { a: 5, b: 5 } }] },
    ]);
    expect(sameAll.map((x) => x.projectId)).toEqual(["zz", "aa"]); // earlier submission wins
    const sameTime = rankProjects(C, [
      { projectId: "zz", submittedAt: null, evaluations: [{ scores: { a: 5, b: 5 } }] },
      { projectId: "aa", submittedAt: null, evaluations: [{ scores: { a: 5, b: 5 } }] },
    ]);
    expect(sameTime.map((x) => x.projectId)).toEqual(["aa", "zz"]); // id fallback
    expect(sameTime.map((x) => x.rank)).toEqual([1, 2]);
  });
  it("leaves projects without evaluations unranked at the end", () => {
    const r = rankProjects(C, [
      { projectId: "none", submittedAt: null, evaluations: [] },
      { projectId: "some", submittedAt: null, evaluations: [{ scores: { a: 1, b: 1 } }] },
    ]);
    expect(r.map((x) => [x.projectId, x.rank])).toEqual([
      ["some", 1],
      ["none", null],
    ]);
  });
});

describe("selectAdvancing", () => {
  const ranked = rankProjects(
    C,
    ["p1", "p2", "p3", "p4"].map((id, i) => ({ projectId: id, submittedAt: null, evaluations: [{ scores: { a: 10 - i * 2, b: 10 - i * 2 } }] })),
  );
  it("supports TOP_N, TOP_PERCENT, MIN_SCORE and MANUAL", () => {
    expect([...selectAdvancing(ranked, "TOP_N", 2)]).toEqual(["p1", "p2"]);
    expect([...selectAdvancing(ranked, "TOP_PERCENT", 50)]).toEqual(["p1", "p2"]);
    expect([...selectAdvancing(ranked, "TOP_PERCENT", 30)]).toEqual(["p1", "p2"]); // ceil(1.2) = 2
    expect([...selectAdvancing(ranked, "MIN_SCORE", 60)]).toEqual(["p1", "p2", "p3"]);
    expect(selectAdvancing(ranked, "MANUAL", null).size).toBe(0);
  });
});
