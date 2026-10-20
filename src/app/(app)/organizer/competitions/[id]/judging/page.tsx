import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, CardHeader, EmptyState, Icon, Progress, Stat } from "@/components/ui/primitives";
import { ActionForm, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { db } from "@/server/db";
import { stageJudgingOverview } from "@/server/modules/judging/service";
import { DECISION_META, STAGE_STATUS_META } from "@/lib/labels";
import {
  applyRuleAction,
  assignJudgesAction,
  autoAssignAction,
  correctEvaluationAction,
  revokeAssignmentAction,
  setDecisionAction,
  transitionStageAction,
} from "../../../actions";
import { loadManaged } from "../load";

const ASG: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  ASSIGNED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "Draft", tone: "warning" },
  SUBMITTED: { label: "Final", tone: "success" },
  CONFLICT_DECLARED: { label: "Conflict", tone: "danger" },
};

export default async function JudgingAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, can } = await loadManaged(id);
  if (!can("judge.assign") && !can("evaluation.view_all")) redirect(`/organizer/competitions/${id}`);
  const stages = await db.stage.findMany({ where: { competitionId: id, isJudged: true, enabled: true }, orderBy: { order: "asc" } });
  if (!stages.length) return <EmptyState title="No judged stages" description="Enable judging on a stage in the Stages tab." icon={<Icon name="gavel" />} />;
  const stage = stages.find((s) => s.id === sp.stage) ?? stages.find((s) => s.status === "JUDGING") ?? stages[0];
  const o = await stageJudgingOverview(user, stage.id);
  const criteria = o.stage.rubric?.criteria ?? [];
  const canDecide = can("advancement.decide") && stage.status === "JUDGING";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {stages.map((s) => (
          <Link
            key={s.id}
            href={`?stage=${s.id}`}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${s.id === stage.id ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 text-ink-700"}`}
          >
            {s.name} <span className="opacity-70">· {STAGE_STATUS_META[s.status].label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Projects" value={o.totals.projects} />
        <Stat label="Assignments" value={o.totals.assignments} />
        <Stat label="Finalized" value={o.totals.finalized} tone="success" />
        <Stat label="Pending" value={o.totals.pending} tone={o.totals.pending ? "warning" : undefined} />
        <Stat label="Conflicts" value={o.totals.conflicts} />
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold">Evaluation completion</p>
            <div className="mt-2">
              <Progress value={o.totals.finalized} max={Math.max(1, o.totals.assignments - o.totals.conflicts)} label="Evaluation completion" />
            </div>
            <p className="mt-1 text-xs text-ink-500">
              Each project needs at least {stage.minJudgesPerProject} finalized evaluation(s). {o.complete ? "All requirements met." : "Not complete yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {stage.status === "CLOSED" && can("stage.manage") ? (
              <InlineAction action={transitionStageAction.bind(null, stage.id, "JUDGING")} variant="primary">
                Start judging
              </InlineAction>
            ) : null}
            {canDecide && stage.advancementRule !== "MANUAL" ? (
              <ConfirmAction
                action={applyRuleAction.bind(null, stage.id)}
                label={`Apply rule (${stage.advancementRule.replace("_", " ").toLowerCase()} ${stage.advancementValue ?? ""})`}
                variant="outline"
                confirmVariant="primary"
                title="Apply the advancement rule?"
                description="Every project gets an Advanced / Not advanced decision from the deterministic ranking. You can still override individual decisions before completing the stage."
                confirmLabel="Apply rule"
              />
            ) : null}
            {stage.status === "JUDGING" && can("stage.manage") ? (
              <ConfirmAction
                action={transitionStageAction.bind(null, stage.id, "COMPLETED")}
                label="Complete stage"
                variant="primary"
                confirmVariant="primary"
                title="Complete this stage?"
                description="Decisions become final and teams are notified. Projects marked Advanced can enter the next stage."
                confirmLabel="Complete stage"
              />
            ) : null}
          </div>
        </div>
      </Card>
      {stage.status === "PENDING" || stage.status === "OPEN" ? (
        <Alert tone="info">You can assign judges now. Judges can score once the stage is in judging.</Alert>
      ) : null}

      {can("judge.assign") && stage.status !== "COMPLETED" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Balanced auto-assignment"
              description="Gives every eligible project N judges, least-loaded first, skipping declared conflicts."
            />
            <ActionForm action={autoAssignAction.bind(null, stage.id)} className="flex items-end gap-3 p-5">
              <TextInput
                label="Judges per project"
                name="perProject"
                type="number"
                min={1}
                defaultValue={Math.max(stage.minJudgesPerProject, Math.min(2, o.judges.length))}
              />
              <SubmitButton>Auto-assign</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Manual assignment" />
            {o.judges.length && o.rows.length ? (
              <ActionForm action={assignJudgesAction.bind(null, stage.id)} className="grid gap-3 p-5 sm:grid-cols-2">
                <fieldset>
                  <legend className="mb-1 text-sm font-semibold">Judges</legend>
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-ink-100 p-2 text-sm">
                    {o.judges.map((j) => (
                      <label key={j.userId} className="flex items-center gap-2">
                        <input type="checkbox" name="judgeIds" value={j.userId} className="accent-brand-600" /> {j.user.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-1 text-sm font-semibold">Projects</legend>
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-ink-100 p-2 text-sm">
                    {o.rows.map((r) => (
                      <label key={r.projectId} className="flex items-center gap-2">
                        <input type="checkbox" name="projectIds" value={r.projectId} className="accent-brand-600" /> {r.project.title}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="sm:col-span-2">
                  <SubmitButton size="sm" variant="outline">
                    Assign selected
                  </SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <p className="p-5 text-sm text-ink-500">
                {o.judges.length ? "No eligible projects yet (projects need a submission for this stage)." : "Add judges on the People tab first."}
              </p>
            )}
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={stage.status === "COMPLETED" ? "Final ranking" : "Provisional ranking (private)"}
          description="Mean of finalized weighted totals (0–100). Ties: tie-break criteria, then earlier submission, then project id."
          action={
            <a href={`/api/v1/organizer/competitions/${id}/export/rankings`} className="text-sm font-semibold text-brand-600 hover:underline">
              Export CSV
            </a>
          }
        />
        {o.rows.length ? (
          <div className="overflow-x-auto">
            <table className="table-om">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Project</th>
                  <th className="text-right">Score</th>
                  <th>Judges</th>
                  <th className="min-w-[260px]">Decision</th>
                </tr>
              </thead>
              <tbody>
                {o.rows.map((r) => {
                  const decision = r.result?.decision ?? "PENDING";
                  return (
                    <tr key={r.projectId}>
                      <td className="font-display text-lg font-bold">{r.rank ?? "—"}</td>
                      <td>
                        <span className="font-semibold text-ink-900">{r.project.title}</span>
                        <span className="block text-xs">
                          {r.submission?.submittedAt
                            ? `Submitted ${r.submission.submittedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
                            : "No written submission"}
                          {r.submission?.isLate ? " · late" : ""}
                        </span>
                        {!r.complete ? (
                          <Badge tone="warning" className="mt-1">
                            Incomplete
                          </Badge>
                        ) : null}
                      </td>
                      <td className="text-right font-semibold tabular-nums">{r.score ?? "—"}</td>
                      <td className="text-xs">
                        <ul className="space-y-1.5">
                          {r.assignments.map((a) => (
                            <li key={a.id} className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-ink-800">{a.judge.name}</span>
                              <Badge tone={ASG[a.status]?.tone ?? "neutral"}>{ASG[a.status]?.label ?? a.status}</Badge>
                              {a.evaluation?.totalScore != null ? <span className="tabular-nums">{a.evaluation.totalScore}</span> : null}
                              {can("judge.assign") && a.status !== "SUBMITTED" && stage.status !== "COMPLETED" ? (
                                <InlineAction action={revokeAssignmentAction.bind(null, a.id)} variant="ghost">
                                  revoke
                                </InlineAction>
                              ) : null}
                              {a.evaluation?.status === "FINAL" && can("evaluation.correct") && stage.status !== "COMPLETED" ? (
                                <details className="w-full">
                                  <summary className="cursor-pointer text-[11px] font-semibold text-brand-600">Correct scores</summary>
                                  <ActionForm action={correctEvaluationAction.bind(null, a.evaluation.id)} className="mt-2 space-y-2 rounded-lg bg-ink-50 p-3">
                                    {criteria.map((c) => (
                                      <label key={c.id} className="flex items-center justify-between gap-2">
                                        <span>{c.name}</span>
                                        <input
                                          name={`score_${c.id}`}
                                          type="number"
                                          step={0.5}
                                          min={c.minScore}
                                          max={c.maxScore}
                                          defaultValue={a.evaluation!.scores.find((s) => s.criterionId === c.id)?.score}
                                          className="h-8 w-16 rounded border border-ink-200 px-1 text-center"
                                        />
                                      </label>
                                    ))}
                                    <TextInput label="Reason (audited)" name="reason" required />
                                    <SubmitButton size="sm" variant="outline">
                                      Save correction
                                    </SubmitButton>
                                  </ActionForm>
                                </details>
                              ) : null}
                              {a.evaluation?.privateComment && can("evaluation.view_all") ? (
                                <span className="w-full text-[11px] italic text-ink-500">Private: {a.evaluation.privateComment}</span>
                              ) : null}
                              {a.conflictNote ? <span className="w-full text-[11px] text-rose-700">Conflict: {a.conflictNote}</span> : null}
                            </li>
                          ))}
                          {r.assignments.length === 0 ? <li className="text-ink-400">Unassigned</li> : null}
                        </ul>
                      </td>
                      <td>
                        <Badge tone={DECISION_META[decision].tone}>{DECISION_META[decision].label}</Badge>
                        {canDecide && decision !== "DISQUALIFIED" ? (
                          <ActionForm
                            action={setDecisionAction.bind(null, stage.id, r.projectId)}
                            className="mt-2 flex flex-wrap items-end gap-2"
                            successMessage={false}
                          >
                            <Select
                              label={<span className="sr-only">Decision</span>}
                              name="decision"
                              defaultValue={decision}
                              options={[
                                { value: "ADVANCED", label: "Advance" },
                                { value: "NOT_ADVANCED", label: "Do not advance" },
                                { value: "PENDING", label: "Undecided" },
                              ]}
                            />
                            <SubmitButton size="sm" variant="outline">
                              Set
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-5 text-sm text-ink-500">No eligible projects in this stage yet.</p>
        )}
      </Card>
    </div>
  );
}
