import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { Badge, DemoBadge, EmptyState, Icon } from "@/components/ui/primitives";
import { db } from "@/server/db";
import { formatDate } from "@/lib/time";
import { TYPE_LABEL } from "@/lib/labels";

export const metadata: Metadata = {
  title: "Winners",
  description: "Published results and award winners from OmniHack competitions.",
  alternates: { canonical: "/winners" },
};
export const dynamic = "force-dynamic";

export default async function WinnersPage() {
  const comps = await db.competition.findMany({
    where: { resultsStatus: "PUBLISHED", visibility: "PUBLIC" },
    include: {
      organization: { select: { name: true } },
      prizes: {
        where: { winners: { some: {} } },
        orderBy: { order: "asc" },
        include: { winners: { include: { project: { select: { id: true, title: true, showcaseStatus: true, team: { select: { name: true } } } } } } },
      },
    },
    orderBy: { resultsPublishedAt: "desc" },
    take: 30,
  });
  return (
    <>
      <PageHero
        eyebrow="Winners"
        title="Celebrating winning projects"
        description="Officially published results. Only results approved and published by organizers appear here."
      />
      <div className="container-page space-y-8 py-14">
        {comps.length === 0 ? <EmptyState title="No published results yet" icon={<Icon name="trophy" />} /> : null}
        {comps.map((c) => (
          <section key={c.id} className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold">{c.title}</h2>
                <p className="text-sm text-ink-500">
                  {TYPE_LABEL[c.type]} · {c.organization.name} · {formatDate(c.resultsPublishedAt, c.timezone)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.isDemo ? <DemoBadge /> : null}
                <Link href={`/competitions/${c.slug}/results`} className="text-sm font-semibold text-brand-600 hover:underline">
                  Full results →
                </Link>
              </div>
            </div>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {c.prizes.flatMap((p) =>
                p.winners.map((w) => (
                  <li key={w.id} className="rounded-xl border border-ink-100 p-4">
                    <Badge tone="warning">
                      <Icon name="trophy" className="h-3.5 w-3.5" /> {p.title}
                    </Badge>
                    <p className="mt-2 font-bold">
                      {w.project.showcaseStatus === "PUBLISHED" ? (
                        <Link href={`/projects/${w.project.id}`} className="hover:underline">
                          {w.project.title}
                        </Link>
                      ) : (
                        w.project.title
                      )}
                    </p>
                    {w.project.team ? <p className="text-sm text-ink-500">{w.project.team.name}</p> : null}
                  </li>
                )),
              )}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
