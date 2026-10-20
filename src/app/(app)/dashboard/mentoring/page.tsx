import type { Metadata } from "next";
import { Badge, Card, CardHeader, EmptyState, Icon, PageHeader } from "@/components/ui/primitives";
import { ActionForm, Checkbox, SubmitButton, TextArea } from "@/components/ui/form";
import { SubmissionView } from "@/components/workspace/submission-view";
import { requireUser } from "@/server/auth/current";
import { myMentees } from "@/server/modules/mentoring/service";
import { db } from "@/server/db";
import { relativeFromNow } from "@/lib/time";
import { mentorNoteAction } from "../actions";

export const metadata: Metadata = { title: "Mentoring" };

export default async function MentoringPage() {
  const user = await requireUser("/dashboard/mentoring");
  const mentees = await myMentees(user);
  const subs = await db.submission.findMany({
    where: { projectId: { in: mentees.map((m) => m.projectId) }, status: "SUBMITTED" },
    include: { stage: { select: { name: true, submissionTemplate: true, submissionFields: true } }, attachments: { where: { deletedAt: null } } },
  });
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mentor dashboard"
        title="Your teams"
        description="Review submitted work and leave feedback. Feedback marked visible appears in the team's workspace."
      />
      {mentees.length === 0 ? (
        <EmptyState
          title="No teams assigned yet"
          description="Organizers assign mentors to teams from the competition's People page."
          icon={<Icon name="mentor" />}
        />
      ) : (
        mentees.map((m) => {
          const p = m.project;
          const members = p.team ? p.team.members.map((x) => x.user.name) : p.owner ? [p.owner.name] : [];
          return (
            <Card key={m.id}>
              <CardHeader
                title={p.title}
                description={`${p.competition.title}${p.team ? ` · Team ${p.team.name}` : ""}${p.challenge ? ` · ${p.challenge.title}` : ""}`}
                action={
                  <Badge>
                    {members.length} member{members.length === 1 ? "" : "s"}
                  </Badge>
                }
              />
              <div className="grid gap-6 p-5 lg:grid-cols-2">
                <div className="min-w-0 space-y-6">
                  <p className="text-sm text-ink-600">Members: {members.join(", ")}</p>
                  {subs
                    .filter((s) => s.projectId === p.id)
                    .map((s) => (
                      <SubmissionView key={s.id} submission={s} />
                    ))}
                  {!subs.some((s) => s.projectId === p.id) ? <p className="text-sm text-ink-500">No submitted work yet.</p> : null}
                </div>
                <div className="space-y-4">
                  <ActionForm action={mentorNoteAction.bind(null, p.id)} resetOnSuccess className="space-y-3">
                    <TextArea label="Feedback" name="body" rows={4} required />
                    <Checkbox name="visibleToTeam" defaultChecked label="Visible to the team" />
                    <SubmitButton size="sm">Save feedback</SubmitButton>
                  </ActionForm>
                  {p.mentorNotes.length ? (
                    <ul className="space-y-3 border-t border-ink-100 pt-4 text-sm">
                      {p.mentorNotes.map((n) => (
                        <li key={n.id}>
                          <p className="whitespace-pre-line text-ink-700">{n.body}</p>
                          <p className="text-xs text-ink-400">
                            {relativeFromNow(n.createdAt)} · {n.visibleToTeam ? "visible to team" : "private"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
