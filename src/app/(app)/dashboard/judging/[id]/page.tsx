import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Card, CardHeader } from "@/components/ui/primitives";
import { ConfirmAction } from "@/components/ui/confirm";
import { Scorecard } from "@/components/judging/scorecard";
import { SubmissionView } from "@/components/workspace/submission-view";
import { requireUser } from "@/server/auth/current";
import { getScorecard } from "@/server/modules/judging/service";
import { formatDateTime } from "@/lib/time";
import { autosaveEvaluationAction, declareConflictAction, saveEvaluationAction } from "../../actions";

export const metadata: Metadata = { title: "Evaluate project" };

export default async function ScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/judging/${id}`);
  const { assignment: a, project } = await getScorecard(user, id);
  const ev = a.evaluation;
  const final = ev?.status === "FINAL";
  const conflict = a.status === "CONFLICT_DECLARED";
  const judgingOpen = a.stage.status === "JUDGING";
  const criteria = (a.stage.rubric?.criteria ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    instructions: c.instructions,
    weight: c.weight,
    minScore: c.minScore,
    maxScore: c.maxScore,
    commentRequired: c.commentRequired,
  }));
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/judging" className="text-sm font-semibold text-brand-600 hover:underline">
          ← All evaluations
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold">{project.title}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {a.stage.competition.title} · {a.stage.name}
          {project.challenge ? ` · ${project.challenge.title}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {final ? <Badge tone="success">Finalized {formatDateTime(ev?.finalizedAt, a.stage.competition.timezone)}</Badge> : null}
          {conflict ? <Badge tone="danger">Conflict declared</Badge> : null}
          {!judgingOpen && !final ? <Badge tone="warning">Judging not open</Badge> : null}
        </div>
      </div>
      {final ? (
        <Alert tone="info">This evaluation is locked. If a correction is needed, contact the organizer — corrections are recorded with a reason.</Alert>
      ) : null}
      {ev?.corrections.length ? (
        <Alert tone="warning" title="Corrected by organizer">
          {ev.corrections.map((c) => (
            <p key={c.id}>{c.reason}</p>
          ))}
        </Alert>
      ) : null}
      {conflict ? <Alert tone="info">You declared a conflict of interest: “{a.conflictNote}”. This project will be reassigned.</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card className="min-w-0">
          <CardHeader title="Submission" description="Personal contact details of participants are not shown to judges." />
          <div className="space-y-8 p-5">
            {project.submissions.length ? (
              project.submissions.map((s) => <SubmissionView key={s.id} submission={s} />)
            ) : (
              <p className="text-sm text-ink-500">This stage has no written submission; evaluate the live presentation.</p>
            )}
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Scorecard" description={a.stage.rubric?.instructions || "Score each criterion. Weighted totals are calculated automatically."} />
          <div className="p-5">
            {conflict ? (
              <p className="text-sm text-ink-500">Scoring is disabled after a conflict declaration.</p>
            ) : (
              <Scorecard
                criteria={criteria}
                initialScores={Object.fromEntries((ev?.scores ?? []).map((s) => [s.criterionId, s.score]))}
                initialComments={Object.fromEntries((ev?.scores ?? []).map((s) => [s.criterionId, s.comment]))}
                feedbackToTeam={ev?.feedbackToTeam ?? ""}
                privateComment={ev?.privateComment ?? ""}
                locked={final || !judgingOpen}
                saveAction={saveEvaluationAction.bind(null, a.id)}
                autosaveAction={autosaveEvaluationAction.bind(null, a.id)}
              />
            )}
            {!final && !conflict ? (
              <div className="mt-6 border-t border-ink-100 pt-4">
                <ConfirmAction
                  action={declareConflictAction.bind(null, a.id)}
                  label="Declare a conflict of interest"
                  variant="ghost"
                  title="Declare a conflict of interest"
                  description="If you have a personal or professional relationship with this team, declare it. You will be removed from this evaluation and the organizer will be notified."
                  reasonLabel="Describe the conflict"
                  reasonRequired
                  confirmLabel="Declare conflict"
                />
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
