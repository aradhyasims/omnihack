import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, CardHeader, EmptyState, Icon } from "@/components/ui/primitives";
import { InlineAction } from "@/components/ui/confirm";
import { db } from "@/server/db";
import { moderateShowcaseAction } from "../../../actions";
import { loadManaged } from "../load";

export default async function ShowcaseModerationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { can } = await loadManaged(id);
  if (!can("showcase.moderate")) redirect(`/organizer/competitions/${id}`);
  const projects = await db.project.findMany({
    where: { competitionId: id, showcaseStatus: { not: "PRIVATE" } },
    include: { team: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  if (!projects.length)
    return <EmptyState title="No showcase requests" description="Team leaders can request a public listing after submitting." icon={<Icon name="layers" />} />;
  return (
    <div className="space-y-4">
      {projects.map((p) => (
        <Card key={p.id}>
          <CardHeader
            title={p.title}
            description={p.team?.name ?? "Individual"}
            action={
              <Badge tone={p.showcaseStatus === "PUBLISHED" ? "success" : p.showcaseStatus === "REQUESTED" ? "warning" : "danger"}>
                {p.showcaseStatus.toLowerCase()}
              </Badge>
            }
          />
          <div className="space-y-3 p-5 text-sm">
            <p className="whitespace-pre-line text-ink-700">{p.showcaseSummary}</p>
            {p.showcaseImpact ? (
              <p className="text-ink-600">
                <strong>Impact:</strong> {p.showcaseImpact}
              </p>
            ) : null}
            <p className="text-xs text-ink-500">
              Demo: {p.demoUrl ?? "—"} · Repo: {p.repoUrl ?? "—"} · Show members: {p.showMembers ? "yes (consenting members only)" : "no"}
            </p>
            <div className="flex gap-2">
              {p.showcaseStatus !== "PUBLISHED" ? (
                <InlineAction action={moderateShowcaseAction.bind(null, p.id, true)} variant="primary">
                  Approve & publish
                </InlineAction>
              ) : (
                <Link href={`/projects/${p.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                  View public page
                </Link>
              )}
              {p.showcaseStatus !== "REJECTED" ? (
                <InlineAction action={moderateShowcaseAction.bind(null, p.id, false)} variant="ghost">
                  {p.showcaseStatus === "PUBLISHED" ? "Remove from showcase" : "Reject"}
                </InlineAction>
              ) : null}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
