import { Badge, Icon } from "@/components/ui/primitives";
import { ActionForm, Checkbox, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { listStages } from "@/server/modules/stages/service";
import { STAGE_TYPE_LABELS } from "@/server/modules/stages/templates";
import { templateFields, type FieldOverrides } from "@/server/modules/submissions/fields";
import { STAGE_STATUS_META } from "@/lib/labels";
import { formatDateTime, utcToZonedLocal } from "@/lib/time";
import {
  addStageAction,
  deleteCriterionAction,
  deleteStageAction,
  moveStageAction,
  toggleStageAction,
  transitionStageAction,
  updateStageAction,
  upsertCriterionAction,
} from "@/app/(app)/organizer/actions";

type Stage = Awaited<ReturnType<typeof listStages>>[number];

const RULES = [
  { value: "MANUAL", label: "Manual decisions" },
  { value: "TOP_N", label: "Top N projects" },
  { value: "TOP_PERCENT", label: "Top % of projects" },
  { value: "MIN_SCORE", label: "Minimum score (0–100)" },
];

function Transitions({ s }: { s: Stage }) {
  const t = (to: "OPEN" | "CLOSED" | "JUDGING" | "COMPLETED", label: string, variant: "primary" | "outline" = "outline") => (
    <InlineAction key={to} action={transitionStageAction.bind(null, s.id, to)} variant={variant}>
      {label}
    </InlineAction>
  );
  if (!s.enabled) return null;
  const out = [];
  if (s.status === "PENDING") {
    out.push(t("OPEN", s.acceptsSubmissions ? "Open submissions" : "Start stage", "primary"));
    if (!s.acceptsSubmissions && !s.isJudged) out.push(t("COMPLETED", "Mark completed"));
  }
  if (s.status === "OPEN") {
    if (s.acceptsSubmissions) out.push(t("CLOSED", "Close submissions"));
    if (s.isJudged && !s.acceptsSubmissions) out.push(t("JUDGING", "Start judging", "primary"));
    if (!s.isJudged) out.push(t("COMPLETED", "Complete stage"));
  }
  if (s.status === "CLOSED") {
    out.push(t("OPEN", "Reopen"));
    if (s.isJudged) out.push(t("JUDGING", "Start judging", "primary"));
    else out.push(t("COMPLETED", "Complete stage", "primary"));
  }
  if (s.status === "JUDGING") out.push(t("COMPLETED", "Complete stage (after decisions)", "primary"));
  return <div className="flex flex-wrap gap-2">{out}</div>;
}

function RubricEditor({ s }: { s: Stage }) {
  const criteria = s.rubric?.criteria ?? [];
  const total = criteria.reduce((a, c) => a + c.weight, 0);
  const locked = Boolean(s.rubric?.lockedAt);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Scoring rubric</p>
        <Badge tone={total === 100 ? "success" : "warning"}>Weights total {total}%</Badge>
      </div>
      {locked ? (
        <p className="text-xs text-ink-500">
          <Icon name="lock" className="mr-1 inline h-3.5 w-3.5" />
          Locked because judging has started.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="table-om">
          <thead>
            <tr>
              <th>Criterion</th>
              <th className="text-right">Weight</th>
              <th className="text-right">Range</th>
              <th>Tie-break</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {criteria.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="font-semibold text-ink-900">{c.name}</span>
                  {c.commentRequired ? <Badge className="ml-2">comment required</Badge> : null}
                  {c.description ? <span className="block text-xs text-ink-500">{c.description}</span> : null}
                  {!locked ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-brand-600">Edit</summary>
                      <ActionForm action={upsertCriterionAction.bind(null, s.id)} className="mt-3 grid gap-3 sm:grid-cols-4">
                        <input type="hidden" name="id" value={c.id} />
                        <TextInput label="Name" name="name" defaultValue={c.name} className="sm:col-span-2" />
                        <TextInput label="Weight %" name="weight" type="number" defaultValue={c.weight} />
                        <TextInput label="Tie-break priority" name="tieBreakPriority" type="number" defaultValue={c.tieBreakPriority ?? ""} hint="1 = first" />
                        <TextInput label="Min" name="minScore" type="number" defaultValue={c.minScore} />
                        <TextInput label="Max" name="maxScore" type="number" defaultValue={c.maxScore} />
                        <TextInput label="Description" name="description" defaultValue={c.description} className="sm:col-span-2" />
                        <TextInput label="Scoring instructions" name="instructions" defaultValue={c.instructions} className="sm:col-span-3" />
                        <Checkbox name="commentRequired" label="Comment required" defaultChecked={c.commentRequired} />
                        <div className="sm:col-span-4">
                          <SubmitButton size="sm">Save criterion</SubmitButton>
                        </div>
                      </ActionForm>
                    </details>
                  ) : null}
                </td>
                <td className="text-right tabular-nums">{c.weight}%</td>
                <td className="text-right tabular-nums">
                  {c.minScore}–{c.maxScore}
                </td>
                <td>{c.tieBreakPriority ?? "—"}</td>
                <td className="text-right">
                  {!locked ? (
                    <InlineAction action={deleteCriterionAction.bind(null, s.id, c.id)} variant="ghost">
                      Delete
                    </InlineAction>
                  ) : null}
                </td>
              </tr>
            ))}
            {criteria.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-ink-500">
                  No criteria yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!locked ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Add criterion</summary>
          <ActionForm action={upsertCriterionAction.bind(null, s.id)} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-4">
            <TextInput label="Name" name="name" required className="sm:col-span-2" />
            <TextInput label="Weight %" name="weight" type="number" required defaultValue={Math.max(0, 100 - total) || ""} />
            <TextInput label="Tie-break priority" name="tieBreakPriority" type="number" />
            <TextInput label="Min" name="minScore" type="number" defaultValue={0} />
            <TextInput label="Max" name="maxScore" type="number" defaultValue={10} />
            <TextInput label="Description" name="description" className="sm:col-span-2" />
            <Checkbox name="commentRequired" label="Comment required" />
            <div className="sm:col-span-4">
              <SubmitButton size="sm">Add criterion</SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}

function StageSettings({ s, tz }: { s: Stage; tz: string }) {
  const locked = s.status !== "PENDING";
  const overrides = (s.submissionFields ?? {}) as FieldOverrides;
  return (
    <ActionForm action={updateStageAction.bind(null, s.id)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Stage name" name="name" defaultValue={s.name} required />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label={`Starts (${tz})`} name="startsAt" type="datetime-local" defaultValue={utcToZonedLocal(s.startsAt, tz)} />
          <TextInput label={`Ends (${tz})`} name="endsAt" type="datetime-local" defaultValue={utcToZonedLocal(s.endsAt, tz)} />
        </div>
        <TextArea label="Description shown to participants" name="description" defaultValue={s.description} rows={2} className="sm:col-span-2" />
      </div>
      <fieldset className="grid gap-4 rounded-xl border border-ink-100 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-bold">
          Participation & submissions {locked ? <span className="font-normal text-ink-400">(locked after start)</span> : null}
        </legend>
        {locked ? (
          <>
            {/* Locked settings are re-sent unchanged so validation passes. */}
            {s.acceptsSubmissions ? <input type="hidden" name="acceptsSubmissions" value="on" /> : null}
            {s.onlyAdvancedProjects ? <input type="hidden" name="onlyAdvancedProjects" value="on" /> : null}
            {s.isJudged ? <input type="hidden" name="isJudged" value="on" /> : null}
            <input type="hidden" name="submissionTemplate" value={s.submissionTemplate} />
          </>
        ) : null}
        <Checkbox
          name="onlyAdvancedProjects"
          label="Only projects advanced from the previous judged stage"
          defaultChecked={s.onlyAdvancedProjects}
          disabled={locked}
        />
        <Checkbox name="acceptsSubmissions" label="This stage collects submissions" defaultChecked={s.acceptsSubmissions} disabled={locked} />
        <Select
          label="Submission template"
          name={locked ? "_template" : "submissionTemplate"}
          defaultValue={s.submissionTemplate}
          disabled={locked}
          options={[
            { value: "NONE", label: "None" },
            { value: "IDEA", label: "Idea (ideathon)" },
            { value: "PROJECT", label: "Project (hackathon)" },
          ]}
        />
        <Checkbox name="allowLateSubmissions" label="Accept late submissions (marked as late)" defaultChecked={s.allowLateSubmissions} />
        <TextInput
          label="Required documents (comma-separated)"
          name="requiredDocuments"
          defaultValue={s.requiredDocuments.join(", ")}
          className="sm:col-span-2"
        />
        {s.submissionTemplate !== "NONE" ? (
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-semibold">Fields</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {templateFields(s.submissionTemplate).map((f) => {
                const o = overrides[f.key];
                const enabled = o?.enabled ?? f.defaultEnabled;
                const required = o?.required ?? f.defaultRequired;
                return (
                  <div key={f.key} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-50">
                    {!locked ? <input type="hidden" name={`f_${f.key}_present`} value="1" /> : null}
                    <label className="flex min-w-0 items-center gap-2">
                      <input type="checkbox" name={`f_${f.key}_enabled`} defaultChecked={enabled} className="accent-brand-600" disabled={locked} />
                      <span className="truncate">{f.type === "checkbox" ? "Originality declaration" : f.label}</span>
                    </label>
                    <label className="flex shrink-0 items-center gap-1 text-xs text-ink-500">
                      <input type="checkbox" name={`f_${f.key}_required`} defaultChecked={required} className="accent-brand-600" disabled={locked} /> required
                    </label>
                  </div>
                );
              })}
            </div>
            {locked ? <p className="mt-1 text-xs text-ink-400">Field settings are locked once the stage has started.</p> : null}
          </div>
        ) : null}
      </fieldset>
      <fieldset className="grid gap-4 rounded-xl border border-ink-100 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-bold">Judging & advancement</legend>
        <Checkbox name="isJudged" label="This stage is judged" defaultChecked={s.isJudged} disabled={locked} className="sm:col-span-3" />
        <TextInput label="Min. judges per project" name="minJudgesPerProject" type="number" min={1} defaultValue={s.minJudgesPerProject} />
        <Select label="Advancement rule" name="advancementRule" defaultValue={s.advancementRule} options={RULES} />
        <TextInput label="Rule value" name="advancementValue" type="number" step="any" defaultValue={s.advancementValue ?? ""} hint="N, % or minimum score" />
        <Select
          label="Feedback visibility to participants"
          name="resultVisibility"
          defaultValue={s.resultVisibility}
          options={[
            { value: "PRIVATE", label: "Decision only" },
            { value: "PROVISIONAL", label: "Decision only (provisional)" },
            { value: "PUBLIC", label: "Decision + judges' team feedback" },
          ]}
          className="sm:col-span-3"
        />
        <Checkbox name="notifyOnOpen" label="Notify participants when the stage opens" defaultChecked={s.notifyOnOpen} />
        <Checkbox name="notifyOnAdvance" label="Notify teams of advancement decisions" defaultChecked={s.notifyOnAdvance} />
      </fieldset>
      <SubmitButton size="sm">Save stage</SubmitButton>
    </ActionForm>
  );
}

export async function StageManager({ competitionId, tz, editable = true }: { competitionId: string; tz: string; editable?: boolean }) {
  const stages = await listStages(competitionId);
  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {stages.map((s, i) => {
          const st = STAGE_STATUS_META[s.status];
          return (
            <li key={s.id} className={`card overflow-hidden ${s.enabled ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-5 py-4">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-100 text-sm font-bold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{s.name}</p>
                  <p className="text-xs text-ink-500">
                    {STAGE_TYPE_LABELS[s.type]}
                    {s.startsAt ? ` · ${formatDateTime(s.startsAt, tz)} → ${formatDateTime(s.endsAt, tz)}` : ""}
                    {s.acceptsSubmissions ? ` · ${s._count.submissions} submitted` : ""}
                  </p>
                </div>
                {s.isJudged ? <Badge tone="brand">Judged</Badge> : null}
                {s.onlyAdvancedProjects ? <Badge tone="info">Shortlist only</Badge> : null}
                <Badge tone={s.enabled ? st.tone : "neutral"}>{s.enabled ? st.label : "Disabled"}</Badge>
              </div>
              {editable ? (
                <div className="space-y-4 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Transitions s={s} />
                    <span className="flex-1" />
                    {s.status === "PENDING" ? (
                      <>
                        <InlineAction action={moveStageAction.bind(null, s.id, "up")} variant="ghost">
                          ↑
                        </InlineAction>
                        <InlineAction action={moveStageAction.bind(null, s.id, "down")} variant="ghost">
                          ↓
                        </InlineAction>
                        <InlineAction action={toggleStageAction.bind(null, s.id, !s.enabled)} variant="ghost">
                          {s.enabled ? "Disable" : "Enable"}
                        </InlineAction>
                        <ConfirmAction
                          action={deleteStageAction.bind(null, s.id)}
                          label="Delete"
                          variant="ghost"
                          title={`Delete "${s.name}"?`}
                          confirmLabel="Delete stage"
                        />
                      </>
                    ) : null}
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-ink-700">Stage settings</summary>
                    <div className="mt-4">
                      <StageSettings s={s} tz={tz} />
                    </div>
                  </details>
                  {s.isJudged ? (
                    <details open={!s.rubric?.criteria.length || s.rubric.criteria.reduce((a, c) => a + c.weight, 0) !== 100}>
                      <summary className="cursor-pointer text-sm font-semibold text-ink-700">Rubric ({s.rubric?.criteria.length ?? 0} criteria)</summary>
                      <div className="mt-4">
                        <RubricEditor s={s} />
                      </div>
                    </details>
                  ) : null}
                  {s.transitions.length ? (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-ink-500">Transition history</summary>
                      <ul className="mt-2 space-y-1 text-xs text-ink-500">
                        {s.transitions.map((t) => (
                          <li key={t.id}>
                            {formatDateTime(t.createdAt, tz)}: {t.fromStatus.toLowerCase()} → {t.toStatus.toLowerCase()}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {editable ? (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold text-brand-700">+ Add a stage</summary>
          <ActionForm action={addStageAction.bind(null, competitionId)} resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextInput label="Stage name" name="name" required />
            <Select label="Stage type" name="type" options={Object.entries(STAGE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            <TextArea label="Description" name="description" rows={2} className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <SubmitButton size="sm">Add stage</SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}
