# Scoring, ranking and advancement

Implementation: `src/server/modules/judging/scoring.ts` (pure functions, unit-tested in `tests/unit/scoring.test.ts`). The same rules are published to participants at `/resources#scoring` and summarized on every competition page.

## 1. Rubrics

- Each judged stage has its own rubric: criteria with a weight (whole %, **must total 100**), a score range (min–max), optional required comments, scoring instructions and an optional tie-break priority.
- Publishing a competition and starting judging both fail if any judged stage's rubric is invalid.
- The rubric **locks** when its stage enters judging.

## 2. Evaluation total (per judge)

```
total = Σ_i weight_i × (score_i − min_i) / (max_i − min_i)        → 0–100, rounded to 2 dp
```

Scores accept whole or half points within the range. A draft may be partial. Finalizing requires every criterion (and any required comments) and locks the evaluation.

## 3. Project stage score

The arithmetic mean of the totals of **finalized** evaluations. Evaluations from assignments that are revoked or have a declared conflict of interest are excluded. A project counts as "complete" when it has at least `minJudgesPerProject` finalized evaluations and no pending assignments.

## 4. Ranking (deterministic)

1. Higher stage score.
2. Tie-break criteria in ascending `tieBreakPriority`: higher mean normalized score on that criterion.
3. Earlier final submission time for the stage.
4. Project id, ascending (a final fallback that guarantees determinism).

Values are compared at 4-decimal precision. Every scored project receives a unique rank; projects with no finalized evaluations are unranked and listed last.

## 5. Advancement

| Rule                    | Advances                                    |
| ----------------------- | ------------------------------------------- |
| `TOP_N` (value N)       | The first N ranked projects                 |
| `TOP_PERCENT` (value p) | The first ⌈count × p / 100⌉ ranked projects |
| `MIN_SCORE` (value s)   | Projects with score ≥ s                     |
| `MANUAL`                | Organizer decides per project               |

Automatic rules can only be applied when every project is complete. Organizers can then override individual decisions. A judged stage completes only when every eligible project has a decision. Disqualified projects keep a `DISQUALIFIED` decision.

## 6. Corrections

Final scores can only be corrected by a user with `evaluation.correct`, with a mandatory reason. The before and after values are stored in `EvaluationCorrection` and written to the audit log, and totals are recomputed.

## 7. Results

The final ranking comes from the last enabled judged stage. Ranked OVERALL and TRACK prizes can be filled automatically (rank r → r-th project, within the track for track prizes) and edited manually. Results move through **Provisional → Approved (organization owner) → Published**. Any change to winners after approval returns the results to Provisional. Public pages show winners and finalist positions, never scores or judge comments.
