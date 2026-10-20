import { redirect } from "next/navigation";
import { Badge, Card, CardHeader, EmptyState, Icon } from "@/components/ui/primitives";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { SubmissionView } from "@/components/workspace/submission-view";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/time";
import { disqualifyAction, lockTeamAction, organizerRemoveMemberAction } from "../../../actions";
import { loadManaged } from "../load";

export default async function TeamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { competition: c, can } = await loadManaged(id);
  if (!can("team.manage") && !can("submission.view_all")) redirect(`/organizer/competitions/${id}`);
  const projects = await db.project.findMany({
    where: { competitionId: id },
    include: {
      team: {
        include: { members: { include: { user: { select: { id: true, name: true, email: true } } } }, events: { orderBy: { createdAt: "desc" }, take: 6 } },
      },
      owner: { select: { name: true, email: true } },
      challenge: { select: { title: true } },
      submissions: {
        include: {
          stage: { select: { name: true, order: true, submissionTemplate: true, submissionFields: true } },
          attachments: { where: { deletedAt: null } },
        },
        orderBy: { stage: { order: "asc" } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const open = sp.project;
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3">
        <p className="text-sm text-ink-500">{projects.length} project(s). Team rosters can be approved (locked) before judging.</p>
        <div className="flex gap-3 text-sm font-semibold">
          <a href={`/api/v1/organizer/competitions/${id}/export/teams`} className="text-brand-600 hover:underline">
            Teams CSV
          </a>
          <a href={`/api/v1/organizer/competitions/${id}/export/submissions`} className="text-brand-600 hover:underline">
            Submissions CSV
          </a>
        </div>
      </div>
      {projects.length === 0 ? <EmptyState title="No teams or projects yet" icon={<Icon name="users" />} /> : null}
      {projects.map((p) => (
        <Card key={p.id}>
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {p.title}
                {p.team ? <Badge>Team {p.team.name}</Badge> : <Badge>Individual</Badge>}
                {p.status !== "ACTIVE" ? <Badge tone="danger">{p.status.toLowerCase()}</Badge> : null}
                {p.team?.status === "LOCKED" ? <Badge tone="success">Roster approved</Badge> : null}
              </span>
            }
            description={`${p.challenge?.title ?? "No challenge selected"} · ${p.submissions.filter((s) => s.status === "SUBMITTED").length} submitted stage(s)`}
            action={
              <div className="flex flex-wrap gap-2">
                {p.team && can("team.manage") && p.status === "ACTIVE" ? (
                  <InlineAction action={lockTeamAction.bind(null, p.team.id, p.team.status !== "LOCKED")}>
                    {p.team.status === "LOCKED" ? "Unlock roster" : "Approve roster"}
                  </InlineAction>
                ) : null}
                {can("team.manage") && p.status === "ACTIVE" ? (
                  <ConfirmAction
                    action={disqualifyAction.bind(null, p.id)}
                    label="Disqualify"
                    title={`Disqualify ${p.title}?`}
                    description="The project is excluded from judging and results. The reason is recorded in the audit log."
                    reasonLabel="Reason"
                    reasonRequired
                    confirmLabel="Disqualify"
                  />
                ) : null}
              </div>
            }
          />
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-4 text-sm">
              <ul className="space-y-2">
                {p.team ? (
                  p.team.members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-semibold">{m.user.name}</span> {m.role === "LEADER" ? <Badge tone="brand">Leader</Badge> : null}
                        <span className="block text-xs text-ink-500">{m.user.email}</span>
                      </span>
                      {can("team.manage") && m.role !== "LEADER" ? (
                        <ConfirmAction
                          action={organizerRemoveMemberAction.bind(null, p.team!.id, m.userId)}
                          label="Remove"
                          variant="ghost"
                          title={`Remove ${m.user.name} from ${p.team!.name}?`}
                          confirmLabel="Remove"
                        />
                      ) : null}
                    </li>
                  ))
                ) : p.owner ? (
                  <li>
                    <span className="font-semibold">{p.owner.name}</span>
                    <span className="block text-xs text-ink-500">{p.owner.email}</span>
                  </li>
                ) : null}
              </ul>
              {p.team?.events.length ? (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-ink-500">Membership history</summary>
                  <ul className="mt-2 space-y-1 text-xs text-ink-500">
                    {p.team.events.map((e) => (
                      <li key={e.id}>
                        {formatDateTime(e.createdAt, c.timezone)} · {e.action.toLowerCase()} {e.note ? `— ${e.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
            <div className="min-w-0">
              {can("submission.view_all") ? (
                open === p.id ? (
                  <div className="space-y-6">
                    {p.submissions
                      .filter((s) => s.status === "SUBMITTED")
                      .map((s) => (
                        <SubmissionView key={s.id} submission={s} />
                      ))}
                  </div>
                ) : (
                  <a href={`?project=${p.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                    View submissions →
                  </a>
                )
              ) : (
                <p className="text-sm text-ink-500">You don't have permission to view submissions.</p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
