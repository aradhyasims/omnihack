import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, EmptyState, Icon, PageHeader } from "@/components/ui/primitives";
import { ActionForm, SubmitButton, TextArea } from "@/components/ui/form";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listOpenTeams } from "@/server/modules/teams/service";
import { isAppError } from "@/server/errors";
import { requestJoinAction } from "../../../actions";

export const metadata: Metadata = { title: "Team finder" };

export default async function TeamFinderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/dashboard/competitions/${slug}/teams`);
  const c = await db.competition.findUnique({ where: { slug } });
  if (!c) notFound();
  let teams: Awaited<ReturnType<typeof listOpenTeams>> = [];
  let denied: string | null = null;
  try {
    teams = await listOpenTeams(user, c.id);
  } catch (e) {
    if (isAppError(e)) denied = e.message;
    else throw e;
  }
  const inTeam = await db.teamMembership.findUnique({ where: { competitionId_userId: { competitionId: c.id, userId: user.id } } });
  return (
    <div className="space-y-6">
      <Link href={`/dashboard/competitions/${slug}`} className="text-sm font-semibold text-brand-600 hover:underline">
        ← Back to workspace
      </Link>
      <PageHeader eyebrow={c.title} title="Team finder" description="Teams looking for members. Send a short note — the leader can invite you by email." />
      {denied ? <Alert tone="warning">{denied}</Alert> : null}
      {inTeam ? <Alert tone="info">You're already in a team for this competition.</Alert> : null}
      {!denied && teams.length === 0 ? (
        <EmptyState
          title="No teams are looking for members right now"
          description="Create your own team from your workspace and tick “We're looking for more members”."
          icon={<Icon name="users" />}
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((t) => (
          <article key={t.id} className="card space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{t.name}</h2>
              <Badge tone="success">
                {t.seatsLeft} seat{t.seatsLeft === 1 ? "" : "s"} left
              </Badge>
            </div>
            {t.challenge ? <p className="text-sm text-ink-500">Challenge: {t.challenge}</p> : null}
            {t.description ? <p className="text-sm text-ink-700">{t.description}</p> : null}
            {t.skills.length ? (
              <div className="flex flex-wrap gap-1.5">
                {t.skills.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            ) : null}
            {!inTeam ? (
              <ActionForm action={requestJoinAction.bind(null, t.id)} className="space-y-2 border-t border-ink-100 pt-3">
                <TextArea label="Message to the leader (optional)" name="message" rows={2} maxLength={500} />
                <SubmitButton size="sm" variant="outline">
                  Ask to join
                </SubmitButton>
              </ActionForm>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
