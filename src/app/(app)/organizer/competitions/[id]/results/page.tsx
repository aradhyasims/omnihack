import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, CardHeader, Icon } from "@/components/ui/primitives";
import { ActionForm, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { resultsWorkspace } from "@/server/modules/results/service";
import { RESULTS_STATUS_META } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import {
  approveResultsAction,
  assignWinnerAction,
  autoPrizesAction,
  prepareResultsAction,
  publishResultsAction,
  removeWinnerAction,
  unpublishResultsAction,
} from "../../../actions";
import { loadManaged } from "../load";

export default async function ResultsAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, can } = await loadManaged(id);
  if (!can("results.prepare") && !can("evaluation.view_all")) redirect(`/organizer/competitions/${id}`);
  const w = await resultsWorkspace(user, id);
  const c = w.competition;
  const status = c.resultsStatus;
  const editable = can("results.prepare") && status !== "PUBLISHED";
  const steps = [
    { key: "PROVISIONAL", label: "Prepare provisional results", done: status !== "NONE" },
    { key: "APPROVED", label: "Authorized approval", done: status === "APPROVED" || status === "PUBLISHED" },
    { key: "PUBLISHED", label: "Publish winners", done: status === "PUBLISHED" },
  ];
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ol className="flex flex-wrap items-center gap-3 text-sm">
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-100 text-emerald-700" : "bg-ink-100 text-ink-500"}`}
                >
                  {s.done ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={s.done ? "font-semibold" : "text-ink-500"}>{s.label}</span>
                {i < steps.length - 1 ? <span className="text-ink-300">→</span> : null}
              </li>
            ))}
          </ol>
          <Badge tone={RESULTS_STATUS_META[status].tone} dot>
            {RESULTS_STATUS_META[status].label}
          </Badge>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          {status === "NONE" && can("results.prepare") ? (
            <InlineAction action={prepareResultsAction.bind(null, id)} variant="primary">
              Prepare provisional results
            </InlineAction>
          ) : null}
          {status === "PROVISIONAL" && can("results.approve") ? (
            <ConfirmAction
              action={approveResultsAction.bind(null, id)}
              label="Approve results"
              variant="primary"
              confirmVariant="primary"
              title="Approve these results?"
              description="Your approval is recorded. Results stay private until published; any later winner change requires re-approval."
              confirmLabel="Approve"
            />
          ) : null}
          {status === "PROVISIONAL" && !can("results.approve") ? (
            <p className="text-sm text-ink-500">An owner of the organization must approve the results (the event team cannot approve its own results).</p>
          ) : null}
          {status === "APPROVED" && can("results.publish") ? (
            <ConfirmAction
              action={publishResultsAction.bind(null, id)}
              label="Publish results"
              variant="primary"
              confirmVariant="primary"
              title="Publish results publicly?"
              description="Winners appear on the public results page and every participant is notified. The competition is marked completed."
              confirmLabel="Publish"
            />
          ) : null}
          {status === "PUBLISHED" ? (
            <>
              <Link href={`/competitions/${c.slug}/results`} className="text-sm font-semibold text-brand-600 hover:underline">
                View public results →
              </Link>
              {can("results.publish") ? (
                <ConfirmAction
                  action={unpublishResultsAction.bind(null, id)}
                  label="Unpublish"
                  title="Unpublish results?"
                  description="Use only to correct an error. The reason is recorded."
                  reasonLabel="Reason"
                  reasonRequired
                  confirmLabel="Unpublish"
                />
              ) : null}
            </>
          ) : null}
        </div>
        {c.resultsApprovedAt ? (
          <p className="mt-3 text-xs text-ink-500">
            Approved {formatDateTime(c.resultsApprovedAt, c.timezone)}
            {c.resultsPublishedAt ? ` · published ${formatDateTime(c.resultsPublishedAt, c.timezone)}` : ""}
          </p>
        ) : null}
      </Card>

      {w.overview && !w.overview.complete ? (
        <Alert tone="warning" title="Final-stage judging is not complete">
          Results can be prepared and approved only after every required evaluation in “{w.stage?.name}” is finalized.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader
            title="Prizes & winners"
            action={
              editable && w.overview?.complete ? <InlineAction action={autoPrizesAction.bind(null, id)}>Fill ranked prizes from ranking</InlineAction> : null
            }
          />
          <ul className="divide-y divide-ink-100">
            {w.prizes.map((p) => (
              <li key={p.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name="trophy" className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold">{p.title}</span>
                  <Badge>
                    {p.category.toLowerCase().replace("_", "-")}
                    {p.rank ? ` · rank ${p.rank}` : ""}
                    {p.track ? ` · ${p.track.name}` : ""}
                  </Badge>
                </div>
                {p.winners.length ? (
                  <ul className="space-y-1 text-sm">
                    {p.winners.map((wnr) => (
                      <li key={wnr.id} className="flex items-center justify-between gap-2">
                        <span>
                          {wnr.project.title} {wnr.project.team ? <span className="text-ink-500">({wnr.project.team.name})</span> : null}
                        </span>
                        {editable ? (
                          <InlineAction action={removeWinnerAction.bind(null, p.id, wnr.projectId)} variant="ghost">
                            Remove
                          </InlineAction>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-500">No winner assigned.</p>
                )}
                {editable ? (
                  <ActionForm action={assignWinnerAction.bind(null, p.id)} className="flex flex-wrap items-end gap-2" successMessage={false}>
                    <Select
                      label={<span className="sr-only">Project</span>}
                      name="projectId"
                      options={w.projects
                        .filter((x) => p.category !== "TRACK" || x.trackId === p.trackId)
                        .map((x) => ({ value: x.id, label: `${x.title}${x.team ? ` (${x.team.name})` : ""}` }))}
                    />
                    <TextInput label={<span className="sr-only">Citation</span>} name="citation" placeholder="Citation (optional)" />
                    <SubmitButton size="sm" variant="outline">
                      Assign
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            ))}
            {w.prizes.length === 0 ? <li className="px-5 py-6 text-sm text-ink-500">No prizes configured. Add them in Setup → Prizes.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader
            title={`Final ranking${w.stage ? ` — ${w.stage.name}` : ""}`}
            description="Private until results are published. Public pages show winners and finalists, never scores or comments."
          />
          <ol className="divide-y divide-ink-100 text-sm">
            {w.overview?.rows.map((r) => (
              <li key={r.projectId} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span>
                  <span className="mr-2 font-bold">{r.rank ?? "—"}</span>
                  {r.project.title}
                </span>
                <span className="tabular-nums text-ink-600">{r.score ?? "—"}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
